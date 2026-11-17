import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import { EventEmitter } from 'events';
import os from 'os';
import { pathToFileURL } from 'url';
import { ModLo } from '@cocos/creator-programming-mod-lo/lib/mod-lo';
import { QuickPack } from '@cocos/creator-programming-quick-pack/lib/quick-pack';
import { attachModuleResolutionDiagnostics, getMissingRelativeImport } from '../packer-driver/module-resolution-diagnostics';
import { CompilationState } from '../compilation-state';

// Execute production methods without loading the engine and asset database.
const source = ts.createSourceFile('packer.ts', fs.readFileSync(path.join(__dirname, '../packer-driver/index.ts'), 'utf8'), ts.ScriptTarget.Latest, true);
function method(...names: string[]): string {
    let result = '';
    function visit(node: ts.Node) {
        if (ts.isMethodDeclaration(node) && names.includes(node.name.getText(source))) result += node.getText(source) + '\n';
        ts.forEachChild(node, visit);
    }
    visit(source);
    if (!result) throw new Error('Missing production methods: ' + names.join(', '));
    return ts.transpileModule(`class Harness { ${result} }`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText + '\nreturn new Harness();';
}

describe('script compilation failure recovery', () => {
    function driver(target: any) {
        const state = new CompilationState();
        const events = new EventEmitter();
        const compiled = jest.fn(); events.on('compiled', compiled);
        const driver = new Function('compilationState', 'eventEmitter', 'AssetActionEnum', method('_startBuild'))(state, events, { change: 'change' });
        const change = { filePath: 'Importer.ts', type: 'change' };
        Object.assign(driver, { _logger: { clear() {}, debug() {} }, _assetChangeQueue: [change], _beforeBuildTasks: [], _featureChanged: false, _targets: { preview: target }, beforeEditorBuildDelegate: { dispatch: async () => {} } });
        return { driver, change, state, compiled };
    }

    it('clears busy state, retains changes and preserves the original error, then retries', async () => {
        const error = new Error('Missing dependency');
        const target = { applyAssetChanges: jest.fn().mockRejectedValueOnce(error).mockResolvedValue(undefined), build: jest.fn().mockResolvedValue({}) };
        const { driver: d, change, state, compiled } = driver(target);
        await expect(d._startBuild('failed-task')).rejects.toBe(error);
        expect(d._building).toBe(false);
        expect(d._currentTaskId).toBeNull();
        expect(d._assetChangeQueue).toEqual([change]);
        expect(compiled).not.toHaveBeenCalled();
        expect(state.getStatus()).toMatchObject({ state: 'failed', error: { message: error.message } });
        await d._startBuild('retry');
        expect(target.applyAssetChanges).toHaveBeenLastCalledWith([change]);
        expect(d._assetChangeQueue).toEqual([]);
        expect(state.getStatus()).toEqual({ state: 'ready', revision: 1 });
        expect(compiled).toHaveBeenCalledTimes(1);
    });

    it('does not publish success when a target returns an error', async () => {
        const error = Object.assign(new Error('Syntax error'), { file: 'Broken.ts' });
        const { driver: d, state, compiled } = driver({ applyAssetChanges: async () => {}, build: async () => ({ err: error }), deleteCacheFile: jest.fn() });
        await expect(d._startBuild()).rejects.toBe(error);
        expect(compiled).not.toHaveBeenCalled();
        expect(d._assetChangeQueue).toEqual([]);
        expect(state.getStatus()).toMatchObject({ state: 'failed', error: { file: 'Broken.ts' } });
    });

    it('does not re-register a rejected script when importing another script or fixing it later', async () => {
        const entries = new Set<string>();
        let broken = true;
        const error = Object.assign(new SyntaxError('Unexpected token'), { file: 'Broken.ts' });
        const target = {
            applyAssetChanges: jest.fn(async (changes: any[]) => {
                for (const change of changes) entries.add(change.filePath);
            }),
            build: jest.fn(async () => entries.has('Broken.ts') && broken ? { err: error } : {}),
            deleteCacheFile: jest.fn((file: string) => entries.delete(file)),
        };
        const { driver: d, state, compiled } = driver(target);
        const bad = { filePath: 'Broken.ts', type: 'change' };
        const good = { filePath: 'Good.ts', type: 'change' };
        d._assetChangeQueue = [bad];
        await expect(d._startBuild()).rejects.toBe(error);
        expect(entries.has('Broken.ts')).toBe(false);
        d._assetChangeQueue.push(good);
        await expect(d._startBuild()).resolves.toBeUndefined();
        expect(target.applyAssetChanges).toHaveBeenLastCalledWith([good]);
        expect(entries.has('Broken.ts')).toBe(false);
        expect(state.getStatus()).toMatchObject({ state: 'ready', revision: 1 });
        broken = false;
        d._assetChangeQueue.push(bad);
        await expect(d._startBuild()).resolves.toBeUndefined();
        expect(entries.has('Broken.ts')).toBe(true);
        expect(compiled).toHaveBeenCalledTimes(2);
    });

    it('retries an interrupted application across all targets before building any target', async () => {
        const error = new Error('Entry update failed');
        const first = { applyAssetChanges: jest.fn(async () => {}), build: jest.fn(async () => ({})) };
        const second = {
            applyAssetChanges: jest.fn().mockRejectedValueOnce(error).mockResolvedValue(undefined),
            build: jest.fn(async () => ({})),
        };
        const { driver: d, change } = driver(first);
        d._targets = { editor: first, preview: second };
        await expect(d._startBuild()).rejects.toBe(error);
        expect(d._assetChangeQueue).toEqual([change]);
        expect(first.build).not.toHaveBeenCalled();
        expect(second.build).not.toHaveBeenCalled();
        await d._startBuild();
        expect(first.applyAssetChanges).toHaveBeenCalledTimes(2);
        expect(second.applyAssetChanges).toHaveBeenCalledTimes(2);
        expect(first.build).toHaveBeenCalledTimes(1);
        expect(second.build).toHaveBeenCalledTimes(1);
    });

    it('preserves newer queued changes without replaying applied changes or engine features', async () => {
        const error = Object.assign(new Error('Syntax error'), { file: 'Broken.ts' });
        const { driver: d, change } = driver({
            applyAssetChanges: async () => {},
            build: async () => { d._assetChangeQueue.push({ filePath: 'New.ts', type: 'change' }); return { err: error }; },
            deleteCacheFile: jest.fn(),
        });
        d._featureChanged = true;
        d._syncEngineFeatures = jest.fn(async () => {});
        await expect(d._startBuild()).rejects.toBe(error);
        expect(d._assetChangeQueue).toEqual([{ filePath: 'New.ts', type: 'change' }]);
        expect(d._assetChangeQueue).not.toContain(change);
        expect(d._featureChanged).toBe(false);
    });

    it('serializes overlapping iterations', async () => {
        const state = new CompilationState();
        let release!: () => void;
        const first = state.run(() => new Promise<void>(resolve => { release = resolve; }));
        const secondBuild = jest.fn(async () => {});
        const second = state.run(secondBuild);
        await Promise.resolve();
        expect(secondBuild).not.toHaveBeenCalled();
        expect(state.getStatus().state).toBe('compiling');
        release(); await Promise.all([first, second]);
        expect(state.getStatus()).toEqual({ state: 'ready', revision: 2 });
    });

    it.each([undefined, 42])('updates the entry with non-callable console timers (%s)', async timer => {
        const runtimeConsole = { time: timer, timeEnd: timer };
        const makeSource = () => 'export const value = 2;';
        const target = new Function('console', 'performance', 'makePrerequisiteImportsMod', 'makeTentativePrerequisiteImports', 'OPTIMIZE_ENTRY_SOURCE_COMPILATION', 'AssetActionEnum', method('applyAssetChanges'))(runtimeConsole, { now: () => 1 }, makeSource, makeSource, true, {});
        Object.assign(target, { _ensureIdle() {}, _getPrerequisiteAssetModsWithFilter: async () => [], _entryMod: { source: '' }, _entryModSource: '', _logger: { debug() {} } });
        await expect(target.applyAssetChanges([])).resolves.toBeUndefined();
        expect(target._entryMod.source).toBe(makeSource());
    });
});

describe('restore script entries when dependencies appear', () => {
    it.each([
        { name: 'separate additions', initial: { A: "import './B'; import './C'; export class A {}" }, batches: [{ B: 'export {}' }, { C: 'export {}' }], missing: ['./B', './C'] },
        { name: 'one batch', initial: { A: "import './B'; import './C'; export class A {}" }, batches: [{ B: 'export {}', C: 'export {}' }], missing: ['./B'] },
        { name: 'transitive import', initial: { A: "import './B'; export class A {}", B: "import './C';" }, batches: [{ C: 'export {}' }], missing: ['./C'] },
        { name: 'cycle', initial: { A: "import './B'; export class A {}" }, batches: [{ B: "import './A'; export class B {}" }], missing: ['./B'] },
    ])('restores unchanged entries for $name', async ({ initial, batches, missing }) => {
        const temporaryRoot = fs.realpathSync(os.tmpdir());
        const directory = fs.realpathSync(fs.mkdtempSync(path.join(temporaryRoot, 'cli-missing-dependency-')));
        try {
            const workspace = path.join(directory, 'out');
            fs.mkdirSync(workspace);
            const logger = { debug() {}, info() {}, warn() {}, error() {} };
            const modLo = new ModLo({ _compressUUID: uuid => uuid, logger });
            modLo.setExternals(['cc']);
            modLo.setAssetPrefixes([pathToFileURL(directory + path.sep).href]);
            attachModuleResolutionDiagnostics(modLo, 'preview', () => {});
            const pack = new QuickPack({ modLo, origin: directory, workspace, logger });
            const makeSource = (entries: string[]) => JSON.stringify(entries);
            const target = new Function('getMissingRelativeImport', 'makePrerequisiteImportsMod',
                'makeTentativePrerequisiteImports', 'OPTIMIZE_ENTRY_SOURCE_COMPILATION', 'AssetActionEnum',
                method('applyAssetChanges', 'deleteCacheFile', 'restoreEntriesWithResolvedDependencies'))(
                getMissingRelativeImport, makeSource, makeSource, true, { add: 'add', change: 'change', delete: 'delete' });
            Object.assign(target, {
                _ensureIdle() {}, _modLo: modLo, _uuidURLMap: new Map(),
                _prerequisiteAssetMods: new Set(), _waitingForDependency: new Map(),
                _getPrerequisiteAssetModsWithFilter: async () => [...target._prerequisiteAssetMods],
                _entryMod: { source: '' }, _entryModSource: '', _logger: logger,
            });
            const failures: string[] = [];
            const addAndBuild = async (scripts: Record<string, string | undefined>) => {
                const changes = Object.entries(scripts).map(([name, code]) => {
                    const file = path.join(directory, name + '.ts');
                    fs.writeFileSync(file, code!);
                    return { type: 'add', uuid: name, url: pathToFileURL(file) };
                });
                await target.applyAssetChanges(changes);
                try {
                    await pack.build(JSON.parse(target._entryMod.source));
                } catch (error) {
                    const request = getMissingRelativeImport(error);
                    if (!request) throw error;
                    failures.push(request[0]);
                    target.deleteCacheFile((error as Error & { file: string }).file, error);
                }
            };

            await addAndBuild(initial);
            const importer = path.join(directory, 'A.ts');
            const timestamp = fs.statSync(importer).mtimeMs;
            for (const batch of batches) await addAndBuild(batch);
            expect(failures).toEqual(missing);
            expect(target._waitingForDependency.size).toBe(0);
            expect(fs.statSync(importer).mtimeMs).toBe(timestamp);
            const { imports } = JSON.parse(fs.readFileSync(path.join(workspace, 'import-map.json'), 'utf8'));
            for (const name of ['A', 'B']) {
                const entry = imports[pathToFileURL(path.join(directory, name + '.ts')).href];
                expect(entry).toBeDefined();
                expect(fs.existsSync(path.resolve(workspace, entry))).toBe(true);
            }
        } finally {
            expect(path.dirname(directory)).toBe(temporaryRoot);
            expect(path.basename(directory)).toMatch(/^cli-missing-dependency-/);
            fs.rmSync(directory, { recursive: true, force: true });
        }
    });
});
