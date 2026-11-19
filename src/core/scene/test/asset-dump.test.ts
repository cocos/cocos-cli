import { assetDump } from '../scene-process/service/dump/types/asset-dump';

class Asset {
    public _uuid = '';

    public initDefault(uuid: string) {
        this._uuid = uuid;
    }
}

class Script extends Asset {}
class ModelScript extends Script {}
class OtherAsset extends Asset {}

describe('asset dump for missing scripts', () => {
    const globalScope = globalThis as typeof globalThis & { cc?: unknown };
    const originalCC = globalScope.cc;

    beforeAll(() => {
        const classes = new Map<string, typeof Asset>([
            ['cc.Script', Script],
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
                loadAny: (_uuid: string, callback: (error: Error) => void) => callback(new Error('Script asset is unavailable')),
            },
        };
        jest.spyOn(console, 'error').mockImplementation(() => {});
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
