/**
 * Generate Layer-1 (MCP tool) documentation from the live toolRegistry.
 *
 * Source of truth: `@tool` / `@title` / `@description` / `@param` / `@result`
 * on `src/api/*` — the same registry MCP `tools/list` exposes to agents.
 *
 * Reuses `e2e/scripts/tool-utils.ts` (`scanToolsFromRegistry`), same path as
 * `generate:mcp-types`.
 *
 * Usage (repo root; requires `dist/` from compile/build):
 *   npm run generate:mcp-docs
 *   npm run generate:mcp-docs:check
 *   npx tsx workflow/generate-mcp-tool-docs.ts --out docs/api/mcp
 *   npx tsx workflow/generate-mcp-tool-docs.ts --json-only
 */

import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { scanToolsFromRegistry, ExtendedToolInfo } from '../e2e/scripts/tool-utils';
import { BuilderHook } from '../src/mcp/hooks/builder.hook';

type JsonSchema = Record<string, unknown>;

interface ToolDoc {
    name: string;
    title: string;
    description: string;
    category: string;
    methodName: string;
    inputSchema: JsonSchema;
    outputSchema: JsonSchema;
    params: Array<{ name: string; schema: JsonSchema }>;
    schemaNote?: string;
}

function parseArgs(argv: string[]) {
    const outIdx = argv.indexOf('--out');
    const outDir = outIdx >= 0 && argv[outIdx + 1]
        ? path.resolve(argv[outIdx + 1])
        : path.resolve(process.cwd(), 'docs/api/mcp');
    return {
        outDir,
        jsonOnly: argv.includes('--json-only'),
        check: argv.includes('--check'),
    };
}

/** Match `McpMiddleware.zodToJSONSchema7` (no named `$ref` wrapper). */
function toMcpListJsonSchema(zodSchema: unknown): JsonSchema {
    if (!zodSchema) {
        return { type: 'object', description: 'No schema' };
    }
    try {
        return zodToJsonSchema(zodSchema as any, {
            target: 'jsonSchema7',
            $refStrategy: 'none',
        }) as JsonSchema;
    } catch (e) {
        return {
            type: 'object',
            description: `Failed to convert schema: ${e instanceof Error ? e.message : String(e)}`,
        };
    }
}

function stableStringify(value: unknown): string {
    return `${JSON.stringify(value, null, 2)}\n`;
}

function collectTools(infos: ExtendedToolInfo[]): ToolDoc[] {
    const tools: ToolDoc[] = [];
    const builderHook = new BuilderHook();

    for (const info of infos) {
        const paramMetas = [...(info.paramSchemas || [])]
            .sort((a, b) => a.index - b.index)
            .filter((p) => p.name);

        const shape: Record<string, z.ZodTypeAny> = {};
        let schemaNote: string | undefined;
        for (const p of paramMetas) {
            const param = {
                name: p.name as string,
                schema: p.schema as z.ZodTypeAny,
                index: p.index,
            };
            builderHook.onRegisterParam(info.toolName, param, shape);
            if (!shape[param.name]) {
                shape[param.name] = param.schema;
            }
            if (info.toolName === 'builder-build' && param.name === 'options') {
                schemaNote =
                    '`options` is rewritten by BuilderHook to `z.object({}).passthrough().optional()` for tools/list; full SchemaBuildOption runs only in onBeforeExecute.';
            }
        }

        const inputZod = z.object(shape);
        const outputZod = info.returnSchema
            ? z.object({ result: info.returnSchema as z.ZodTypeAny })
            : z.object({ result: z.any() });
        const inputSchema = toMcpListJsonSchema(inputZod);
        const props = (inputSchema.properties || {}) as Record<string, JsonSchema>;

        tools.push({
            name: info.toolName,
            title: info.title || info.toolName,
            description: info.description || `Tool: ${info.toolName}`,
            category: info.category || 'Unknown',
            methodName: info.methodName,
            inputSchema,
            outputSchema: toMcpListJsonSchema(outputZod),
            params: Object.keys(props).map((name) => ({
                name,
                schema: props[name] || {},
            })),
            schemaNote,
        });
    }

    return tools.sort((a, b) => a.name.localeCompare(b.name));
}

function renderToolMarkdown(tool: ToolDoc): string {
    const lines: string[] = [
        `# ${tool.name}`,
        '',
        `- **Title**: ${tool.title}`,
        `- **Category**: ${tool.category}`,
        `- **Method**: \`${tool.methodName}\``,
        '',
        '## Description',
        '',
        tool.description || '_No description_',
        '',
    ];

    if (tool.schemaNote) {
        lines.push('> ' + tool.schemaNote, '');
    }

    lines.push(
        '## Input schema (tools/list shape)',
        '',
        '```json',
        JSON.stringify(tool.inputSchema, null, 2),
        '```',
        '',
        '## Parameters',
        '',
    );

    if (tool.params.length === 0) {
        lines.push('_No parameters._', '');
    } else {
        for (const p of tool.params) {
            lines.push(`### \`${p.name}\``, '', '```json', JSON.stringify(p.schema, null, 2), '```', '');
        }
    }

    lines.push(
        '## Output schema',
        '',
        '```json',
        JSON.stringify(tool.outputSchema, null, 2),
        '```',
        '',
        '---',
        '',
        '_Generated by `workflow/generate-mcp-tool-docs.ts`. Do not edit by hand._',
        '',
    );

    return lines.join('\n');
}

function renderIndexMarkdown(tools: ToolDoc[], generatedAt: string): string {
    const byCategory = new Map<string, ToolDoc[]>();
    for (const t of tools) {
        const list = byCategory.get(t.category) || [];
        list.push(t);
        byCategory.set(t.category, list);
    }

    const lines: string[] = [
        '# Layer 1 — MCP Tools',
        '',
        'Auto-generated documentation for every `@tool` registered in `toolRegistry`.',
        '',
        'This is **layer 1** of the Cocos CLI interface stack:',
        '',
        '1. **Tools (MCP)** — `src/api` decorators → agent-facing contract (this page)',
        '2. **Commands** — `src/commands` / CLI',
        '3. **Lib facade** — `src/lib`',
        '4. **Core** — `src/core` (+ scene-process RPC)',
        '',
        `- **Tool count**: ${tools.length}`,
        `- **Generated at**: ${generatedAt}`,
        '',
        'Regenerate:',
        '',
        '```bash',
        'npm run generate:mcp-docs',
        '```',
        '',
    ];

    for (const category of [...byCategory.keys()].sort()) {
        const list = (byCategory.get(category) || []).sort((a, b) => a.name.localeCompare(b.name));
        lines.push(`## ${category} (${list.length})`, '');
        lines.push('| Tool | Title |', '| --- | --- |');
        for (const t of list) {
            const rel = `${category.toLowerCase()}/${t.name}.md`;
            lines.push(`| [\`${t.name}\`](./${rel}) | ${t.title.replace(/\|/g, '\\|')} |`);
        }
        lines.push('');
    }

    lines.push('_Generated by `workflow/generate-mcp-tool-docs.ts`. Do not edit by hand._', '');
    return lines.join('\n');
}

function writeOutputs(outDir: string, tools: ToolDoc[], jsonOnly: boolean) {
    const generatedAt = new Date().toISOString();
    const catalog = {
        layer: 1,
        name: 'mcp-tools',
        generatedAt,
        toolCount: tools.length,
        tools,
    };

    fs.mkdirSync(outDir, { recursive: true });
    const jsonPath = path.join(outDir, 'tools.json');
    fs.writeFileSync(jsonPath, stableStringify(catalog));

    if (jsonOnly) {
        console.log(`Wrote ${jsonPath} (${tools.length} tools)`);
        return;
    }

    fs.writeFileSync(path.join(outDir, 'README.md'), renderIndexMarkdown(tools, generatedAt));

    for (const tool of tools) {
        const catDir = path.join(outDir, tool.category.toLowerCase());
        fs.mkdirSync(catDir, { recursive: true });
        fs.writeFileSync(path.join(catDir, `${tool.name}.md`), renderToolMarkdown(tool));
    }

    console.log(`Wrote ${tools.length} tool docs under ${outDir}`);
}

function checkStale(outDir: string, tools: ToolDoc[]): number {
    const jsonPath = path.join(outDir, 'tools.json');
    if (!fs.existsSync(jsonPath)) {
        console.error(`[check] missing ${jsonPath}`);
        return 1;
    }
    const existing = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const a = JSON.stringify({ toolCount: existing.toolCount, tools: existing.tools });
    const b = JSON.stringify({ toolCount: tools.length, tools });
    if (a !== b) {
        console.error('[check] docs/api/mcp is stale — run: npm run generate:mcp-docs');
        return 1;
    }
    console.log(`[check] docs/api/mcp is up to date (${tools.length} tools)`);
    return 0;
}

async function main() {
    const { outDir, jsonOnly, check } = parseArgs(process.argv.slice(2));
    console.log('Scanning toolRegistry for Layer-1 MCP tools...\n');
    const infos = await scanToolsFromRegistry();
    if (!infos.length) {
        throw new Error('toolRegistry is empty — build dist/ and ensure API modules register @tool entries');
    }
    const tools = collectTools(infos);
    console.log(`Found ${tools.length} tools\n`);

    if (check) {
        process.exit(checkStale(outDir, tools));
    }

    writeOutputs(outDir, tools, jsonOnly);
}

main().catch((err) => {
    console.error(err instanceof Error ? err.stack || err.message : err);
    process.exit(1);
});
