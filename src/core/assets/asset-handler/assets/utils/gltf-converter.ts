

import * as DataURI from '@cocos/data-uri';
import * as cc from 'cc';
import { Mat4, Quat, Vec3, Vec4, gfx, Constructor } from 'cc';
import * as fs from 'fs-extra';
import * as path from 'path';
import {
    Accessor,
    Animation,
    AnimationChannel,
    BufferView,
    GlTf,
    Image,
    Material,
    Mesh,
    MeshPrimitive,
    Node,
    Scene,
    Skin,
    Texture,
} from '../../../@types/glTF';
import { GlTFUserData } from '../../../@types/userDatas';
import { NormalImportSetting, TangentImportSetting } from '../../../@types/interface';
import { defaultMagFilter, defaultMinFilter } from '../texture-base';
import { decodeBase64ToArrayBuffer } from './base64';
import {
    getGltfAccessorTypeComponents,
    GltfAccessorComponentType,
    GltfAnimationChannelTargetPath,
    GlTfAnimationInterpolation,
    GltfPrimitiveMode,
    GltfTextureMagFilter,
    GltfTextureMinFilter,
    GltfWrapMode,
} from './glTF.constants';
import {
    DecodedDracoGeometry,
    decodeDracoGeometry,
    DecodeDracoGeometryOptions,
    KHRDracoMeshCompression,
} from './khr-draco-mesh-compression';
import { PPGeometry, PPGeometryTypedArray, getGfxAttributeName } from './pp-geometry';
import {
    Adsk3dsMaxPhysicalMaterialProperties,
    ADSK_3DS_MAX_PHYSICAL_MATERIAL_DEFAULT_PARAMETERS,
    hasOriginalMaterialExtras,
    isAdsk3dsMaxPhysicalMaterial,
    OriginalMaterial,
} from '@cocos/fbx-gltf-conv/lib/extras';
import { exoticAnimationTag, RealArrayTrack } from 'cc/editor/exotic-animation';
import { GlTFTrsAnimationData, GlTFTrsTrackData } from './glTF-animation-utils';
import { MaxPhysicalMaterial, MayaStandardSurface } from './material-interface';
import { DocumentExtra, FbxSurfaceLambertProperties, FbxSurfacePhongProperties } from '@cocos/fbx-gltf-conv/types/FBX-glTF-conv-extras';
import { linearToSrgb8Bit } from 'cc/editor/color-utils';
import { Filter, TextureBaseAssetUserData, WrapMode } from '../../../@types/userDatas';

type FloatArray = Float32Array | Float64Array;

export interface GltfImagePathInfo {
    isDataUri: boolean;
    fullPath: string;
}

export interface GltfImageDataURIInfo {
    isDataUri: boolean;
    dataURI: DataURI.DataURI;
}

export type GltfImageUriInfo = GltfImagePathInfo | GltfImageDataURIInfo;

export function isFilesystemPath(uriInfo: GltfImageUriInfo): uriInfo is GltfImagePathInfo {
    return !uriInfo.isDataUri;
}

export type GltfAssetFinderKind = 'meshes' | 'animations' | 'skeletons' | 'textures' | 'materials';

export interface IGltfAssetFinder {
    find<T extends cc.Asset>(kind: GltfAssetFinderKind, index: number, type: Constructor<T>): T | null;
}

export type AssetLoader = (uuid: string) => cc.Asset;

export type GltfSubAsset = Node | Mesh | Texture | Skin | Animation | Image | Material | Scene;

export function getPathFromRoot(target: cc.Node | null, root: cc.Node) {
    let node: cc.Node | null = target;
    let path = '';
    while (node !== null && node !== root) {
        path = `${node.name}/${path}`;
        node = node.parent;
    }
    return path.slice(0, -1);
}

export function getWorldTransformUntilRoot(target: cc.Node, root: cc.Node, outPos: Vec3, outRot: Quat, outScale: Vec3) {
    Vec3.set(outPos, 0, 0, 0);
    Quat.set(outRot, 0, 0, 0, 1);
    Vec3.set(outScale, 1, 1, 1);
    while (target !== root) {
        Vec3.multiply(outPos, outPos, target.scale);
        Vec3.transformQuat(outPos, outPos, target.rotation);
        Vec3.add(outPos, outPos, target.position);
        Quat.multiply(outRot, target.rotation, outRot);
        Vec3.multiply(outScale, target.scale, outScale);
        target = target.parent!;
    }
}

enum GltfAssetKind {
    Node,
    Mesh,
    Texture,
    Skin,
    Animation,
    Image,
    Material,
    Scene,
}

const enum GltfSemanticName {
    // float
    // vec3
    POSITION = 'POSITION',

    // float
    // vec3
    NORMAL = 'NORMAL',

    // float
    // vec4
    TANGENT = 'TANGENT',

    // float/unsigned byte normalized/unsigned short normalized
    // vec2
    TEXCOORD_0 = 'TEXCOORD_0',

    // float/unsigned byte normalized/unsigned short normalized
    // vec2
    TEXCOORD_1 = 'TEXCOORD_1',

    // float/unsigned byte normalized/unsigned short normalized
    // vec3/vec4
    COLOR_0 = 'COLOR_0',

    // unsgiend byte/unsigned short
    // vec4
    JOINTS_0 = 'JOINTS_0',

    // float/unsigned byte normalized/unsigned short normalized
    // vec4
    WEIGHTS_0 = 'WEIGHTS_0',
}

type AccessorStorageConstructor =
    | typeof Int8Array
    | typeof Uint8Array
    | typeof Int16Array
    | typeof Uint16Array
    | typeof Uint32Array
    | typeof Float32Array;

type AccessorStorage = Int8Array | Uint8Array | Int16Array | Uint16Array | Uint32Array | Float32Array;

export interface IMeshOptions {
    normals: NormalImportSetting;
    tangents: TangentImportSetting;
}

export interface IGltfSemantic {
    name: string;
    baseType: number;
    type: string;
}

const qt = new Quat();
const v3a = new Vec3();
const v3b = new Vec3();
const v3Min = new Vec3();
const v3Max = new Vec3();

type FieldsRequired<T, K extends keyof T> = {
    [X in Exclude<keyof T, K>]?: T[X];
} & {
    [P in K]-?: T[P];
};

export function doCreateSocket(sceneNode: cc.Node, out: cc.Socket[], model: cc.Node) {
    const path = getPathFromRoot(model.parent, sceneNode);
    if (model.parent === sceneNode) {
        return;
    }
    let socket = out.find((s) => s.path === path);
    if (!socket) {
        const target = new cc.Node();
        target.name = `${model.parent!.name} Socket`;
        target.parent = sceneNode;
        getWorldTransformUntilRoot(model.parent!, sceneNode, v3a, qt, v3b);
        target.setPosition(v3a);
        target.setRotation(qt);
        target.setScale(v3b);
        socket = new cc.SkeletalAnimation.Socket(path, target);
        out.push(socket);
    }
    model.parent = socket.target;
}

interface IProcessedMesh {
    geometries: PPGeometry[];
    materialIndices: number[];
    jointMaps: number[][];
    minPosition: Vec3;
    maxPosition: Vec3;
}

const skinRootNotCalculated = -2;
const skinRootAbsent = -1;

const supportedExtensions = new Set<string>([
    // Sort please
    'KHR_draco_mesh_compression',
    'KHR_materials_pbrSpecularGlossiness',
    'KHR_materials_unlit',
    'KHR_texture_transform',
]);

interface CreatorStdMaterialProperties {
    mainColor: Vec4 | cc.Color;
    albedoScale: Vec3;
    tilingOffset: Vec4;
    mainTexture: cc.Texture2D | null;
    metallic: number;
    roughness: number;
    pbrMap: cc.Texture2D | null;
    normalMap: cc.Texture2D | null;
    normalStrenth: number;
    emissive: Vec4 | cc.Color;
    emissiveScale: Vec4;
    emissiveMap: cc.Texture2D | null;
    occlusionMap: cc.Texture2D | null;
    occlusion: number;
    alphaThreshold: number;
}

interface CreatorPhongMaterialProperties {
    mainColor: Vec4 | cc.Color;
    mainTexture: cc.Texture2D | null;
    albedoScale: number;

    specularFactor: number;
    specularColor: Vec4 | cc.Color;
    specularMap: cc.Texture2D | null;

    normalMap: cc.Texture2D | null;
    normalFactor: number;

    glossiness: number;
    specularGlossinessMap: cc.Texture2D | null;
    shininessExponent: number;
    shininessExponentMap: cc.Texture2D | null;

    transparencyMap: cc.Texture2D | null;
    transparentColor: Vec4 | cc.Color;
    transparencyFactor: number;

    emissiveMap: cc.Texture2D | null;
    emissive: Vec4 | cc.Color;
    emissiveScaleMap: cc.Texture2D | null;
    emissiveScale: number;

    alphaThreshold: number;

    // blender
    metallic: number;
    metallicMap: cc.Texture2D | null;
}

interface CreatorDCCMetallicRoughnessMaterialDefines {
    ALPHA_SOURCE_IS_OPACITY: boolean;
    USE_VERTEX_COLOR: boolean;
    USE_NORMAL_MAP: boolean;
    HAS_SECOND_UV: boolean;
    USE_TWOSIDE: boolean;
    USE_ALBEDO_MAP: boolean;
    USE_WEIGHT_MAP: boolean;
    USE_METALLIC_MAP: boolean;
    USE_ROUGHNESS_MAP: boolean;
    USE_OCCLUSION_MAP: boolean;
    // USE_TRANSPARENCY_MAP: boolean;
    // USE_TRANSPARENCYCOLOR_MAP: boolean;
    USE_EMISSIVESCALE_MAP: boolean;
    USE_EMISSIVE_MAP: boolean;
    USE_EMISSION_COLOR_MAP: boolean;
    // USE_CUTOUT_MAP: boolean;
    USE_OPACITY_MAP: boolean;
    USE_ALPHA_TEST: boolean;
    DCC_APP_NAME: number;
}

interface CreatorDCCMetallicRoughnessMaterialProperties {
    albedoScale: number;
    alphaSource: number;
    alphaSourceMap: cc.Texture2D | null;
    baseWeightMap: cc.Texture2D | null;
    emissiveScale: number;
    emissiveScaleMap: cc.Texture2D | null;
    emissive: cc.Vec4 | cc.Color;
    emissiveMap: cc.Texture2D | null;
    mainColor: cc.Vec4 | cc.Color;
    mainTexture: cc.Color | cc.Texture2D | null;
    metallic: number;
    metallicMap: cc.Texture2D | null;
    normalMap: cc.Texture2D | null;
    normalStrength: number;
    occlusion: number;
    occlusionMap: cc.Texture2D | null;
    roughness: number;
    roughnessMap: cc.Texture2D | null;
    specularIntensity: number;
}

interface CreatorStdMaterialDefines {
    USE_VERTEX_COLOR: boolean;
    HAS_SECOND_UV: boolean;
    USE_ALBEDO_MAP: boolean;
    ALBEDO_UV: string;
    USE_PBR_MAP: boolean;
    USE_NORMAL_MAP: boolean;
    USE_OCCLUSION_MAP: boolean;
    USE_EMISSIVE_MAP: boolean;
    EMISSIVE_UV: string;
    USE_ALPHA_TEST: boolean;
}

interface CreatorPhongMaterialDefines {
    USE_VERTEX_COLOR: boolean;
    HAS_SECOND_UV: boolean;
    USE_ALBEDO_MAP: boolean;
    USE_SPECULAR_MAP: boolean;
    ALBEDO_UV: string;
    USE_SHININESS_MAP: boolean;
    USE_NORMAL_MAP: boolean;
    USE_OCCLUSION_MAP: boolean;
    USE_EMISSIVESCALE_MAP: boolean;
    USE_EMISSIVE_MAP: boolean;
    USE_EMISSIVECOLOR_MAP: boolean;
    EMISSIVE_UV: string;
    USE_ALPHA_TEST: boolean;
    USE_TRANSPARENCY_MAP: boolean;
    USE_TRANSPARENCYCOLOR_MAP: boolean;

    HAS_EXPORTED_GLOSSINESS: boolean;
    USE_SPECULAR_GLOSSINESS_MAP: boolean;

    DCC_APP_NAME: number;
    HAS_EXPORTED_METALLIC: boolean;
    USE_METALLIC_MAP: boolean;
}

interface CreatorUnlitMaterialDefines {
    USE_TEXTURE: boolean;
}

interface CreatorUnlitMaterialProperties {
    mainColor: Vec4;
}

type FbxSurfaceLambertOrPhongProperties = {
    [x in keyof FbxSurfacePhongProperties | keyof FbxSurfaceLambertProperties]: x extends keyof FbxSurfaceLambertProperties
    ? FbxSurfaceLambertProperties[x]
    : FbxSurfacePhongProperties[x] | undefined;
};

enum AppId {
    UNKNOWN = 0,
    ADSK_3DS_MAX = 1,
    CINEMA4D = 3,
    MAYA = 5,
}

export class GltfConverter {
    get gltf() {
        return this._gltf;
    }

    get path() {
        return this._gltfFilePath;
    }

    get processedMeshes() {
        return this._processedMeshes;
    }

    get fbxMissingImagesId() {
        return this._fbxMissingImagesId;
    }

    private static _defaultLogger: GltfConverter.Logger = (level, error, args) => {
        const message = JSON.stringify({ error, arguments: args }, undefined, 4);
        switch (level) {
            case GltfConverter.LogLevel.Info:
                console.log(message);
                break;
            case GltfConverter.LogLevel.Warning:
                console.warn(message);
                break;
            case GltfConverter.LogLevel.Error:
                console.error(message);
                break;
            case GltfConverter.LogLevel.Debug:
                console.debug(message);
                break;
        }
    };

    private _promotedRootNodes: number[] = [];

    private _nodePathTable: string[];

    /**
     * The parent index of each node.
     */
    private _parents: number[] = [];

    /**
     * The root node of each skin.
     */
    private _skinRoots: number[] = [];

    private _logger: GltfConverter.Logger;

    private _processedMeshes: IProcessedMesh[] = [];

    private _socketMappings = new Map<string, string>();

    private _fbxMissingImagesId: number[] = [];

    constructor(private _gltf: GlTf, private _buffers: Buffer[], private _gltfFilePath: string, options?: GltfConverter.Options) {
        options = options || {};
        this._logger = options.logger || GltfConverter._defaultLogger;

        this._gltf.extensionsRequired?.forEach((extensionRequired) => this._warnIfExtensionNotSupported(extensionRequired, true));

        this._gltf.extensionsUsed?.forEach((extensionUsed) => {
            if (!this._gltf.extensionsRequired?.includes(extensionUsed)) {
                // We've warned it before.
                this._warnIfExtensionNotSupported(extensionUsed, false);
            }
        });

        if (options.promoteSingleRootNode) {
            this._promoteSingleRootNodes();
        }

        // SubAsset importers are NOT guaranteed to be executed in-order
        // so all the interdependent data should be created right here

        // We require the scene graph is a disjoint union of strict trees.
        // This is also the requirement in glTf 2.0.
        if (this._gltf.nodes !== undefined) {
            this._parents = new Array(this._gltf.nodes.length).fill(-1);
            this._gltf.nodes.forEach((node, iNode) => {
                if (node.children !== undefined) {
                    for (const iChildNode of node.children) {
                        this._parents[iChildNode] = iNode;
                    }
                }
            });
        }

        if (this._gltf.skins) {
            this._skinRoots = new Array(this._gltf.skins.length).fill(skinRootNotCalculated);
        }

        this._nodePathTable = this._createNodePathTable();

        const userData = options.userData || ({} as GlTFUserData);
        if (this._gltf.meshes) {
            // split the meshes
            const normals = userData.normals ?? NormalImportSetting.require;
            const tangents = userData.tangents ?? TangentImportSetting.require;
            const morphNormals = userData.morphNormals ?? NormalImportSetting.exclude;
            for (let i = 0; i < this._gltf.meshes.length; i++) {
                const gltfMesh = this._gltf.meshes[i];
                const minPosition = new Vec3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
                const maxPosition = new Vec3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);
                const { geometries, materialIndices, jointMaps } = PPGeometry.skinningProcess(
                    gltfMesh.primitives.map((gltfPrimitive, primitiveIndex) => {
                        const ppGeometry = this._readPrimitive(gltfPrimitive, i, primitiveIndex);

                        // If there are more than 4 joints, we should reduce it
                        // since our engine currently can process only up to 4 joints.
                        ppGeometry.reduceJointInfluences();

                        this._applySettings(ppGeometry, normals, tangents, morphNormals, primitiveIndex, i);
                        this._readBounds(gltfPrimitive, v3Min, v3Max);
                        Vec3.min(minPosition, minPosition, v3Min);
                        Vec3.max(maxPosition, maxPosition, v3Max);
                        ppGeometry.sanityCheck();
                        return ppGeometry;
                    }),
                    userData.disableMeshSplit === false ? false : true,
                );
                this._processedMeshes.push({ geometries, materialIndices, jointMaps, minPosition, maxPosition });
            }
        }
        if (this._gltf.nodes && this._gltf.skins) {
            const nodes = this._gltf.nodes;
            const candidates: number[] = [];
            for (let i = 0; i < nodes.length; i++) {
                const node = nodes[i];
                if (node.mesh !== undefined && node.skin === undefined) {
                    candidates.push(i);
                }
            }
            for (let i = 0; i < candidates.length; i++) {
                const candidate = candidates[i];
                if (candidates.some((node) => this._isAncestorOf(node, candidate))) {
                    candidates[i] = candidates[candidates.length - 1];
                    candidates.length--;
                    i--;
                }
            }
            for (let i = 0; i < candidates.length; i++) {
                const node = candidates[i];
                const parent = nodes[this._getParent(node)];
                if (parent) {
                    this._socketMappings.set(this._getNodePath(node), parent.name + ' Socket/' + nodes[node].name);
                }
            }
        }
    }

    public createMesh(iGltfMesh: number, bGenerateLightmapUV = false, bAddVertexColor = false) {
        const processedMesh = this._processedMeshes[iGltfMesh];
        const glTFMesh = this._gltf.meshes![iGltfMesh];
        const bufferBlob = new BufferBlob();
        const vertexBundles = new Array<cc.Mesh.IVertexBundle>();

        const primitives = processedMesh.geometries.map((ppGeometry, primitiveIndex): cc.Mesh.ISubMesh => {
            const { vertexCount, vertexStride, formats, vertexBuffer } = interleaveVertices(
                ppGeometry,
                bGenerateLightmapUV,
                bAddVertexColor,
            );

            bufferBlob.setNextAlignment(0);
            vertexBundles.push({
                view: {
                    offset: bufferBlob.getLength(),
                    length: vertexBuffer.byteLength,
                    count: vertexCount,
                    stride: vertexStride,
                },
                attributes: formats,
            });
            bufferBlob.addBuffer(vertexBuffer);

            const primitive: cc.Mesh.ISubMesh = {
                primitiveMode: ppGeometry.primitiveMode,
                jointMapIndex: ppGeometry.jointMapIndex,
                vertexBundelIndices: [primitiveIndex],
            };

            if (ppGeometry.indices !== undefined) {
                const indices = ppGeometry.indices;
                bufferBlob.setNextAlignment(indices.BYTES_PER_ELEMENT);
                primitive.indexView = {
                    offset: bufferBlob.getLength(),
                    length: indices.byteLength,
                    count: indices.length,
                    stride: indices.BYTES_PER_ELEMENT,
                };
                bufferBlob.addBuffer(indices.buffer as unknown as ArrayBuffer);
            }

            return primitive;
        });

        const meshStruct: cc.Mesh.IStruct = {
            primitives,
            vertexBundles,
            minPosition: processedMesh.minPosition,
            maxPosition: processedMesh.maxPosition,
            jointMaps: processedMesh.jointMaps,
        };

        const exportMorph = true;
        if (exportMorph) {
            type SubMeshMorph = NonNullable<cc.Mesh.IStruct['morph']>['subMeshMorphs'][0];
            type MorphTarget = NonNullable<SubMeshMorph>['targets'][0];
            const subMeshMorphs = processedMesh.geometries.map((ppGeometry): SubMeshMorph => {
                let nTargets = 0;
                const attributes: PPGeometry.Attribute[] = [];
                ppGeometry.forEachAttribute((attribute) => {
                    if (!attribute.morphs) {
                        return;
                    }
                    if (nTargets === 0) {
                        nTargets = attribute.morphs.length;
                    } else if (nTargets !== attribute.morphs.length) {
                        throw new Error('Bad morph...');
                    }
                    attributes.push(attribute);
                });
                if (nTargets === 0) {
                    return null;
                }
                const targets: MorphTarget[] = new Array(nTargets);
                for (let iTarget = 0; iTarget < nTargets; ++iTarget) {
                    targets[iTarget] = {
                        displacements: attributes.map((attribute): cc.Mesh.IBufferView => {
                            const attributeMorph = attribute.morphs![iTarget];
                            // Align as requirement of corresponding typed array.
                            bufferBlob.setNextAlignment(attributeMorph.BYTES_PER_ELEMENT);
                            const offset = bufferBlob.getLength();
                            bufferBlob.addBuffer(attributeMorph.buffer as unknown as ArrayBuffer);
                            return {
                                offset,
                                length: attributeMorph.byteLength,
                                stride: attributeMorph.BYTES_PER_ELEMENT,
                                count: attributeMorph.length,
                            };
                        }),
                    };
                }
                return {
                    attributes: attributes.map((attribute) => getGfxAttributeName(attribute) as cc.gfx.AttributeName), // TODO
                    targets,
                };
            });

            const firstNonNullSubMeshMorph = subMeshMorphs.find((subMeshMorph) => subMeshMorph !== null);

            if (firstNonNullSubMeshMorph) {
                assertGlTFConformance(
                    subMeshMorphs.every(
                        (subMeshMorph) => !subMeshMorph || subMeshMorph.targets.length === firstNonNullSubMeshMorph.targets.length,
                    ),
                    'glTF expects that every primitive has same number of targets',
                );
                if (subMeshMorphs.length !== 0) {
                    assertGlTFConformance(
                        glTFMesh.weights === undefined || glTFMesh.weights.length === firstNonNullSubMeshMorph.targets.length,
                        'Number of "weights" mismatch number of morph targets',
                    );
                }

                meshStruct.morph = {
                    subMeshMorphs,
                    weights: glTFMesh.weights,
                };

                // https://github.com/KhronosGroup/glTF/pull/1631
                // > Implementation note: A significant number of authoring and client implementations associate names with morph targets.
                // > While the glTF 2.0 specification currently does not provide a way to specify names,
                // > most tools use an array of strings, mesh.extras.targetNames, for this purpose.
                // > The targetNames array and all primitive targets arrays must have the same length.
                if (typeof glTFMesh.extras === 'object' && Array.isArray(glTFMesh.extras.targetNames)) {
                    const targetNames: string[] = glTFMesh.extras.targetNames;
                    if (
                        targetNames.length === firstNonNullSubMeshMorph.targets.length &&
                        targetNames.every((elem) => typeof elem === 'string')
                    ) {
                        meshStruct.morph.targetNames = targetNames.slice();
                    }
                }
            }
        }

        const mesh = new cc.Mesh();
        mesh.name = this._getGltfXXName(GltfAssetKind.Mesh, iGltfMesh);
        mesh.assign(meshStruct, bufferBlob.getCombined());
        mesh.hash; // serialize hashes
        return mesh;
    }

    public createSkeleton(iGltfSkin: number, sortMap?: number[]) {
        const gltfSkin = this._gltf.skins![iGltfSkin];

        const skeleton = new cc.Skeleton();
        skeleton.name = this._getGltfXXName(GltfAssetKind.Skin, iGltfSkin);
        // @ts-ignore TS2551
        skeleton._joints = gltfSkin.joints.map((j) => this._mapToSocketPath(this._getNodePath(j)));

        if (gltfSkin.inverseBindMatrices !== undefined) {
            const inverseBindMatricesAccessor = this._gltf.accessors![gltfSkin.inverseBindMatrices];
            if (inverseBindMatricesAccessor.componentType !== GltfAccessorComponentType.FLOAT || inverseBindMatricesAccessor.type !== 'MAT4') {
                throw new Error('The inverse bind matrix should be floating-point 4x4 matrix.');
            }

            const bindposes: Mat4[] = new Array(gltfSkin.joints.length);
            const data = new Float32Array(bindposes.length * 16);
            this._readAccessor(inverseBindMatricesAccessor, createDataViewFromTypedArray(data));
            assertGlTFConformance(data.length === 16 * bindposes.length, 'Wrong data in bind-poses accessor.');
            for (let i = 0; i < bindposes.length; ++i) {
                bindposes[i] = new Mat4(
                    data[16 * i + 0],
                    data[16 * i + 1],
                    data[16 * i + 2],
                    data[16 * i + 3],
                    data[16 * i + 4],
                    data[16 * i + 5],
                    data[16 * i + 6],
                    data[16 * i + 7],
                    data[16 * i + 8],
                    data[16 * i + 9],
                    data[16 * i + 10],
                    data[16 * i + 11],
                    data[16 * i + 12],
                    data[16 * i + 13],
                    data[16 * i + 14],
                    data[16 * i + 15],
                );
            }
            // @ts-ignore TS2551
            skeleton._bindposes = bindposes;
        }

        skeleton.hash; // serialize hashes
        return skeleton;
    }

    public getAnimationDuration(iGltfAnimation: number) {
        const gltfAnimation = this._gltf.animations![iGltfAnimation];
        let duration = 0;
        gltfAnimation.channels.forEach((gltfChannel) => {
            const targetNode = gltfChannel.target.node;
            if (targetNode === undefined) {
                // When node isn't defined, channel should be ignored.
                return;
            }

            const sampler = gltfAnimation.samplers[gltfChannel.sampler];
            const inputAccessor = this._gltf.accessors![sampler.input];
            const channelDuration =
                inputAccessor.max !== undefined && inputAccessor.max.length === 1 ? Math.fround(inputAccessor.max[0]) : 0;
            duration = Math.max(channelDuration, duration);
        });
        return duration;
    }

    public createAnimation(iGltfAnimation: number) {
        const gltfAnimation = this._gltf.animations![iGltfAnimation];

        const glTFTrsAnimationData = new GlTFTrsAnimationData();
        const getJointCurveData = (node: number) => {
            const path = this._mapToSocketPath(this._getNodePath(node));
            return glTFTrsAnimationData.addNodeAnimation(path);
        };

        let duration = 0;
        const keys = new Array<FloatArray>();
        const keysMap = new Map<number, number>();
        const getKeysIndex = (iInputAccessor: number) => {
            let i = keysMap.get(iInputAccessor);
            if (i === undefined) {
                const inputAccessor = this._gltf.accessors![iInputAccessor];
                const inputs = this._readAccessorIntoArray(inputAccessor) as Float32Array;
                i = keys.length;
                keys.push(inputs);
                keysMap.set(iInputAccessor, i);
            }
            return i;
        };

        const tracks: cc.animation.Track[] = [];

        gltfAnimation.channels.forEach((gltfChannel) => {
            const targetNode = gltfChannel.target.node;
            if (targetNode === undefined) {
                // When node isn't defined, channel should be ignored.
                return;
            }

            const jointCurveData = getJointCurveData(targetNode);
            const sampler = gltfAnimation.samplers[gltfChannel.sampler];
            const iKeys = getKeysIndex(sampler.input);
            if (gltfChannel.target.path === 'weights') {
                tracks.push(...this._glTFWeightChannelToTracks(gltfAnimation, gltfChannel, keys[iKeys]));
            } else {
                this._gltfChannelToCurveData(gltfAnimation, gltfChannel, jointCurveData, keys[iKeys]);
            }
            const inputAccessor = this._gltf.accessors![sampler.input];
            const channelDuration =
                inputAccessor.max !== undefined && inputAccessor.max.length === 1 ? Math.fround(inputAccessor.max[0]) : 0;
            duration = Math.max(channelDuration, duration);
        });

        if (this._gltf.nodes) {
            const standaloneInput = new Float32Array([0.0]);
            const r = new Quat();
            const t = new Vec3();
            const s = new Vec3();
            this._gltf.nodes.forEach((node, nodeIndex) => {
                if (this._promotedRootNodes.includes(nodeIndex)) {
                    // Promoted root nodes should not have animations.
                    return;
                }
                const jointCurveData = getJointCurveData(nodeIndex);
                let m: Mat4 | undefined;
                if (node.matrix) {
                    m = this._readNodeMatrix(node.matrix);
                    Mat4.toRTS(m, r, t, s);
                }
                if (!jointCurveData.position) {
                    const v = new Vec3();
                    if (node.translation) {
                        Vec3.set(v, node.translation[0], node.translation[1], node.translation[2]);
                    } else if (m) {
                        Vec3.copy(v, t);
                    }
                    jointCurveData.setConstantPosition(v);
                }
                if (!jointCurveData.scale) {
                    const v = new Vec3(1, 1, 1);
                    if (node.scale) {
                        Vec3.set(v, node.scale[0], node.scale[1], node.scale[2]);
                    } else if (m) {
                        Vec3.copy(v, s);
                    }
                    jointCurveData.setConstantScale(v);
                }
                if (!jointCurveData.rotation) {
                    const v = new Quat();
                    if (node.rotation) {
                        this._getNodeRotation(node.rotation, v);
                    } else if (m) {
                        Quat.copy(v, r);
                    }
                    jointCurveData.setConstantRotation(v);
                }
            });
        }

        const exoticAnimation = glTFTrsAnimationData.createExotic();

        const animationClip = new cc.AnimationClip();
        animationClip.name = this._getGltfXXName(GltfAssetKind.Animation, iGltfAnimation);
        animationClip.wrapMode = cc.AnimationClip.WrapMode.Loop;
        animationClip.duration = duration;
        animationClip.sample = 30;
        animationClip.hash; // serialize hashes
        animationClip.enableTrsBlending = true;
        tracks.forEach((track) => animationClip.addTrack(track));
        animationClip[exoticAnimationTag] = exoticAnimation;
        return animationClip;
    }

    public createMaterial(
        iGltfMaterial: number,
        gltfAssetFinder: IGltfAssetFinder,
        effectGetter: (name: string) => cc.EffectAsset,
        options: {
            useVertexColors?: boolean;
            depthWriteInAlphaModeBlend?: boolean;
            smartMaterialEnabled?: boolean;
        },
    ) {
        const useVertexColors = options.useVertexColors ?? true;
        const depthWriteInAlphaModeBlend = options.depthWriteInAlphaModeBlend ?? false;
        const smartMaterialEnabled = options.smartMaterialEnabled ?? false;
        const gltfMaterial = this._gltf.materials![iGltfMaterial];
        const isUnlit = (gltfMaterial.extensions && gltfMaterial.extensions.KHR_materials_unlit) !== undefined;
        const documentExtras = this._gltf.extras;

        // Transfer dcc default material attributes.
        if (smartMaterialEnabled) {
            let appName = '';
            if (typeof documentExtras === 'object' && documentExtras && 'FBX-glTF-conv' in documentExtras) {
                const fbxExtras = documentExtras['FBX-glTF-conv'] as DocumentExtra;
                // ["FBX-glTF-conv"].fbxFileHeaderInfo.sceneInfo.original.applicationName
                if (typeof fbxExtras.fbxFileHeaderInfo !== 'undefined') {
                    if (typeof fbxExtras.fbxFileHeaderInfo.sceneInfo !== 'undefined') {
                        appName = fbxExtras.fbxFileHeaderInfo.sceneInfo.original.applicationName;
                    }
                    const APP_NAME_REGEX_BLENDER = /Blender/;
                    const APP_NAME_REGEX_MAYA = /Maya/;
                    const APP_NAME_REGEX_3DSMAX = /Max/;
                    const APP_NAME_REGEX_CINEMA4D = /Cinema/;
                    const APP_NAME_REGEX_MIXAMO = /mixamo/;
                    const rawData = gltfMaterial.extras['FBX-glTF-conv'].raw;
                    // debugger;
                    if (APP_NAME_REGEX_BLENDER.test(appName) || APP_NAME_REGEX_MIXAMO.test(appName)) {
                        if (rawData.type === 'phong') {
                            return this._convertBlenderPBRMaterial(gltfMaterial, iGltfMaterial, gltfAssetFinder, effectGetter);
                        }
                    } else if (APP_NAME_REGEX_MAYA.test(appName)) {
                        if (rawData.type === 'phong' || rawData.type === 'lambert') {
                            return this._convertPhongMaterial(iGltfMaterial, gltfAssetFinder, effectGetter, AppId.MAYA, rawData.properties);
                        } else if (rawData.properties.Maya) {
                            if (rawData.properties.Maya.value.TypeId.value === 1398031443) {
                                return this._convertMayaStandardSurface(
                                    iGltfMaterial,
                                    gltfAssetFinder,
                                    effectGetter,
                                    rawData.properties.Maya.value,
                                );
                            }
                        }
                    } else if (APP_NAME_REGEX_3DSMAX.test(appName)) {
                        if (rawData.type === 'phong' || rawData.type === 'lambert') {
                            return this._convertPhongMaterial(
                                iGltfMaterial,
                                gltfAssetFinder,
                                effectGetter,
                                AppId.ADSK_3DS_MAX,
                                rawData.properties,
                            );
                        }
                        if (rawData.properties['3dsMax'].value.ORIGINAL_MTL) {
                            if (rawData.properties['3dsMax'].value.ORIGINAL_MTL.value === 'PHYSICAL_MTL') {
                                return this._convertMaxPhysicalMaterial(
                                    iGltfMaterial,
                                    gltfAssetFinder,
                                    effectGetter,
                                    rawData.properties['3dsMax'].value.Parameters.value,
                                );
                            }
                        }
                    } else if (APP_NAME_REGEX_CINEMA4D.test(appName)) {
                        if (rawData.type === 'phong' || rawData.type === 'lambert') {
                            return this._convertPhongMaterial(
                                iGltfMaterial,
                                gltfAssetFinder,
                                effectGetter,
                                AppId.CINEMA4D,
                                rawData.properties,
                            );
                        }
                    }
                    if (rawData.type === 'phong' || rawData.type === 'lambert') {
                        return this._convertPhongMaterial(iGltfMaterial, gltfAssetFinder, effectGetter, AppId.UNKNOWN, rawData.properties);
                    }
                } else {
                    console.debug('Failed to read fbx header info, default material was used');
                }
            } else {
                console.debug('Failed to read fbx info.');
            }
        } else {
            const physicalMaterial = ((): cc.Material | null => {
                if (!hasOriginalMaterialExtras(gltfMaterial.extras)) {
                    return null;
                }
                const { originalMaterial } = gltfMaterial.extras['FBX-glTF-conv'];
                if (isAdsk3dsMaxPhysicalMaterial(originalMaterial)) {
                    return this._convertAdskPhysicalMaterial(gltfMaterial, iGltfMaterial, gltfAssetFinder, effectGetter, originalMaterial);
                } else {
                    return null;
                }
            })();
            if (physicalMaterial) {
                return physicalMaterial;
            }
        }
        const material = new cc.Material();
        material.name = this._getGltfXXName(GltfAssetKind.Material, iGltfMaterial);
        // @ts-ignore TS2445
        material._effectAsset = effectGetter(`db://internal/effects/${isUnlit ? 'builtin-unlit' : 'builtin-standard'}.effect`);

        const defines: Partial<CreatorStdMaterialDefines & CreatorUnlitMaterialDefines> = {};
        const props: Partial<CreatorStdMaterialProperties & CreatorUnlitMaterialProperties> = {};
        const states: cc.Material['_states'][0] = {
            rasterizerState: {},
            blendState: { targets: [{}] },
            depthStencilState: {},
        };

        if (this._gltf.meshes) {
            for (let i = 0; i < this._gltf.meshes.length; i++) {
                const mesh = this._gltf.meshes[i];
                for (let j = 0; j < mesh.primitives.length; j++) {
                    const prim = mesh.primitives[j];
                    if (prim.material === iGltfMaterial) {
                        if (prim.attributes[GltfSemanticName.COLOR_0] && useVertexColors) {
                            defines['USE_VERTEX_COLOR'] = true;
                        }
                        if (prim.attributes[GltfSemanticName.TEXCOORD_1]) {
                            defines['HAS_SECOND_UV'] = true;
                        }
                    }
                }
            }
        }
        // gltf Materials: https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Archived/KHR_materials_pbrSpecularGlossiness/README.md
        let hasPbrMetallicRoughness = false;
        if (gltfMaterial.pbrMetallicRoughness) {
            const pbrMetallicRoughness = gltfMaterial.pbrMetallicRoughness;
            if (pbrMetallicRoughness.baseColorTexture !== undefined) {
                hasPbrMetallicRoughness = true;
                const mainTexture = gltfAssetFinder.find('textures', pbrMetallicRoughness.baseColorTexture.index, cc.Texture2D);
                defines[isUnlit ? 'USE_TEXTURE' : 'USE_ALBEDO_MAP'] = mainTexture ? true : false;
                props['mainTexture'] = mainTexture;
                if (pbrMetallicRoughness.baseColorTexture.texCoord) {
                    defines['ALBEDO_UV'] = 'v_uv1';
                }
                if (pbrMetallicRoughness.baseColorTexture.extensions !== undefined) {
                    if (pbrMetallicRoughness.baseColorTexture.extensions.KHR_texture_transform) {
                        props['tilingOffset'] = this._khrTextureTransformToTiling(
                            pbrMetallicRoughness.baseColorTexture.extensions.KHR_texture_transform,
                        );
                    }
                }
            }
            if (pbrMetallicRoughness.baseColorFactor) {
                hasPbrMetallicRoughness = true;
                const c = pbrMetallicRoughness.baseColorFactor;
                if (isUnlit) {
                    props['mainColor'] = new Vec4(c[0], c[1], c[2], 1);
                } else {
                    props['albedoScale'] = new Vec3(c[0], c[1], c[2]);
                }
            }
            if (pbrMetallicRoughness.metallicRoughnessTexture !== undefined) {
                hasPbrMetallicRoughness = true;
                defines['USE_PBR_MAP'] = true;
                props['pbrMap'] = gltfAssetFinder.find('textures', pbrMetallicRoughness.metallicRoughnessTexture.index, cc.Texture2D);
                props['metallic'] = 1;
                props['roughness'] = 1;
            }
            if (pbrMetallicRoughness.metallicFactor !== undefined) {
                hasPbrMetallicRoughness = true;
                props['metallic'] = pbrMetallicRoughness.metallicFactor;
            }
            if (pbrMetallicRoughness.roughnessFactor !== undefined) {
                hasPbrMetallicRoughness = true;
                props['roughness'] = pbrMetallicRoughness.roughnessFactor;
            }
        }
        if (!hasPbrMetallicRoughness) {
            if (gltfMaterial.extensions?.KHR_materials_pbrSpecularGlossiness) {
                return this._convertGltfPbrSpecularGlossiness(
                    gltfMaterial,
                    iGltfMaterial,
                    gltfAssetFinder,
                    effectGetter,
                    depthWriteInAlphaModeBlend,
                );
            }
        }
        if (gltfMaterial.normalTexture !== undefined) {
            const pbrNormalTexture = gltfMaterial.normalTexture;
            if (pbrNormalTexture.index !== undefined) {
                defines['USE_NORMAL_MAP'] = true;
                props['normalMap'] = gltfAssetFinder.find('textures', pbrNormalTexture.index, cc.Texture2D);
                if (pbrNormalTexture.scale !== undefined) {
                    props['normalStrenth'] = pbrNormalTexture.scale;
                }
            }
        }

        props['occlusion'] = 0.0;
        if (gltfMaterial.occlusionTexture) {
            const pbrOcclusionTexture = gltfMaterial.occlusionTexture;
            if (pbrOcclusionTexture.index !== undefined) {
                defines['USE_OCCLUSION_MAP'] = true;
                props['occlusionMap'] = gltfAssetFinder.find('textures', pbrOcclusionTexture.index, cc.Texture2D);
                if (pbrOcclusionTexture.strength !== undefined) {
                    props['occlusion'] = pbrOcclusionTexture.strength;
                }
            }
        }

        if (gltfMaterial.emissiveTexture !== undefined) {
            defines['USE_EMISSIVE_MAP'] = true;
            if (gltfMaterial.emissiveTexture.texCoord) {
                defines['EMISSIVE_UV'] = 'v_uv1';
            }
            props['emissiveMap'] = gltfAssetFinder.find('textures', gltfMaterial.emissiveTexture.index, cc.Texture2D);
        }

        if (gltfMaterial.emissiveFactor !== undefined) {
            const v = gltfMaterial.emissiveFactor;
            props['emissive'] = this._normalizeArrayToCocosColor(v)[1];
        }

        if (gltfMaterial.doubleSided) {
            states.rasterizerState!.cullMode = gfx.CullMode.NONE;
        }

        switch (gltfMaterial.alphaMode) {
            case 'BLEND': {
                const blendState = states.blendState!.targets![0];
                blendState.blend = true;
                blendState.blendSrc = gfx.BlendFactor.SRC_ALPHA;
                blendState.blendDst = gfx.BlendFactor.ONE_MINUS_SRC_ALPHA;
                blendState.blendDstAlpha = gfx.BlendFactor.ONE_MINUS_SRC_ALPHA;
                states.depthStencilState!.depthWrite = depthWriteInAlphaModeBlend;
                break;
            }
            case 'MASK': {
                const alphaCutoff = gltfMaterial.alphaCutoff === undefined ? 0.5 : gltfMaterial.alphaCutoff;
                defines['USE_ALPHA_TEST'] = true;
                props['alphaThreshold'] = alphaCutoff;
                break;
            }
            case 'OPAQUE':
            case undefined:
                break;
            default:
                this._logger(GltfConverter.LogLevel.Warning, GltfConverter.ConverterError.UnsupportedAlphaMode, {
                    mode: gltfMaterial.alphaMode,
                    material: iGltfMaterial,
                });
                break;
        }

        // @ts-ignore TS2445
        material._defines = [defines];
        // @ts-ignore TS2445
        material._props = [props];
        // @ts-ignore TS2445
        material._states = [states];

        return material;
    }

    public getTextureParameters(gltfTexture: Texture, userData: TextureBaseAssetUserData) {
        const convertWrapMode = (gltfWrapMode?: number): WrapMode => {
            if (gltfWrapMode === undefined) {
                gltfWrapMode = GltfWrapMode.__DEFAULT;
            }
            switch (gltfWrapMode) {
                case GltfWrapMode.CLAMP_TO_EDGE:
                    return 'clamp-to-edge';
                case GltfWrapMode.MIRRORED_REPEAT:
                    return 'mirrored-repeat';
                case GltfWrapMode.REPEAT:
                    return 'repeat';
                default:
                    this._logger(GltfConverter.LogLevel.Warning, GltfConverter.ConverterError.UnsupportedTextureParameter, {
                        type: 'wrapMode',
                        value: gltfWrapMode,
                        fallback: GltfWrapMode.REPEAT,
                        sampler: gltfTexture.sampler!,
                        texture: this._gltf.textures!.indexOf(gltfTexture),
                    });
                    return 'repeat';
            }
        };

        const convertMagFilter = (gltfFilter: number): Filter => {
            switch (gltfFilter) {
                case GltfTextureMagFilter.NEAREST:
                    return 'nearest';
                case GltfTextureMagFilter.LINEAR:
                    return 'linear';
                default:
                    this._logger(GltfConverter.LogLevel.Warning, GltfConverter.ConverterError.UnsupportedTextureParameter, {
                        type: 'magFilter',
                        value: gltfFilter,
                        fallback: GltfTextureMagFilter.LINEAR,
                        sampler: gltfTexture.sampler!,
                        texture: this._gltf.textures!.indexOf(gltfTexture),
                    });
                    return 'linear';
            }
        };

        // Also convert mip filter.
        const convertMinFilter = (gltfFilter: number): Filter[] => {
            switch (gltfFilter) {
                case GltfTextureMinFilter.NEAREST:
                    return ['nearest', 'none'];
                case GltfTextureMinFilter.LINEAR:
                    return ['linear', 'none'];
                case GltfTextureMinFilter.NEAREST_MIPMAP_NEAREST:
                    return ['nearest', 'nearest'];
                case GltfTextureMinFilter.LINEAR_MIPMAP_NEAREST:
                    return ['linear', 'nearest'];
                case GltfTextureMinFilter.NEAREST_MIPMAP_LINEAR:
                    return ['nearest', 'linear'];
                case GltfTextureMinFilter.LINEAR_MIPMAP_LINEAR:
                    return ['linear', 'linear'];
                default:
                    this._logger(GltfConverter.LogLevel.Warning, GltfConverter.ConverterError.UnsupportedTextureParameter, {
                        type: 'minFilter',
                        value: gltfFilter,
                        fallback: GltfTextureMinFilter.LINEAR,
                        sampler: gltfTexture.sampler!,
                        texture: this._gltf.textures!.indexOf(gltfTexture),
                    });
                    return ['linear', 'none'];
            }
        };

        if (gltfTexture.sampler === undefined) {
            userData.wrapModeS = 'repeat';
            userData.wrapModeT = 'repeat';
        } else {
            const gltfSampler = this._gltf.samplers![gltfTexture.sampler];
            userData.wrapModeS = convertWrapMode(gltfSampler.wrapS);
            userData.wrapModeT = convertWrapMode(gltfSampler.wrapT);
            userData.magfilter = gltfSampler.magFilter === undefined ? defaultMagFilter : convertMagFilter(gltfSampler.magFilter);
            userData.minfilter = defaultMinFilter;
            if (gltfSampler.minFilter !== undefined) {
                const [min, mip] = convertMinFilter(gltfSampler.minFilter);
                userData.minfilter = min;
                userData.mipfilter = mip;
            }
        }
    }

    public createScene(iGltfScene: number, gltfAssetFinder: IGltfAssetFinder, withTransform = true): cc.Node {
        const scene = this._getSceneNode(iGltfScene, gltfAssetFinder, withTransform);
        // update skinning root to animation root node
        scene.getComponentsInChildren(cc.SkinnedMeshRenderer).forEach((comp) => (comp.skinningRoot = scene));
        return scene;
    }

    public createSockets(sceneNode: cc.Node) {
        const sockets: cc.Socket[] = [];
        for (const pair of this._socketMappings) {
            const node = sceneNode.getChildByPath(pair[0])!;
            doCreateSocket(sceneNode, sockets, node);
        }
        return sockets;
    }

    public readImageInBufferView(bufferView: BufferView) {
        return this._readBufferView(bufferView);
    }

    private _warnIfExtensionNotSupported(name: string, required: boolean) {
        if (!supportedExtensions.has(name)) {
            this._logger(GltfConverter.LogLevel.Warning, GltfConverter.ConverterError.UnsupportedExtension, {
                name,
                required,
            });
        }
    }

    private _promoteSingleRootNodes() {
        if (this._gltf.nodes === undefined || this._gltf.scenes === undefined) {
            return;
        }
        for (const glTFScene of this._gltf.scenes) {
            if (glTFScene.nodes !== undefined && glTFScene.nodes.length === 1) {
                // If it's the only root node in the scene.
                // We would promote it to the prefab's root(i.e the skinning root).
                // So we cannot include it as part of the joint path or animation target path.
                const rootNodeIndex = glTFScene.nodes[0];

                // We can't perform this operation if the root participates in skinning, or--
                if (this._gltf.skins && this._gltf.skins.some((skin) => skin.joints.includes(rootNodeIndex))) {
                    continue;
                }

                // animation.
                if (
                    this._gltf.animations &&
                    this._gltf.animations.some((animation: any) => animation.channels.some((channel: any) => channel.target.node === rootNodeIndex))
                ) {
                    continue;
                }

                this._promotedRootNodes.push(rootNodeIndex);
            }
        }
    }

    private _getNodeRotation(rotation: number[], out: Quat) {
        Quat.set(out, rotation[0], rotation[1], rotation[2], rotation[3]);
        Quat.normalize(out, out);
        return out;
    }

    private _gltfChannelToCurveData(
        gltfAnimation: Animation,
        gltfChannel: AnimationChannel,
        jointCurveData: ReturnType<GlTFTrsAnimationData['addNodeAnimation']>,
        input: FloatArray,
    ) {
        let propName: 'position' | 'scale' | 'rotation';
        if (gltfChannel.target.path === GltfAnimationChannelTargetPath.translation) {
            propName = 'position';
        } else if (gltfChannel.target.path === GltfAnimationChannelTargetPath.rotation) {
            propName = 'rotation';
        } else if (gltfChannel.target.path === GltfAnimationChannelTargetPath.scale) {
            propName = 'scale';
        } else {
            this._logger(GltfConverter.LogLevel.Error, GltfConverter.ConverterError.UnsupportedChannelPath, {
                channel: gltfAnimation.channels.indexOf(gltfChannel),
                animation: this._gltf.animations!.indexOf(gltfAnimation),
                path: gltfChannel.target.path,
            });
            return;
        }

        const gltfSampler = gltfAnimation.samplers[gltfChannel.sampler];

        const interpolation = gltfSampler.interpolation ?? GlTfAnimationInterpolation.LINEAR;
        switch (interpolation) {
            case GlTfAnimationInterpolation.STEP:
            case GlTfAnimationInterpolation.LINEAR:
            case GlTfAnimationInterpolation.CUBIC_SPLINE:
                break;
            default:
                return;
        }

        const output = this._readAccessorIntoArrayAndNormalizeAsFloat(this._gltf.accessors![gltfSampler.output]);

        jointCurveData[propName] = new GlTFTrsTrackData(interpolation, input, output);
    }

    private _glTFWeightChannelToTracks(gltfAnimation: Animation, gltfChannel: AnimationChannel, times: FloatArray): cc.animation.Track[] {
        const gltfSampler = gltfAnimation.samplers[gltfChannel.sampler];
        const outputs = this._readAccessorIntoArrayAndNormalizeAsFloat(this._gltf.accessors![gltfSampler.output]);
        const targetNode = this._gltf.nodes![gltfChannel.target.node!];
        const targetProcessedMesh = this._processedMeshes[targetNode.mesh!];
        const tracks = new Array<cc.animation.Track>();
        const nSubMeshes = targetProcessedMesh.geometries.length;
        let nTarget = 0;
        for (let iSubMesh = 0; iSubMesh < nSubMeshes; ++iSubMesh) {
            const geometry = targetProcessedMesh.geometries[iSubMesh];
            if (!geometry.hasAttribute(PPGeometry.StdSemantics.position)) {
                continue;
            }
            const { morphs } = geometry.getAttribute(PPGeometry.StdSemantics.position);
            if (!morphs) {
                continue;
            }
            nTarget = morphs.length;
            break;
        }
        if (nTarget === 0) {
            console.debug(
                `Morph animation in ${gltfAnimation.name} on node ${this._gltf.nodes![gltfChannel.target.node!]}` +
                'is going to be ignored due to lack of morph information in mesh.',
            );
            return [];
        }
        const track = new RealArrayTrack();
        tracks.push(track);
        track.path = new cc.animation.TrackPath()
            .toHierarchy(this._mapToSocketPath(this._getNodePath(gltfChannel.target.node!)))
            .toComponent(cc.js.getClassName(cc.MeshRenderer));
        track.proxy = new cc.animation.MorphWeightsAllValueProxy();
        track.elementCount = nTarget;
        for (let iTarget = 0; iTarget < nTarget; ++iTarget) {
            const { curve } = track.channels()[iTarget];
            const frameValues: Partial<cc.RealKeyframeValue>[] = Array.from({ length: times.length }, (_, index) => {
                const value = outputs[nTarget * index + iTarget];
                const keyframeValue = { value, interpolationMode: cc.RealInterpolationMode.LINEAR };
                return keyframeValue;
            });
            curve.assignSorted(Array.from(times), frameValues);
        }
        return tracks;
    }

    private _getParent(node: number) {
        return this._parents[node];
    }

    private _getRootParent(node: number) {
        for (let parent = node; parent >= 0; parent = this._getParent(node)) {
            node = parent;
        }
        return node;
    }

    private _commonRoot(nodes: number[]) {
        let minPathLen = Infinity;
        const paths = nodes.map((node) => {
            const path: number[] = [];
            let curNode = node;
            while (curNode >= 0) {
                path.unshift(curNode);
                curNode = this._getParent(curNode);
            }
            minPathLen = Math.min(minPathLen, path.length);
            return path;
        });
        if (paths.length === 0) {
            return -1;
        }

        const commonPath: number[] = [];
        for (let i = 0; i < minPathLen; ++i) {
            const n = paths[0][i];
            if (paths.every((path) => path[i] === n)) {
                commonPath.push(n);
            } else {
                break;
            }
        }

        if (commonPath.length === 0) {
            return -1;
        }
        return commonPath[commonPath.length - 1];
    }

    private _getSkinRoot(skin: number) {
        let result = this._skinRoots[skin];
        if (result === skinRootNotCalculated) {
            result = this._commonRoot(this._gltf.skins![skin].joints);
            this._skinRoots[skin] = result;
        }
        return result;
    }

    private _readPrimitive(glTFPrimitive: MeshPrimitive, meshIndex: number, primitiveIndex: number) {
        let decodedDracoGeometry: DecodedDracoGeometry | null = null;
        if (glTFPrimitive.extensions) {
            for (const extensionName of Object.keys(glTFPrimitive.extensions)) {
                const extension = glTFPrimitive.extensions[extensionName];
                switch (extensionName) {
                    case 'KHR_draco_mesh_compression':
                        decodedDracoGeometry = this._decodeDracoGeometry(glTFPrimitive, extension);
                        break;
                }
            }
        }

        const primitiveMode = this._getPrimitiveMode(glTFPrimitive.mode === undefined ? GltfPrimitiveMode.__DEFAULT : glTFPrimitive.mode);

        let indices: PPGeometryTypedArray | undefined;
        if (glTFPrimitive.indices !== undefined) {
            let data: PPGeometryTypedArray;
            if (decodedDracoGeometry && decodedDracoGeometry.indices) {
                data = decodedDracoGeometry.indices;
            } else {
                const indicesAccessor = this._gltf.accessors![glTFPrimitive.indices];
                data = this._readAccessorIntoArray(indicesAccessor);
            }
            indices = data;
        }

        if (!(GltfSemanticName.POSITION in glTFPrimitive.attributes)) {
            throw new Error('The primitive doesn\'t contains positions.');
        }

        // TODO: mismatch in glTF-sample-module:Monster-Draco?
        const nVertices = decodedDracoGeometry
            ? decodedDracoGeometry.vertices[GltfSemanticName.POSITION].length / 3
            : this._gltf.accessors![glTFPrimitive.attributes[GltfSemanticName.POSITION]].count;

        const ppGeometry: PPGeometry = new PPGeometry(nVertices, primitiveMode, indices);

        for (const attributeName of Object.getOwnPropertyNames(glTFPrimitive.attributes)) {
            const attributeAccessor = this._gltf.accessors![glTFPrimitive.attributes[attributeName]];
            let data: PPGeometryTypedArray;
            if (decodedDracoGeometry && attributeName in decodedDracoGeometry.vertices) {
                const dracoDecodedAttribute = decodedDracoGeometry.vertices[attributeName];
                data = dracoDecodedAttribute;
            } else {
                const plainAttribute = this._readAccessorIntoArray(attributeAccessor);
                data = plainAttribute;
            }
            const semantic = glTFAttributeNameToPP(attributeName);
            const components = this._getComponentsPerAttribute(attributeAccessor.type);
            ppGeometry.setAttribute(semantic, data, components);
        }

        if (glTFPrimitive.targets) {
            const attributes = Object.getOwnPropertyNames(glTFPrimitive.targets[0]);
            for (const attribute of attributes) {
                // Check if the morph-attributes are valid.
                const semantic = glTFAttributeNameToPP(attribute);
                if (
                    !PPGeometry.isStdSemantic(semantic) ||
                    ![PPGeometry.StdSemantics.position, PPGeometry.StdSemantics.normal, PPGeometry.StdSemantics.tangent].includes(semantic)
                ) {
                    throw new Error(`Only position, normal, tangent attribute are morph-able, but provide ${attribute}`);
                }

                assertGlTFConformance(ppGeometry.hasAttribute(semantic), `Primitive do not have attribute ${attribute} for morph.`);
                const ppAttribute = ppGeometry.getAttribute(semantic);

                ppAttribute.morphs = new Array(glTFPrimitive.targets.length);
                for (let iTarget = 0; iTarget < glTFPrimitive.targets.length; ++iTarget) {
                    const morphTarget = glTFPrimitive.targets[iTarget];
                    // All targets shall have same morph-attributes.
                    assertGlTFConformance(attribute in morphTarget, 'Morph attributes in all target must be same.');
                    // Extracts the displacements.
                    const attributeAccessor = this._gltf.accessors![morphTarget[attribute]];
                    const morphDisplacement = this._readAccessorIntoArray(attributeAccessor);
                    ppAttribute.morphs[iTarget] = morphDisplacement;
                    // const mainData = ppGeometry.getAttribute(semantic).data;
                    // assertGlTFConformance(ppGeometry.length === data.length,
                    //     `Count of morph attribute ${targetAttribute} mismatch which in primitive.`);
                }
            }

            // If all targets are zero, which means no any displacement, we exclude it from morphing.
            // Should we?
            // Edit: in cocos/3d-tasks#11585 we can see that
            // in mesh 0 there are 11 primitives, 8 of them have empty morph data.
            // So I decide to silence the warning and leave it as `verbose`.
            let nonEmptyMorph = false;
            ppGeometry.forEachAttribute((attribute) => {
                if (
                    !nonEmptyMorph &&
                    attribute.morphs &&
                    attribute.morphs.some((displacement) => displacement.some((v: number) => v !== 0))
                ) {
                    nonEmptyMorph = true;
                }
            });
            if (!nonEmptyMorph) {
                this._logger(GltfConverter.LogLevel.Debug, GltfConverter.ConverterError.EmptyMorph, {
                    mesh: meshIndex,
                    primitive: primitiveIndex,
                });
            }
        }

        return ppGeometry;
    }

    private _decodeDracoGeometry(glTFPrimitive: MeshPrimitive, extension: KHRDracoMeshCompression) {
        const bufferView = this._gltf.bufferViews![extension.bufferView];
        const buffer = this._buffers[bufferView.buffer];
        const bufferViewOffset = bufferView.byteOffset === undefined ? 0 : bufferView.byteOffset;
        const compressedData = buffer.slice(bufferViewOffset, bufferViewOffset + bufferView.byteLength);
        const options: DecodeDracoGeometryOptions = {
            buffer: new Int8Array(compressedData),
            attributes: {},
        };
        if (glTFPrimitive.indices !== undefined) {
            options.indices = this._getAttributeBaseTypeStorage(this._gltf.accessors![glTFPrimitive.indices].componentType);
        }
        for (const attributeName of Object.keys(extension.attributes)) {
            if (attributeName in glTFPrimitive.attributes) {
                const accessor = this._gltf.accessors![glTFPrimitive.attributes[attributeName]];
                options.attributes[attributeName] = {
                    uniqueId: extension.attributes[attributeName],
                    storageConstructor: this._getAttributeBaseTypeStorage(accessor.componentType),
                    components: this._getComponentsPerAttribute(accessor.type),
                };
            }
        }
        return decodeDracoGeometry(options);
    }

    private _readBounds(glTFPrimitive: MeshPrimitive, minPosition: Vec3, maxPosition: Vec3) {
        // https://github.com/KhronosGroup/glTF/tree/master/specification/2.0#accessors-bounds
        // > JavaScript client implementations should convert JSON-parsed floating-point doubles to single precision,
        // > when componentType is 5126 (FLOAT).
        const iPositionAccessor = glTFPrimitive.attributes[GltfSemanticName.POSITION];
        if (iPositionAccessor !== undefined) {
            const positionAccessor = this._gltf.accessors![iPositionAccessor];
            if (positionAccessor.min) {
                if (positionAccessor.componentType === GltfAccessorComponentType.FLOAT) {
                    minPosition.x = Math.fround(positionAccessor.min[0]);
                    minPosition.y = Math.fround(positionAccessor.min[1]);
                    minPosition.z = Math.fround(positionAccessor.min[2]);
                } else {
                    minPosition.x = positionAccessor.min[0];
                    minPosition.y = positionAccessor.min[1];
                    minPosition.z = positionAccessor.min[2];
                }
            }
            if (positionAccessor.max) {
                if (positionAccessor.componentType === GltfAccessorComponentType.FLOAT) {
                    maxPosition.x = Math.fround(positionAccessor.max[0]);
                    maxPosition.y = Math.fround(positionAccessor.max[1]);
                    maxPosition.z = Math.fround(positionAccessor.max[2]);
                } else {
                    maxPosition.x = positionAccessor.max[0];
                    maxPosition.y = positionAccessor.max[1];
                    maxPosition.z = positionAccessor.max[2];
                }
            }
        }
    }

    private _applySettings(
        ppGeometry: PPGeometry,
        normalImportSetting: NormalImportSetting,
        tangentImportSetting: TangentImportSetting,
        morphNormalsImportSetting: NormalImportSetting.exclude | NormalImportSetting.optional,
        primitiveIndex: number,
        meshIndex: number,
    ) {
        if (
            normalImportSetting === NormalImportSetting.recalculate ||
            (normalImportSetting === NormalImportSetting.require && !ppGeometry.hasAttribute(PPGeometry.StdSemantics.normal))
        ) {
            const normals = ppGeometry.calculateNormals();
            ppGeometry.setAttribute(PPGeometry.StdSemantics.normal, normals, 3);
        } else if (normalImportSetting === NormalImportSetting.exclude && ppGeometry.hasAttribute(PPGeometry.StdSemantics.normal)) {
            ppGeometry.deleteAttribute(PPGeometry.StdSemantics.normal);
        }

        if (
            tangentImportSetting === TangentImportSetting.recalculate ||
            (tangentImportSetting === TangentImportSetting.require && !ppGeometry.hasAttribute(PPGeometry.StdSemantics.tangent))
        ) {
            if (!ppGeometry.hasAttribute(PPGeometry.StdSemantics.normal)) {
                this._logger(GltfConverter.LogLevel.Warning, GltfConverter.ConverterError.FailedToCalculateTangents, {
                    reason: 'normal',
                    primitive: primitiveIndex,
                    mesh: meshIndex,
                });
            } else if (!ppGeometry.hasAttribute(PPGeometry.StdSemantics.texcoord)) {
                this._logger(GltfConverter.LogLevel.Debug, GltfConverter.ConverterError.FailedToCalculateTangents, {
                    reason: 'uv',
                    primitive: primitiveIndex,
                    mesh: meshIndex,
                });
            } else {
                const tangents = ppGeometry.calculateTangents();
                ppGeometry.setAttribute(PPGeometry.StdSemantics.tangent, tangents, 4);
            }
        } else if (tangentImportSetting === TangentImportSetting.exclude && ppGeometry.hasAttribute(PPGeometry.StdSemantics.tangent)) {
            ppGeometry.deleteAttribute(PPGeometry.StdSemantics.tangent);
        }

        if (morphNormalsImportSetting === NormalImportSetting.exclude && ppGeometry.hasAttribute(PPGeometry.StdSemantics.normal)) {
            const normalAttribute = ppGeometry.getAttribute(PPGeometry.StdSemantics.normal);
            normalAttribute.morphs = null;
        }
    }

    private _readBufferView(bufferView: BufferView) {
        const buffer = this._buffers[bufferView.buffer];
        return Buffer.from(buffer.buffer, buffer.byteOffset + (bufferView.byteOffset || 0), bufferView.byteLength);
    }

    private _readAccessorIntoArray(gltfAccessor: Accessor) {
        const storageConstructor = this._getAttributeBaseTypeStorage(gltfAccessor.componentType);
        const result = new storageConstructor(gltfAccessor.count * this._getComponentsPerAttribute(gltfAccessor.type));
        this._readAccessor(gltfAccessor, createDataViewFromTypedArray(result));
        if (gltfAccessor.sparse !== undefined) {
            this._applyDeviation(gltfAccessor as FieldsRequired<Accessor, 'sparse'>, result);
        }
        return result;
    }

    private _readAccessorIntoArrayAndNormalizeAsFloat(gltfAccessor: Accessor) {
        let outputs = this._readAccessorIntoArray(gltfAccessor);
        if (!(outputs instanceof Float32Array)) {
            const normalizedOutput = new Float32Array(outputs.length);
            const normalize = (() => {
                if (outputs instanceof Int8Array) {
                    return (value: number) => {
                        return Math.max(value / 127.0, -1.0);
                    };
                } else if (outputs instanceof Uint8Array) {
                    return (value: number) => {
                        return value / 255.0;
                    };
                } else if (outputs instanceof Int16Array) {
                    return (value: number) => {
                        return Math.max(value / 32767.0, -1.0);
                    };
                } else if (outputs instanceof Uint16Array) {
                    return (value: number) => {
                        return value / 65535.0;
                    };
                } else {
                    return (value: number) => {
                        return value;
                    };
                }
            })();
            for (let i = 0; i < outputs.length; ++i) {
                normalizedOutput[i] = normalize(outputs[i]); // Do normalize.
            }
            outputs = normalizedOutput;
        }
        return outputs;
    }

    private _getSceneNode(iGltfScene: number, gltfAssetFinder: IGltfAssetFinder, withTransform = true) {
        const sceneName = this._getGltfXXName(GltfAssetKind.Scene, iGltfScene);
        const gltfScene = this._gltf.scenes![iGltfScene];

        let sceneNode: cc.Node;
        if (!gltfScene.nodes || gltfScene.nodes.length === 0) {
            sceneNode = new cc.Node(sceneName);
        } else {
            const glTFSceneRootNodes = gltfScene.nodes;
            const mapping: (cc.Node | null)[] = new Array(this._gltf.nodes!.length).fill(null);
            if (gltfScene.nodes.length === 1 && this._promotedRootNodes.includes(gltfScene.nodes[0])) {
                const promotedRootNode = gltfScene.nodes[0];
                sceneNode = this._createEmptyNodeRecursive(promotedRootNode, mapping, withTransform);
            } else {
                sceneNode = new cc.Node(sceneName);
                for (const node of gltfScene.nodes) {
                    const root = this._createEmptyNodeRecursive(node, mapping, withTransform);
                    root.parent = sceneNode;
                }
            }
            mapping.forEach((node, iGltfNode) => {
                this._setupNode(iGltfNode, mapping, gltfAssetFinder, sceneNode, glTFSceneRootNodes);
            });
        }

        return sceneNode;
    }

    private _createEmptyNodeRecursive(iGltfNode: number, mapping: (cc.Node | null)[], withTransform = true): cc.Node {
        const gltfNode = this._gltf.nodes![iGltfNode];
        const result = this._createEmptyNode(iGltfNode, withTransform);
        if (gltfNode.children !== undefined) {
            for (const child of gltfNode.children) {
                const childResult = this._createEmptyNodeRecursive(child, mapping, withTransform);
                childResult.parent = result;
            }
        }
        mapping[iGltfNode] = result;
        return result;
    }

    private _setupNode(
        iGltfNode: number,
        mapping: (cc.Node | null)[],
        gltfAssetFinder: IGltfAssetFinder,
        sceneNode: cc.Node,
        glTFSceneRootNodes: number[],
    ) {
        const node = mapping[iGltfNode];
        if (node === null) {
            return;
        }
        const gltfNode = this._gltf.nodes![iGltfNode];
        if (gltfNode.mesh !== undefined) {
            let modelComponent: cc.MeshRenderer | null = null;
            if (gltfNode.skin === undefined) {
                modelComponent = node.addComponent(cc.MeshRenderer);
            } else {
                const skinningModelComponent = node.addComponent(cc.SkinnedMeshRenderer)!;
                const skeleton = gltfAssetFinder.find('skeletons', gltfNode.skin, cc.Skeleton);
                if (skeleton) {
                    skinningModelComponent.skeleton = skeleton;
                }
                const skinRoot = mapping[this._getSkinRoot(gltfNode.skin)];
                if (skinRoot === null) {
                    // They do not have common root.
                    // This may be caused by root parent nodes of them are different but they are all under same scene.
                    const glTFSkin = this.gltf.skins![gltfNode.skin];
                    const isUnderSameScene = glTFSkin.joints.every((joint: any) => glTFSceneRootNodes.includes(this._getRootParent(joint)));
                    if (isUnderSameScene) {
                        skinningModelComponent.skinningRoot = sceneNode;
                    } else {
                        this._logger(GltfConverter.LogLevel.Error, GltfConverter.ConverterError.ReferenceSkinInDifferentScene, {
                            node: iGltfNode,
                            skin: gltfNode.skin,
                        });
                    }
                } else {
                    // assign a temporary root
                    skinningModelComponent.skinningRoot = skinRoot;
                }
                modelComponent = skinningModelComponent;
            }
            const mesh = gltfAssetFinder.find('meshes', gltfNode.mesh, cc.Mesh);
            if (mesh) {
                // @ts-ignore TS2445
                modelComponent._mesh = mesh;
            }
            const gltfMesh = this.gltf.meshes![gltfNode.mesh];
            const processedMesh = this._processedMeshes[gltfNode.mesh];
            const materials = processedMesh.materialIndices.map((idx) => {
                const gltfPrimitive = gltfMesh.primitives[idx];
                if (gltfPrimitive.material === undefined) {
                    return null;
                } else {
                    const material = gltfAssetFinder.find('materials', gltfPrimitive.material, cc.Material);
                    if (material) {
                        return material;
                    }
                }
                return null;
            });
            // @ts-ignore TS2445
            modelComponent._materials = materials;
        }
    }

    private _createEmptyNode(iGltfNode: number, withTransform = true) {
        const gltfNode = this._gltf.nodes![iGltfNode];
        const nodeName = this._getGltfXXName(GltfAssetKind.Node, iGltfNode);

        const node = new cc.Node(nodeName);
        if (!withTransform) {
            return node;
        }

        if (gltfNode.translation) {
            node.setPosition(gltfNode.translation[0], gltfNode.translation[1], gltfNode.translation[2]);
        }
        if (gltfNode.rotation) {
            node.setRotation(this._getNodeRotation(gltfNode.rotation, new Quat()));
        }
        if (gltfNode.scale) {
            node.setScale(gltfNode.scale[0], gltfNode.scale[1], gltfNode.scale[2]);
        }
        if (gltfNode.matrix) {
            const ns = gltfNode.matrix;
            const m = this._readNodeMatrix(ns);
            const t = new Vec3();
            const r = new Quat();
            const s = new Vec3();
            Mat4.toRTS(m, r, t, s);
            node.setPosition(t);
            node.setRotation(r);
            node.setScale(s);
        }
        return node;
    }

    private _readNodeMatrix(ns: number[]) {
        return new Mat4(
            ns[0],
            ns[1],
            ns[2],
            ns[3],
            ns[4],
            ns[5],
            ns[6],
            ns[7],
            ns[8],
            ns[9],
            ns[10],
            ns[11],
            ns[12],
            ns[13],
            ns[14],
            ns[15],
        );
    }

    private _getNodePath(node: number) {
        return this._nodePathTable[node];
    }

    private _isAncestorOf(parent: number, child: number) {
        if (parent !== child) {
            while (child >= 0) {
                if (child === parent) {
                    return true;
                }
                child = this._getParent(child);
            }
        }
        return false;
    }

    private _mapToSocketPath(path: string) {
        for (const pair of this._socketMappings) {
            if (path !== pair[0] && !path.startsWith(pair[0] + '/')) {
                continue;
            }
            return pair[1] + path.slice(pair[0].length);
        }
        return path;
    }

    private _createNodePathTable() {
        if (this._gltf.nodes === undefined) {
            return [];
        }

        const parentTable = new Array<number>(this._gltf.nodes.length).fill(-1);
        this._gltf.nodes.forEach((gltfNode: any, nodeIndex: any) => {
            if (gltfNode.children) {
                gltfNode.children.forEach((iChildNode: any) => {
                    parentTable[iChildNode] = nodeIndex;
                });
                const names = gltfNode.children.map((iChildNode: any) => {
                    const childNode = this._gltf.nodes![iChildNode];
                    let name = childNode.name;
                    if (typeof name !== 'string' || name.length === 0) {
                        name = null;
                    }
                    return name;
                });
                const uniqueNames = makeUniqueNames(names, uniqueChildNodeNameGenerator);
                uniqueNames.forEach((uniqueName, iUniqueName) => {
                    this._gltf.nodes![gltfNode.children![iUniqueName]].name = uniqueName;
                });
            }
        });

        const nodeNames = new Array<string>(this._gltf.nodes.length).fill('');
        for (let iNode = 0; iNode < nodeNames.length; ++iNode) {
            nodeNames[iNode] = this._getGltfXXName(GltfAssetKind.Node, iNode);
        }

        const result = new Array<string>(this._gltf.nodes.length).fill('');
        this._gltf.nodes.forEach((gltfNode: any, nodeIndex: any) => {
            const segments: string[] = [];
            for (let i = nodeIndex; i >= 0; i = parentTable[i]) {
                // Promoted node is not part of node path
                if (!this._promotedRootNodes.includes(i)) {
                    segments.unshift(nodeNames[i]);
                }
            }
            result[nodeIndex] = segments.join('/');
        });

        return result;
    }

    /**
     * Note, if `bufferView` property is not defined, this method will do nothing.
     * So you should ensure that the data area of `outputBuffer` is filled with `0`s.
     * @param gltfAccessor
     * @param outputBuffer
     * @param outputStride
     */
    private _readAccessor(gltfAccessor: Accessor, outputBuffer: DataView, outputStride = 0) {
        // When not defined, accessor must be initialized with zeros.
        if (gltfAccessor.bufferView === undefined) {
            return;
        }

        const gltfBufferView = this._gltf.bufferViews![gltfAccessor.bufferView];

        const componentsPerAttribute = this._getComponentsPerAttribute(gltfAccessor.type);
        const bytesPerElement = this._getBytesPerComponent(gltfAccessor.componentType);

        if (outputStride === 0) {
            outputStride = componentsPerAttribute * bytesPerElement;
        }

        const inputStartOffset =
            (gltfAccessor.byteOffset !== undefined ? gltfAccessor.byteOffset : 0) +
            (gltfBufferView.byteOffset !== undefined ? gltfBufferView.byteOffset : 0);

        const inputBuffer = createDataViewFromBuffer(this._buffers[gltfBufferView.buffer], inputStartOffset);

        const inputStride = gltfBufferView.byteStride !== undefined ? gltfBufferView.byteStride : componentsPerAttribute * bytesPerElement;

        const componentReader = this._getComponentReader(gltfAccessor.componentType);
        const componentWriter = this._getComponentWriter(gltfAccessor.componentType);

        for (let iAttribute = 0; iAttribute < gltfAccessor.count; ++iAttribute) {
            const i = createDataViewFromTypedArray(inputBuffer, inputStride * iAttribute);
            const o = createDataViewFromTypedArray(outputBuffer, outputStride * iAttribute);
            for (let iComponent = 0; iComponent < componentsPerAttribute; ++iComponent) {
                const componentBytesOffset = bytesPerElement * iComponent;
                const value = componentReader(i, componentBytesOffset);
                componentWriter(o, componentBytesOffset, value);
            }
        }
    }

    private _applyDeviation(glTFAccessor: FieldsRequired<Accessor, 'sparse'>, baseValues: AccessorStorage) {
        const { sparse } = glTFAccessor;

        // Sparse indices
        const indicesBufferView = this._gltf.bufferViews![sparse.indices.bufferView];
        const indicesBuffer = this._buffers[indicesBufferView.buffer];
        const indicesSc = this._getAttributeBaseTypeStorage(sparse.indices.componentType);
        const sparseIndices = new indicesSc(
            indicesBuffer.buffer as unknown as ArrayBuffer,
            indicesBuffer.byteOffset + (indicesBufferView.byteOffset || 0) + (sparse.indices.byteOffset || 0),
            sparse.count,
        );

        // Sparse values
        const valuesBufferView = this._gltf.bufferViews![sparse.values.bufferView];
        const valuesBuffer = this._buffers[valuesBufferView.buffer];
        const valuesSc = this._getAttributeBaseTypeStorage(glTFAccessor.componentType);
        const sparseValues = new valuesSc(
            valuesBuffer.buffer as unknown as ArrayBuffer,
            valuesBuffer.byteOffset + (valuesBufferView.byteOffset || 0) + (sparse.values.byteOffset || 0),
        );

        const components = this._getComponentsPerAttribute(glTFAccessor.type);
        for (let iComponent = 0; iComponent < components; ++iComponent) {
            for (let iSparseIndex = 0; iSparseIndex < sparseIndices.length; ++iSparseIndex) {
                const sparseIndex = sparseIndices[iSparseIndex];
                baseValues[components * sparseIndex + iComponent] = sparseValues[components * iSparseIndex + iComponent];
            }
        }
    }

    private _getPrimitiveMode(mode: number | undefined) {
        if (mode === undefined) {
            mode = GltfPrimitiveMode.__DEFAULT;
        }
        switch (mode) {
            case GltfPrimitiveMode.POINTS:
                return gfx.PrimitiveMode.POINT_LIST;
            case GltfPrimitiveMode.LINES:
                return gfx.PrimitiveMode.LINE_LIST;
            case GltfPrimitiveMode.LINE_LOOP:
                return gfx.PrimitiveMode.LINE_LOOP;
            case GltfPrimitiveMode.LINE_STRIP:
                return gfx.PrimitiveMode.LINE_STRIP;
            case GltfPrimitiveMode.TRIANGLES:
                return gfx.PrimitiveMode.TRIANGLE_LIST;
            case GltfPrimitiveMode.TRIANGLE_STRIP:
                return gfx.PrimitiveMode.TRIANGLE_STRIP;
            case GltfPrimitiveMode.TRIANGLE_FAN:
                return gfx.PrimitiveMode.TRIANGLE_FAN;
            default:
                throw new Error(`Unrecognized primitive mode: ${mode}.`);
        }
    }

    private _getAttributeBaseTypeStorage(componentType: number): AccessorStorageConstructor {
        switch (componentType) {
            case GltfAccessorComponentType.BYTE:
                return Int8Array;
            case GltfAccessorComponentType.UNSIGNED_BYTE:
                return Uint8Array;
            case GltfAccessorComponentType.SHORT:
                return Int16Array;
            case GltfAccessorComponentType.UNSIGNED_SHORT:
                return Uint16Array;
            case GltfAccessorComponentType.UNSIGNED_INT:
                return Uint32Array;
            case GltfAccessorComponentType.FLOAT:
                return Float32Array;
            default:
                throw new Error(`Unrecognized component type: ${componentType}`);
        }
    }

    private _getComponentsPerAttribute(type: string) {
        return getGltfAccessorTypeComponents(type);
    }

    private _getBytesPerComponent(componentType: number) {
        switch (componentType) {
            case GltfAccessorComponentType.BYTE:
            case GltfAccessorComponentType.UNSIGNED_BYTE:
                return 1;
            case GltfAccessorComponentType.SHORT:
            case GltfAccessorComponentType.UNSIGNED_SHORT:
                return 2;
            case GltfAccessorComponentType.UNSIGNED_INT:
            case GltfAccessorComponentType.FLOAT:
                return 4;
            default:
                throw new Error(`Unrecognized component type: ${componentType}`);
        }
    }

    private _getComponentReader(componentType: number): (buffer: DataView, offset: number) => number {
        switch (componentType) {
            case GltfAccessorComponentType.BYTE:
                return (buffer, offset) => buffer.getInt8(offset);
            case GltfAccessorComponentType.UNSIGNED_BYTE:
                return (buffer, offset) => buffer.getUint8(offset);
            case GltfAccessorComponentType.SHORT:
                return (buffer, offset) => buffer.getInt16(offset, DataViewUseLittleEndian);
            case GltfAccessorComponentType.UNSIGNED_SHORT:
                return (buffer, offset) => buffer.getUint16(offset, DataViewUseLittleEndian);
            case GltfAccessorComponentType.UNSIGNED_INT:
                return (buffer, offset) => buffer.getUint32(offset, DataViewUseLittleEndian);
            case GltfAccessorComponentType.FLOAT:
                return (buffer, offset) => buffer.getFloat32(offset, DataViewUseLittleEndian);
            default:
                throw new Error(`Unrecognized component type: ${componentType}`);
        }
    }

    private _getComponentWriter(componentType: number): (buffer: DataView, offset: number, value: number) => void {
        switch (componentType) {
            case GltfAccessorComponentType.BYTE:
                return (buffer, offset, value) => buffer.setInt8(offset, value);
            case GltfAccessorComponentType.UNSIGNED_BYTE:
                return (buffer, offset, value) => buffer.setUint8(offset, value);
            case GltfAccessorComponentType.SHORT:
                return (buffer, offset, value) => buffer.setInt16(offset, value, DataViewUseLittleEndian);
            case GltfAccessorComponentType.UNSIGNED_SHORT:
                return (buffer, offset, value) => buffer.setUint16(offset, value, DataViewUseLittleEndian);
            case GltfAccessorComponentType.UNSIGNED_INT:
                return (buffer, offset, value) => buffer.setUint32(offset, value, DataViewUseLittleEndian);
            case GltfAccessorComponentType.FLOAT:
                return (buffer, offset, value) => buffer.setFloat32(offset, value, DataViewUseLittleEndian);
            default:
                throw new Error(`Unrecognized component type: ${componentType}`);
        }
    }

    private _getGltfXXName(assetKind: GltfAssetKind, index: number) {
        const assetsArrayName: {
            [x: number]: string;
        } = {
            [GltfAssetKind.Animation]: 'animations',
            [GltfAssetKind.Image]: 'images',
            [GltfAssetKind.Material]: 'materials',
            [GltfAssetKind.Node]: 'nodes',
            [GltfAssetKind.Skin]: 'skins',
            [GltfAssetKind.Texture]: 'textures',
            [GltfAssetKind.Scene]: 'scenes',
        };

        const assets = this._gltf[assetsArrayName[assetKind]];
        if (!assets) {
            return '';
        }
        const asset = assets[index];
        if (typeof asset.name === 'string') {
            return asset.name;
        } else {
            return `${GltfAssetKind[assetKind]}-${index}`;
        }
    }

    /**
     * Normalize a number array if max value is greater than 1,returns the max value and the normalized array.
     * @param orgArray
     * @private
     */
    private _normalizeArrayToCocosColor(orgArray: number[]): [factor: number, color: cc.Color] {
        let factor = 1;
        if (Math.max(...orgArray) > 1) {
            factor = Math.max(...orgArray);
        }
        const normalizeArray = orgArray.map((v) => linearToSrgb8Bit(v / factor));
        if (normalizeArray.length === 3) {
            normalizeArray.push(255);
        }
        const color = new cc.Color(normalizeArray[0], normalizeArray[1], normalizeArray[2], normalizeArray[3]);
        return [factor, color];
    }

    private _convertAdskPhysicalMaterial(
        _glTFMaterial: Material,
        glTFMaterialIndex: number,
        glTFAssetFinder: IGltfAssetFinder,
        effectGetter: (name: string) => cc.EffectAsset,
        originalMaterial: {
            properties: Adsk3dsMaxPhysicalMaterialProperties;
        },
    ): cc.Material | null {
        const defines: Partial<CreatorStdMaterialDefines> = {};
        const properties: Partial<CreatorStdMaterialProperties> = {};
        const states: cc.Material['_states'][0] = {
            rasterizerState: {},
            blendState: { targets: [{}] },
            depthStencilState: {},
        };

        const { Parameters: physicalParams } = originalMaterial.properties['3dsMax'];
        // Note: You should support every thing in `physicalParams` optional

        const pBaseColor = physicalParams.base_color ?? ADSK_3DS_MAX_PHYSICAL_MATERIAL_DEFAULT_PARAMETERS.base_color;
        properties['mainColor'] = cc.Vec4.set(new cc.Color(), pBaseColor[0], pBaseColor[1], pBaseColor[2], pBaseColor[3]);

        const pBaseWeight = physicalParams.basic_weight ?? ADSK_3DS_MAX_PHYSICAL_MATERIAL_DEFAULT_PARAMETERS.basic_weight;
        properties['albedoScale'] = new cc.Vec3(pBaseWeight, pBaseWeight, pBaseWeight);

        const pBaseColorMapOn = physicalParams.base_color_map_on ?? ADSK_3DS_MAX_PHYSICAL_MATERIAL_DEFAULT_PARAMETERS.base_color_map_on;
        const pBaseColorMap = physicalParams.base_color_map;
        if (pBaseColorMapOn && pBaseColorMap) {
            defines['USE_ALBEDO_MAP'] = true;
            properties['mainTexture'] = glTFAssetFinder.find('textures', pBaseColorMap.index, cc.Texture2D) ?? undefined;
            if (pBaseColorMap.texCoord === 1) {
                defines['ALBEDO_UV'] = 'v_uv1';
            }
            if (hasKHRTextureTransformExtension(pBaseColorMap)) {
                properties['tilingOffset'] = this._khrTextureTransformToTiling(pBaseColorMap.extensions.KHR_texture_transform);
            }
        }

        const pMetalness = physicalParams.metalness ?? ADSK_3DS_MAX_PHYSICAL_MATERIAL_DEFAULT_PARAMETERS.metalness;
        properties['metallic'] = pMetalness;
        const pRoughness = physicalParams.roughness ?? ADSK_3DS_MAX_PHYSICAL_MATERIAL_DEFAULT_PARAMETERS.roughness;
        const pInvRoughness = physicalParams.roughness_inv ?? ADSK_3DS_MAX_PHYSICAL_MATERIAL_DEFAULT_PARAMETERS.roughness_inv;
        properties['roughness'] = pInvRoughness ? 1.0 - pRoughness : pRoughness;
        const pMetalnessMapOn = physicalParams.metalness_map_on ?? ADSK_3DS_MAX_PHYSICAL_MATERIAL_DEFAULT_PARAMETERS.metalness_map_on;
        const pMetalnessMap = physicalParams.metalness_map;
        const pRoughnessMapOn = physicalParams.roughness_map_on ?? ADSK_3DS_MAX_PHYSICAL_MATERIAL_DEFAULT_PARAMETERS.roughness_map_on;
        const pRoughnessMap = physicalParams.roughness_map;
        if (pMetalnessMapOn && pMetalnessMap) {
            // TODO
            // defines.USE_METALLIC_ROUGHNESS_MAP = true;
            // properties.metallicRoughnessMap;
        }
        if (pRoughnessMapOn && pRoughnessMap) {
            // TODO: apply inv?
        }

        // TODO: bump map & bump map on?
        // const pBumpMap = physicalParams.bump_map;
        // if (pBumpMap) {
        // }

        const pEmission = physicalParams.emission ?? ADSK_3DS_MAX_PHYSICAL_MATERIAL_DEFAULT_PARAMETERS.emission;
        // TODO: emissive scale
        // properties['emissiveScale'] = new Vec4(pEmission, pEmission, pEmission, 1.0);

        const pEmissiveColor = physicalParams.emit_color ?? ADSK_3DS_MAX_PHYSICAL_MATERIAL_DEFAULT_PARAMETERS.emit_color;
        properties['emissive'] = new Vec4(
            pEmissiveColor[0] * pEmission,
            pEmissiveColor[1] * pEmission,
            pEmissiveColor[2] * pEmission,
            pEmissiveColor[3] * pEmission,
        );

        // const pEmissionMapOn = physicalParams.emission_map_on ?? ADSK_3DS_MAX_PHYSICAL_MATERIAL_DEFAULT_PARAMETERS.emission_map_on;
        // const pEmissionMap = physicalParams.emission_map;
        // We do not support emission (factor) map
        // if ((pEmissionMapOn && pEmissionMap)) {
        // }

        const pEmissiveColorMapOn = physicalParams.emit_color_map_on ?? ADSK_3DS_MAX_PHYSICAL_MATERIAL_DEFAULT_PARAMETERS.emit_color_map_on;
        const pEmissiveColorMap = physicalParams.emit_color_map;
        if (pEmissiveColorMapOn && pEmissiveColorMap) {
            defines['USE_EMISSIVE_MAP'] = true;
            properties['emissiveMap'] = glTFAssetFinder.find('textures', pEmissiveColorMap.index, cc.Texture2D) ?? undefined;
            if (pEmissiveColorMap.texCoord === 1) {
                defines['EMISSIVE_UV'] = 'v_uv1';
            }
        }

        // TODO:
        // defines['USE_OCCLUSION_MAP'] = true;
        // properties['occlusionMap'];
        // properties['occlusion'];

        const material = new cc.Material();
        material.name = this._getGltfXXName(GltfAssetKind.Material, glTFMaterialIndex);
        // @ts-ignore TS2445
        material._effectAsset = effectGetter('db://internal/effects/builtin-standard.effect');
        // @ts-ignore TS2445
        material._defines = [defines];
        // @ts-ignore TS2445
        material._props = [properties];
        // @ts-ignore TS2445
        material._states = [states];
        return material;
    }

    private _convertMaxPhysicalMaterial(
        glTFMaterialIndex: number,
        glTFAssetFinder: IGltfAssetFinder,
        effectGetter: (name: string) => cc.EffectAsset,
        physicalMaterial: MaxPhysicalMaterial,
    ): cc.Material | null {
        const defines: Partial<CreatorDCCMetallicRoughnessMaterialDefines> = {};
        const properties: Partial<CreatorDCCMetallicRoughnessMaterialProperties> = {};
        const states: cc.Material['_states'][0] = {
            rasterizerState: {},
            blendState: { targets: [{}] },
            depthStencilState: {},
        };
        if (physicalMaterial.base_color_map && !this.fbxMissingImagesId.includes(physicalMaterial.base_color_map.value.index)) {
            defines['USE_ALBEDO_MAP'] = true;
            properties['mainTexture'] =
                glTFAssetFinder.find('textures', physicalMaterial.base_color_map.value.index, cc.Texture2D) ?? undefined;
        }
        properties['mainColor'] = this._normalizeArrayToCocosColor(physicalMaterial.base_color.value)[1];

        if (physicalMaterial.base_weight_map && !this.fbxMissingImagesId.includes(physicalMaterial.base_weight_map.value.index)) {
            defines['USE_WEIGHT_MAP'] = true;
            properties['baseWeightMap'] =
                glTFAssetFinder.find('textures', physicalMaterial.base_weight_map.value.index, cc.Texture2D) ?? undefined;
        }
        properties['albedoScale'] = physicalMaterial.base_weight.value;

        if (physicalMaterial.metalness_map && !this.fbxMissingImagesId.includes(physicalMaterial.metalness_map.value.index)) {
            defines['USE_METALLIC_MAP'] = true;
            properties['metallicMap'] =
                glTFAssetFinder.find('textures', physicalMaterial.metalness_map.value.index, cc.Texture2D) ?? undefined;
        }
        properties['metallic'] = physicalMaterial.metalness.value;

        if (physicalMaterial.roughness_map && !this.fbxMissingImagesId.includes(physicalMaterial.roughness_map.value.index)) {
            defines['USE_ROUGHNESS_MAP'] = true;
            properties['roughnessMap'] =
                glTFAssetFinder.find('textures', physicalMaterial.roughness_map.value.index, cc.Texture2D) ?? undefined;
        }
        properties['roughness'] = physicalMaterial.roughness.value;

        if (physicalMaterial.bump_map && !this.fbxMissingImagesId.includes(physicalMaterial.bump_map.value.index)) {
            defines['USE_NORMAL_MAP'] = true;
            properties['normalMap'] = glTFAssetFinder.find('textures', physicalMaterial.bump_map.value.index, cc.Texture2D) ?? undefined;
        }

        if (physicalMaterial.emission_map && !this.fbxMissingImagesId.includes(physicalMaterial.emission_map.value.index)) {
            defines['USE_EMISSIVESCALE_MAP'] = true;
            properties['emissiveScaleMap'] =
                glTFAssetFinder.find('textures', physicalMaterial.emission_map.value.index, cc.Texture2D) ?? undefined;
        }
        properties['emissiveScale'] = physicalMaterial.emission.value;

        if (physicalMaterial.emit_color_map && !this.fbxMissingImagesId.includes(physicalMaterial.emit_color_map.value.index)) {
            defines['USE_EMISSIVE_MAP'] = true;
            properties['emissiveMap'] =
                glTFAssetFinder.find('textures', physicalMaterial.emit_color_map.value.index, cc.Texture2D) ?? undefined;
        }
        properties['emissive'] = this._normalizeArrayToCocosColor(physicalMaterial.emit_color.value)[1];

        // set alphaSource default value.
        properties['alphaSource'] = 1;
        let tech = 0;
        if (physicalMaterial.cutout_map) {
            tech = 1;
            defines['USE_ALPHA_TEST'] = false;
            defines['USE_OPACITY_MAP'] = true;
            properties['alphaSourceMap'] =
                glTFAssetFinder.find('textures', physicalMaterial.cutout_map.value.index, cc.Texture2D) ?? undefined;
        }

        const material = new cc.Material();

        material.name = this._getGltfXXName(GltfAssetKind.Material, glTFMaterialIndex);
        // @ts-ignore TS2445
        material._effectAsset = effectGetter('db://internal/effects/util/dcc/imported-metallic-roughness.effect');
        // @ts-ignore TS2445
        material._defines = [defines];
        // @ts-ignore TS2445
        material._props = [properties];
        // @ts-ignore TS2445
        material._states = [states];
        setTechniqueIndex(material, tech);
        return material;
    }

    private _convertMayaStandardSurface(
        glTFMaterialIndex: number,
        glTFAssetFinder: IGltfAssetFinder,
        effectGetter: (name: string) => cc.EffectAsset,
        mayaStandardSurface: MayaStandardSurface,
    ): cc.Material | null {
        const defines: Partial<CreatorDCCMetallicRoughnessMaterialDefines> = {};
        const properties: Partial<CreatorDCCMetallicRoughnessMaterialProperties> = {};
        const states: cc.Material['_states'][0] = {
            rasterizerState: {},
            blendState: { targets: [{}] },
            depthStencilState: {},
        };
        if (mayaStandardSurface.base.texture && !this.fbxMissingImagesId.includes(mayaStandardSurface.base.texture.index)) {
            defines['USE_WEIGHT_MAP'] = true;
            properties['baseWeightMap'] =
                glTFAssetFinder.find('textures', mayaStandardSurface.base.texture.index, cc.Texture2D) ?? undefined;
        }
        properties['albedoScale'] = mayaStandardSurface.base.value;

        if (mayaStandardSurface.baseColor.texture && !this.fbxMissingImagesId.includes(mayaStandardSurface.baseColor.texture.index)) {
            defines['USE_ALBEDO_MAP'] = true;
            properties['mainTexture'] =
                glTFAssetFinder.find('textures', mayaStandardSurface.baseColor.texture.index, cc.Texture2D) ?? undefined;
        }
        properties['mainColor'] = this._normalizeArrayToCocosColor(mayaStandardSurface.baseColor.value)[1];

        if (mayaStandardSurface.metalness.texture && !this.fbxMissingImagesId.includes(mayaStandardSurface.metalness.texture.index)) {
            defines['USE_METALLIC_MAP'] = true;
            properties['metallicMap'] =
                glTFAssetFinder.find('textures', mayaStandardSurface.metalness.texture.index, cc.Texture2D) ?? undefined;
        }
        properties['metallic'] = mayaStandardSurface.metalness.value;

        if (
            mayaStandardSurface.specularRoughness.texture &&
            !this.fbxMissingImagesId.includes(mayaStandardSurface.specularRoughness.texture.index)
        ) {
            defines['USE_ROUGHNESS_MAP'] = true;
            properties['roughnessMap'] =
                glTFAssetFinder.find('textures', mayaStandardSurface.specularRoughness.texture.index, cc.Texture2D) ?? undefined;
        }
        properties['roughness'] = mayaStandardSurface.specularRoughness.value;
        properties['specularIntensity'] = Math.max(...mayaStandardSurface.specularColor.value) * 0.5;

        if (
            mayaStandardSurface.normalCamera.texture !== undefined &&
            !this.fbxMissingImagesId.includes(mayaStandardSurface.normalCamera.texture.index)
        ) {
            defines['USE_NORMAL_MAP'] = true;
            properties['normalMap'] =
                glTFAssetFinder.find('textures', mayaStandardSurface.normalCamera.texture.index, cc.Texture2D) ?? undefined;
        }

        if (
            mayaStandardSurface.emission.texture !== undefined &&
            !this.fbxMissingImagesId.includes(mayaStandardSurface.emission.texture.index)
        ) {
            defines['USE_EMISSIVESCALE_MAP'] = true;
            properties['emissiveScaleMap'] =
                glTFAssetFinder.find('textures', mayaStandardSurface.emission.texture.index, cc.Texture2D) ?? undefined;
        }
        properties['emissiveScale'] = mayaStandardSurface.emission.value;

        if (
            mayaStandardSurface.emissionColor.texture !== undefined &&
            !this.fbxMissingImagesId.includes(mayaStandardSurface.emissionColor.texture.index)
        ) {
            defines['USE_EMISSIVE_MAP'] = true;
            properties['emissiveMap'] =
                glTFAssetFinder.find('textures', mayaStandardSurface.emissionColor.texture.index, cc.Texture2D) ?? undefined;
        }
        properties['emissive'] = this._normalizeArrayToCocosColor(mayaStandardSurface.emissionColor.value)[1];

        if (mayaStandardSurface.opacity.texture && !this.fbxMissingImagesId.includes(mayaStandardSurface.opacity.texture.index)) {
            defines['USE_ALPHA_TEST'] = false;
            defines['USE_OPACITY_MAP'] = true;
            properties['alphaSourceMap'] =
                glTFAssetFinder.find('textures', mayaStandardSurface.opacity.texture.index, cc.Texture2D) ?? undefined;
        } else if (Math.max(...mayaStandardSurface.opacity.value) < 0.99) {
            properties['alphaSource'] = Math.max(...mayaStandardSurface.opacity.value);
        }
        const material = new cc.Material();
        material.name = this._getGltfXXName(GltfAssetKind.Material, glTFMaterialIndex);

        // @ts-ignore TS2445(GltfAssetKind.Material
        material._effectAsset = effectGetter('db://internal/effects/util/dcc/imported-metallic-roughness.effect');
        // @ts-ignore TS2445
        material._defines = [defines];
        // @ts-ignore TS2445
        material._props = [properties];
        // @ts-ignore TS2445
        material._states = [states];
        return material;
    }

    private _convertPhongMaterial(
        glTFMaterialIndex: number,
        glTFAssetFinder: IGltfAssetFinder,
        effectGetter: (name: string) => cc.EffectAsset,
        appID: AppId,
        phongMat: FbxSurfaceLambertOrPhongProperties,
    ): cc.Material | null {
        const defines: Partial<CreatorPhongMaterialDefines> = {};
        const properties: Partial<CreatorPhongMaterialProperties> = {};
        const states: cc.Material['_states'][0] = {
            rasterizerState: {},
            blendState: { targets: [{}] },
            depthStencilState: {},
        };
        let tech = 0;
        let alphaValue = 255;
        if (phongMat.transparentColor.texture !== undefined && !this.fbxMissingImagesId.includes(phongMat.transparentColor.texture.index)) {
            defines['USE_ALPHA_TEST'] = false;
            defines['USE_TRANSPARENCY_MAP'] = true;
            properties['transparencyMap'] =
                glTFAssetFinder.find('textures', phongMat.transparentColor.texture.index, cc.Texture2D) ?? undefined;
            tech = 1;
        } else if (phongMat.transparencyFactor) {
            const theColor =
                (phongMat.transparentColor.value[0] + phongMat.transparentColor.value[1] + phongMat.transparentColor.value[2]) / 3.0;
            if (
                !(
                    phongMat.transparentColor.value[0] === phongMat.transparentColor.value[1] &&
                    phongMat.transparentColor.value[0] === phongMat.transparentColor.value[2]
                )
            ) {
                console.warn(
                    `Material ${this._getGltfXXName(
                        GltfAssetKind.Material,
                        glTFMaterialIndex,
                    )} : Transparent color property is not supported, average value would be used.`,
                );
            }
            const transparencyValue = phongMat.transparencyFactor.value * theColor;
            if (transparencyValue !== 0) {
                tech = 1;
                alphaValue = linearToSrgb8Bit(1 - phongMat.transparencyFactor.value * theColor);
            }
        }
        if (phongMat.diffuse) {
            const diffuseColor = this._normalizeArrayToCocosColor(phongMat.diffuse.value);
            properties['albedoScale'] = phongMat.diffuseFactor.value * diffuseColor[0];
            diffuseColor[1].a = alphaValue;
            properties['mainColor'] = diffuseColor[1]; //use srgb input color
            if (phongMat.diffuse.texture !== undefined && !this.fbxMissingImagesId.includes(phongMat.diffuse.texture.index)) {
                defines['USE_ALBEDO_MAP'] = true;
                properties['mainTexture'] = glTFAssetFinder.find('textures', phongMat.diffuse.texture.index, cc.Texture2D) ?? undefined;
            }
        }
        if (phongMat.specular) {
            const specularColor = this._normalizeArrayToCocosColor(phongMat.specular.value);
            properties['specularFactor'] = phongMat.specularFactor!.value * specularColor[0];
            properties['specularColor'] = specularColor[1]; // phong_mat.specular.value;
            if (phongMat.specular.texture !== undefined && !this.fbxMissingImagesId.includes(phongMat.specular.texture.index)) {
                defines['USE_SPECULAR_MAP'] = true;
                properties['specularMap'] = glTFAssetFinder.find('textures', phongMat.specular.texture.index, cc.Texture2D) ?? undefined;
            }
        }
        if (phongMat.normalMap?.texture !== undefined && !this.fbxMissingImagesId.includes(phongMat.normalMap.texture.index)) {
            defines['USE_NORMAL_MAP'] = true;
            properties['normalMap'] = glTFAssetFinder.find('textures', phongMat.normalMap.texture.index, cc.Texture2D) ?? undefined;
        } else if (phongMat.bump?.texture !== undefined) {
            defines['USE_NORMAL_MAP'] = true;
            properties['normalMap'] = glTFAssetFinder.find('textures', phongMat.bump.texture.index, cc.Texture2D) ?? undefined;
        }
        if (phongMat.shininess) {
            properties['shininessExponent'] = phongMat.shininess.value;
            if (phongMat.shininess.texture !== undefined && !this.fbxMissingImagesId.includes(phongMat.shininess.texture.index)) {
                defines['USE_SHININESS_MAP'] = true;
                properties['shininessExponentMap'] =
                    glTFAssetFinder.find('textures', phongMat.shininess.texture.index, cc.Texture2D) ?? undefined;
            }
        }
        if (phongMat.emissive) {
            const emissiveColor = this._normalizeArrayToCocosColor(phongMat.emissive.value);
            properties['emissiveScale'] = phongMat.emissiveFactor.value * emissiveColor[0];
            properties['emissive'] = emissiveColor[1];
            if (phongMat.emissive.texture !== undefined && !this.fbxMissingImagesId.includes(phongMat.emissive.texture.index)) {
                defines['USE_EMISSIVE_MAP'] = true;
                properties['emissiveMap'] = glTFAssetFinder.find('textures', phongMat.emissive.texture.index, cc.Texture2D) ?? undefined;
            }
            if (phongMat.emissiveFactor.texture !== undefined && !this.fbxMissingImagesId.includes(phongMat.emissiveFactor.texture.index)) {
                defines['USE_EMISSIVESCALE_MAP'] = true;
                properties['emissiveScaleMap'] =
                    glTFAssetFinder.find('textures', phongMat.emissiveFactor.texture.index, cc.Texture2D) ?? undefined;
            }
        }

        defines['DCC_APP_NAME'] = appID;
        const material = new cc.Material();
        material.name = this._getGltfXXName(GltfAssetKind.Material, glTFMaterialIndex);
        setTechniqueIndex(material, tech);
        // @ts-ignore TS2445
        material._effectAsset = effectGetter('db://internal/effects/util/dcc/imported-specular-glossiness.effect');
        // @ts-ignore TS2445
        material._defines = [defines];
        // @ts-ignore TS2445
        material._props = [properties];
        // @ts-ignore TS2445
        material._states = [states];
        return material;
    }

    private _convertBlenderPBRMaterial(
        glTFMaterial: Material,
        glTFMaterialIndex: number,
        glTFAssetFinder: IGltfAssetFinder,
        effectGetter: (name: string) => cc.EffectAsset,
    ): cc.Material | null {
        const defines: Partial<CreatorPhongMaterialDefines> = {};
        const properties: Partial<CreatorPhongMaterialProperties> = {};
        const states: cc.Material['_states'][0] = {
            rasterizerState: {},
            blendState: { targets: [{}] },
            depthStencilState: {},
        };

        const phongMaterialContainer: FbxSurfacePhongProperties = glTFMaterial.extras['FBX-glTF-conv'].raw.properties;
        defines['DCC_APP_NAME'] = 2;
        defines['HAS_EXPORTED_METALLIC'] = true;
        // base color
        if (phongMaterialContainer.diffuse) {
            const diffuseColor = this._normalizeArrayToCocosColor(phongMaterialContainer.diffuse.value);
            properties['mainColor'] = diffuseColor[1]; // phong_mat.diffuse.value;
            if (
                phongMaterialContainer.diffuse.texture !== undefined &&
                !this.fbxMissingImagesId.includes(phongMaterialContainer.diffuse.texture.index)
            ) {
                defines['USE_ALBEDO_MAP'] = true;
                properties['mainTexture'] =
                    glTFAssetFinder.find('textures', phongMaterialContainer.diffuse.texture.index, cc.Texture2D) ?? undefined;
            }
        }
        // normal
        if (
            phongMaterialContainer.bump?.texture !== undefined &&
            !this.fbxMissingImagesId.includes(phongMaterialContainer.bump.texture.index)
        ) {
            defines['USE_NORMAL_MAP'] = true;
            properties['normalMap'] =
                glTFAssetFinder.find('textures', phongMaterialContainer.bump.texture.index, cc.Texture2D) ?? undefined;
        }
        // roughness
        if (phongMaterialContainer.shininess) {
            properties['shininessExponent'] = phongMaterialContainer.shininess.value;
            if (
                phongMaterialContainer.shininess.texture !== undefined &&
                !this.fbxMissingImagesId.includes(phongMaterialContainer.shininess.texture.index)
            ) {
                // roughness map
                defines['USE_SHININESS_MAP'] = true;
                properties['shininessExponentMap'] =
                    glTFAssetFinder.find('textures', phongMaterialContainer.shininess.texture.index, cc.Texture2D) ?? undefined;
            }
        }
        if (phongMaterialContainer.emissive) {
            const emissiveColor = this._normalizeArrayToCocosColor(phongMaterialContainer.emissive.value);
            properties['emissiveScale'] = phongMaterialContainer.emissiveFactor.value * emissiveColor[0];
            properties['emissive'] = emissiveColor[1];
            if (
                phongMaterialContainer.emissive.texture !== undefined &&
                !this.fbxMissingImagesId.includes(phongMaterialContainer.emissive.texture.index)
            ) {
                defines['USE_EMISSIVE_MAP'] = true;
                properties['emissiveMap'] =
                    glTFAssetFinder.find('textures', phongMaterialContainer.emissive.texture.index, cc.Texture2D) ?? undefined;
            }
            if (
                phongMaterialContainer.emissiveFactor.texture !== undefined &&
                !this.fbxMissingImagesId.includes(phongMaterialContainer.emissiveFactor.texture.index)
            ) {
                defines['USE_EMISSIVESCALE_MAP'] = true;
                properties['emissiveScaleMap'] =
                    glTFAssetFinder.find('textures', phongMaterialContainer.emissiveFactor.texture.index, cc.Texture2D) ?? undefined;
            }
        }
        // metallic
        if (phongMaterialContainer.reflectionFactor) {
            properties['metallic'] = phongMaterialContainer.reflectionFactor.value;
            if (
                phongMaterialContainer.reflectionFactor.texture !== undefined &&
                !this.fbxMissingImagesId.includes(phongMaterialContainer.reflectionFactor.texture.index)
            ) {
                defines['USE_METALLIC_MAP'] = true;
                properties['metallicMap'] =
                    glTFAssetFinder.find('textures', phongMaterialContainer.reflectionFactor.texture.index, cc.Texture2D) ?? undefined;
            }
        }
        // specular
        if (phongMaterialContainer.specularFactor) {
            if (
                phongMaterialContainer.specularFactor.texture !== undefined &&
                !this.fbxMissingImagesId.includes(phongMaterialContainer.specularFactor.texture.index)
            ) {
                defines['USE_SPECULAR_MAP'] = true;
                properties['specularMap'] =
                    glTFAssetFinder.find('textures', phongMaterialContainer.specularFactor.texture.index, cc.Texture2D) ?? undefined;
            } else {
                properties['specularFactor'] = phongMaterialContainer.specularFactor.value;
            }
        }

        if (phongMaterialContainer.transparencyFactor) {
            if (
                phongMaterialContainer.transparencyFactor.texture !== undefined &&
                !this.fbxMissingImagesId.includes(phongMaterialContainer.transparencyFactor.texture.index)
            ) {
                defines['USE_ALPHA_TEST'] = false;
                defines['USE_TRANSPARENCY_MAP'] = true;
                properties['transparencyMap'] =
                    glTFAssetFinder.find('textures', phongMaterialContainer.transparencyFactor.texture.index, cc.Texture2D) ?? undefined;
            } else {
                properties['transparencyFactor'] = phongMaterialContainer.transparencyFactor.value;
            }
        }
        const material = new cc.Material();
        material.name = this._getGltfXXName(GltfAssetKind.Material, glTFMaterialIndex);

        // @ts-ignore TS2445
        material._effectAsset = effectGetter('db://internal/effects/util/dcc/imported-specular-glossiness.effect');
        // @ts-ignore TS2445
        material._defines = [defines];
        // @ts-ignore TS2445
        material._props = [properties];
        // @ts-ignore TS2445
        material._states = [states];
        return material;
    }
    private _convertGltfPbrSpecularGlossiness(
        glTFMaterial: Material,
        glTFMaterialIndex: number,
        glTFAssetFinder: IGltfAssetFinder,
        effectGetter: (name: string) => cc.EffectAsset,
        depthWriteInAlphaModeBlend: boolean,
    ): cc.Material | null {
        const defines: Partial<CreatorPhongMaterialDefines> = {};
        const properties: Partial<CreatorPhongMaterialProperties> = {};
        const states: cc.Material['_states'][0] = {
            rasterizerState: {},
            blendState: { targets: [{}] },
            depthStencilState: {},
        };

        const gltfSpecularGlossiness = glTFMaterial.extensions.KHR_materials_pbrSpecularGlossiness;
        defines['DCC_APP_NAME'] = 4;
        // base color
        if (gltfSpecularGlossiness.diffuseFactor) {
            const diffuseColor = this._normalizeArrayToCocosColor(gltfSpecularGlossiness.diffuseFactor);
            properties['mainColor'] = diffuseColor[1]; // phong_mat.diffuse.value;
        }
        if (gltfSpecularGlossiness.diffuseTexture !== undefined) {
            defines['USE_ALBEDO_MAP'] = true;
            properties['mainTexture'] =
                glTFAssetFinder.find('textures', gltfSpecularGlossiness.diffuseTexture.index, cc.Texture2D) ?? undefined;
        }
        // specular
        if (gltfSpecularGlossiness.specularFactor) {
            const specularColor = this._normalizeArrayToCocosColor(gltfSpecularGlossiness.specularFactor);
            properties['specularColor'] = specularColor[1];
        }

        // glossiness
        if (gltfSpecularGlossiness.glossinessFactor) {
            defines['HAS_EXPORTED_GLOSSINESS'] = true;
            properties['glossiness'] = gltfSpecularGlossiness.glossinessFactor;
        }

        if (gltfSpecularGlossiness.specularGlossinessTexture !== undefined) {
            defines['HAS_EXPORTED_GLOSSINESS'] = true;
            defines['USE_SPECULAR_GLOSSINESS_MAP'] = true;
            properties['specularGlossinessMap'] =
                glTFAssetFinder.find('textures', gltfSpecularGlossiness.specularGlossinessTexture.index, cc.Texture2D) ?? undefined;
        }

        if (glTFMaterial.normalTexture !== undefined) {
            const pbrNormalTexture = glTFMaterial.normalTexture;
            if (pbrNormalTexture.index !== undefined) {
                defines['USE_NORMAL_MAP'] = true;
                properties['normalMap'] = glTFAssetFinder.find('textures', pbrNormalTexture.index, cc.Texture2D);
            }
        }
        if (glTFMaterial.emissiveTexture !== undefined) {
            defines['USE_EMISSIVE_MAP'] = true;
            if (glTFMaterial.emissiveTexture.texCoord) {
                defines['EMISSIVE_UV'] = 'v_uv1';
            }
            properties['emissiveMap'] = glTFAssetFinder.find('textures', glTFMaterial.emissiveTexture.index, cc.Texture2D);
        }

        if (glTFMaterial.emissiveFactor !== undefined) {
            const v = glTFMaterial.emissiveFactor;
            properties['emissive'] = this._normalizeArrayToCocosColor(v)[1];
        }

        if (glTFMaterial.doubleSided) {
            states.rasterizerState!.cullMode = gfx.CullMode.NONE;
        }
        switch (glTFMaterial.alphaMode) {
            case 'BLEND': {
                const blendState = states.blendState!.targets![0];
                blendState.blend = true;
                blendState.blendSrc = gfx.BlendFactor.SRC_ALPHA;
                blendState.blendDst = gfx.BlendFactor.ONE_MINUS_SRC_ALPHA;
                blendState.blendDstAlpha = gfx.BlendFactor.ONE_MINUS_SRC_ALPHA;
                states.depthStencilState!.depthWrite = depthWriteInAlphaModeBlend;
                break;
            }
            case 'MASK': {
                const alphaCutoff = glTFMaterial.alphaCutoff === undefined ? 0.5 : glTFMaterial.alphaCutoff;
                defines['USE_ALPHA_TEST'] = true;
                properties['alphaThreshold'] = alphaCutoff;
                break;
            }
            case 'OPAQUE':
            case undefined:
                break;
            default:
                this._logger(GltfConverter.LogLevel.Warning, GltfConverter.ConverterError.UnsupportedAlphaMode, {
                    mode: glTFMaterial.alphaMode,
                    material: glTFMaterialIndex,
                });
                break;
        }

        const material = new cc.Material();
        material.name = this._getGltfXXName(GltfAssetKind.Material, glTFMaterialIndex);
        // @ts-ignore TS2445
        material._effectAsset = effectGetter('db://internal/effects/util/dcc/imported-specular-glossiness.effect');
        // @ts-ignore TS2445
        material._defines = [defines];
        // @ts-ignore TS2445
        material._props = [properties];
        // @ts-ignore TS2445
        material._states = [states];
        return material;
    }

    private _khrTextureTransformToTiling(khrTextureTransform: { scale?: [number, number]; offset?: [number, number] }) {
        const result = new Vec4(1, 1, 0, 0);
        if (khrTextureTransform.scale) {
            result.x = khrTextureTransform.scale[0];
            result.y = khrTextureTransform.scale[1];
        }
        if (khrTextureTransform.offset) {
            result.z = khrTextureTransform.offset[0];
            result.w = khrTextureTransform.offset[1];
        }
        return result;
    }
}

interface KHRTextureTransformExtension {
    scale?: [number, number];
    offset?: [number, number];
}

function hasKHRTextureTransformExtension(obj: { extensions?: unknown }): obj is {
    extensions: {
        KHR_texture_transform: KHRTextureTransformExtension;
    };
} {
    const { extensions } = obj;
    return (
        typeof extensions === 'object' &&
        extensions !== null &&
        typeof (extensions as { KHR_texture_transform?: unknown })['KHR_texture_transform'] === 'object'
    );
}
function setTechniqueIndex(material: cc.Material, index: number) {
    // @ts-expect-error TODO: fix type
    material._techIdx = index;
}
export namespace GltfConverter {
    export interface Options {
        logger?: Logger;
        userData?: Omit<GlTFUserData, 'imageMetas'>;
        promoteSingleRootNode?: boolean;
        generateLightmapUVNode?: boolean;
    }

    export type Logger = <ErrorType extends ConverterError>(
        level: LogLevel,
        error: ErrorType,
        args: ConverterErrorArgumentFormat[ErrorType],
    ) => void;

    export enum LogLevel {
        Info,
        Warning,
        Error,
        Debug,
    }

    export enum ConverterError {
        /**
         * glTf requires that skin joints must exists in same scene as node references it.
         */
        ReferenceSkinInDifferentScene,

        /**
         * Specified alpha mode is not supported currently.
         */
        UnsupportedAlphaMode,

        /**
         * Unsupported texture parameter.
         */
        UnsupportedTextureParameter,

        /**
         * Unsupported channel path.
         */
        UnsupportedChannelPath,

        DisallowCubicSplineChannelSplit,

        FailedToCalculateTangents,

        /**
         * All targets of the specified sub-mesh are zero-displaced.
         */
        EmptyMorph,

        UnsupportedExtension,
    }

    export interface ConverterErrorArgumentFormat {
        [ConverterError.UnsupportedExtension]: {
            name: string;
            required?: boolean;
        };

        [ConverterError.ReferenceSkinInDifferentScene]: {
            skin: number;
            node: number;
        };

        [ConverterError.UnsupportedAlphaMode]: {
            mode: string;
            material: number;
        };

        [ConverterError.UnsupportedTextureParameter]: {
            type: 'minFilter' | 'magFilter' | 'wrapMode';
            value: number;
            fallback?: number;
            texture: number;
            sampler: number;
        };

        [ConverterError.UnsupportedChannelPath]: {
            channel: number;
            animation: number;
            path: string;
        };

        [ConverterError.DisallowCubicSplineChannelSplit]: {
            channel: number;
            animation: number;
        };

        [ConverterError.FailedToCalculateTangents]: {
            reason: 'normal' | 'uv';
            primitive: number;
            mesh: number;
        };

        [ConverterError.EmptyMorph]: {
            mesh: number;
            primitive: number;
        };
    }
}

interface ParsedAndBufferResolvedGlTf {
    /**
     * The parsed glTF document.
     */
    glTF: GlTf;

    /**
     * Buffers of this glTF referenced.
     */
    buffers: ResolvedBuffer[];
}

/**
 * Either buffer itself or full path to external buffer file.
 */
type ResolvedBuffer = string | Buffer;

export async function readGltf(gltfFilePath: string): Promise<ParsedAndBufferResolvedGlTf> {
    return path.extname(gltfFilePath) === '.glb' ? await readGlb(gltfFilePath) : await readGltfJson(gltfFilePath);
}

async function readGltfJson(path: string): Promise<ParsedAndBufferResolvedGlTf> {
    const glTF = (await fs.readJSON(path)) as GlTf;
    const resolvedBuffers = !glTF.buffers
        ? []
        : glTF.buffers.map((glTFBuffer: any) => {
            if (glTFBuffer.uri) {
                return resolveBufferUri(path, glTFBuffer.uri);
            } else {
                return Buffer.alloc(0);
            }
        });
    return { glTF, buffers: resolvedBuffers };
}

async function readGlb(path: string): Promise<ParsedAndBufferResolvedGlTf> {
    const badGLBFormat = (): never => {
        throw new Error('Bad glb format.');
    };

    const glb = await fs.readFile(path);
    if (glb.length < 12) {
        return badGLBFormat();
    }

    const magic = glb.readUInt32LE(0);
    if (magic !== 0x46546c67) {
        return badGLBFormat();
    }

    const ChunkTypeJson = 0x4e4f534a;
    const ChunkTypeBin = 0x004e4942;
    const version = glb.readUInt32LE(4);
    const length = glb.readUInt32LE(8);
    let glTF: GlTf | undefined;
    let embeddedBinaryBuffer: Buffer | undefined;
    for (let iChunk = 0, offset = 12; offset + 8 <= glb.length; ++iChunk) {
        const chunkLength = glb.readUInt32LE(offset);
        offset += 4;
        const chunkType = glb.readUInt32LE(offset);
        offset += 4;
        if (offset + chunkLength > glb.length) {
            return badGLBFormat();
        }
        const payload = Buffer.from(glb.buffer, offset, chunkLength);
        offset += chunkLength;
        if (iChunk === 0) {
            if (chunkType !== ChunkTypeJson) {
                return badGLBFormat();
            }
            const glTFJson = new TextDecoder('utf-8').decode(payload);
            glTF = JSON.parse(glTFJson) as GlTf;
        } else if (chunkType === ChunkTypeBin) {
            // TODO: Should we copy?
            // embeddedBinaryBuffer = payload.slice();
            embeddedBinaryBuffer = payload;
        }
    }

    if (!glTF) {
        return badGLBFormat();
    } else {
        const resolvedBuffers = !glTF.buffers
            ? []
            : glTF.buffers.map((glTFBuffer: any, glTFBufferIndex: any) => {
                if (glTFBuffer.uri) {
                    return resolveBufferUri(path, glTFBuffer.uri);
                } else if (glTFBufferIndex === 0 && embeddedBinaryBuffer) {
                    return embeddedBinaryBuffer;
                } else {
                    return Buffer.alloc(0);
                }
            });
        return { glTF, buffers: resolvedBuffers };
    }
}

function resolveBufferUri(glTFFilePath: string, uri: string): ResolvedBuffer {
    const dataURI = DataURI.parse(uri);
    if (!dataURI) {
        const bufferPath = path.resolve(path.dirname(glTFFilePath), uri);
        return bufferPath;
    } else {
        return Buffer.from(resolveBufferDataURI(dataURI));
    }
}

export function isDataUri(uri: string) {
    return uri.startsWith('data:');
}

export class BufferBlob {
    private _arrayBufferOrPaddings: (Uint8Array | ArrayBuffer | number)[] = [];
    private _length = 0;

    public setNextAlignment(align: number) {
        if (align !== 0) {
            const remainder = this._length % align;
            if (remainder !== 0) {
                const padding = align - remainder;
                this._arrayBufferOrPaddings.push(padding);
                this._length += padding;
            }
        }
    }

    public addBuffer(arrayBuffer: ArrayBuffer | Uint8Array) {
        const result = this._length;
        this._arrayBufferOrPaddings.push(arrayBuffer);
        this._length += arrayBuffer.byteLength;
        return result;
    }

    public getLength() {
        return this._length;
    }

    public getCombined() {
        const result = new Uint8Array(this._length);
        let counter = 0;
        this._arrayBufferOrPaddings.forEach((arrayBufferOrPadding) => {
            if (typeof arrayBufferOrPadding === 'number') {
                counter += arrayBufferOrPadding;
            } else {
                result.set(new Uint8Array(arrayBufferOrPadding), counter);
                counter += arrayBufferOrPadding.byteLength;
            }
        });
        return result;
    }
}

function createDataViewFromBuffer(buffer: Buffer, offset = 0) {
    return new DataView(buffer.buffer, buffer.byteOffset + offset);
}

function createDataViewFromTypedArray(typedArray: ArrayBufferView, offset = 0) {
    return new DataView(typedArray.buffer, typedArray.byteOffset + offset);
}

const DataViewUseLittleEndian = true;

type UniqueNameGenerator = (original: string | null, last: string | null, index: number, count: number) => string;

function uniqueChildNodeNameGenerator(original: string | null, last: string | null, index: number, count: number): string {
    const postfix = count === 0 ? '' : `-${count}`;
    return `${original || ''}(__autogen ${index}${postfix})`;
}

function makeUniqueNames(names: (string | null)[], generator: UniqueNameGenerator): string[] {
    const uniqueNames = new Array(names.length).fill('');
    for (let i = 0; i < names.length; ++i) {
        let name = names[i];
        let count = 0;

        while (true) {
            const isUnique = () =>
                uniqueNames.every((uniqueName, index) => {
                    return index === i || name !== uniqueName;
                });
            if (name === null || !isUnique()) {
                name = generator(names[i], name, i, count++);
            } else {
                uniqueNames[i] = name;
                break;
            }
        }
    }
    return uniqueNames;
}

function resolveBufferDataURI(uri: DataURI.DataURI): ArrayBuffer {
    // https://github.com/KhronosGroup/glTF/issues/944
    if (
        !uri.base64 ||
        !uri.mediaType ||
        !(uri.mediaType.value === 'application/octet-stream' || uri.mediaType.value === 'application/gltf-buffer')
    ) {
        throw new Error(`Cannot understand data uri(base64: ${uri.base64}, mediaType: ${uri.mediaType}) for buffer.`);
    }
    return decodeBase64ToArrayBuffer(uri.data);
}

class DynamicArrayBuffer {
    get arrayBuffer() {
        return this._arrayBuffer;
    }

    private _size = 0;
    private _arrayBuffer: ArrayBuffer;
    constructor(reserve?: number) {
        this._arrayBuffer = new ArrayBuffer(Math.max(reserve || 0, 4));
    }

    public grow(growSize: number) {
        const szBeforeGrow = this._size;
        if (growSize) {
            const cap = this._arrayBuffer.byteLength;
            const space = cap - szBeforeGrow;
            const req = space - growSize;
            if (req < 0) {
                // assert(cap >= 4)
                const newCap = (cap + -req) * 1.5;
                const newArrayBuffer = new ArrayBuffer(newCap);
                new Uint8Array(newArrayBuffer, 0, cap).set(new Uint8Array(this._arrayBuffer));
                this._arrayBuffer = newArrayBuffer;
            }
            this._size += growSize;
        }
        return szBeforeGrow;
    }

    public shrink() {
        return this._arrayBuffer.slice(0, this._size);
    }
}

function getDataviewWritterOfTypedArray(typedArray: PPGeometryTypedArray, littleEndian?: boolean) {
    switch (typedArray.constructor) {
        case Int8Array:
            return (dataView: DataView, byteOffset: number, value: number) => dataView.setInt8(byteOffset, value);
        case Uint8Array:
            return (dataView: DataView, byteOffset: number, value: number) => dataView.setUint8(byteOffset, value);
        case Int16Array:
            return (dataView: DataView, byteOffset: number, value: number) => dataView.setInt16(byteOffset, value, littleEndian);
        case Uint16Array:
            return (dataView: DataView, byteOffset: number, value: number) => dataView.setUint16(byteOffset, value, littleEndian);
        case Int32Array:
            return (dataView: DataView, byteOffset: number, value: number) => dataView.setInt32(byteOffset, value, littleEndian);
        case Uint32Array:
            return (dataView: DataView, byteOffset: number, value: number) => dataView.setUint32(byteOffset, value, littleEndian);
        case Float32Array:
            return (dataView: DataView, byteOffset: number, value: number) => dataView.setFloat32(byteOffset, value, littleEndian);
        default:
            throw new Error('Bad storage constructor.');
    }
}

function interleaveVertices(ppGeometry: PPGeometry, bGenerateUV = false, bAddVertexColor = false) {
    const vertexCount = ppGeometry.vertexCount;
    let hasUV1 = false;
    let hasColor = false;
    const validAttributes: Array<[string, PPGeometry.Attribute]> = [];
    for (const attribute of ppGeometry.attributes()) {
        let gfxAttributeName: string;
        try {
            gfxAttributeName = getGfxAttributeName(attribute);
            if (gfxAttributeName === gfx.AttributeName.ATTR_TEX_COORD1) {
                hasUV1 = true;
            }
            if (gfxAttributeName === gfx.AttributeName.ATTR_COLOR) {
                hasColor = true;
            }
        } catch (err) {
            console.error(err);
            continue;
        }
        validAttributes.push([gfxAttributeName, attribute]);
    }

    if (bAddVertexColor && !hasColor) {
        const fillColor = new Vec4(1, 1, 1, 1);
        const colorData = new Float32Array(vertexCount * 4);
        for (let i = 0; i < vertexCount; ++i) {
            colorData[i * 4 + 0] = fillColor.x;
            colorData[i * 4 + 1] = fillColor.y;
            colorData[i * 4 + 2] = fillColor.z;
            colorData[i * 4 + 3] = fillColor.w;
        }
        validAttributes.push(['a_color', new PPGeometry.Attribute(PPGeometry.StdSemantics.color, colorData, 4)]);
    }
    if (bGenerateUV && !hasUV1) {
        validAttributes.push([
            'a_texCoord1',
            new PPGeometry.Attribute(PPGeometry.StdSemantics.texcoord, new Float32Array(vertexCount * 2), 2),
        ]);
    }
    let vertexStride = 0;
    for (const [_, attribute] of validAttributes) {
        vertexStride += attribute.data.BYTES_PER_ELEMENT * attribute.components;
    }
    const vertexBuffer = new ArrayBuffer(vertexCount * vertexStride);
    const vertexBufferView = new DataView(vertexBuffer);
    let currentByteOffset = 0;
    const formats: any[] = [];
    for (const [gfxAttributeName, attribute] of validAttributes) {
        const attributeData = attribute.data;
        const dataviewWritter = getDataviewWritterOfTypedArray(attributeData, DataViewUseLittleEndian);
        for (let iVertex = 0; iVertex < vertexCount; ++iVertex) {
            const offset1 = currentByteOffset + vertexStride * iVertex;
            for (let iComponent = 0; iComponent < attribute.components; ++iComponent) {
                const value = attributeData[attribute.components * iVertex + iComponent];
                dataviewWritter(vertexBufferView, offset1 + attributeData.BYTES_PER_ELEMENT * iComponent, value);
            }
        }
        currentByteOffset += attribute.data.BYTES_PER_ELEMENT * attribute.components;
        formats.push({
            name: gfxAttributeName,
            format: attribute.getGFXFormat(),
            isNormalized: attribute.isNormalized,
        });
    }

    return {
        vertexCount,
        vertexStride,
        formats,
        vertexBuffer,
    };
}

const glTFAttributeNameToPP = (() => {
    return (attributeName: string): PPGeometry.Semantic => {
        if (attributeName.startsWith('_')) {
            // Application-specific semantics must start with an underscore
            return attributeName;
        }

        const attributeNameRegexMatches = /([a-zA-Z]+)(?:_(\d+))?/g.exec(attributeName);
        if (!attributeNameRegexMatches) {
            return attributeName;
        }

        const attributeBaseName = attributeNameRegexMatches[1];
        let stdSemantic: PPGeometry.StdSemantics | undefined;
        const set = parseInt(attributeNameRegexMatches[2] || '0');
        switch (attributeBaseName) {
            case 'POSITION':
                stdSemantic = PPGeometry.StdSemantics.position;
                break;
            case 'NORMAL':
                stdSemantic = PPGeometry.StdSemantics.normal;
                break;
            case 'TANGENT':
                stdSemantic = PPGeometry.StdSemantics.tangent;
                break;
            case 'COLOR':
                stdSemantic = PPGeometry.StdSemantics.color;
                break;
            case 'TEXCOORD':
                stdSemantic = PPGeometry.StdSemantics.texcoord;
                break;
            case 'JOINTS':
                stdSemantic = PPGeometry.StdSemantics.joints;
                break;
            case 'WEIGHTS':
                stdSemantic = PPGeometry.StdSemantics.weights;
                break;
        }

        if (stdSemantic === undefined) {
            return attributeName;
        } else {
            return PPGeometry.StdSemantics.set(stdSemantic, set);
        }
    };
})();

export class GlTfConformanceError extends Error { }

function assertGlTFConformance(expr: boolean, message: string) {
    if (!expr) {
        throw new GlTfConformanceError(`glTF non-conformance error: ${message}`);
    }
}
