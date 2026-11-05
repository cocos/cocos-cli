import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import baseline from './fixtures/mcp-before-editor-extraction.json';

const root = path.resolve(__dirname, '..');

it('preserves pre-extraction MCP declarations while allowing new tools', () => {
    const actual: typeof baseline = [];
    for (const file of new Set(baseline.map(tool => tool.file))) {
        const source = ts.createSourceFile(file, fs.readFileSync(path.join(root, file), 'utf8'), ts.ScriptTarget.Latest, true);
        const visit = (node: ts.Node) => {
            if (ts.isMethodDeclaration(node)) {
                const decorators = ts.getDecorators(node) ?? [];
                const tool = decorators.find(d => ts.isCallExpression(d.expression) && d.expression.expression.getText(source) === 'tool');
                if (tool && ts.isCallExpression(tool.expression)) {
                    actual.push({ name: (tool.expression.arguments[0] as ts.StringLiteral).text, file,
                        decorators: decorators.map(d => d.getText(source)),
                        parameters: node.parameters.map(p => p.getText(source)), ...(node.type ? { returnType: node.type.getText(source) } : {}) });
                }
            }
            ts.forEachChild(node, visit);
        };
        visit(source);
    }
    expect(baseline).toHaveLength(104);
    const baselineNames = new Set(baseline.map(tool => tool.name));
    expect(baselineNames.size).toBe(baseline.length);
    expect(new Set(actual.map(tool => tool.name)).size).toBe(actual.length);
    // The fixture was recorded on Windows; compare declarations independent of checkout EOLs.
    const normalizeText = (text: string) => text.replace(/\r\n/g, '\n');
    const normalize = (entries: typeof baseline) => entries.map(entry => ({
        ...entry,
        decorators: entry.decorators.map(normalizeText),
        parameters: entry.parameters.map(normalizeText),
        ...(entry.returnType ? { returnType: normalizeText(entry.returnType) } : {}),
    }));
    // Preserve the historical declarations without freezing the current tool inventory.
    const historical = actual.filter(tool => baselineNames.has(tool.name));
    expect(normalize(historical.sort((a, b) => a.name.localeCompare(b.name)))).toEqual(normalize(baseline));
});

it('publishes a CLI without private package dependencies or preview commands', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
        expect(manifest[section]?.['@cocos/scene-editor']).toBeUndefined();
    }
    expect(manifest.workspaces).not.toContain('packages/scene-editor');
    expect(manifest.exports['./host/*']).toBeUndefined();
    expect(fs.existsSync(path.join(root, 'src/core/scene/scene-process/service/operation.ts'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'src/core/scene/scene-process/service/operation/operation-manager.ts'))).toBe(false);
    for (const file of ['preview-play.ts', 'node/node-create-drag.ts', 'node/drag-placement.ts',
        'gizmo/utils/cached-line-geometry.ts', 'gizmo/utils/light-probe-wireframe.ts',
        'utils/cached-line-geometry.ts', 'utils/light-probe-wireframe.ts']) {
        expect(fs.existsSync(path.join(root, 'src/core/scene/scene-process/service', file))).toBe(false);
    }
    const cli = fs.readFileSync(path.join(root, 'src/cli.ts'), 'utf8');
    expect(cli).not.toMatch(/PreviewCommand|SimulatorCommand/);
    const simulator = fs.readFileSync(path.join(root, 'src/lib/simulator/simulator.ts'), 'utf8');
    expect(simulator).not.toMatch(/launchPreview|prepareResources|listSessions|stopAll/);
    const walk = (directory: string) => {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const file = path.join(directory, entry.name);
            if (entry.isDirectory()) walk(file);
            else if (/\.(ts|js)$/.test(file)) expect(fs.readFileSync(file, 'utf8')).not.toMatch(/(?:from\s*|import\s*\(|require\s*\()["'][^"']*(?:packages\/scene-editor|@cocos\/scene-editor)/);
        }
    };
    walk(path.join(root, 'src'));
});
