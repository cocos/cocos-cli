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

interface McpToolDoc {
    name: string;
    title: string;
    description: string;
    category: string;
    methodName: string;
    inputSchema: JsonSchema;
    outputSchema: JsonSchema;
    params: Array<{ name: string; schema: JsonSchema }>;
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

function toJsonSchema(zodSchema: unknown, name: string): JsonSchema {
    if (!zodSchema) return { type: 'object', description: 'No schema' };
    try {
        return zodToJsonSchema(zodSchema as any, { name, $refStrategy: 'none' }) as JsonSchema;
    } catch (e) {
        return { type: 'object', description: String(e instanceof Error ? e.message : e) };
    }
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
  padding: 14px 16px;
  margin: 0 0 24px;
}
.callout h2 { margin: 0 0 10px; font-size: 16px; border: 0; padding: 0; }
.callout ul { margin: 8px 0 0; padding-left: 1.2em; }
.callout li { margin: 4px 0; }
.callout .warn { color: #f0c674; margin-top: 10px; }
`;
}

/** MCP 层：说明 LLM 实际拿到的提示词来源（仅 tools/list 字段） */
function mcpLlmPromptCallout(): string {
    return `<aside class="callout">
  <h2>给 LLM 的提示词只靠以下内容</h2>
  <p>Agent / PinK 调用 MCP 时，模型<strong>不会</strong>看到本 HTML 文档站、源码注释或中文附录。
  运行时经 <code>tools/list</code>（见 <code>src/mcp/mcp.middleware.ts</code>）注入的字段<strong>只有</strong>：</p>
  <ul>
    <li><code>name</code> — 来自 <code>@tool('...')</code></li>
    <li><code>title</code> — 来自 <code>@title('...')</code></li>
    <li><code>description</code> — 来自 <code>@description('...')</code></li>
    <li><code>inputSchema</code> — 来自各 <code>@param(ZodSchema)</code>（含 Zod <code>.describe()</code> 文案）</li>
    <li><code>outputSchema</code> — 来自 <code>@result(ZodSchema)</code></li>
  </ul>
  <p class="warn">因此：想改 Agent 行为，请改装饰器与 Zod describe；本页其余说明仅供人类阅读，不会进入 LLM 上下文。</p>
</aside>`;
}

// ---------------- Layer 1: MCP ----------------

async function collectMcpTools(): Promise<McpToolDoc[]> {
    const { scanToolsFromRegistry } = await import('../e2e/scripts/tool-utils');
    const infos = await scanToolsFromRegistry();
    const tools: McpToolDoc[] = [];
    for (const info of infos) {
        const paramMetas = [...(info.paramSchemas || [])]
            .sort((a, b) => a.index - b.index)
            .filter((p) => p.name);
        const shape: Record<string, z.ZodTypeAny> = {};
        for (const p of paramMetas) shape[p.name as string] = p.schema as z.ZodTypeAny;
        const inputZod = z.object(shape);
        const outputZod = info.returnSchema
            ? z.object({ result: info.returnSchema as z.ZodTypeAny })
            : z.object({ result: z.any() });
        tools.push({
            name: info.toolName,
            title: info.title || info.toolName,
            description: info.description || `Tool: ${info.toolName}`,
            category: info.category || 'Unknown',
            methodName: info.methodName,
            inputSchema: toJsonSchema(inputZod, `${info.toolName}_input`),
            outputSchema: toJsonSchema(outputZod, `${info.toolName}_output`),
            params: paramMetas.map((p) => ({
                name: p.name as string,
                schema: toJsonSchema(p.schema, `${info.toolName}_${p.name}`),
            })),
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
        let body = `<h1><code>${esc(t.name)}</code></h1>
<p class="meta"><span class="badge">${esc(t.category)}</span> 方法 <code>${esc(t.methodName)}</code></p>
${mcpLlmPromptCallout()}
<p class="lead"><strong>description（会注入 LLM）：</strong>${esc(t.description)}</p>
<h2>参数（inputSchema，会注入 LLM）</h2>`;
        if (!t.params.length) body += `<p class="meta">无参数。</p>`;
        else {
            for (const p of t.params) {
                body += `<h3><code>${esc(p.name)}</code></h3><pre>${esc(JSON.stringify(p.schema, null, 2))}</pre>`;
            }
        }
        body += `<h2>完整 inputSchema</h2><pre>${esc(JSON.stringify(t.inputSchema, null, 2))}</pre>`;
        body += `<h2>完整 outputSchema（会注入 LLM）</h2><pre>${esc(JSON.stringify(t.outputSchema, null, 2))}</pre>`;
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
<p class="lead">第 1 层详见「给 LLM 的提示词只靠以下内容」说明：模型只看到 name / title / description / inputSchema / outputSchema。</p>
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
            // also keep json next to html for machines
            writeFile(path.join(outDir, 'layer1-mcp', 'tools.json'), JSON.stringify({ toolCount: tools.length, tools }, null, 2) + '\n');
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
