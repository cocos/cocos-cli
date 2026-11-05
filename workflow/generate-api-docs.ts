/**
 * Generate Cocos CLI API docs for all four interface layers as a static HTML site.
 *
 * Layers (outside → inside):
 *   1. Tools (MCP)     — `src/api` `@tool` registry (runtime toolRegistry)
 *   2. Commands (CLI)  — `src/commands` commander definitions (source scan)
 *   3. Lib facade      — `src/lib` public exports (source scan)
 *   4. Core            — `src/core` modules / public entrypoints (source scan)
 *
 * Usage (repo root; Layer 1 needs `dist/`):
 *   npm run generate:api-docs
 *   npx tsx workflow/generate-api-docs.ts --out docs/api/html
 *   npx tsx workflow/generate-api-docs.ts --layers 1,2,3,4
 *
 * Tracking: https://github.com/cocos/cocos-cli/issues/984
 */

import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

type JsonSchema = Record<string, unknown>;

/** Minimal surface of BuilderHook used for tools/list fidelity. */
interface McpParamHook {
    onRegisterParam(
        toolName: string,
        param: { name: string; schema: z.ZodTypeAny; index: number },
        inputSchemaFields: Record<string, z.ZodTypeAny>,
    ): void;
}

interface McpToolDoc {
    name: string;
    title: string;
    description: string;
    category: string;
    methodName: string;
    inputSchema: JsonSchema;
    outputSchema: JsonSchema;
    params: Array<{ name: string; schema: JsonSchema }>;
    /** True when BuilderHook (or similar) rewrote Zod before tools/list. */
    schemaNote?: string;
}

interface CommandOptionDoc {
    flags: string;
    description: string;
    required: boolean;
}

interface CommandDoc {
    name: string;
    description: string;
    sourceFile: string;
    options: CommandOptionDoc[];
}

interface LibExportDoc {
    name: string;
    kind: 'function' | 'const' | 'class' | 'type' | 'other';
    signature: string;
    sourceFile: string;
}

interface LibModuleDoc {
    module: string;
    sourceFile: string;
    exports: LibExportDoc[];
}

interface CoreModuleDoc {
    name: string;
    path: string;
    description: string;
    entryFiles: string[];
    exportCount: number;
}

function parseArgs(argv: string[]) {
    const outIdx = argv.indexOf('--out');
    const layersIdx = argv.indexOf('--layers');
    const layersRaw = layersIdx >= 0 && argv[layersIdx + 1] ? argv[layersIdx + 1] : '1,2,3,4';
    const layers = new Set(
        layersRaw.split(',').map((s) => s.trim()).filter(Boolean),
    );
    return {
        outDir: outIdx >= 0 && argv[outIdx + 1]
            ? path.resolve(argv[outIdx + 1])
            : path.resolve(process.cwd(), 'docs/api/html'),
        layers,
        srcRoot: path.resolve(process.cwd(), 'src'),
    };
}

function ensureDir(p: string) {
    fs.mkdirSync(p, { recursive: true });
}

function writeFile(p: string, content: string) {
    ensureDir(path.dirname(p));
    fs.writeFileSync(p, content);
}

function esc(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Match `McpMiddleware.zodToJSONSchema7`: Gemini-friendly draft-07, no $ref,
 * and **no** `name` wrapper (named conversion emits `$ref` + `definitions`).
 */
function toMcpListJsonSchema(zodSchema: unknown): JsonSchema {
    if (!zodSchema) return { type: 'object', description: 'No schema' };
    try {
        return zodToJsonSchema(zodSchema as any, {
            target: 'jsonSchema7',
            $refStrategy: 'none',
        }) as JsonSchema;
    } catch (e) {
        return { type: 'object', description: String(e instanceof Error ? e.message : e) };
    }
}

/**
 * Apply the same param rewrites MCP registration uses before tools/list.
 * Notably `builder-build.options` becomes a passthrough object — not the full
 * SchemaBuildOption union (that runs only in BuilderHook.onBeforeExecute).
 */
function applyMcpListParamHooks(
    toolName: string,
    paramMetas: Array<{ name: string; schema: z.ZodTypeAny; index: number }>,
    builderHook: McpParamHook,
): { shape: Record<string, z.ZodTypeAny>; note?: string } {
    const shape: Record<string, z.ZodTypeAny> = {};
    let note: string | undefined;
    for (const meta of paramMetas) {
        // Clone so we do not mutate the live toolRegistry entry.
        const param = { name: meta.name, schema: meta.schema, index: meta.index };
        builderHook.onRegisterParam(toolName, param, shape);
        if (!shape[param.name]) {
            shape[param.name] = param.schema;
        }
        if (toolName === 'builder-build' && param.name === 'options') {
            note =
                '注册时 BuilderHook：options → 空 object passthrough；platform 描述会拼上 packages/platforms 扫描到的平台。' +
                '完整 SchemaBuildOption 只在 onBeforeExecute 校验，不进 tools/list。';
        }
    }
    return { shape, note };
}

function relativeAsset(depth: number): string {
    // depth: 1 = root index, 2 = layer index, 3 = detail page
    if (depth <= 1) return 'assets/style.css';
    if (depth === 2) return '../assets/style.css';
    return '../../assets/style.css';
}

function relativeHome(depth: number): string {
    if (depth <= 1) return 'index.html';
    if (depth === 2) return '../index.html';
    return '../../index.html';
}

function page(title: string, body: string, crumb: Array<{ href?: string; label: string }>): string {
    const depth = crumb.length;
    const crumbHtml = crumb.map((c, i) => {
        const sep = i === 0 ? '' : ' <span class="sep">/</span> ';
        return c.href
            ? `${sep}<a href="${esc(c.href)}">${esc(c.label)}</a>`
            : `${sep}<span>${esc(c.label)}</span>`;
    }).join('');

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)} · Cocos CLI 接口文档</title>
  <link rel="stylesheet" href="${relativeAsset(depth)}" />
</head>
<body>
  <header class="top">
    <div class="wrap">
      <a class="brand" href="${relativeHome(depth)}">Cocos CLI 接口文档</a>
      <nav class="crumb">${crumbHtml}</nav>
    </div>
  </header>
  <main class="wrap">
${body}
  </main>
  <footer class="wrap foot">
    由 <code>workflow/generate-api-docs.ts</code> 从代码反查生成 ·
    <a href="https://github.com/cocos/cocos-cli/issues/984">#984</a>
  </footer>
</body>
</html>
`;
}

function css(): string {
    return `:root {
  --bg: #0f1419;
  --panel: #1a2332;
  --text: #e7ecf3;
  --muted: #9aa8bc;
  --accent: #3d8bfd;
  --border: #2a3648;
  --code: #0b1020;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font: 15px/1.55 ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif;
  background: var(--bg);
  color: var(--text);
}
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
.wrap { max-width: 1100px; margin: 0 auto; padding: 0 20px; }
.top {
  border-bottom: 1px solid var(--border);
  background: #121a24;
  position: sticky; top: 0; z-index: 10;
}
.top .wrap { display: flex; gap: 24px; align-items: center; min-height: 56px; }
.brand { font-weight: 700; color: var(--text); }
.crumb { color: var(--muted); font-size: 13px; }
.crumb .sep { opacity: .5; }
.foot { color: var(--muted); font-size: 12px; padding: 32px 20px 48px; border-top: 1px solid var(--border); margin-top: 48px; }
h1 { font-size: 28px; margin: 28px 0 8px; }
h2 { font-size: 20px; margin: 28px 0 12px; border-bottom: 1px solid var(--border); padding-bottom: 6px; }
h3 { font-size: 16px; margin: 20px 0 8px; }
.lead { color: var(--muted); margin: 0 0 24px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
.card {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 14px 16px;
}
.card h3 { margin: 0 0 6px; font-size: 15px; }
.card p { margin: 0; color: var(--muted); font-size: 13px; }
.meta { color: var(--muted); font-size: 13px; margin: 0 0 16px; }
table { width: 100%; border-collapse: collapse; margin: 12px 0 24px; font-size: 14px; }
th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--border); vertical-align: top; }
th { color: var(--muted); font-weight: 600; }
code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
code { background: var(--code); padding: 1px 5px; border-radius: 4px; font-size: 12.5px; }
pre {
  background: var(--code);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px 14px;
  overflow: auto;
  font-size: 12px;
  line-height: 1.45;
}
.badge {
  display: inline-block;
  font-size: 11px;
  padding: 2px 7px;
  border-radius: 999px;
  background: #243047;
  color: var(--muted);
  margin-right: 6px;
}
.req { color: #f0a0a0; }
.callout {
  background: #1e2a3d;
  border: 1px solid #3d5a80;
  border-left: 4px solid var(--accent);
  border-radius: 8px;
  padding: 12px 14px;
  margin: 0 0 20px;
  font-size: 13px;
  color: var(--muted);
}
.callout p { margin: 0 0 8px; }
.callout p:last-child { margin: 0; }
.callout ul { margin: 6px 0 0; padding-left: 1.2em; }
.callout li { margin: 2px 0; }
.note { color: var(--muted); font-size: 13px; margin: 0 0 16px; }
.md-box {
  margin: 0 0 28px;
  border: 1px solid #3d5a80;
  border-radius: 10px;
  overflow: hidden;
  background: var(--code);
  box-shadow: 0 0 0 1px rgba(61, 139, 253, 0.12);
}
.md-box-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  background: #1a2740;
  border-bottom: 1px solid #3d5a80;
  font-size: 12px;
  color: var(--muted);
}
.md-box-bar strong { color: #9ec1ff; font-weight: 600; }
.md-box pre {
  margin: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  padding: 14px 16px 16px;
}
.md-box .fence-lang {
  color: #6b7c93;
  user-select: none;
}
`;
}

/** Layer-1 index：短说明 */
function mcpLlmPromptCallout(): string {
    return `<aside class="callout">
  <p>模型侧工具定义通常是 <code>name</code> + <code>description</code> + <code>inputSchema</code>（经 hook 改写后的 jsonSchema7）。</p>
  <p><code>tools/list</code> 另可带 <code>title</code>（UI）与 <code>outputSchema</code>（结果校验），宿主不一定塞进提示词。见 <code>src/mcp/mcp.middleware.ts</code>。</p>
</aside>`;
}

/** 工具详情：模型侧定义框 + tools/list 其余字段 */
function renderLlmViewBox(tool: McpToolDoc): string {
    // PinK / 常见 MCP client：进模型的是调用契约，不是完整 tools/list 条目。
    const modelPayload = {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
    };
    const listExtras = {
        title: tool.title,
        outputSchema: tool.outputSchema,
    };
    const note = tool.schemaNote
        ? `<p class="note">${esc(tool.schemaNote)}</p>`
        : '';
    return `${note}<section class="md-box" aria-label="模型侧工具定义">
  <div class="md-box-bar">
    <strong>模型侧工具定义</strong>
    <span>通常注入 · <code>name</code> / <code>description</code> / <code>inputSchema</code></span>
  </div>
  <pre><span class="fence-lang">\`\`\`json</span>
${esc(JSON.stringify(modelPayload, null, 2))}
<span class="fence-lang">\`\`\`</span></pre>
</section>
<h2>tools/list 另含（未必进模型）</h2>
<p class="note"><code>title</code> 偏 UI 展示；<code>outputSchema</code> 供结构化结果校验。</p>
<pre>${esc(JSON.stringify(listExtras, null, 2))}</pre>`;
}

// ---------------- Layer 1: MCP ----------------

async function collectMcpTools(): Promise<McpToolDoc[]> {
    const { scanToolsFromRegistry } = await import('../e2e/scripts/tool-utils');
    const infos = await scanToolsFromRegistry();
    // Must load BuilderHook from dist/ so __dirname resolves next to packages/platforms
    // (same as the running MCP server). Importing from src/ misses dynamic platforms.
    const { BuilderHook } = await import('../dist/mcp/hooks/builder.hook.js');
    const builderHook = new BuilderHook() as McpParamHook;
    const tools: McpToolDoc[] = [];
    for (const info of infos) {
        const paramMetas = [...(info.paramSchemas || [])]
            .sort((a, b) => a.index - b.index)
            .filter((p) => p.name)
            .map((p) => ({
                name: p.name as string,
                schema: p.schema as z.ZodTypeAny,
                index: p.index,
            }));
        const { shape, note } = applyMcpListParamHooks(info.toolName, paramMetas, builderHook);
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
            schemaNote: note,
        });
    }
    return tools.sort((a, b) => a.name.localeCompare(b.name));
}

function writeMcpHtml(outDir: string, tools: McpToolDoc[]) {
    const layerDir = path.join(outDir, 'layer1-mcp');
    ensureDir(layerDir);
    const byCat = new Map<string, McpToolDoc[]>();
    for (const t of tools) {
        const list = byCat.get(t.category) || [];
        list.push(t);
        byCat.set(t.category, list);
    }

    let indexBody = `<h1>第 1 层 — 工具（MCP）</h1>
<p class="lead"><code>src/api</code> 通过 <code>@tool</code> 注册，经 MCP <code>tools/list</code> 暴露给 Agent 的契约。</p>
${mcpLlmPromptCallout()}
<p class="meta"><span class="badge">工具</span>共 ${tools.length} 个 · ${byCat.size} 个分类</p>
`;
    for (const category of [...byCat.keys()].sort()) {
        const list = (byCat.get(category) || []).sort((a, b) => a.name.localeCompare(b.name));
        indexBody += `<h2>${esc(category)}（${list.length}）</h2><table><thead><tr><th>工具名</th><th>标题</th></tr></thead><tbody>`;
        for (const t of list) {
            indexBody += `<tr><td><a href="${esc(t.name)}.html"><code>${esc(t.name)}</code></a></td><td>${esc(t.title)}</td></tr>`;
        }
        indexBody += `</tbody></table>`;
    }
    writeFile(
        path.join(layerDir, 'index.html'),
        page('第 1 层 — MCP 工具', indexBody, [
            { href: '../index.html', label: '首页' },
            { label: '第 1 层 · MCP' },
        ]),
    );

    for (const t of tools) {
        const body = `<h1><code>${esc(t.name)}</code></h1>
<p class="meta"><span class="badge">${esc(t.category)}</span> 方法 <code>${esc(t.methodName)}</code> · ${esc(t.title)}</p>
${renderLlmViewBox(t)}`;
        writeFile(
            path.join(layerDir, `${t.name}.html`),
            page(t.name, body, [
                { href: '../index.html', label: '首页' },
                { href: 'index.html', label: '第 1 层 · MCP' },
                { label: t.name },
            ]),
        );
    }
}

// ---------------- Layer 2: Commands ----------------

function collectCommands(srcRoot: string): CommandDoc[] {
    const dir = path.join(srcRoot, 'commands');
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.ts') && f !== 'index.ts' && f !== 'base.ts');
    const docs: CommandDoc[] = [];

    for (const file of files) {
        const sourceFile = path.join('src/commands', file);
        const content = fs.readFileSync(path.join(dir, file), 'utf8');
        const nameMatch = content.match(/\.command\(\s*['"]([^'"]+)['"]\s*\)/);
        if (!nameMatch) continue;
        const descMatch = content.match(/\.description\(\s*['"]([^'"]+)['"]\s*\)/);
        const options: CommandOptionDoc[] = [];
        const optRe = /\.(requiredOption|option)\(\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]*)['"]/g;
        let m: RegExpExecArray | null;
        while ((m = optRe.exec(content))) {
            options.push({
                flags: m[2],
                description: m[3],
                required: m[1] === 'requiredOption',
            });
        }
        docs.push({
            name: nameMatch[1],
            description: descMatch?.[1] || '',
            sourceFile,
            options,
        });
    }
    return docs.sort((a, b) => a.name.localeCompare(b.name));
}

function writeCommandsHtml(outDir: string, commands: CommandDoc[]) {
    const layerDir = path.join(outDir, 'layer2-commands');
    ensureDir(layerDir);
    let indexBody = `<h1>第 2 层 — 命令（CLI）</h1>
<p class="lead"><code>src/commands</code> 中基于 commander 注册的 CLI 子命令（终端入口，给人用，不经 MCP 注入 LLM）。</p>
<p class="meta"><span class="badge">命令</span>共 ${commands.length} 个</p>
<table><thead><tr><th>命令</th><th>说明</th><th>源码</th></tr></thead><tbody>`;
    for (const c of commands) {
        indexBody += `<tr><td><a href="${esc(c.name)}.html"><code>cocos ${esc(c.name)}</code></a></td><td>${esc(c.description)}</td><td><code>${esc(c.sourceFile)}</code></td></tr>`;
    }
    indexBody += `</tbody></table>`;
    writeFile(
        path.join(layerDir, 'index.html'),
        page('第 2 层 — CLI 命令', indexBody, [
            { href: '../index.html', label: '首页' },
            { label: '第 2 层 · 命令' },
        ]),
    );

    for (const c of commands) {
        let body = `<h1><code>cocos ${esc(c.name)}</code></h1>
<p class="lead">${esc(c.description)}</p>
<p class="meta">源码：<code>${esc(c.sourceFile)}</code></p>
<h2>选项</h2>`;
        if (!c.options.length) body += `<p class="meta">未扫描到选项。</p>`;
        else {
            body += `<table><thead><tr><th>标志</th><th>是否必填</th><th>说明</th></tr></thead><tbody>`;
            for (const o of c.options) {
                body += `<tr><td><code>${esc(o.flags)}</code></td><td>${o.required ? '<span class="req">必填</span>' : '可选'}</td><td>${esc(o.description)}</td></tr>`;
            }
            body += `</tbody></table>`;
        }
        writeFile(
            path.join(layerDir, `${c.name}.html`),
            page(`cocos ${c.name}`, body, [
                { href: '../index.html', label: '首页' },
                { href: 'index.html', label: '第 2 层 · 命令' },
                { label: c.name },
            ]),
        );
    }
}

// ---------------- Layer 3: Lib ----------------

function collectLibModules(srcRoot: string): LibModuleDoc[] {
    const libRoot = path.join(srcRoot, 'lib');
    const files: string[] = [];
    function walk(dir: string) {
        for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, ent.name);
            if (ent.isDirectory()) walk(p);
            else if (ent.isFile() && ent.name.endsWith('.ts') && ent.name !== 'index.ts') files.push(p);
        }
    }
    walk(libRoot);

    const modules: LibModuleDoc[] = [];
    for (const file of files) {
        const content = fs.readFileSync(file, 'utf8');
        const rel = path.relative(path.join(srcRoot, '..'), file).replace(/\\/g, '/');
        const module = path.relative(libRoot, file).replace(/\\/g, '/').replace(/\.ts$/, '');
        const exports: LibExportDoc[] = [];

        const patterns: Array<{ re: RegExp; kind: LibExportDoc['kind'] }> = [
            { re: /^export\s+async\s+function\s+(\w+)\s*(\([^)]*\))/gm, kind: 'function' },
            { re: /^export\s+function\s+(\w+)\s*(\([^)]*\))/gm, kind: 'function' },
            { re: /^export\s+class\s+(\w+)/gm, kind: 'class' },
            { re: /^export\s+const\s+(\w+)/gm, kind: 'const' },
            { re: /^export\s+type\s+(\w+)/gm, kind: 'type' },
            { re: /^export\s+interface\s+(\w+)/gm, kind: 'type' },
            { re: /^export\s+enum\s+(\w+)/gm, kind: 'other' },
        ];
        for (const { re, kind } of patterns) {
            let m: RegExpExecArray | null;
            while ((m = re.exec(content))) {
                exports.push({
                    name: m[1],
                    kind,
                    signature: kind === 'function' ? `${m[1]}${m[2] || '()'}` : m[1],
                    sourceFile: rel.startsWith('src/') ? rel : `src/lib/${module}.ts`,
                });
            }
        }
        // dedupe by name
        const seen = new Set<string>();
        const uniq = exports.filter((e) => (seen.has(e.name) ? false : (seen.add(e.name), true)));
        modules.push({ module, sourceFile: `src/lib/${module}.ts`, exports: uniq.sort((a, b) => a.name.localeCompare(b.name)) });
    }
    return modules.sort((a, b) => a.module.localeCompare(b.module));
}

function writeLibHtml(outDir: string, modules: LibModuleDoc[]) {
    const layerDir = path.join(outDir, 'layer3-lib');
    ensureDir(layerDir);
    const totalExports = modules.reduce((n, m) => n + m.exports.length, 0);
    let indexBody = `<h1>第 3 层 — Lib 门面</h1>
<p class="lead"><code>src/lib</code> 对外库门面：给程序化调用 / PinK / 工具进程的稳定 export，内部再动态 import <code>src/core</code>。</p>
<p class="meta"><span class="badge">lib</span>${modules.length} 个模块 · ${totalExports} 个导出</p>
<table><thead><tr><th>模块</th><th>导出数</th><th>源码</th></tr></thead><tbody>`;
    for (const m of modules) {
        const id = m.module.replace(/\//g, '__');
        indexBody += `<tr><td><a href="${esc(id)}.html"><code>${esc(m.module)}</code></a></td><td>${m.exports.length}</td><td><code>${esc(m.sourceFile)}</code></td></tr>`;
    }
    indexBody += `</tbody></table>`;
    writeFile(
        path.join(layerDir, 'index.html'),
        page('第 3 层 — Lib 门面', indexBody, [
            { href: '../index.html', label: '首页' },
            { label: '第 3 层 · Lib' },
        ]),
    );

    for (const m of modules) {
        const id = m.module.replace(/\//g, '__');
        let body = `<h1><code>${esc(m.module)}</code></h1>
<p class="meta">源码：<code>${esc(m.sourceFile)}</code> · ${m.exports.length} 个导出</p>
<table><thead><tr><th>类型</th><th>名称 / 签名</th></tr></thead><tbody>`;
        for (const e of m.exports) {
            body += `<tr><td><span class="badge">${esc(e.kind)}</span></td><td><code>${esc(e.signature)}</code></td></tr>`;
        }
        body += `</tbody></table>`;
        writeFile(
            path.join(layerDir, `${id}.html`),
            page(m.module, body, [
                { href: '../index.html', label: '首页' },
                { href: 'index.html', label: '第 3 层 · Lib' },
                { label: m.module },
            ]),
        );
    }
}

// ---------------- Layer 4: Core ----------------

function collectCoreModules(srcRoot: string): CoreModuleDoc[] {
    const coreRoot = path.join(srcRoot, 'core');
    const entries = fs.readdirSync(coreRoot, { withFileTypes: true });
    const docs: CoreModuleDoc[] = [];

    for (const ent of entries) {
        if (!ent.isDirectory()) {
            if (ent.name.endsWith('.ts') && !ent.name.endsWith('.d.ts')) {
                docs.push({
                    name: ent.name.replace(/\.ts$/, ''),
                    path: `src/core/${ent.name}`,
                    description: 'Core 顶层文件',
                    entryFiles: [`src/core/${ent.name}`],
                    exportCount: countExports(path.join(coreRoot, ent.name)),
                });
            }
            continue;
        }
        if (ent.name === 'test') continue;
        const modPath = path.join(coreRoot, ent.name);
        const entryFiles: string[] = [];
        for (const candidate of ['index.ts', `${ent.name}.ts`]) {
            const p = path.join(modPath, candidate);
            if (fs.existsSync(p)) entryFiles.push(`src/core/${ent.name}/${candidate}`);
        }
        // also count ts files shallow
        let exportCount = 0;
        let fileCount = 0;
        function walk(dir: string, depth: number) {
            if (depth > 2) return;
            for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
                if (e.name === 'test' || e.name === 'node_modules') continue;
                const p = path.join(dir, e.name);
                if (e.isDirectory()) walk(p, depth + 1);
                else if (e.isFile() && e.name.endsWith('.ts') && !e.name.endsWith('.d.ts') && !e.name.includes('.test.')) {
                    fileCount += 1;
                    exportCount += countExports(p);
                }
            }
        }
        walk(modPath, 0);
        docs.push({
            name: ent.name,
            path: `src/core/${ent.name}`,
            description: `${fileCount} 个 TypeScript 文件（深度≤2 扫描）`,
            entryFiles: entryFiles.length ? entryFiles : [`src/core/${ent.name}/`],
            exportCount,
        });
    }
    return docs.sort((a, b) => a.name.localeCompare(b.name));
}

function countExports(file: string): number {
    try {
        const content = fs.readFileSync(file, 'utf8');
        return (content.match(/^export\s+/gm) || []).length;
    } catch {
        return 0;
    }
}

function writeCoreHtml(outDir: string, modules: CoreModuleDoc[]) {
    const layerDir = path.join(outDir, 'layer4-core');
    ensureDir(layerDir);
    let indexBody = `<h1>第 4 层 — Core</h1>
<p class="lead"><code>src/core</code> 实现主体（含 scene-process RPC）。本层为<strong>模块地图 + export 计数</strong>，不做全量函数展开；细节以入口文件与类型包为准。</p>
<p class="meta"><span class="badge">core</span>共 ${modules.length} 个模块</p>
<table><thead><tr><th>模块</th><th>说明</th><th>导出数（约）</th><th>入口</th></tr></thead><tbody>`;
    for (const m of modules) {
        indexBody += `<tr><td><a href="${esc(m.name)}.html"><code>${esc(m.name)}</code></a></td><td>${esc(m.description)}</td><td>${m.exportCount}</td><td><code>${esc(m.entryFiles.join(', '))}</code></td></tr>`;
    }
    indexBody += `</tbody></table>`;
    writeFile(
        path.join(layerDir, 'index.html'),
        page('第 4 层 — Core', indexBody, [
            { href: '../index.html', label: '首页' },
            { label: '第 4 层 · Core' },
        ]),
    );

    for (const m of modules) {
        const body = `<h1><code>${esc(m.name)}</code></h1>
<p class="lead">${esc(m.description)}</p>
<p class="meta">路径：<code>${esc(m.path)}</code></p>
<h2>入口文件</h2>
<ul>${m.entryFiles.map((f) => `<li><code>${esc(f)}</code></li>`).join('')}</ul>
<p class="meta">浅扫描 <code>export</code> 语句约：<strong>${m.exportCount}</strong></p>
<p class="lead">细节请下钻源码或 <code>@cocos/cocos-cli-types</code>；本生成器先保证四层可导航。</p>`;
        writeFile(
            path.join(layerDir, `${m.name}.html`),
            page(m.name, body, [
                { href: '../index.html', label: '首页' },
                { href: 'index.html', label: '第 4 层 · Core' },
                { label: m.name },
            ]),
        );
    }
}

// ---------------- Index + catalog ----------------

function writeHome(
    outDir: string,
    stats: { mcp: number; commands: number; libModules: number; libExports: number; core: number },
    generatedAt: string,
) {
    const body = `<h1>Cocos CLI — 四层接口</h1>
<p class="lead">由代码反查生成的 HTML 文档，请勿手改。重新生成：<code>npm run generate:api-docs</code></p>
<p class="meta">生成时间：${esc(generatedAt)}</p>
<div class="grid">
  <a class="card" href="layer1-mcp/index.html"><h3>1 · 工具（MCP）</h3><p>${stats.mcp} 个工具 · src/api @tool<br/><strong>LLM 提示词只靠 tools/list</strong></p></a>
  <a class="card" href="layer2-commands/index.html"><h3>2 · 命令（CLI）</h3><p>${stats.commands} 个命令 · src/commands</p></a>
  <a class="card" href="layer3-lib/index.html"><h3>3 · Lib 门面</h3><p>${stats.libModules} 模块 / ${stats.libExports} 导出 · src/lib</p></a>
  <a class="card" href="layer4-core/index.html"><h3>4 · Core</h3><p>${stats.core} 个模块 · src/core</p></a>
</div>
<h2>分层结构</h2>
<pre>Agent / PinK
  └─ 第 1 层  MCP 工具          （src/api  @tool + Zod → tools/list 注入 LLM）
人类终端
  └─ 第 2 层  CLI 命令          （src/commands / commander）
程序化宿主
  └─ 第 3 层  Lib 门面          （src/lib → 动态 import core）
实现
  └─ 第 4 层  Core + scene RPC  （src/core）</pre>
<p class="lead">第 1 层工具页用文档框标出模型侧定义（name / description / inputSchema），并单独列出 tools/list 另含字段。</p>
`;
    writeFile(
        path.join(outDir, 'index.html'),
        page('Cocos CLI 接口文档', body, [{ label: '首页' }]),
    );
    writeFile(path.join(outDir, 'assets', 'style.css'), css());
}

async function main() {
    const { outDir, layers, srcRoot } = parseArgs(process.argv.slice(2));
    ensureDir(outDir);
    const generatedAt = new Date().toISOString();
    const stats = { mcp: 0, commands: 0, libModules: 0, libExports: 0, core: 0 };
    const catalog: Record<string, unknown> = { generatedAt, layers: {} };

    if (layers.has('1')) {
        console.log('Layer 1: MCP tools...');
        try {
            const tools = await collectMcpTools();
            writeMcpHtml(outDir, tools);
            stats.mcp = tools.length;
            catalog.layers = { ...(catalog.layers as object), mcp: { count: tools.length, tools: tools.map((t) => t.name) } };
        } catch (e) {
            console.warn('Layer 1 skipped (need dist/):', e instanceof Error ? e.message : e);
            writeFile(
                path.join(outDir, 'layer1-mcp', 'index.html'),
                page('第 1 层 — MCP（不可用）', `<h1>第 1 层暂不可用</h1><p class="lead">${esc(String(e instanceof Error ? e.message : e))}</p><p>请先构建：<code>npm run compile</code></p>`, [
                    { href: '../index.html', label: '首页' },
                    { label: '第 1 层 · MCP' },
                ]),
            );
        }
    }

    if (layers.has('2')) {
        console.log('Layer 2: Commands...');
        const commands = collectCommands(srcRoot);
        writeCommandsHtml(outDir, commands);
        stats.commands = commands.length;
        (catalog.layers as any).commands = commands;
    }

    if (layers.has('3')) {
        console.log('Layer 3: Lib...');
        const modules = collectLibModules(srcRoot);
        writeLibHtml(outDir, modules);
        stats.libModules = modules.length;
        stats.libExports = modules.reduce((n, m) => n + m.exports.length, 0);
        (catalog.layers as any).lib = modules;
    }

    if (layers.has('4')) {
        console.log('Layer 4: Core...');
        const modules = collectCoreModules(srcRoot);
        writeCoreHtml(outDir, modules);
        stats.core = modules.length;
        (catalog.layers as any).core = modules;
    }

    writeHome(outDir, stats, generatedAt);
    writeFile(path.join(outDir, 'catalog.json'), JSON.stringify({ ...catalog, stats }, null, 2) + '\n');
    console.log(`\nHTML docs written to ${outDir}`);
    console.log(JSON.stringify(stats, null, 2));
}

main().catch((err) => {
    console.error(err instanceof Error ? err.stack || err.message : err);
    process.exit(1);
});
