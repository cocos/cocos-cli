const mockFiles = new Map<string, unknown>();
const mockMtimes = new Map<string, number>();

class MockAsset {
    _uuid = '';
}

class MockAnimationClip extends MockAsset {}

class MockAnimationGraph extends MockAsset {
    clips: MockAnimationClip[] = [];
}

class MockClipOverrideMap {
    entries: Array<{ original: MockAnimationClip; substitution: MockAnimationClip }> = [];

    [Symbol.iterator]() {
        return this.entries[Symbol.iterator]();
    }

    clear() {
        this.entries.length = 0;
    }

    set(original: MockAnimationClip, substitution: MockAnimationClip) {
        this.entries.push({ original, substitution });
    }
}

class MockAnimationGraphVariant extends MockAsset {
    original: MockAnimationGraph | null = null;
    marker = '';
    clipOverrides = new MockClipOverrideMap();
}

class MockDeserializeDetails {
    refs: Array<{ uuid: string; type: new () => MockAsset; assign: (asset: MockAsset) => void }> = [];

    reset() {
        this.refs.length = 0;
    }

    assignAssetsBy(factory: (uuid: string, options?: { type?: new () => MockAsset }) => MockAsset) {
        for (const ref of this.refs) {
            ref.assign(factory(ref.uuid, { type: ref.type }));
        }
    }
}

const mockAssets = new Map<string, any>();
const mockSavedAssets: Array<{ uuid: string; content: string }> = [];
const mockAssetQuery = {
    queryAsset: jest.fn((uuid: string) => mockAssets.get(uuid) || null),
    queryAssetProperty: jest.fn((asset: { type?: string; meta?: { importer?: string } }, property: string) => (
        property === 'type' && asset.meta?.importer === 'gltf-animation' ? 'cc.AnimationClip' : asset[property as keyof typeof asset]
    )),
    queryAssetMtime: jest.fn((uuid: string) => {
        const asset = mockAssets.get(uuid);
        return asset ? mockMtimes.get(asset.source) ?? null : null;
    }),
};
const mockAssetOperation = {
    saveAsset: jest.fn(async (uuid: string, content: string) => {
        const asset = mockAssets.get(uuid);
        mockFiles.set(asset.source, JSON.parse(content));
        mockSavedAssets.push({ uuid, content });
        return asset;
    }),
};

const mockCC = {
    Asset: MockAsset,
    AnimationClip: MockAnimationClip,
    deserialize: Object.assign(
        (serialized: any, details: MockDeserializeDetails) => mockDeserialize(serialized, details),
        { Details: MockDeserializeDetails },
    ),
};

const mockNewGenAnim = {
    AnimationGraph: MockAnimationGraph,
    AnimationGraphVariant: MockAnimationGraphVariant,
    visitAnimationClips: function* (graph: MockAnimationGraph) {
        yield* graph.clips;
    },
};

jest.mock('fs-extra', () => ({
    readFile: jest.fn(async (source: string) => JSON.stringify(mockFiles.get(source))),
    stat: jest.fn(async (source: string) => ({ mtimeMs: mockMtimes.get(source) ?? 1 })),
}));
// EngineLoader changes module resolution in the shared serial worker. Mock its
// runtime aliases directly so these factories do not depend on proxy-file paths.
jest.mock('cc', () => mockCC, { virtual: true });
jest.mock('cc/editor/new-gen-anim', () => mockNewGenAnim, { virtual: true });
jest.mock('../manager/query', () => ({
    __esModule: true,
    default: mockAssetQuery,
}));
jest.mock('../manager/operation', () => ({
    __esModule: true,
    default: mockAssetOperation,
}));

import animationGraphVariant from '../animation-graph-variant';

describe('animation graph variant asset service', () => {
    beforeAll(() => {
        (globalThis as any).EditorExtends = {
            serialize: Object.assign(
                (asset: MockAnimationGraphVariant) => JSON.stringify(serializeVariant(asset), null, 2),
                {
                    asAsset(uuid: string, type: new () => MockAsset = MockAsset) {
                        const asset = new type();
                        asset._uuid = uuid;
                        return asset;
                    },
                },
            ),
        };
    });

    beforeEach(() => {
        mockFiles.clear();
        mockMtimes.clear();
        mockAssets.clear();
        mockSavedAssets.length = 0;
        jest.clearAllMocks();
    });

    it('queries, changes, and saves clip overrides through save(uuid)', async () => {
        registerVariantFixture('variant-save', 'graph-save', ['origin-save'], {
            'origin-save': 'saved-override',
        });
        registerClipAsset('next-override');

        const queried = await animationGraphVariant.query('variant-save');
        expect(queried).toEqual({
            graphUuid: 'graph-save',
            clips: {
                'origin-save': 'saved-override',
            },
            invalids: {},
        });

        const changed = await animationGraphVariant.change('variant-save', {
            graphUuid: 'graph-save',
            clips: {
                'origin-save': 'next-override',
            },
        });
        expect(changed.clips['origin-save']).toBe('next-override');

        await animationGraphVariant.save('variant-save');

        expect(mockSavedAssets).toHaveLength(1);
        expect(mockSavedAssets[0].uuid).toBe('variant-save');
        expect(JSON.parse(mockSavedAssets[0].content)).toEqual({
            kind: 'variant',
            graphUuid: 'graph-save',
            marker: 'preserve-variant-fields',
            overrides: {
                'origin-save': 'next-override',
            },
        });
        await expect(animationGraphVariant.save('variant-save')).rejects.toThrow('pending edit');
    });

    it('saves model-imported original and replacement clips without a direct type property', async () => {
        registerVariantFixture('variant-gltf', 'graph-gltf', ['origin-gltf'], {});
        registerAsset('origin-gltf', 'gltf-animation', '', 'model.fbx');
        registerAsset('replacement-gltf', 'gltf-animation', '', 'replacement.fbx');
        delete mockAssets.get('origin-gltf').type;
        delete mockAssets.get('replacement-gltf').type;

        await animationGraphVariant.change('variant-gltf', {
            graphUuid: 'graph-gltf', clips: { 'origin-gltf': 'replacement-gltf' },
        });
        await animationGraphVariant.save('variant-gltf');

        expect(JSON.parse(mockSavedAssets[0].content).overrides).toEqual({ 'origin-gltf': 'replacement-gltf' });
        expect((await animationGraphVariant.query('variant-gltf')).clips).toEqual({ 'origin-gltf': 'replacement-gltf' });
    });

    it('rejects a non-animation replacement before saving', async () => {
        registerVariantFixture('variant-wrong-type', 'graph-wrong-type', ['origin-wrong-type'], {});
        registerAsset('texture', 'texture', 'cc.Texture2D', 'texture.png');
        await animationGraphVariant.change('variant-wrong-type', {
            graphUuid: 'graph-wrong-type', clips: { 'origin-wrong-type': 'texture' },
        });
        await expect(animationGraphVariant.save('variant-wrong-type')).rejects.toThrow('Expected cc.AnimationClip asset');
        expect(mockAssetOperation.saveAsset).not.toHaveBeenCalled();
    });

    it('rebuilds rows when graphUuid changes and moves incompatible saved overrides to invalids', async () => {
        registerVariantFixture('variant-switch', 'graph-switch-old', ['origin-old'], {
            'origin-old': 'saved-override',
        });
        registerGraphAsset('graph-switch-new', ['origin-new']);

        const changed = await animationGraphVariant.change('variant-switch', {
            graphUuid: 'graph-switch-new',
            clips: {},
        });

        expect(changed).toEqual({
            graphUuid: 'graph-switch-new',
            clips: {
                'origin-new': '',
            },
            invalids: {
                'origin-old': 'saved-override',
            },
        });
    });

    it('rejects save when the source file changed after query', async () => {
        registerVariantFixture('variant-conflict', 'graph-conflict', ['origin-conflict'], {});

        await animationGraphVariant.query('variant-conflict');
        mockMtimes.set('variant-conflict.animgraphvari', 2);

        await expect(animationGraphVariant.save('variant-conflict')).rejects.toThrow('source changed');
        expect(mockAssetOperation.saveAsset).not.toHaveBeenCalled();
    });

    it('rejects save when the graph file changed after query', async () => {
        registerVariantFixture('variant-graph-conflict', 'graph-has-conflict', ['origin-graph-conflict'], {});

        await animationGraphVariant.query('variant-graph-conflict');
        mockMtimes.set('graph-has-conflict.animgraph', 2);

        await expect(animationGraphVariant.save('variant-graph-conflict')).rejects.toThrow('AnimationGraph source');
        expect(mockAssetOperation.saveAsset).not.toHaveBeenCalled();
    });
});

function registerVariantFixture(
    variantUuid: string,
    graphUuid: string,
    clipUuids: string[],
    overrides: Record<string, string>,
) {
    registerGraphAsset(graphUuid, clipUuids);
    for (const clipUuid of clipUuids) {
        registerClipAsset(clipUuid);
    }
    for (const overrideUuid of Object.values(overrides)) {
        registerClipAsset(overrideUuid);
    }
    registerAsset(variantUuid, 'animation-graph-variant', 'cc.animation.AnimationGraphVariant', `${variantUuid}.animgraphvari`);
    mockFiles.set(`${variantUuid}.animgraphvari`, {
        kind: 'variant',
        graphUuid,
        marker: 'preserve-variant-fields',
        overrides,
    });
    mockMtimes.set(`${variantUuid}.animgraphvari`, 1);
}

function registerGraphAsset(uuid: string, clipUuids: string[]) {
    registerAsset(uuid, 'animation-graph', 'cc.animation.AnimationGraph', `${uuid}.animgraph`);
    for (const clipUuid of clipUuids) {
        registerClipAsset(clipUuid);
    }
    mockFiles.set(`${uuid}.animgraph`, {
        kind: 'graph',
        clipUuids,
    });
    mockMtimes.set(`${uuid}.animgraph`, 1);
}

function registerClipAsset(uuid: string) {
    if (mockAssets.has(uuid)) {
        return;
    }
    registerAsset(uuid, 'animation-clip', 'cc.AnimationClip', `${uuid}.anim`);
}

function registerAsset(uuid: string, importer: string, type: string, source: string) {
    mockAssets.set(uuid, {
        uuid,
        source,
        type,
        meta: {
            importer,
        },
    });
}

function mockDeserialize(serialized: any, details: MockDeserializeDetails) {
    if (serialized.kind === 'graph') {
        const graph = new MockAnimationGraph();
        for (const clipUuid of serialized.clipUuids) {
            details.refs.push({
                uuid: clipUuid,
                type: MockAnimationClip,
                assign: (asset) => graph.clips.push(asset as MockAnimationClip),
            });
        }
        return graph;
    }

    if (serialized.kind === 'variant') {
        const variant = new MockAnimationGraphVariant();
        variant.marker = serialized.marker || '';
        if (serialized.graphUuid) {
            details.refs.push({
                uuid: serialized.graphUuid,
                type: MockAnimationGraph,
                assign: (asset) => {
                    variant.original = asset as MockAnimationGraph;
                },
            });
        }
        for (const [originalUuid, substituteUuid] of Object.entries(serialized.overrides || {})) {
            const entry: { original?: MockAnimationClip; substitution?: MockAnimationClip } = {};
            variant.clipOverrides.entries.push(entry as { original: MockAnimationClip; substitution: MockAnimationClip });
            details.refs.push({
                uuid: originalUuid,
                type: MockAnimationClip,
                assign: (asset) => {
                    entry.original = asset as MockAnimationClip;
                },
            });
            details.refs.push({
                uuid: substituteUuid as string,
                type: MockAnimationClip,
                assign: (asset) => {
                    entry.substitution = asset as MockAnimationClip;
                },
            });
        }
        return variant;
    }

    throw new Error(`Unsupported mock serialized asset: ${serialized.kind}`);
}

function serializeVariant(asset: MockAnimationGraphVariant) {
    const overrides: Record<string, string> = {};
    for (const entry of asset.clipOverrides.entries) {
        overrides[entry.original._uuid] = entry.substitution._uuid;
    }

    return {
        kind: 'variant',
        graphUuid: asset.original?._uuid ?? null,
        marker: asset.marker,
        overrides,
    };
}
