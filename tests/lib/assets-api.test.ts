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

    it('reconciles the canonical builtin mount after persisted enable changes', async () => {
        const canonical = {
            name: 'localization-editor',
            target: 'C:/builtin/static/assets',
            readonly: true,
            visible: true,
            library: 'C:/project/library/localization-editor',
        };
        let persistedEnable = false;
        mockAssetConfig.resolveBuiltinLocalizationMount.mockImplementation(() => {
            if (!persistedEnable) {
                throw new Error('Localization Runtime builtin mount is unavailable or disabled for this project.');
            }
            return canonical;
        });
        mockAssetDBManager.addDB.mockImplementation(async (info: typeof canonical) => {
            mockAssetDBManager.assetDBMap[info.name] = { options: { target: info.target } };
            mockAssetDBManager.assetDBInfo[info.name] = info;
        });

        const reconcile = (Assets as {
            reconcileLocalizationRuntimeMount?: () => Promise<unknown>;
        }).reconcileLocalizationRuntimeMount;
        expect(reconcile).toEqual(expect.any(Function));
        expect(reconcile?.length).toBe(0);
        if (!reconcile) {
            throw new Error('reconcileLocalizationRuntimeMount is not exposed from lib/assets/assets');
        }

        await expect(reconcile()).rejects.toThrow('disabled for this project');
        expect(mockAssetDBManager.addDB).not.toHaveBeenCalled();

        persistedEnable = true;
        await expect(reconcile?.()).resolves.toBe(canonical);
        expect(mockAssetConfig.resolveBuiltinLocalizationMount).toHaveBeenCalledWith();
        expect(mockAssetDBManager.addDB).toHaveBeenCalledWith(canonical);
        expect(mockAssetConfig.data.assetDBList).toEqual([canonical]);
    });

    it('keeps repeated builtin mount reconciliation idempotent', async () => {
        const canonical = {
            name: 'localization-editor',
            target: 'C:/builtin/static/assets',
            readonly: true,
            visible: true,
            library: 'C:/project/library/localization-editor',
        };
        mockAssetConfig.resolveBuiltinLocalizationMount.mockReturnValue(canonical);
        mockAssetDBManager.addDB.mockImplementation(async (info: typeof canonical) => {
            mockAssetDBManager.assetDBMap[info.name] = { options: { target: info.target } };
            mockAssetDBManager.assetDBInfo[info.name] = info;
        });

        const reconcile = (Assets as {
            reconcileLocalizationRuntimeMount: () => Promise<unknown>;
        }).reconcileLocalizationRuntimeMount;
        const first = await reconcile();
        const second = await reconcile();

        expect(first).toBe(second);
        expect(mockAssetDBManager.addDB).toHaveBeenCalledTimes(1);
        expect(mockAssetConfig.data.assetDBList).toEqual([canonical]);
    });

    it('propagates mount and AssetDB failures without reporting success', async () => {
        const canonical = {
            name: 'localization-editor',
            target: 'C:/builtin/static/assets',
            readonly: true,
            visible: true,
            library: 'C:/project/library/localization-editor',
        };
        const resolverError = new Error('builtin manifest unavailable');
        mockAssetConfig.resolveBuiltinLocalizationMount.mockImplementation(() => {
            throw resolverError;
        });
        const reconcile = (Assets as {
            reconcileLocalizationRuntimeMount: () => Promise<unknown>;
        }).reconcileLocalizationRuntimeMount;

        await expect(reconcile()).rejects.toBe(resolverError);
        expect(mockAssetDBManager.addDB).not.toHaveBeenCalled();
        expect(mockAssetConfig.data.assetDBList).toEqual([]);

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
            reconcileLocalizationRuntimeMount: () => Promise<unknown>;
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
