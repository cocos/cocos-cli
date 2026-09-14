const mockGetScene = jest.fn();
const mockGetEditorType = jest.fn();
const mockAttributes = jest.fn();
const mockQueryCurrent = jest.fn();
const mockQueryNode = jest.fn();
const mockHost = jest.fn();

jest.mock('cc', () => ({
    director: { getScene: mockGetScene },
    CCClass: { attr: mockAttributes },
    js: { getClassName: (ctor: { name: string }) => ctor.name },
}));
jest.mock('../scene-process/service/core', () => ({
    BaseService: class {}, register: () => () => undefined,
    Service: {
        Editor: { getCurrentEditorType: mockGetEditorType, queryCurrent: mockQueryCurrent },
        Node: { query: mockQueryNode },
    },
}));
jest.mock('../scene-process/service/baking/lightfx/baker', () => ({
    lightFXCoordinator: { bake: mockHost, queryDiagnostics: mockHost },
}));
jest.mock('../scene-process/service/baking/lightfx/host', () => ({
    lightFXBakeHost: { queryCapabilities: mockHost, reserveSceneOperation: mockHost },
}));
jest.mock('../scene-process/service/baking/lightfx/settings', () => ({
    createDefaultLightFXSettings: mockHost,
}));

import { LightProbeBakeService } from '../scene-process/service/light-probe-bake';
import type { ILightProbeSettings } from '../common/lightfx-bake';

const initial = {
    giScale: 2, giSamples: 1024, bounces: 2, reduceRinging: 0.03,
    showWireframe: false, showConvex: true, lightProbeSphereVolume: 3,
};
const types = {
    giScale: 'Float', giSamples: 'Integer', bounces: 'Integer', reduceRinging: 'Float',
    showWireframe: 'Boolean', showConvex: 'Boolean', lightProbeSphereVolume: 'Float',
};
const query = (): Promise<ILightProbeSettings> => new LightProbeBakeService().querySettings();

describe('Light probe lightweight settings', () => {
    let info: typeof initial;
    let globals: { lightProbeInfo: typeof initial };
    let attributes: Record<string, Record<string, unknown>>;
    let parentAttributes: Record<string, unknown>;

    beforeEach(() => {
        jest.resetAllMocks();
        info = { ...initial };
        for (const key of ['data', '_data']) {
            Object.defineProperty(info, key, { get() { throw new Error('Must not read baked probe data'); } });
        }
        globals = { lightProbeInfo: info };
        mockGetScene.mockReturnValue({ globals, get children() { throw new Error('Must not traverse the scene'); } });
        mockGetEditorType.mockReturnValue('scene');
        parentAttributes = {};
        attributes = Object.fromEntries(Object.entries(types).map(([key, type]) => [key, {
            ...(type === 'Boolean' ? {} : { type }), hasGetter: true, hasSetter: true,
        }]));
        mockAttributes.mockImplementation((owner, key) => owner === globals.constructor ? parentAttributes : attributes[key]);
        for (const mock of [mockQueryCurrent, mockQueryNode, mockHost]) {
            mock.mockImplementation(() => { throw new Error('Must not dump the scene or contact the native host'); });
        }
    });

    afterEach(() => {
        expect(mockQueryCurrent).not.toHaveBeenCalled();
        expect(mockQueryNode).not.toHaveBeenCalled();
        expect(mockHost).not.toHaveBeenCalled();
    });

    it('reads exactly seven scalar settings and instance metadata without accessing probe data', async () => {
        const expected = Object.fromEntries(Object.entries(initial).map(([key, value]) => [key, {
            value, type: types[key as keyof typeof types], readonly: false,
        }]));
        await expect(query()).resolves.toEqual(expected);
        expect(mockAttributes.mock.calls).toEqual([
            [globals.constructor, 'lightProbeInfo'], ...Object.keys(initial).map(key => [info, key]),
        ]);
        expect(info).toEqual(initial);
    });

    it.each([null, { probes: [], tetrahedrons: [] }])('does not require generated or baked data: %p', async data => {
        globals.lightProbeInfo = { ...initial, data } as typeof initial;
        await expect(query()).resolves.toMatchObject({ giSamples: { value: 1024 } });
    });

    it('returns fresh live values and detached results on repeated queries', async () => {
        const first = await query();
        first.giScale.value = 99;
        expect(info.giScale).toBe(2);
        info.giScale = 4;
        info.showWireframe = true;
        attributes.giScale.readonly = true;
        await expect(query()).resolves.toMatchObject({
            giScale: { value: 4, readonly: true }, showWireframe: { value: true },
        });
    });

    it('preserves engine type overrides and getter-only readonly metadata', async () => {
        attributes.giScale = { type: 'Integer', hasGetter: true, hasSetter: false };
        attributes.bounces = { ctor: Number, type: 'Float', readonly: { deep: true } };
        await expect(query()).resolves.toMatchObject({
            giScale: { value: 2, type: 'Integer', readonly: true },
            bounces: { value: 2, type: 'Number', readonly: true },
        });
    });

    it.each([{ readonly: true }, { readonly: { deep: true } }, { hasGetter: true, hasSetter: false }])(
        'includes parent readonly in the panel effective editability: %p', async attrs => {
            parentAttributes = Object.freeze(attrs);
            const result = await query();
            expect(Object.values(result).every(property => property.readonly)).toBe(true);
        },
    );

    it('rejects a closed scene', async () => {
        mockGetScene.mockReturnValue(null);
        await expect(query()).rejects.toThrow('No scene is currently open.');
        expect(mockAttributes).not.toHaveBeenCalled();
    });

    it.each(['prefab', 'unknown'])('does not read the backing scene of a %s editor', async type => {
        mockGetEditorType.mockReturnValue(type);
        await expect(query()).rejects.toThrow('scene editor');
        expect(mockAttributes).not.toHaveBeenCalled();
    });

    it('reports missing settings instead of returning invented defaults', async () => {
        mockGetScene.mockReturnValue({ globals: {} });
        await expect(query()).rejects.toThrow('unavailable');
    });

    it.each([NaN, Infinity, '2', false, null])('rejects invalid numeric setting %p', async value => {
        Object.assign(info, { giScale: value });
        await expect(query()).rejects.toThrow('giScale');
    });

    it('does not coerce an invalid boolean setting', async () => {
        Object.assign(info, { showConvex: 1 });
        await expect(query()).rejects.toThrow('showConvex');
    });
});
