import { gfx, pipeline, clamp } from 'cc';

declare const EditorExtends: any;

export type PPGeometryTypedArrayConstructor =
    | typeof Int8Array
    | typeof Uint8Array
    | typeof Int16Array
    | typeof Uint16Array
    | typeof Int32Array
    | typeof Uint32Array
    | typeof Float32Array
    | typeof Float64Array;

export type PPGeometryTypedArray =
    | Int8Array
    | Uint8Array
    | Int16Array
    | Uint16Array
    | Int32Array
    | Uint32Array
    | Float32Array
    | Float64Array;

function getMergedSetSize(s1: Set<number>, s2: Set<number>) {
    let count = s1.size;
    for (const n of s2) {
        if (!s1.has(n)) {
            count++;
        }
    }
    return count;
}
function mergeSets(s1: Set<number>, s2: Set<number>) {
    const res = new Set<number>();
    for (const n of s1) {
        res.add(n);
    }
    for (const n of s2) {
        res.add(n);
    }
    return res;
}
function isStrictSubSet(dom: Set<number>, sub: Set<number>) {
    for (const n of sub) {
        if (!dom.has(n)) {
            return false;
        }
    }
    return true;
}

/**
 * Post-processing geometry.
 */
export class PPGeometry {
    public static skinningProcess(originals: PPGeometry[], disableMeshSplit: boolean | undefined) {
        const geometries: PPGeometry[] = [];
        const materialIndices: number[] = [];
        const capacity = pipeline.JOINT_UNIFORM_CAPACITY;
        // split sub-mesh if needed
        for (let i = 0; i < originals.length; i++) {
            const geom = originals[i];
            if (disableMeshSplit || !geom._jointSet || geom._jointSet.size <= capacity) {
                geometries.push(geom);
                materialIndices.push(i);
                continue;
            }
            const joints = geom.getAttribute(PPGeometry.StdSemantics.joints).data;
            const indices = geom._getTriangleIndices();
            const splitInfos = EditorExtends.GeometryUtils.splitBasedOnJoints(joints, indices, geom.primitiveMode, capacity);
            if (!splitInfos.length) {
                geometries.push(geom);
                materialIndices.push(i);
                continue;
            }
            for (const info of splitInfos) {
                const vertexList = Array.from(info.indices.reduce((acc: any, cur: any) => acc.add(cur), new Set<number>()).values());
                const indices = new (EditorExtends.GeometryUtils.getUintArrayCtor(vertexList.length))(info.indices.length);
                info.indices.forEach((cur: any, idx: any) => (indices[idx] = vertexList.indexOf(cur)));
                const newGeom = new PPGeometry(vertexList.length, info.primitiveMode, indices, info.jointSet);
                geom.forEachAttribute((attribute) => {
                    const { semantic } = attribute;
                    const comp = attribute.components;
                    const data = attribute.data;
                    const newData = new (data.constructor as PPGeometryTypedArrayConstructor)(vertexList.length * comp);
                    vertexList.forEach((v: any, idx: any) => {
                        for (let i = 0; i < comp; i++) {
                            newData[idx * comp + i] = data[v * comp + i];
                        }
                    });
                    newGeom.setAttribute(semantic, newData, comp, attribute.isNormalized);
                    if (attribute.morphs) {
                        const newAttribute = newGeom.getAttribute(semantic);
                        newAttribute.morphs = new Array(attribute.morphs.length);
                        for (let iTarget = 0; iTarget < attribute.morphs.length; ++iTarget) {
                            const comp = 3; // TODO!!
                            const data = attribute.morphs[iTarget];
                            const newMorphData = new (data.constructor as PPGeometryTypedArrayConstructor)(vertexList.length * comp);
                            vertexList.forEach((v: any, idx: any) => {
                                for (let i = 0; i < comp; ++i) {
                                    newMorphData[idx * comp + i] = data[v * comp + i];
                                }
                            });
                            newAttribute.morphs[iTarget] = newMorphData;
                        }
                    }
                });
                geometries.push(newGeom);
                materialIndices.push(i);
            }
        }
        // reuse buffer if possible
        const jointSets = geometries.reduce((acc, cur) => (cur._jointSet && acc.push(cur._jointSet), acc), [] as Set<number>[]);
        let hasMergablePair = jointSets.length > 1;
        while (hasMergablePair) {
            hasMergablePair = false;
            let minDist = Infinity;
            let p = -1;
            let q = -1;
            for (let i = 0; i < jointSets.length; i++) {
                const s1 = jointSets[i];
                for (let j = i + 1; j < jointSets.length; j++) {
                    const s2 = jointSets[j];
                    const merged = getMergedSetSize(s1, s2);
                    if (merged <= capacity) {
                        const dist = Math.min(Math.abs(merged - s1.size), Math.abs(merged - s2.size));
                        if (dist < minDist) {
                            hasMergablePair = true;
                            minDist = dist;
                            p = i;
                            q = j;
                        }
                    }
                }
            }
            if (hasMergablePair) {
                const s1 = jointSets[p];
                const s2 = jointSets[q];
                jointSets[p] = mergeSets(s1, s2);
                jointSets[q] = jointSets[jointSets.length - 1];
                if (--jointSets.length <= 1) {
                    break;
                }
                minDist = Infinity;
            }
        }
        let jointMaps = jointSets.map((s) => Array.from(s.values()).sort((a, b) => a - b)); // default is radix sort
        if (!jointMaps.length || jointMaps.every((m) => m.length === 1 && !m[0])) {
            jointMaps = undefined!;
        } else {
            for (let i = 0; i < geometries.length; i++) {
                const geom = geometries[i];
                const joints = geom._jointSet;
                if (!joints) {
                    continue;
                }
                geom._jointMapIndex = jointSets.findIndex((s) => isStrictSubSet(s, joints));
                // the actual mapping in VB is performed at runtime
            }
        }
        return { geometries, materialIndices, jointMaps };
    }

    get vertexCount() {
        return this._vertexCount;
    }

    get indices() {
        return this._indices;
    }

    get primitiveMode() {
        return this._primitiveMode;
    }

    get jointMapIndex() {
        return this._jointMapIndex;
    }

    private _vertexCount: number;
    private _vertices: Record<string, PPGeometry.Attribute> = {};
    private _primitiveMode: gfx.PrimitiveMode;
    private _indices?: PPGeometryTypedArray;
    private _generatedIndices?: PPGeometryTypedArray;
    private _jointSet?: Set<number>;
    private _jointMapIndex?: number;

    constructor(vertexCount: number, primitiveMode: gfx.PrimitiveMode, indices?: PPGeometryTypedArray, jointSet?: Set<number>) {
        this._vertexCount = vertexCount;
        this._primitiveMode = primitiveMode;
        this._jointSet = jointSet;
        if (indices && indices.BYTES_PER_ELEMENT < Uint16Array.BYTES_PER_ELEMENT) {
            indices = Uint16Array.from(indices); // metal doesn't support uint8 indices
        }
        this._indices = indices;
    }

    public calculateNormals(storageConstructor: PPGeometryTypedArrayConstructor = Float32Array) {
        const positions = this._assertAttribute(PPGeometry.StdSemantics.position).data;
        const indices = this._getTriangleIndices();
        const result = new storageConstructor(3 * this._vertexCount);
        return EditorExtends.GeometryUtils.calculateNormals(positions, indices, result) as PPGeometryTypedArray;
    }

    public calculateTangents(storageConstructor: PPGeometryTypedArrayConstructor = Float32Array, uvset = 0) {
        const positions = this._assertAttribute(PPGeometry.StdSemantics.position).data;
        const indices = this._getTriangleIndices();
        const normals = this._assertAttribute(PPGeometry.StdSemantics.normal).data;
        const uvs = this._assertAttribute(PPGeometry.StdSemantics.set(PPGeometry.StdSemantics.texcoord, uvset)).data;
        const result = new storageConstructor(4 * this._vertexCount);
        return EditorExtends.GeometryUtils.calculateTangents(positions, indices, normals, uvs, result) as PPGeometryTypedArray;
    }

    public sanityCheck() {
        if (!this.hasAttribute(PPGeometry.StdSemantics.weights) || !this.hasAttribute(PPGeometry.StdSemantics.joints)) {
            return;
        }
        const weights = this.getAttribute(PPGeometry.StdSemantics.weights);
        const joints = this.getAttribute(PPGeometry.StdSemantics.joints);
        const nVertices = this.vertexCount;
        // convert joints as uint16
        if (joints.data.constructor !== Uint16Array) {
            const newData = new Uint16Array(joints.data.length);
            for (let i = 0; i < newData.length; i++) {
                newData[i] = joints.data[i];
            }
            joints.data = newData;
        }
        // normalize weights
        const [targetSum, offset] = getTargetJointWeightCheckParams(weights.data.constructor as PPGeometryTypedArrayConstructor);
        for (let iVertex = 0; iVertex < nVertices; ++iVertex) {
            let sum = 0;
            for (let i = 0; i < weights.components; i++) {
                let v = weights.data[weights.components * iVertex + i];
                if (Number.isNaN(v)) {
                    v = weights.data[weights.components * iVertex + i] = targetSum - offset;
                }
                sum += v + offset;
            }
            if (sum !== targetSum && sum !== 0) {
                if (targetSum === 1) {
                    // floating point arithmetics
                    for (let i = 0; i < weights.components; i++) {
                        weights.data[weights.components * iVertex + i] *= targetSum / sum;
                    }
                } else {
                    // quantized, need dithering
                    const weightF = [];
                    for (let i = 0; i < weights.components; i++) {
                        weightF.push((weights.data[weights.components * iVertex + i] + offset) / sum);
                    }
                    let ditherAcc = 0;
                    for (let i = 0; i < weights.components; i++) {
                        const w = weightF[i];
                        const wi = clamp(Math.floor((w + ditherAcc) * targetSum), 0, targetSum);
                        ditherAcc = w - wi / targetSum;
                        weights.data[weights.components * iVertex + i] = wi - offset;
                    }
                }
            }
        }
        // prepare joints info
        this._jointSet = new Set();
        this._jointSet.add(0);
        for (let iVertex = 0; iVertex < nVertices; ++iVertex) {
            for (let i = 0; i < joints.components; i++) {
                if (weights.data[joints.components * iVertex + i] > 0) {
                    this._jointSet.add(joints.data[joints.components * iVertex + i]);
                } else {
                    joints.data[joints.components * iVertex + i] = 0;
                }
            }
        }
    }

    public getAttribute(semantic: PPGeometry.Semantic) {
        return this._vertices[semantic];
    }

    public hasAttribute(semantic: PPGeometry.Semantic) {
        return semantic in this._vertices;
    }

    public deleteAttribute(semantic: PPGeometry.Semantic) {
        delete this._vertices[semantic];
    }

    public setAttribute(semantic: PPGeometry.Semantic, data: PPGeometryTypedArray, components: number, isNormalized?: boolean) {
        // const isNormalized = getIsNormalized(semantic, data.constructor as PPGeometryTypedArrayConstructor);
        if (isNormalized === undefined) {
            if (data.constructor === Float32Array) {
                isNormalized = false;
            } else if (typeof semantic === 'number') {
                switch (PPGeometry.StdSemantics.decode(semantic).semantic0) {
                    case PPGeometry.StdSemantics.texcoord:
                    case PPGeometry.StdSemantics.color:
                    case PPGeometry.StdSemantics.weights:
                        isNormalized = true;
                        break;
                }
            }
        }
        this._vertices[semantic] = new PPGeometry.Attribute(semantic, data, components, isNormalized);
    }

    public *attributes() {
        yield* Object.values(this._vertices);
    }

    public forEachAttribute(visitor: (attribute: PPGeometry.Attribute) => void) {
        Object.values(this._vertices).forEach(visitor);
    }

    /**
     * Reduce the max number of joint influence up to 4(one set).
     * Note, this method may result in non-normalized weights.
     */
    public reduceJointInfluences() {
        const countSet = (expected: PPGeometry.StdSemantics) =>
            Object.values(this._vertices).reduce(
                (previous, attribute) => (previous += equalStdSemantic(attribute.semantic, expected) ? 1 : 0),
                0,
            );

        const nJointSets = countSet(PPGeometry.StdSemantics.joints);
        if (nJointSets <= 1) {
            return;
        }

        let weightStorageConstructor: undefined | PPGeometryTypedArrayConstructor;
        for (const attribute of Object.values(this._vertices)) {
            if (equalStdSemantic(attribute.semantic, PPGeometry.StdSemantics.weights)) {
                const constructor = attribute.data.constructor as PPGeometryTypedArrayConstructor;
                if (!weightStorageConstructor) {
                    weightStorageConstructor = constructor;
                } else if (weightStorageConstructor !== constructor) {
                    console.error('All weights attribute should be of same component type.');
                    return; // Do not proceed
                }
            }
        }

        if (!weightStorageConstructor) {
            console.error('The number of joints attribute and weights attribute are not matched.');
            return;
        }

        const nMergedComponents = 4;
        const mergedJoints = new Uint16Array(nMergedComponents * this._vertexCount);
        const mergedWeights = new weightStorageConstructor(nMergedComponents * this._vertexCount);

        for (const attribute of Object.values(this._vertices)) {
            if (!PPGeometry.isStdSemantic(attribute.semantic)) {
                continue;
            }
            const { semantic0, set } = PPGeometry.StdSemantics.decode(attribute.semantic);
            if (semantic0 !== PPGeometry.StdSemantics.joints) {
                continue;
            }
            const weightSemantic = PPGeometry.StdSemantics.set(PPGeometry.StdSemantics.weights, set);
            if (!(weightSemantic in this._vertices)) {
                console.error(`Vertex attribute joints-${set} has no corresponding weights attribute`);
                continue;
            }
            const joints = attribute;
            const weights = this._vertices[weightSemantic].data;
            const nInputComponents = 4;
            for (let iInputComponent = 0; iInputComponent < nInputComponents; ++iInputComponent) {
                for (let iVertex = 0; iVertex < this._vertexCount; ++iVertex) {
                    const iInput = iVertex * nInputComponents + iInputComponent;
                    const weight = weights[iInput];
                    // Here implies and establishes the promise:
                    // merged weights are sorted in descending order.
                    // So the problem is, insert(and replace) a value into a descending-sorted seq.
                    for (let iReplaceComponent = 0; iReplaceComponent < nMergedComponents; ++iReplaceComponent) {
                        const iReplace = iVertex * nMergedComponents + iReplaceComponent;
                        if (weight >= mergedWeights[iReplace]) {
                            const iReplaceLast = (iVertex + 1) * nMergedComponents - 1;
                            for (let i = iReplaceLast - 1; i >= iReplace; --i) {
                                mergedWeights[i + 1] = mergedWeights[i];
                                mergedJoints[i + 1] = mergedJoints[i];
                            }
                            mergedWeights[iReplace] = weight;
                            mergedJoints[iReplace] = joints.data[iInput];
                            break;
                        }
                    }
                }
            }

            this.deleteAttribute(attribute.semantic);
            this.deleteAttribute(weightSemantic);
        }

        for (let iVertex = 0; iVertex < this._vertexCount; ++iVertex) {
            let sum = 0.0;
            for (let iComponent = 0; iComponent < nMergedComponents; ++iComponent) {
                sum += mergedWeights[nMergedComponents * iVertex + iComponent];
            }
            if (sum !== 0.0) {
                for (let iComponent = 0; iComponent < nMergedComponents; ++iComponent) {
                    mergedWeights[nMergedComponents * iVertex + iComponent] /= sum;
                }
            }
        }

        this.setAttribute(PPGeometry.StdSemantics.set(PPGeometry.StdSemantics.joints, 0), mergedJoints, nMergedComponents);
        this.setAttribute(PPGeometry.StdSemantics.set(PPGeometry.StdSemantics.weights, 0), mergedWeights, nMergedComponents);
    }

    private _getTriangleIndices(): PPGeometryTypedArray {
        if (this._primitiveMode !== gfx.PrimitiveMode.TRIANGLE_LIST) {
            throw new Error('Triangles expected.');
        }
        return (
            this._indices ||
            this._generatedIndices ||
            (this._generatedIndices = (() => {
                const ctor = this._vertexCount >= 1 << (Uint16Array.BYTES_PER_ELEMENT * 8) ? Uint32Array : Uint16Array;
                const indices = new ctor(this._vertexCount);
                for (let i = 0; i < this._vertexCount; ++i) {
                    indices[i] = i;
                }
                return indices;
            })())
        );
    }

    private _assertAttribute(semantic: PPGeometry.Semantic) {
        if (!this.hasAttribute(semantic)) {
            let semanticRep: string;
            if (!PPGeometry.isStdSemantic(semantic)) {
                semanticRep = semantic;
            } else {
                const { semantic0, set } = PPGeometry.StdSemantics.decode(semantic);
                semanticRep = `${PPGeometry.StdSemantics[semantic0]}`;
                if (set !== 0) {
                    semanticRep += `(set ${set})`;
                }
            }
            throw new Error(`${semanticRep} attribute is expect but not present`);
        } else {
            return this.getAttribute(semantic);
        }
    }
}

// returns [ targetSum, offset ]
function getTargetJointWeightCheckParams(ctor: PPGeometryTypedArrayConstructor) {
    switch (ctor) {
        case Int8Array:
            return [0xff, 0x80];
        case Uint8Array:
            return [0xff, 0];
        case Int16Array:
            return [0xffff, 0x8000];
        case Uint16Array:
            return [0xffff, 0];
        case Int32Array:
            return [0xffffffff, 0x80000000];
        case Uint32Array:
            return [0xffffffff, 0];
        case Float32Array:
            return [1, 0];
    }
    return [1, 0];
}

export namespace PPGeometry {
    export enum StdSemantics {
        position,
        normal,
        texcoord,
        tangent,
        joints,
        weights,
        color,
    }

    export namespace StdSemantics {
        export function set(semantic: StdSemantics, set: number) {
            return (set << 4) + semantic;
        }

        export function decode(semantic: number) {
            return {
                semantic0: (semantic & 0xf) as StdSemantics,
                set: semantic >> 4,
            };
        }
    }

    export type Semantic = StdSemantics | number | string;

    export function isStdSemantic(semantic: Semantic): semantic is StdSemantics | number {
        return typeof semantic === 'number';
    }

    export class Attribute {
        public semantic: PPGeometry.Semantic;
        public data: PPGeometryTypedArray;
        public components: number;
        public isNormalized: boolean;
        public morphs: PPGeometryTypedArray[] | null = null;

        constructor(semantic: PPGeometry.Semantic, data: PPGeometryTypedArray, components: number, isNormalized = false) {
            this.semantic = semantic;
            this.data = data;
            this.components = components;
            this.isNormalized = isNormalized;
        }

        public getGFXFormat() {
            const map2 = attributeFormatMap.get(this.data.constructor as PPGeometryTypedArrayConstructor);
            if (map2 !== undefined) {
                if (this.components in map2) {
                    return map2[this.components];
                }
            }
            throw new Error('No corresponding gfx format for attribute.');
        }
    }
}

const stdSemanticInfoMap: Record<
    PPGeometry.StdSemantics,
    {
        gfxAttributeName: string;
        components: number | number[];
        multisets?: Record<number, string>;
    }
> = {
    [PPGeometry.StdSemantics.position]: {
        gfxAttributeName: gfx.AttributeName.ATTR_POSITION,
        components: 3,
    },
    [PPGeometry.StdSemantics.normal]: {
        gfxAttributeName: gfx.AttributeName.ATTR_NORMAL,
        components: 3,
    },
    [PPGeometry.StdSemantics.texcoord]: {
        gfxAttributeName: gfx.AttributeName.ATTR_TEX_COORD,
        components: 2,
        multisets: {
            1: gfx.AttributeName.ATTR_TEX_COORD1,
            2: gfx.AttributeName.ATTR_TEX_COORD2,
            3: gfx.AttributeName.ATTR_TEX_COORD3,
            4: gfx.AttributeName.ATTR_TEX_COORD4,
            5: gfx.AttributeName.ATTR_TEX_COORD5,
            6: gfx.AttributeName.ATTR_TEX_COORD6,
            7: gfx.AttributeName.ATTR_TEX_COORD7,
            8: gfx.AttributeName.ATTR_TEX_COORD8,
        },
    },
    [PPGeometry.StdSemantics.tangent]: {
        gfxAttributeName: gfx.AttributeName.ATTR_TANGENT,
        components: 4,
    },
    [PPGeometry.StdSemantics.joints]: {
        gfxAttributeName: gfx.AttributeName.ATTR_JOINTS,
        components: 4,
    },
    [PPGeometry.StdSemantics.weights]: {
        gfxAttributeName: gfx.AttributeName.ATTR_WEIGHTS,
        components: 4,
    },
    [PPGeometry.StdSemantics.color]: {
        gfxAttributeName: gfx.AttributeName.ATTR_COLOR,
        components: [3, 4],
    },
};

const attributeFormatMap = new Map([
    [
        Int8Array,
        {
            1: gfx.Format.R8SN,
            2: gfx.Format.RG8SN,
            3: gfx.Format.RGB8SN,
            4: gfx.Format.RGBA8SN,
        },
    ],
    [
        Uint8Array,
        {
            1: gfx.Format.R8,
            2: gfx.Format.RG8,
            3: gfx.Format.RGB8,
            4: gfx.Format.RGBA8,
        },
    ],
    [
        Int16Array,
        {
            1: gfx.Format.R16I,
            2: gfx.Format.RG16I,
            3: gfx.Format.RGB16I,
            4: gfx.Format.RGBA16I,
        },
    ],
    [
        Uint16Array,
        {
            1: gfx.Format.R16UI,
            2: gfx.Format.RG16UI,
            3: gfx.Format.RGB16UI,
            4: gfx.Format.RGBA16UI,
        },
    ],
    [
        Int32Array,
        {
            1: gfx.Format.R32I,
            2: gfx.Format.RG32I,
            3: gfx.Format.RGB32I,
            4: gfx.Format.RGBA32I,
        },
    ],
    [
        Uint32Array,
        {
            1: gfx.Format.R32UI,
            2: gfx.Format.RG32UI,
            3: gfx.Format.RGB32UI,
            4: gfx.Format.RGBA32UI,
        },
    ],
    [
        Float32Array,
        {
            1: gfx.Format.R32F,
            2: gfx.Format.RG32F,
            3: gfx.Format.RGB32F,
            4: gfx.Format.RGBA32F,
        },
    ],
] as Iterable<[PPGeometryTypedArrayConstructor, Record<number, gfx.Format>]>);

/**
 * @returns The corresponding GFX attribute name.
 * @throws If the attribute **is standard semantic** but is not a valid GFX attribute name:
 * - It has a different number of component which is not permitted.
 * - Its set count beyond how many that kind of GFX attributes can proceed.
 */
export function getGfxAttributeName(attribute: PPGeometry.Attribute) {
    const { semantic } = attribute;
    let gfxAttributeName: string;
    if (!PPGeometry.isStdSemantic(semantic)) {
        gfxAttributeName = semantic;
    } else {
        // Validate standard semantic.
        const { semantic0, set } = PPGeometry.StdSemantics.decode(semantic);
        const semanticInfo = stdSemanticInfoMap[semantic0];
        if (
            !(Array.isArray(semanticInfo.components)
                ? semanticInfo.components.includes(attribute.components)
                : semanticInfo.components === attribute.components)
        ) {
            throw new Error(`Mismatched ${PPGeometry.StdSemantics[semantic0]} components, expect ${semanticInfo.components}.`);
        }
        if (set === 0) {
            gfxAttributeName = semanticInfo.gfxAttributeName;
        } else if (semanticInfo.multisets && set in semanticInfo.multisets) {
            gfxAttributeName = semanticInfo.multisets[set];
        } else {
            throw new Error(`${PPGeometry.StdSemantics[semantic0]} doesn't allow set ${set}.`);
        }
    }
    return gfxAttributeName;
}

/**
 * Get the normalizer which normalize the integers of specified type array
 * into [0, 1](for unsigned integers) or [-1, 1](for signed integers).
 * The normalization is performed as described in:
 * https://www.khronos.org/opengl/wiki/Normalized_Integer
 * @returns The normalizer, or `undefined` if no corresponding normalizer.
 */
export const getNormalizer = (() => {
    const U8_MAX = 2 ** 8 - 1;
    const U16_MAX = 2 ** 16 - 1;
    const U32_MAX = 2 ** 32 - 1;
    const I8_MAX = 2 ** (8 - 1) - 1;
    const I16_MAX = 2 ** (16 - 1) - 1;
    const I32_MAX = 2 ** (32 - 1) - 1;

    type Normalizer = (value: number) => number;

    const u8: Normalizer = (value) => value / U8_MAX;
    const u16: Normalizer = (value) => value / U16_MAX;
    const u32: Normalizer = (value) => value / U32_MAX;
    const i8: Normalizer = (value) => Math.max(value / I8_MAX, -1);
    const i16: Normalizer = (value) => Math.max(value / I16_MAX, -1);
    const i32: Normalizer = (value) => Math.max(value / I32_MAX, -1);

    return (typedArray: PPGeometryTypedArray) => {
        switch (true) {
            case typedArray instanceof Int8Array:
                return i8;
            case typedArray instanceof Int16Array:
                return i16;
            case typedArray instanceof Int32Array:
                return i32;
            case typedArray instanceof Uint8Array:
                return u8;
            case typedArray instanceof Uint16Array:
                return u16;
            case typedArray instanceof Uint32Array:
                return u32;
            default:
                return null!;
        }
    };
})();

const equalStdSemantic = (semantic: PPGeometry.Semantic, expected: PPGeometry.StdSemantics) =>
    PPGeometry.isStdSemantic(semantic) && PPGeometry.StdSemantics.decode(semantic).semantic0 === expected;
