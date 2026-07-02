const loadAny = jest.fn();

jest.mock('cc', () => {
    class Asset {
        _uuid = '';

        initDefault(uuid?: string) {
            this._uuid = uuid || this._uuid;
        }
    }

    class TextureAsset extends Asset { }

    return {
        Asset,
        assetManager: { loadAny },
        js: {
            getClassByName(name: string) {
                return name === 'cc.TextureAsset' ? TextureAsset : null;
            },
        },
    };
});

describe('Animation asset value helpers', () => {
    beforeEach(() => {
        jest.resetModules();
        loadAny.mockReset();
    });

    it('uses metadata valueCtor for generic asset values without concrete asset type branches', () => {
        const { Asset } = require('cc');
        const {
            createAnimationAssetPlaceholder,
            queryAnimationAssetCtor,
            queryAnimationAssetUuid,
            serializeAnimationAssetValue,
        } = require('../scene-process/service/animation/asset-value');

        class IconAsset extends Asset { }
        const ctor = queryAnimationAssetCtor({
            type: { value: 'cc.DoesNotNeedClassLookup' },
            valueCtor: IconAsset,
        });

        expect(ctor).toBe(IconAsset);

        const placeholder = createAnimationAssetPlaceholder(ctor, 'icon-uuid');

        expect(placeholder).toBeInstanceOf(IconAsset);
        expect(queryAnimationAssetUuid(placeholder)).toBe('icon-uuid');
        expect(serializeAnimationAssetValue(placeholder)).toEqual({ uuid: 'icon-uuid' });
    });

    it('falls back to metadata type class lookup for generic asset values', () => {
        const {
            createAnimationAssetPlaceholder,
            queryAnimationAssetCtor,
            serializeAnimationAssetValue,
        } = require('../scene-process/service/animation/asset-value');

        const ctor = queryAnimationAssetCtor({ type: { value: 'cc.TextureAsset' } });
        const placeholder = createAnimationAssetPlaceholder(ctor, 'texture-uuid');

        expect(serializeAnimationAssetValue(placeholder)).toEqual({ uuid: 'texture-uuid' });
    });
});
