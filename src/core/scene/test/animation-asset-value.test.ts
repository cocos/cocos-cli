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
            getClassName(value: object) {
                return `cc.${value.constructor.name}`;
            },
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

    it('uses a default placeholder when loading the referenced resource fails', async () => {
        const {
            loadAnimationAssetValue,
            queryAnimationAssetCtor,
            serializeAnimationAssetValue,
        } = require('../scene-process/service/animation/asset-value');
        const ctor = queryAnimationAssetCtor({ type: { value: 'cc.TextureAsset' } });
        loadAny.mockImplementation((uuid: string, callback: (error: Error) => void) => {
            callback(new Error(`Resource not found: ${uuid}`));
        });

        const placeholder = await loadAnimationAssetValue(ctor, 'missing-texture');

        expect(placeholder).toBeInstanceOf(ctor);
        expect(serializeAnimationAssetValue(placeholder)).toEqual({ uuid: 'missing-texture' });
    });

    it.each([false, true])('loads another resource subclass, cleared=%s', async (clearKeys) => {
        const { Asset } = require('cc');
        const {
            createPropertyDescriptor,
        } = require('../scene-process/service/animation/property-curve-track');
        const {
            loadAnimationAssetValue,
            queryAnimationAssetCtor,
        } = require('../scene-process/service/animation/asset-value');
        class IconAsset extends Asset { }
        let keyframes = [[0, new IconAsset()]];
        const track = { channels: () => [{ curve: { keyframes: () => keyframes } }] };
        let metadata = createPropertyDescriptor('TestComponent.resource', undefined, 'object', track);
        if (clearKeys) {
            keyframes = [];
            metadata = createPropertyDescriptor('TestComponent.resource', undefined, 'object', track);
        }
        const TextureAsset = queryAnimationAssetCtor({ type: { value: 'cc.TextureAsset' } });
        const texture = new TextureAsset();
        texture._uuid = 'texture-uuid';
        loadAny.mockImplementation((_uuid: string, callback: (error: null, asset: object) => void) => {
            callback(null, texture);
        });

        const loaded = await loadAnimationAssetValue(queryAnimationAssetCtor(metadata), texture._uuid);

        expect(loaded).toBe(texture);
    });

    it('preserves a declared resource type when reading cached track metadata', () => {
        const {
            createPropertyDescriptor,
        } = require('../scene-process/service/animation/property-curve-track');
        const { queryAnimationAssetCtor } = require('../scene-process/service/animation/asset-value');
        const type = { value: 'cc.TextureAsset' };
        const TextureAsset = queryAnimationAssetCtor({ type });
        const track = { channels: () => [{ curve: { keyframes: () => [] } }] };
        createPropertyDescriptor(
            'TestComponent.resource', undefined, 'object', track, type, TextureAsset,
        );

        const metadata = createPropertyDescriptor('TestComponent.resource', undefined, 'object', track);

        expect(queryAnimationAssetCtor(metadata)).toBe(TextureAsset);
        expect(metadata.type).toEqual(type);
    });
});
