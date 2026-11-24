import { assetDump } from '../scene-process/service/dump/types/asset-dump';

class Asset {
    public _uuid = '';

    public initDefault(uuid: string) {
        this._uuid = uuid;
    }
}

class Script extends Asset {}
class TypeScript extends Script {}
class JavaScript extends Script {}
class ModelScript extends Script {}
class OtherAsset extends Asset {}

describe('asset dump for script references', () => {
    const globalScope = globalThis as typeof globalThis & { cc?: unknown };
    const originalCC = globalScope.cc;
    const loadAny = jest.fn((_uuid: string, callback: (error: Error | null, asset?: Asset) => void) =>
        callback(new Error('Script asset is unavailable')));

    beforeAll(() => {
        const classes = new Map<string, typeof Asset>([
            ['cc.Script', Script],
            ['cc.TypeScript', TypeScript],
            ['cc.JavaScript', JavaScript],
            ['ModelScript', ModelScript],
            ['OtherAsset', OtherAsset],
        ]);
        globalScope.cc = {
            js: {
                getClassByName: (name: string) => classes.get(name),
                isChildClassOf: (ctor: typeof Asset | undefined, parent: typeof Asset) =>
                    !!ctor && (ctor === parent || ctor.prototype instanceof parent),
            },
            assetManager: {
                loadAny,
            },
        };
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    beforeEach(() => {
        loadAny.mockImplementation((_uuid, callback) => callback(new Error('Script asset is unavailable')));
    });

    afterAll(() => {
        jest.restoreAllMocks();
        if (originalCC === undefined) {
            delete globalScope.cc;
        } else {
            globalScope.cc = originalCC;
        }
    });

    it('restores a cc.Script reference with its UUID', async () => {
        const data: { script?: Script } = {};
        await assetDump.decode(data, { key: 'script' }, { type: 'cc.Script', value: { uuid: 'base-script' } });

        expect(data.script?.constructor).toBe(Script);
        expect(data.script?._uuid).toBe('base-script');
    });

    it('restores a scalar reference with the declared script subtype and UUID', async () => {
        const data: { script?: Script } = {};
        await assetDump.decode(data, { key: 'script' }, {
            type: 'ModelScript',
            extends: ['cc.Script', 'cc.Asset'],
            value: { uuid: 'model-script' },
        });

        expect(data.script).toBeInstanceOf(ModelScript);
        expect(data.script?._uuid).toBe('model-script');
    });

    it('uses the array element subtype and falls back to the parent type for legacy elements', async () => {
        const data: { scripts?: Script[] } = {};
        await assetDump.decode(data, { key: 'scripts' }, {
            type: 'cc.Script',
            value: [
                { type: 'ModelScript', extends: ['cc.Script', 'cc.Asset'], value: { uuid: 'model-script' } },
                { value: { uuid: 'legacy-script' } },
            ],
        });

        expect(data.scripts?.map((script) => script.constructor)).toEqual([ModelScript, Script]);
        expect(data.scripts?.map((script) => script._uuid)).toEqual(['model-script', 'legacy-script']);
    });

    it.each([TypeScript, JavaScript])('preserves the declared subtype when a scalar loads as %p', async (LoadedScript) => {
        const loaded = new LoadedScript();
        loaded.initDefault('model-script');
        loadAny.mockImplementation((_uuid, callback) => callback(null, loaded));
        const data: { script?: Script } = {};

        await assetDump.decode(data, { key: 'script' }, {
            type: 'ModelScript',
            extends: ['cc.Script', 'cc.Asset'],
            value: { uuid: 'model-script' },
        });

        expect(data.script).toBeInstanceOf(ModelScript);
        expect(data.script?._uuid).toBe('model-script');
    });

    it.each([TypeScript, JavaScript])('preserves element and parent subtypes when an array loads as %p', async (LoadedScript) => {
        const loaded = new LoadedScript();
        loadAny.mockImplementation((_uuid, callback) => callback(null, loaded));
        const data: { scripts?: Script[] } = {};

        await assetDump.decode(data, { key: 'scripts' }, {
            type: 'ModelScript',
            extends: ['cc.Script', 'cc.Asset'],
            value: [
                { type: 'ModelScript', extends: ['cc.Script', 'cc.Asset'], value: { uuid: 'model-script' } },
                { value: { uuid: 'legacy-script' } },
            ],
        });

        expect(data.scripts?.map((script) => script.constructor)).toEqual([ModelScript, ModelScript]);
        expect(data.scripts?.map((script) => script._uuid)).toEqual(['model-script', 'legacy-script']);
    });

    it.each([
        ['cc.Script', Script],
        ['cc.Script', TypeScript],
        ['cc.Script', JavaScript],
        ['cc.TypeScript', TypeScript],
        ['cc.JavaScript', JavaScript],
        ['ModelScript', ModelScript],
        ['UnregisteredScript', TypeScript],
        ['OtherAsset', JavaScript],
        [undefined, TypeScript],
    ] as const)('reuses a compatible %p reference loaded as %p', async (type, LoadedScript) => {
        const loaded = new LoadedScript();
        loaded.initDefault('compatible-script');
        loadAny.mockImplementation((_uuid, callback) => callback(null, loaded));
        const data: { script?: Script; scripts?: Script[] } = {};
        const dump = { type, extends: ['cc.Script', 'cc.Asset'], value: { uuid: loaded._uuid } };

        await assetDump.decode(data, { key: 'script' }, dump);
        await assetDump.decode(data, { key: 'scripts' }, { ...dump, value: [dump] });

        expect(data.script).toBe(loaded);
        expect(data.scripts?.[0]).toBe(loaded);
    });

    it('keeps loaded non-script assets unchanged', async () => {
        const loaded = new OtherAsset();
        loadAny.mockImplementation((_uuid, callback) => callback(null, loaded));
        const data: { asset?: Asset } = {};

        await assetDump.decode(data, { key: 'asset' }, { type: 'OtherAsset', value: { uuid: 'other-asset' } });

        expect(data.asset).toBe(loaded);
    });

    it('still rejects unavailable non-script assets', async () => {
        await expect(assetDump.decode({}, { key: 'asset' }, {
            type: 'OtherAsset',
            value: { uuid: 'missing-asset' },
        })).rejects.toThrow('Failed to load asset using the UUID:missing-asset');
    });

    it.each(['OtherAsset', 'UnregisteredScript', undefined])('falls back to cc.Script for %s and keeps the UUID', async (type) => {
        const data: { script?: Script } = {};
        await assetDump.decode(data, { key: 'script' }, {
            type,
            extends: ['cc.Script', 'cc.Asset'],
            value: { uuid: 'missing-script' },
        });

        expect(data.script?.constructor).toBe(Script);
        expect(data.script?._uuid).toBe('missing-script');
    });
});
