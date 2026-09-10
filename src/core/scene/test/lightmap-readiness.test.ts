jest.mock('cc', () => ({
    gfx: { AttributeName: { ATTR_POSITION: 'position', ATTR_TEX_COORD1: 'uv1' } },
    MeshRenderer: class {}, SkinnedMeshRenderer: class {}, Terrain: class {}, Scene: class {},
    MobilityMode: { Movable: 2 },
}));
import { MeshRenderer, Terrain, type Scene } from 'cc';
import { queryLightmapReadiness, validLightmapUV } from '../scene-process/service/baking/lightfx/readiness';

describe('Lightmap readiness', () => {
    it.each([
        [null, 3, false], [[0, 0], 3, false], [[0, NaN], 1, false], [[Infinity, 0], 1, false],
        [[0, 0, 1, 0, 0, 1], 3, true], [new Float32Array([0, 1]), 1, true], [[], 0, false],
    ])('validates UV1 %p for %p vertices', (uv, count, expected) => {
        expect(validLightmapUV(uv as number[] | null, count as number)).toBe(expected);
    });

    it('reports inherited exclusions, receivers, shadow-only models and invalid UV without mutation', () => {
        const renderer = (uuid: string, bakeable = true, uv: number[] | null = [0, 0, 1, 0, 0, 1]) => ({
            uuid, enabled: true, bakeSettings: { bakeable, castShadow: true, lightmapSize: 64 },
            mesh: { struct: { primitives: [{}] }, readAttribute: (_index: number, name: string) => name === 'uv1' ? uv : Array(9).fill(0) },
        });
        const object = (name: string, models: ReturnType<typeof renderer>[], children: unknown[] = [], mobility = 0) => ({
            name, activeInHierarchy: true, mobility, _objFlags: 0, children,
            getComponents: (type: unknown) => type === MeshRenderer ? models : type === Terrain ? [] : [],
        });
        const scene = object('scene', [], [
            object('valid', [renderer('a')]), object('shadow', [renderer('b', false, null)]),
            object('invalid', [renderer('c', true, null)]),
            object('parent', [], [object('child', [renderer('d')])], 2),
            { ...object('editor helper', [renderer('internal')], [object('nested helper', [renderer('nested')])]), _objFlags: 1 << 10 },
        ]) as unknown as Scene;
        const before = JSON.stringify(scene);
        const result = queryLightmapReadiness(scene);
        expect(result.objects.map(({ componentUuid, receivesLightmap, castsShadow, issues }) => ({ componentUuid, receivesLightmap, castsShadow, issues }))).toEqual([
            { componentUuid: 'a', receivesLightmap: true, castsShadow: true, issues: ['material-approximation'] },
            { componentUuid: 'b', receivesLightmap: false, castsShadow: true, issues: ['material-approximation'] },
            { componentUuid: 'c', receivesLightmap: true, castsShadow: true, issues: ['invalid-uv1', 'material-approximation'] },
            { componentUuid: 'd', receivesLightmap: false, castsShadow: false, issues: ['movable'] },
        ]);
        expect(JSON.stringify(scene)).toBe(before);
    });
});
