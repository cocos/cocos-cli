jest.mock('../scene-process/service/dump/utils', () => ({
    __esModule: true,
    default: {
        getConstructor: (value: object | null, attrs: { ctor?: object }) => attrs.ctor ?? value?.constructor,
        getDefault: (attrs: { default?: unknown }) => attrs.default,
        getTypeName: (ctor?: { name: string }) => ctor?.name ?? 'Unknown',
        getTypeInheritanceChain: () => [],
    },
}));
jest.mock('../scene-process/service/dump/dump-defines', () => ({ DumpDefines: {} }));
jest.mock('../scene-process/service/dump/service-access', () => ({ getDumpComponentAccess: () => ({ getPathFromUuid: () => '' }) }));
jest.mock('../scene-process/service/dump/particle-inspector-metadata', () => ({ applyParticleInspectorMetadata: () => {} }));
jest.mock('../scene-process/service/dump/light-probe-metadata', () => ({ withLightProbeCoefficientType: (attrs: object) => attrs }));
jest.mock('../scene-process/service/dump/lightmap-metadata', () => ({ withLightmapTextureType: (attrs: object) => attrs }));
jest.mock('../scene-process/service/prefab/utils', () => ({ prefabUtils: { getMountedRoot: () => undefined } }));
jest.mock('../scene-process/service/core', () => ({ Service: {} }));
jest.mock('../scene-process/i18n', () => ({ __esModule: true, default: { transI18nName: (value: string) => value } }));
jest.mock('cc', () => ({ MobilityMode: {}, js: { getClassName: () => '' } }));

import { encodeNode, encodeScene } from '../scene-process/service/dump/encode';
import type { Node } from 'cc';

class ProbeInfo {
    static __props__ = ['giScale', '_data'];
    giScale = 2;
    get _data(): object { throw new Error('Baked tables must not be read'); }
}
class Globals {
    static __props__ = ['lightProbeInfo', 'ambient'];
    lightProbeInfo = new ProbeInfo();
    ambient = 3;
}

describe('node dump projection before encoding', () => {
    const globals = globalThis as typeof globalThis & { cc?: unknown; EditorExtends?: unknown };
    const previousCC = globals.cc;
    const previousEditor = globals.EditorExtends;
    beforeAll(() => {
        globals.cc = {
            Class: { attr: () => ({ default: null }) },
            js: { isChildClassOf: () => false, getClassName: () => '' },
            Layers: { Enum: {} }, Object: { Flags: {} },
            math: { Vec3: class { constructor(public x = 0, public y = 0, public z = 0) {} } },
        };
        globals.EditorExtends = { Node: { getNodePath: () => 'Probe' } };
    });
    afterAll(() => {
        globals.cc = previousCC;
        globals.EditorExtends = previousEditor;
    });
    it('omits baked tables while preserving other globals and light-probe settings', () => {
        const scene = { uuid: 'scene', name: 'Scene', active: true, autoReleaseAssets: false, _globals: new Globals(),
            get children(): never { throw new Error('Children must not be read'); } };
        const dump = encodeScene(scene, { includeChildren: false, includeLightProbeData: false });
        expect(dump._globals).toMatchObject({ ambient: { value: 3 }, lightProbeInfo: { value: { giScale: { value: 2 } } } });
        expect(dump._globals.lightProbeInfo.value).not.toHaveProperty('_data');
        // Existing complete reads retain their behavior, including accessing baked data.
        Object.defineProperty(scene, 'children', { value: [] });
        expect(() => encodeScene(scene)).toThrow('Baked tables must not be read');
    });
    it('default scene reads still encode light-probe data', () => {
        const globals = new Globals();
        Object.defineProperty(globals.lightProbeInfo, '_data', { value: 17 });
        expect(encodeScene({ name: 'Scene', uuid: 'scene', children: [], _globals: globals })._globals.lightProbeInfo.value)
            .toMatchObject({ _data: { value: 17 } });
    });
    it('does not encode component properties or children for node-only reads', () => {
        const node = { uuid: 'probe', active: true, name: 'Probe', objFlags: 0, position: { x: 1 }, eulerAngles: {}, scale: {},
            mobility: 0, layer: 0, parent: null,
            _components: [{ objFlags: 0, get uuid(): never { throw new Error('Component must not be encoded'); } }],
            get children(): never { throw new Error('Children must not be read'); } } as unknown as Node;
        expect(encodeNode(node, { includeChildren: false, includeComponents: false })).toMatchObject({
            position: { value: { x: 1 } }, __comps__: [], children: [],
        });
        expect(() => encodeNode(node, { includeChildren: false })).toThrow('Component must not be encoded');
    });
});
