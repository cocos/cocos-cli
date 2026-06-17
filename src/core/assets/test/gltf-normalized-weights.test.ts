import type { GlTf } from '../@types/glTF';

function mockEngineModuleLoad(moduleMocks: Record<string, unknown>) {
    const Module = require('module') as {
        _load: (request: string, parent?: unknown, isMain?: boolean) => unknown;
    };
    const originalLoad = Module._load;

    Module._load = function patchedLoad(this: unknown, request: string, ...args: unknown[]) {
        if (Object.prototype.hasOwnProperty.call(moduleMocks, request)) {
            return moduleMocks[request];
        }
        return originalLoad.call(this, request, ...args);
    };

    return () => {
        Module._load = originalLoad;
    };
}

jest.resetModules();

jest.doMock('cc', () => {
    class Vec3 {
        public x: number;
        public y: number;
        public z: number;

        constructor(x = 0, y = 0, z = 0) {
            this.x = x;
            this.y = y;
            this.z = z;
        }

        public static min(out: Vec3, a: Vec3, b: Vec3) {
            out.x = Math.min(a.x, b.x);
            out.y = Math.min(a.y, b.y);
            out.z = Math.min(a.z, b.z);
            return out;
        }

        public static max(out: Vec3, a: Vec3, b: Vec3) {
            out.x = Math.max(a.x, b.x);
            out.y = Math.max(a.y, b.y);
            out.z = Math.max(a.z, b.z);
            return out;
        }
    }

    class Vec4 {
        constructor(
            public x = 0,
            public y = 0,
            public z = 0,
            public w = 0,
        ) { }
    }

    class Quat { }
    class Mat4 { }
    class Asset { }

    const primitiveMode = {
        POINT_LIST: 0,
        LINE_LIST: 1,
        LINE_LOOP: 2,
        LINE_STRIP: 3,
        TRIANGLE_LIST: 4,
        TRIANGLE_STRIP: 5,
        TRIANGLE_FAN: 6,
    };

    const attributeName = {
        ATTR_POSITION: 'a_position',
        ATTR_NORMAL: 'a_normal',
        ATTR_TEX_COORD: 'a_texCoord',
        ATTR_TEX_COORD1: 'a_texCoord1',
        ATTR_TEX_COORD2: 'a_texCoord2',
        ATTR_TEX_COORD3: 'a_texCoord3',
        ATTR_TEX_COORD4: 'a_texCoord4',
        ATTR_TEX_COORD5: 'a_texCoord5',
        ATTR_TEX_COORD6: 'a_texCoord6',
        ATTR_TEX_COORD7: 'a_texCoord7',
        ATTR_TEX_COORD8: 'a_texCoord8',
        ATTR_TANGENT: 'a_tangent',
        ATTR_JOINTS: 'a_joints',
        ATTR_WEIGHTS: 'a_weights',
        ATTR_COLOR: 'a_color',
    };

    const formatNames = [
        'R8SN', 'RG8SN', 'RGB8SN', 'RGBA8SN',
        'R8', 'RG8', 'RGB8', 'RGBA8',
        'R16I', 'RG16I', 'RGB16I', 'RGBA16I',
        'R16UI', 'RG16UI', 'RGB16UI', 'RGBA16UI',
        'R32I', 'RG32I', 'RGB32I', 'RGBA32I',
        'R32UI', 'RG32UI', 'RGB32UI', 'RGBA32UI',
        'R32F', 'RG32F', 'RGB32F', 'RGBA32F',
    ];

    return {
        Asset,
        Mat4,
        Quat,
        Vec3,
        Vec4,
        clamp: (value: number, min: number, max: number) => Math.min(Math.max(value, min), max),
        gfx: {
            AttributeName: attributeName,
            Format: Object.fromEntries(formatNames.map((name) => [name, name])),
            PrimitiveMode: primitiveMode,
        },
        pipeline: {
            JOINT_UNIFORM_CAPACITY: 30,
        },
    };
}, { virtual: true });

jest.doMock('cc/editor/exotic-animation', () => ({
    exoticAnimationTag: Symbol('exoticAnimation'),
    ExoticAnimation: class ExoticAnimation { },
    RealArrayTrack: class RealArrayTrack { },
}), { virtual: true });

jest.doMock('cc/editor/color-utils', () => ({
    linearToSrgb8Bit: (value: number) => Math.round(value * 255),
}), { virtual: true });

const restoreModuleLoad = mockEngineModuleLoad({
    cc: jest.requireMock('cc'),
    'cc/editor/exotic-animation': jest.requireMock('cc/editor/exotic-animation'),
    'cc/editor/color-utils': jest.requireMock('cc/editor/color-utils'),
});

const {
    GltfConverter,
    PPGeometry,
    NormalImportSetting,
    TangentImportSetting,
} = (() => {
    try {
        return {
            ...require('../asset-handler/assets/utils/gltf-converter') as typeof import('../asset-handler/assets/utils/gltf-converter'),
            ...require('../asset-handler/assets/utils/pp-geometry') as typeof import('../asset-handler/assets/utils/pp-geometry'),
            ...require('../@types/interface') as typeof import('../@types/interface'),
        };
    } finally {
        restoreModuleLoad();
    }
})();

function asBuffer(view: ArrayBufferView) {
    return Buffer.from(view.buffer, view.byteOffset, view.byteLength);
}

function createGlTfWithNormalizedUnsignedByteWeights() {
    const chunks: ArrayBufferView[] = [
        new Float32Array([0, 0, 0]),
        new Uint8Array([10, 11, 12, 13]),
        new Uint8Array([128, 64, 32, 16]),
        new Uint8Array([14, 15, 16, 17]),
        new Uint8Array([8, 4, 2, 1]),
    ];

    const byteOffsets: number[] = [];
    let byteOffset = 0;
    for (const chunk of chunks) {
        byteOffsets.push(byteOffset);
        byteOffset += chunk.byteLength;
    }

    const buffer = Buffer.concat(chunks.map(asBuffer));
    const gltf: GlTf = {
        asset: {
            version: '2.0',
        },
        buffers: [{
            byteLength: buffer.byteLength,
        }],
        bufferViews: chunks.map((chunk, index) => ({
            buffer: 0,
            byteOffset: byteOffsets[index],
            byteLength: chunk.byteLength,
        })),
        accessors: [{
            bufferView: 0,
            componentType: 5126,
            count: 1,
            type: 'VEC3',
            min: [0, 0, 0],
            max: [0, 0, 0],
        }, {
            bufferView: 1,
            componentType: 5121,
            count: 1,
            type: 'VEC4',
        }, {
            bufferView: 2,
            componentType: 5121,
            normalized: true,
            count: 1,
            type: 'VEC4',
        }, {
            bufferView: 3,
            componentType: 5121,
            count: 1,
            type: 'VEC4',
        }, {
            bufferView: 4,
            componentType: 5121,
            normalized: true,
            count: 1,
            type: 'VEC4',
        }],
        meshes: [{
            primitives: [{
                attributes: {
                    POSITION: 0,
                    JOINTS_0: 1,
                    WEIGHTS_0: 2,
                    JOINTS_1: 3,
                    WEIGHTS_1: 4,
                },
            }],
        }],
    };

    return { gltf, buffer };
}

function createGlTfWithExplicitlyNonNormalizedColor() {
    const chunks: ArrayBufferView[] = [
        new Float32Array([0, 0, 0]),
        new Uint8Array([255, 128, 64, 32]),
    ];

    const byteOffsets: number[] = [];
    let byteOffset = 0;
    for (const chunk of chunks) {
        byteOffsets.push(byteOffset);
        byteOffset += chunk.byteLength;
    }

    const buffer = Buffer.concat(chunks.map(asBuffer));
    const gltf: GlTf = {
        asset: {
            version: '2.0',
        },
        buffers: [{
            byteLength: buffer.byteLength,
        }],
        bufferViews: chunks.map((chunk, index) => ({
            buffer: 0,
            byteOffset: byteOffsets[index],
            byteLength: chunk.byteLength,
        })),
        accessors: [{
            bufferView: 0,
            componentType: 5126,
            count: 1,
            type: 'VEC3',
            min: [0, 0, 0],
            max: [0, 0, 0],
        }, {
            bufferView: 1,
            componentType: 5121,
            normalized: false,
            count: 1,
            type: 'VEC4',
        }],
        meshes: [{
            primitives: [{
                attributes: {
                    POSITION: 0,
                    COLOR_0: 1,
                },
            }],
        }],
    };

    return { gltf, buffer };
}

describe('glTF normalized weights', () => {
    it('decodes normalized unsigned byte skin weights before reducing joint influences', () => {
        const { gltf, buffer } = createGlTfWithNormalizedUnsignedByteWeights();

        const converter = new GltfConverter(gltf, [buffer], 'normalized-weights.glb', {
            userData: {
                normals: NormalImportSetting.exclude,
                tangents: TangentImportSetting.exclude,
                morphNormals: NormalImportSetting.exclude,
            },
        });

        const geometry = converter.processedMeshes[0].geometries[0];
        const weights = geometry.getAttribute(PPGeometry.StdSemantics.weights).data;
        const joints = geometry.getAttribute(PPGeometry.StdSemantics.joints).data;

        expect(weights).toBeInstanceOf(Float32Array);
        expect(Array.from(weights)).toEqual([
            expect.closeTo(128 / 240, 6),
            expect.closeTo(64 / 240, 6),
            expect.closeTo(32 / 240, 6),
            expect.closeTo(16 / 240, 6),
        ]);
        expect(Array.from(weights).reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 6);
        expect(Array.from(joints)).toEqual([10, 11, 12, 13]);
    });

    it('keeps legacy normalized inference when integer vertex attributes explicitly set normalized false', () => {
        const { gltf, buffer } = createGlTfWithExplicitlyNonNormalizedColor();

        const converter = new GltfConverter(gltf, [buffer], 'legacy-color.glb', {
            userData: {
                normals: NormalImportSetting.exclude,
                tangents: TangentImportSetting.exclude,
                morphNormals: NormalImportSetting.exclude,
            },
        });

        const geometry = converter.processedMeshes[0].geometries[0];
        const color = geometry.getAttribute(PPGeometry.StdSemantics.color);

        expect(color.isNormalized).toBe(true);
    });
});
