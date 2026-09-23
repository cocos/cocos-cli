import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import JsZip from 'jszip';

const mockAssetManager = {
    copyAsset: jest.fn(),
    updateUserData: jest.fn(),
    updateUserDataByPath: jest.fn(),
    querySerializedData: jest.fn(),
    saveSerializedData: jest.fn(),
    queryPropertySchema: jest.fn(),
    queryMaterialAllEffects: jest.fn(),
    queryMaterialEffect: jest.fn(),
    queryMaterial: jest.fn(),
    saveMaterial: jest.fn(),
    queryAnimationGraph: jest.fn(),
    queryAnimationGraphInspector: jest.fn(),
    setAnimationGraphInspectorProperty: jest.fn(),
    resetAnimationGraphInspectorProperty: jest.fn(),
    createAnimationGraphInspectorProperty: jest.fn(),
    executeAnimationGraphCommand: jest.fn(),
    saveAnimationGraph: jest.fn(),
    reloadAnimationGraph: jest.fn(),
    onAnimationGraphChanged: jest.fn(),
    queryAssetInfo: jest.fn(),
    queryAssetInfos: jest.fn(),
    queryAssetDependencies: jest.fn(),
};

const mockAssetDBManager = {
    ready: true,
    assetDBMap: {} as Record<string, { options: { target: string } }>,
    assetDBInfo: {} as Record<string, unknown>,
    addDB: jest.fn(),
};

const mockAssetConfig = {
    data: {
        assetDBList: [] as Array<{ name: string }>,
    },
    resolveBuiltinLocalizationMount: jest.fn(),
};

jest.mock('../../src/core/assets', () => ({
    assetDBManager: mockAssetDBManager,
    assetManager: mockAssetManager,
}));

jest.mock('../../src/core/assets/asset-config', () => ({
    __esModule: true,
    default: mockAssetConfig,
}));

import * as Assets from '../../src/lib/assets/assets';

describe('lib assets api', () => {
    afterEach(() => {
        jest.clearAllMocks();
        mockAssetDBManager.ready = true;
        mockAssetDBManager.assetDBMap = {};
        mockAssetDBManager.assetDBInfo = {};
        mockAssetConfig.data.assetDBList = [];
    });

    it('does not expose saveAssetMeta from the public lib API', () => {
        expect((Assets as { saveAssetMeta?: unknown }).saveAssetMeta).toBeUndefined();
    });

    it('does not expose updateAssetMetaUserData from the public lib API', () => {
        expect((Assets as { updateAssetMetaUserData?: unknown }).updateAssetMetaUserData).toBeUndefined();
    });

    it('copyAsset delegates resource and metadata copying to assetManager', async () => {
        const copiedAsset = { uuid: 'copied-uuid', url: 'db://assets/copied.png' };
        mockAssetManager.copyAsset.mockResolvedValue(copiedAsset);

        await expect(Assets.copyAsset(
            'db://assets/source.png',
            'db://assets/copied.png',
            { rename: true },
        )).resolves.toBe(copiedAsset);
        expect(mockAssetManager.copyAsset).toHaveBeenCalledWith(
            'db://assets/source.png',
            'db://assets/copied.png',
            { rename: true },
        );
    });

    it('exports selected assets, folders, metadata and recursive dependencies as a ZIP', async () => {
        const project = mkdtempSync(join(tmpdir(), 'cocos-asset-export-'));
        try {
            const root = join(project, 'assets');
            const folder = join(root, 'sprites');
            mkdirSync(folder, { recursive: true });
            writeFileSync(`${folder}.meta`, 'folder-meta');
            writeFileSync(join(folder, 'hero.prefab'), 'hero');
            writeFileSync(join(folder, 'hero.prefab.meta'), 'hero-meta');
            writeFileSync(join(root, 'texture.png'), 'texture');
            writeFileSync(join(root, 'texture.png.meta'), 'texture-meta');
            writeFileSync(join(root, 'material.mtl'), 'material');
            writeFileSync(join(root, 'material.mtl.meta'), 'material-meta');
            const folderInfo = { uuid: 'folder', url: 'db://assets/sprites', file: folder, isDirectory: true };
            const heroInfo = { uuid: 'hero', url: 'db://assets/sprites/hero.prefab', file: join(folder, 'hero.prefab'), isDirectory: false };
            const textureInfo = { uuid: 'texture', url: 'db://assets/texture.png', file: join(root, 'texture.png'), isDirectory: false };
            const materialInfo = { uuid: 'material', url: 'db://assets/material.mtl', file: join(root, 'material.mtl'), isDirectory: false };
            mockAssetDBManager.assetDBMap.assets = { options: { target: root } };
            mockAssetManager.queryAssetInfos.mockReturnValue([folderInfo, heroInfo, textureInfo, materialInfo]);
            mockAssetManager.queryAssetInfo.mockImplementation((id: string) => ({
                folder: folderInfo,
                hero: heroInfo,
                texture: textureInfo,
                material: materialInfo,
                'db://assets/sprites': folderInfo,
                'db://assets/sprites/hero.prefab': heroInfo,
            } as Record<string, unknown>)[id] ?? null);
            mockAssetManager.queryAssetDependencies.mockImplementation(async (id: string) => ({ hero: ['texture'], texture: ['material'] } as Record<string, string[]>)[id] ?? []);

            const output = join(project, 'package.zip');
            await expect(Assets.exportAssetPackage(['db://assets/sprites'], output, true)).resolves.toBe(4);
            const zip = await JsZip.loadAsync(readFileSync(output));
            await expect(zip.file('sprites/hero.prefab')?.async('string')).resolves.toBe('hero');
            await expect(zip.file('sprites/hero.prefab.meta')?.async('string')).resolves.toBe('hero-meta');
            await expect(zip.file('sprites.meta')?.async('string')).resolves.toBe('folder-meta');
            await expect(zip.file('texture.png')?.async('string')).resolves.toBe('texture');
            await expect(zip.file('texture.png.meta')?.async('string')).resolves.toBe('texture-meta');
            await expect(zip.file('material.mtl')?.async('string')).resolves.toBe('material');

            const selectionOnly = join(project, 'selection-only.zip');
            await expect(Assets.exportAssetPackage(['hero'], selectionOnly, false)).resolves.toBe(1);
            const selectionZip = await JsZip.loadAsync(readFileSync(selectionOnly));
            expect(selectionZip.file('texture.png')).toBeNull();
            expect(selectionZip.file('sprites.meta')).not.toBeNull();

            await expect(Assets.exportAssetPackage(['hero'], output, false)).resolves.toBe(1);
            const replacedZip = await JsZip.loadAsync(readFileSync(output));
            expect(replacedZip.file('texture.png')).toBeNull();
        } finally {
            rmSync(project, { recursive: true, force: true });
        }
    });

    it('rejects invalid selections and unsafe output without writing a ZIP', async () => {
        const project = mkdtempSync(join(tmpdir(), 'cocos-asset-export-'));
        try {
            const root = join(project, 'assets');
            mkdirSync(root);
            mockAssetDBManager.assetDBMap.assets = { options: { target: root } };
            mockAssetManager.queryAssetInfos.mockReturnValue([]);
            mockAssetManager.queryAssetInfo.mockReturnValue(null);
            const output = join(project, 'package.zip');
            await expect(Assets.exportAssetPackage([], output)).rejects.toThrow('Select at least one asset');
            await expect(Assets.exportAssetPackage(['db://internal/icon'], output)).rejects.toThrow('unknown or non-project');
            await expect(Assets.exportAssetPackage(['db://assets/missing'], join(root, 'package.zip'))).rejects.toThrow('outside');
            expect(existsSync(output)).toBe(false);
        } finally {
            rmSync(project, { recursive: true, force: true });
        }
    });

    it('updateAssetUserData delegates complete userData replacement to assetManager', async () => {
        const userData = { minfilter: 'nearest', wrapMode: 'clamp' };
        const result = { ...userData };
        mockAssetManager.updateUserData.mockResolvedValue(result);
        const updateAssetUserData = (Assets as {
            updateAssetUserData?: (
                urlOrUuidOrPath: string,
                userData: Record<string, unknown>
            ) => Promise<unknown>;
        }).updateAssetUserData;

        expect(updateAssetUserData).toEqual(expect.any(Function));

        if (!updateAssetUserData) {
            throw new Error('updateAssetUserData is not exposed from lib/assets/assets');
        }

        await expect(updateAssetUserData('parent-uuid@6c48a', userData)).resolves.toBe(result);
        expect(mockAssetManager.updateUserData).toHaveBeenCalledWith('parent-uuid@6c48a', userData);
    });

    it('updateAssetUserDataByPath delegates path updates to assetManager', async () => {
        const result = { minfilter: 'nearest' };
        mockAssetManager.updateUserDataByPath.mockResolvedValue(result);
        const updateAssetUserDataByPath = (Assets as {
            updateAssetUserDataByPath?: (
                urlOrUuidOrPath: string,
                path: string,
                value: unknown
            ) => Promise<unknown>;
        }).updateAssetUserDataByPath;

        expect(updateAssetUserDataByPath).toEqual(expect.any(Function));

        if (!updateAssetUserDataByPath) {
            throw new Error('updateAssetUserDataByPath is not exposed from lib/assets/assets');
        }

        await expect(updateAssetUserDataByPath('parent-uuid@6c48a', 'minfilter', 'nearest')).resolves.toBe(result);
        expect(mockAssetManager.updateUserDataByPath).toHaveBeenCalledWith('parent-uuid@6c48a', 'minfilter', 'nearest');
    });

    it('exposes serializedData namespace and delegates query/save to assetManager', async () => {
        const result = {
            uuid: 'test-uuid',
            url: 'db://assets/test.pmtl',
            type: 'cc.PhysicsMaterial',
            importer: 'physics-material',
            dump: {},
        };
        mockAssetManager.querySerializedData.mockResolvedValue(result);
        mockAssetManager.saveSerializedData.mockResolvedValue(result);

        expect(Assets.serializedData.query).toEqual(expect.any(Function));
        expect(Assets.serializedData.save).toEqual(expect.any(Function));

        await expect(Assets.serializedData.query('test-uuid')).resolves.toEqual(result);
        await expect(Assets.serializedData.save('test-uuid', {})).resolves.toEqual(result);
        expect(mockAssetManager.querySerializedData).toHaveBeenCalledWith('test-uuid');
        expect(mockAssetManager.saveSerializedData).toHaveBeenCalledWith('test-uuid', {});
    });

    it('exposes material namespace and delegates query/save to assetManager', async () => {
        const effects = {
            'effect-uuid': {
                uuid: 'effect-uuid',
                name: 'builtin-standard',
                hideInEditor: false,
                assetPath: 'db://internal/effects/builtin-standard.effect',
            },
        };
        const effectDump = [{ name: 'default', passes: [] }];
        const materialDump = {
            effect: 'effect-uuid',
            technique: 0,
            data: effectDump,
        };
        mockAssetManager.queryMaterialAllEffects.mockResolvedValue(effects);
        mockAssetManager.queryMaterialEffect.mockResolvedValue(effectDump);
        mockAssetManager.queryMaterial.mockResolvedValue(materialDump);
        mockAssetManager.saveMaterial.mockResolvedValue(undefined);

        expect(Assets.material.query).toEqual(expect.any(Function));
        expect(Assets.material.queryEffect).toEqual(expect.any(Function));
        expect(Assets.material.queryAllEffects).toEqual(expect.any(Function));
        expect(Assets.material.save).toEqual(expect.any(Function));

        await expect(Assets.material.queryAllEffects()).resolves.toEqual(effects);
        await expect(Assets.material.queryEffect('effect-uuid')).resolves.toEqual(effectDump);
        await expect(Assets.material.query('material-uuid')).resolves.toEqual(materialDump);
        await expect(Assets.material.save('material-uuid', materialDump)).resolves.toBeUndefined();

        expect(mockAssetManager.queryMaterialAllEffects).toHaveBeenCalledWith();
        expect(mockAssetManager.queryMaterialEffect).toHaveBeenCalledWith('effect-uuid');
        expect(mockAssetManager.queryMaterial).toHaveBeenCalledWith('material-uuid');
        expect(mockAssetManager.saveMaterial).toHaveBeenCalledWith('material-uuid', materialDump);
    });

    it('exposes animationGraph namespace and delegates document operations to assetManager', async () => {
        const snapshot = {
            uuid: 'graph-uuid',
            url: 'db://assets/test.animgraph',
            documentId: 'document-id',
            revision: 0,
            persistedRevision: 0,
            dirty: false,
            externallyModified: false,
            graph: { layers: [], variables: [] },
        };
        const target = { kind: 'layer' as const, layerIndex: 0 };
        const inspector = { ...snapshot, target, dump: { path: '', value: {} } };
        const request = {
            target,
            path: 'weight',
            patch: { value: 0.5 },
            expected: { documentId: snapshot.documentId, revision: snapshot.revision },
        };
        const commandRequest = {
            command: { type: 'add-layer' as const, name: 'Base' },
            expected: request.expected,
        };
        const removeListener = jest.fn();
        mockAssetManager.queryAnimationGraph.mockResolvedValue(snapshot);
        mockAssetManager.queryAnimationGraphInspector.mockResolvedValue(inspector);
        mockAssetManager.setAnimationGraphInspectorProperty.mockResolvedValue(inspector);
        mockAssetManager.resetAnimationGraphInspectorProperty.mockResolvedValue(inspector);
        mockAssetManager.createAnimationGraphInspectorProperty.mockResolvedValue(inspector);
        mockAssetManager.executeAnimationGraphCommand.mockResolvedValue(snapshot);
        mockAssetManager.saveAnimationGraph.mockResolvedValue(snapshot);
        mockAssetManager.reloadAnimationGraph.mockResolvedValue(snapshot);
        mockAssetManager.onAnimationGraphChanged.mockReturnValue(removeListener);

        await expect(Assets.animationGraph.query('graph-uuid')).resolves.toBe(snapshot);
        await expect(Assets.animationGraph.queryInspector('graph-uuid', target)).resolves.toBe(inspector);
        await expect(Assets.animationGraph.setInspectorProperty('graph-uuid', request)).resolves.toBe(inspector);
        await expect(Assets.animationGraph.resetInspectorProperty('graph-uuid', request)).resolves.toBe(inspector);
        await expect(Assets.animationGraph.createInspectorProperty('graph-uuid', request)).resolves.toBe(inspector);
        await expect(Assets.animationGraph.execute('graph-uuid', commandRequest)).resolves.toBe(snapshot);
        await expect(Assets.animationGraph.save('graph-uuid', request.expected, 'inspector')).resolves.toBe(snapshot);
        await expect(Assets.animationGraph.reload('graph-uuid', { expected: request.expected }, 'inspector')).resolves.toBe(snapshot);
        expect(Assets.animationGraph.onChanged(jest.fn())).toBe(removeListener);

        expect(mockAssetManager.queryAnimationGraph).toHaveBeenCalledWith('graph-uuid');
        expect(mockAssetManager.queryAnimationGraphInspector).toHaveBeenCalledWith('graph-uuid', target);
        expect(mockAssetManager.setAnimationGraphInspectorProperty).toHaveBeenCalledWith('graph-uuid', request);
        expect(mockAssetManager.resetAnimationGraphInspectorProperty).toHaveBeenCalledWith('graph-uuid', request);
        expect(mockAssetManager.createAnimationGraphInspectorProperty).toHaveBeenCalledWith('graph-uuid', request);
        expect(mockAssetManager.executeAnimationGraphCommand).toHaveBeenCalledWith('graph-uuid', commandRequest);
        expect(mockAssetManager.saveAnimationGraph).toHaveBeenCalledWith('graph-uuid', request.expected, 'inspector');
        expect(mockAssetManager.reloadAnimationGraph).toHaveBeenCalledWith('graph-uuid', { expected: request.expected }, 'inspector');
    });

    it('exposes queryPropertySchema and delegates to assetManager', async () => {
        const schema = {
            type: {
                title: 'Import Type',
                type: 'string' as const,
                default: 'sprite-frame',
                enum: ['raw', 'sprite-frame'],
                enumDescriptions: ['Raw', 'Sprite Frame'],
            },
        };
        mockAssetManager.queryPropertySchema.mockResolvedValue(schema);

        await expect(Assets.queryPropertySchema('image')).resolves.toEqual(schema);
        expect(mockAssetManager.queryPropertySchema).toHaveBeenCalledWith('image');
    });

    it('does not record a mount when AssetDB registration fails', async () => {
        const canonical = {
            name: 'localization-editor',
            target: 'C:/builtin/static/assets',
            readonly: true,
            visible: true,
            library: 'C:/project/library/localization-editor',
        };
        const reconcile = (Assets as {
            reconcileLocalizationRuntimeMount: () => Promise<void>;
        }).reconcileLocalizationRuntimeMount;

        const addError = new Error('AssetDB start failed');
        mockAssetConfig.resolveBuiltinLocalizationMount.mockReturnValue(canonical);
        mockAssetDBManager.addDB.mockRejectedValue(addError);

        await expect(reconcile()).rejects.toBe(addError);
        expect(mockAssetConfig.data.assetDBList).toEqual([]);
    });

    it('rejects reconciliation before AssetDB readiness and on same-name target conflict', async () => {
        const canonical = {
            name: 'localization-editor',
            target: 'C:/builtin/static/assets',
            readonly: true,
            visible: true,
            library: 'C:/project/library/localization-editor',
        };
        mockAssetConfig.resolveBuiltinLocalizationMount.mockReturnValue(canonical);
        const reconcile = (Assets as {
            reconcileLocalizationRuntimeMount: () => Promise<void>;
        }).reconcileLocalizationRuntimeMount;

        mockAssetDBManager.ready = false;
        await expect(reconcile()).rejects.toThrow('Asset database is not ready');
        expect(mockAssetConfig.resolveBuiltinLocalizationMount).not.toHaveBeenCalled();

        mockAssetDBManager.ready = true;
        mockAssetDBManager.assetDBMap[canonical.name] = { options: { target: 'C:/other/static/assets' } };
        await expect(reconcile()).rejects.toThrow('target conflict');
        expect(mockAssetDBManager.addDB).not.toHaveBeenCalled();
        expect(mockAssetConfig.data.assetDBList).toEqual([]);
    });
});
