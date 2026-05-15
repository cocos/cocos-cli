'use strict';

declare module 'cc' {
    interface Node {
        modelComp?: MeshRenderer;
        modelColor?: Color;
    }
    interface RenderingSubMesh {
        iBuffer?: ArrayBuffer;
        vBuffer?: ArrayBuffer;
    }
}

import {
    Camera, CCObject, Color, geometry, gfx, IVec3Like, math, MeshRenderer, Node,
    primitives, renderer, utils, Vec2, Vec3, Material, Mesh, Layers, Vec4,
} from 'cc';
import type { IAddMeshToNodeOption, ICreateMeshOption, IMeshPrimitive, DynamicMeshPrimitive } from './defines';
import raycastUtil from './raycast';
import type { IRaycastResult } from './raycast';

const flat = (arr: any, fn: any) => {
    return arr.map(fn).reduce((acc: any, val: any) => acc.concat(val), []);
};

const cmp = (a: any, b: any) => a.distance - b.distance;
export const ray = geometry.Ray.create();
const triangles = gfx.PrimitiveMode.TRIANGLE_LIST;

export class RaycastResults extends Array<IRaycastResult> {
    ray: geometry.Ray;
    constructor(r: geometry.Ray) {
        super();
        this.ray = r;
    }
}

// 这边理论上用WeakMap更好，但是在场景原生化中会有问题，所以先用Map
const vbMap = new Map();
const ibMap = new Map();

export const ProjectionType = Camera.ProjectionType;
export const CullMode = gfx.CullMode;
export const PrimitiveMode = gfx.PrimitiveMode;
export const FOVAxis = Camera.FOVAxis;
export const AttributeName = gfx.AttributeName;

export enum HighlightFace {
    NONE,
    UP,
    DOWN,
    LEFT,
    RIGHT,
    FRONT,
    BACK,
}

function setNodeMaterialProperty(node: Node, propName: string, value: any) {
    if (node && node.modelComp && node.modelComp.material) {
        node.modelComp.material.setProperty(propName, value);
    }
}

/**
 * 获取编辑器摄像机（惰性访问，避免循环依赖）
 */
function getEditorCamera(): any {
    try {
        const { Service } = require('../../core/decorator');
        return Service.Camera?.getCamera?.();
    } catch (e) {
        return null;
    }
}

export function create3DNode(name?: string): Node {
    const node = new (cc as any).Node(name);
    node._layer = (cc as any).Layers.Enum.GIZMOS;
    node._objFlags |= CCObject.Flags.DontSave;
    node.modelColor = (cc as any).color();
    return node;
}

export function createMesh(primitive: IMeshPrimitive, opts: ICreateMeshOption = {}): Mesh {
    // prepare data
    const primitiveData: primitives.IGeometry = {
        primitiveMode: primitive.primitiveType,
        positions: flat(primitive.positions, (v: Vec3) => [v.x, v.y, v.z]),
        indices: primitive.indices,
        minPos: primitive.minPos,
        maxPos: primitive.maxPos,
    };

    if (primitive.normals) {
        primitiveData.normals = flat(primitive.normals, (v: Vec3) => [v.x, v.y, v.z]);
    }
    if (primitive.uvs) {
        primitiveData.uvs = flat(primitive.uvs, (v: Vec2) => [v.x, v.y]);
    }

    let customAttributes = primitiveData.customAttributes;
    if (opts.dashed) {
        if (!customAttributes) {
            customAttributes = [];
        }

        const lineDistances: number[] = [];
        for (let i = 0; i < primitive.positions.length; i += 2) {
            const start = primitive.positions[i];
            const end = primitive.positions[i + 1];
            lineDistances[i] = (i === 0) ? 0 : lineDistances[i - 1];
            lineDistances[i + 1] = lineDistances[i] + Vec3.distance(start as Vec3, end as Vec3);
        }

        customAttributes.push({
            attr: new gfx.Attribute('a_lineDistance', gfx.Format.R32F),
            values: lineDistances,
        });
    }
    primitiveData.customAttributes = customAttributes;

    // create
    const mesh = utils.createMesh(primitiveData);
    // set double sided flag for raycast
    const subMesh = mesh.renderingSubMeshes[0];
    const info = subMesh.geometricInfo;
    if (info) {
        info.doubleSided = primitive.doubleSided;
    }
    // cache vb buffer for vb update
    const vbInfo = mesh.struct.vertexBundles[0].view;

    if (vbInfo) {
        subMesh.vBuffer = mesh.data.buffer instanceof ArrayBuffer
            ? mesh.data.buffer.slice(vbInfo.offset, vbInfo.offset + vbInfo.length)
            : undefined;
        vbMap.set(subMesh, subMesh.vBuffer);
    }

    const ibInfo = mesh.struct.primitives[0].indexView;
    if (ibInfo) {
        subMesh.iBuffer = mesh.data.buffer instanceof ArrayBuffer
            ? mesh.data.buffer.slice(ibInfo.offset, ibInfo.offset + ibInfo.length)
            : undefined;
        ibMap.set(subMesh, subMesh.iBuffer);
    }

    return mesh;
}

export function createDynamicMesh(primitive: DynamicMeshPrimitive, opts: (primitives.ICreateDynamicMeshOptions & ICreateMeshOption)): Mesh {
    // prepare data
    const primitiveData: primitives.IDynamicGeometry = primitive.transformToDynamicGeometry();

    if (primitive.normals) {
        primitiveData.normals = Float32Array.from(flat(primitive.normals, (v: Vec3) => [v.x, v.y, v.z]));
    }
    if (primitive.uvs) {
        primitiveData.uvs = Float32Array.from(flat(primitive.uvs, (v: Vec2) => [v.x, v.y]));
    }

    let customAttributes = primitiveData.customAttributes;
    if (opts?.dashed) {
        if (!customAttributes) {
            customAttributes = [];
        }

        const lineDistances: number[] = [];
        for (let i = 0; i < primitive.positions.length; i += 2) {
            const start = primitive.positions[i];
            const end = primitive.positions[i + 1];
            lineDistances[i] = (i === 0) ? 0 : lineDistances[i - 1];
            lineDistances[i + 1] = lineDistances[i] + Vec3.distance(start as Vec3, end as Vec3);
        }

        customAttributes.push({
            attr: new gfx.Attribute('a_lineDistance', gfx.Format.R32F),
            values: Float32Array.from(lineDistances),
        });
    }

    primitiveData.customAttributes = customAttributes;

    // create
    const mesh = (utils as any).MeshUtils.createDynamicMesh(0, primitiveData, undefined, opts);

    // set double sided flag for raycast
    const subMesh = mesh.renderingSubMeshes[0];
    const info = subMesh.geometricInfo;
    if (info) {
        info.doubleSided = primitive.doubleSided;
    }
    // cache vb buffer for vb update
    const vbInfo = mesh.struct.vertexBundles[0].view;

    if (vbInfo) {
        // @ts-ignore
        subMesh.vBuffer = mesh.data.buffer.slice(vbInfo.offset, vbInfo.offset + vbInfo.length);
        // @ts-ignore
        vbMap.set(subMesh, subMesh.vBuffer);
    }

    const ibInfo = mesh.struct.primitives[0].indexView;
    if (ibInfo) {
        // @ts-ignore
        subMesh.iBuffer = mesh.data.buffer.slice(ibInfo.offset, ibInfo.offset + ibInfo.length);
        // @ts-ignore
        ibMap.set(subMesh, subMesh.iBuffer);
    }

    return mesh;
}

export function updateDynamicMesh(meshRenderer: MeshRenderer, subIndex: number, primitive: DynamicMeshPrimitive) {
    const primitiveData: primitives.IDynamicGeometry = primitive.transformToDynamicGeometry();
    meshRenderer.mesh?.updateSubMesh(subIndex, primitiveData);
}

export function addMeshToNode(node: Node, mesh: any, opts: IAddMeshToNodeOption = {}, reuseMaterial?: Material) {
    const model = node.addComponent(MeshRenderer);
    const defines: any = {};
    if (opts.forwardPipeline) {
        defines.USE_FORWARD_PIPELINE = true;
    }

    if (opts.dashed) {
        defines.USE_DASHED_LINE = true;
    }

    if (opts.instancing) {
        defines.USE_INSTANCING = true;
    }

    if (opts.useLightProbe) {
        defines.CC_USE_LIGHT_PROBE = true;
    }

    model.mesh = mesh;
    const cb = model.onEnable.bind(model);
    model.onEnable = () => {
        cb();
    }; // don't show on preview cameras
    const pm = mesh.renderingSubMeshes[0].primitiveMode;
    let technique = 0;
    let effectName = 'internal/editor/gizmo';
    if (opts.effectName) {
        effectName = opts.effectName;
    } else if (opts.technique) {
        technique = opts.technique;
    } else {
        if (opts.unlit) {
            technique = 1;
        } else if (opts.texture) {
            technique = 3;
        } else {
            if (pm < triangles) {
                technique = opts.noDepthTestForLines ? 1 : 2; // unlit
            } else {
                technique = opts.depthTestForTriangles ? 4 : 0;
            }
        }
    }

    const mtl = reuseMaterial ?? new Material();
    const states: any = {};
    if (opts.cullMode) {
        states.rasterizerState = { cullMode: opts.cullMode };
    }
    if (opts.depthStencilState) {
        states.depthStencilState = opts.depthStencilState;
    }
    if (pm !== triangles) {
        states.primitive = pm;
    }
    if (opts.priority) {
        states.priority = opts.priority;
    }

    // 未初始化的材质hash值为0
    if (mtl.hash === 0) {
        mtl.initialize({ effectName, technique, states, defines });
    }
    if (opts.alpha !== undefined) {
        if (node.modelColor) {
            node.modelColor.a = opts.alpha;
        }
    }
    mtl.setProperty('mainColor', (node as any).modelColor);
    model.material = mtl;
    node.modelComp = model;
}

export function setMeshColor(node: Node, c: Color) {
    let alpha = c.a;
    if (node.modelColor) {
        alpha = node.modelColor.a;
    }
    node.modelColor = c.clone();
    node.modelColor.a = alpha;
    setNodeMaterialProperty(node, 'mainColor', node.modelColor);
}

export function getMeshColor(node: Node): Color | undefined {
    return node.modelColor;
}

export function setNodeOpacity(node: Node, opacity: number) {
    if (node.modelColor) {
        node.modelColor.a = opacity;
    }
    setNodeMaterialProperty(node, 'mainColor', node.modelColor);
}

export function getNodeOpacity(node: Node) {
    return node.modelColor?.a ?? 0;
}

export function setMaterialProperty(node: Node, propName: string, value: any) {
    setNodeMaterialProperty(node, propName, value);
}

export function getModel(node: Node) {
    return node.getComponent(MeshRenderer);
}

export function updatePositions(comp: MeshRenderer, data: IVec3Like[]) {
    const model = comp.model && comp.model.subModels[0];
    if (!model || !model.inputAssembler || !model.subMesh) {
        return;
    }
    const { subMesh } = model;

    const points = flat(data, (v: Vec3) => [v.x, v.y, v.z]);
    updateVBAttr(comp, gfx.AttributeName.ATTR_POSITION, points);

    // sync to raycast data
    if (subMesh.geometricInfo) {
        if (subMesh.geometricInfo.positions.length >= points.length) {
            subMesh.geometricInfo.positions.set(points);
        } else {
            subMesh.geometricInfo.positions = new Float32Array(points);
        }
    }
}

export function updateVBAttr(comp: MeshRenderer, attr: string, data: number[]) {
    const model = comp.model && comp.model.subModels[0];
    if (!model || !model.inputAssembler || !model.subMesh) {
        return;
    }
    const { inputAssembler, subMesh } = model;
    let vBuffer = subMesh.vBuffer as ArrayBuffer;
    // update vb
    let offset = 0;
    let format = gfx.Format.UNKNOWN;
    for (const a of inputAssembler.attributes) {
        if (a.name === attr) {
            format = a.format;
            break;
        }
        offset += gfx.FormatInfos[a.format].size;
    }
    const vb = inputAssembler.vertexBuffers[0];
    if (!format || !vb) {
        return;
    }

    const newSize = vb.stride * data.length / gfx.FormatInfos[format].count;
    // 需要扩大VB的大小
    if (vBuffer.byteLength < newSize) {
        vBuffer = new ArrayBuffer(newSize);
        vbMap.set(subMesh, vBuffer);
        vb.resize(newSize);
    }
    utils.writeBuffer(new DataView(vBuffer), data, format, offset, vb.stride);

    vb.update(vBuffer);
}

export function updateIB(comp: MeshRenderer, data: number[]): void {
    const model = comp.model && comp.model.subModels[0];
    if (!model || !model.inputAssembler || !model.subMesh) {
        return;
    }
    const { inputAssembler, subMesh } = model;

    let iBuffer = ibMap.get(subMesh) as ArrayBuffer;
    // update ib
    const ib: gfx.Buffer | null = inputAssembler.indexBuffer;
    if (!ib) {
        return;
    }

    if (inputAssembler.indexCount === data.length) {
        new Uint16Array(iBuffer as ArrayBuffer).set(data);
        ib.update(iBuffer);
        // sync to raycast data
        if (subMesh.geometricInfo && subMesh.geometricInfo.indices) {
            subMesh.geometricInfo.indices.set(data);
        }
    } else {
        const newSize = data.length * ib.stride;
        // 需要扩大IB的大小
        if (newSize > iBuffer.byteLength) {
            // @ts-ignore
            iBuffer = new ArrayBuffer(newSize);
            ibMap.set(subMesh, iBuffer);
            ib.resize(newSize);
        }
        new Uint16Array(iBuffer as ArrayBuffer).set(data);
        ib.update(iBuffer);
        inputAssembler.indexCount = data.length;
        // sync to raycast data
        if (subMesh.geometricInfo && subMesh.geometricInfo.indices) {
            const indicesData = new Uint16Array(data);
            subMesh.geometricInfo.indices = indicesData;
        }
    }
}

export function updateBoundingBox(meshComp: MeshRenderer, minPos?: math.Vec3, maxPos?: math.Vec3) {
    const model = meshComp.model;
    if (!model) {
        return;
    }

    model.createBoundingShape(minPos, maxPos);
}

export function getRaycastResultsByNodes(nodes: Node[], x: number, y: number, distance = Infinity, forSnap = false, excludeMask?: number): RaycastResults {
    const results = new RaycastResults(ray);
    const camera = getEditorCamera();
    if (!camera || !camera.camera) {
        return results;
    }

    camera.camera.screenPointToRay(ray, x, y);

    const walkAllModels = (node: Node, cb: (mr: MeshRenderer) => void) => {
        const modelComponent = node.getComponents(MeshRenderer);
        modelComponent.forEach(e => cb(e));
        if (node.children.length > 0) {
            node.children.forEach(children => {
                walkAllModels(children, cb);
            });
        }
    };

    nodes.forEach(node => {
        walkAllModels(node, (mr: MeshRenderer) => {
            if (!mr.model) return;
            if (raycastUtil.raycastSingleModel(ray, mr.model, node['_layer'], distance, forSnap, excludeMask)) {
                results.push(...raycastUtil.rayResultSingleModel);
                results.sort(cmp);
            }
        });
    });

    return results;
}

export function getRaycastResults(rootNode: Node, x: number, y: number, distance = Infinity, excludeMask?: number): RaycastResults {
    const scene = (rootNode as any).scene?.renderScene as renderer.RenderScene;
    const camera = getEditorCamera();
    if (!camera || !camera.camera || !scene) {
        return new RaycastResults(ray);
    }

    camera.camera.screenPointToRay(ray, x, y);
    const results = new RaycastResults(ray);
    if (raycastUtil.raycastAllModels(scene, ray, rootNode['_layer'], distance, false, excludeMask)) {
        results.push(...raycastUtil.rayResultModels);
        results.sort(cmp);
    }
    return results;
}

export function raycast(scene: any, camera: any, layer: any, x: number, y: number, distance = Infinity, excludeMask?: number): RaycastResults | null {
    if (!camera || !camera.enabled) {
        return null;
    }

    camera.screenPointToRay(ray, x, y);
    const results = new RaycastResults(ray);
    if (raycastUtil.raycastAllModels(scene, ray, layer, distance, false, excludeMask)) {
        results.push(...raycastUtil.rayResultModels);
        results.sort(cmp);
    }
    return results;
}

export function raycastAllColliders(camera: any, x: number, y: number): any[] & { ray?: geometry.Ray } {
    const results: any[] & { ray?: geometry.Ray } = [] as any;
    if (!camera?.camera) return results;
    camera.camera.screenPointToRay(ray, x, y);
    results.ray = ray;
    const PhysicsSystem = (cc as any).PhysicsSystem;
    const physicsSystem = PhysicsSystem?.instance;
    if (!physicsSystem?.raycastAll) return results;
    if (physicsSystem.raycastAll(ray)) {
        results.push(...physicsSystem.raycastResults);
        results.sort(cmp);
    }
    return results;
}

export function getRaycastResultsForSnap(camera: any, x: number, y: number, mask: number = ~Layers.Enum.SCENE_GIZMO): RaycastResults {
    const scene = (cc as any).director?.getScene();
    if (!scene || !camera?.camera) return new RaycastResults(ray);
    const renderScene = (scene as any).renderScene as renderer.RenderScene;
    if (!renderScene) return new RaycastResults(ray);
    camera.camera.screenPointToRay(ray, x, y);
    const results = new RaycastResults(ray);
    if (raycastUtil.raycastAllModels(renderScene, ray, mask, Infinity, true)) {
        results.push(...raycastUtil.rayResultModels);
        results.sort(cmp);
    }
    return results;
}

export function getMeshVertexAroundMouse(node: Node, camera: any, x: number, y: number, radius: number = 30): Vec4[] {
    if (!camera?.camera || !node) return [];
    const targetNode = Node.isNode(node) ? node : ((node as any).collider?.node ?? (node as any).node ?? null);
    if (!targetNode) return [];

    const vertexs: Vec4[] = [];
    const vertex = new Vec3();
    const worldPos = new Vec3();
    const screenPos = new Vec3();
    const worldMatrix = targetNode.getWorldMatrix();

    const components = targetNode.getComponentsInChildren?.(MeshRenderer) ?? [];
    components.forEach((renderableCmp: MeshRenderer) => {
        const mesh = (renderableCmp as any).mesh;
        const len = mesh?.renderingSubMeshes?.length;
        for (let i = 0; i < len; i++) {
            const subMesh = mesh.renderingSubMeshes[i];
            const geoInfo = subMesh?.geometricInfo;
            if (geoInfo) {
                const positions = geoInfo.positions;
                for (let idx = 0; idx < positions.length; idx += 3) {
                    vertex.set(positions[idx], positions[idx + 1], positions[idx + 2]);
                    Vec3.transformMat4(worldPos, vertex, worldMatrix);
                    camera.camera.worldToScreen(screenPos, worldPos);
                    const dx = screenPos.x - x;
                    const dy = screenPos.y - y;
                    const length = Math.sqrt(dx * dx + dy * dy);
                    if (length < radius) {
                        vertexs.push(new Vec4(vertex.x, vertex.y, vertex.z, length));
                    }
                }
            }
        }
    });

    vertexs.sort((a, b) => a.w - b.w);
    return vertexs;
}
