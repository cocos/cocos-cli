'use strict';
import { Color, IVec3, Material, MeshRenderer, Node, Quat, v3, Vec3 } from 'cc';
import type { IAddMeshToNodeOption, IAddQuadToNodeOptions, IAddLineToNodeOptions } from './defines';
import { DynamicMeshPrimitive, IMeshPrimitive } from './defines';

import ControllerShape from './controller-shape';
import { ControllerShapeCollider } from './controller-shape-collider';
import {
    CullMode,
    create3DNode,
    addMeshToNode,
    setMeshColor,
    setNodeOpacity,
    createMesh,
    createDynamicMesh,
    updateDynamicMesh,
} from './engine-utils';

const EPSILON = 1e-6;
const R2D = 180 / Math.PI;

function clamp(v: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, v));
}

enum AxisName {
    x = 'x',
    y = 'y',
    z = 'z',
    neg_x = 'neg_x',
    neg_y = 'neg_y',
    neg_z = 'neg_z',
}

class ControllerUtils {
    public static AxisName = AxisName;
    public static axisDirectionMap: { [key: string]: Vec3 } = {
        'x': new Vec3(1, 0, 0),
        'y': new Vec3(0, 1, 0),
        'z': new Vec3(0, 0, 1),
        'neg_x': new Vec3(-1, 0, 0),
        'neg_y': new Vec3(0, -1, 0),
        'neg_z': new Vec3(0, 0, -1),
    };

    public static arrow(headHeight: number, headRadius: number, bodyHeight: number, color: Color, opts: Partial<IAddLineToNodeOptions> = {}) {
        const axisNode: Node = create3DNode('arrow');

        // body
        let bbSize = 5;
        if (opts.bodyBBSize !== undefined && opts.bodyBBSize !== null) {
            bbSize = opts.bodyBBSize;
        }
        const bodyOpts = { noDepthTestForLines: true };
        Object.assign(bodyOpts, opts);

        // line
        const lineData = ControllerShape.calcLineData(new Vec3(0, 0, 0), new Vec3(0, bodyHeight, 0));
        const lineNode = this.createShapeByData(lineData, color, bodyOpts);
        lineNode.name = 'ArrowLine';
        lineNode.parent = axisNode;
        setMeshColor(lineNode, color);

        // body
        if (bbSize > 0) {
            const cylinderData = ControllerShape.calcCylinderData(bbSize, bbSize, bodyHeight, bodyOpts);
            const cylinderNode = this.createShapeByData(cylinderData, color, bodyOpts);
            cylinderNode.name = 'ArrowBody';
            cylinderNode.parent = axisNode;
            setNodeOpacity(cylinderNode, 0);
            cylinderNode.setPosition(new Vec3(0, bodyHeight / 2, 0));

            const csc = cylinderNode.addComponent(ControllerShapeCollider);
            csc.isDetectMesh = true;
            csc.isRender = false; // 用于碰撞检测的几何体
        }

        // head
        const headOpts = { cullMode: CullMode.BACK };
        Object.assign(headOpts, opts);
        const coneData = ControllerShape.calcConeData(headRadius, headHeight, { capped: false });
        const coneNode = this.createShapeByData(coneData, color, headOpts);
        coneNode.parent = axisNode;
        coneNode.name = 'ArrowHead';
        coneNode.setPosition(new Vec3(0, bodyHeight + headHeight / 2, 0));
        const csc = coneNode.addComponent(ControllerShapeCollider);
        csc.isDetectMesh = false;

        return axisNode;
    }

    public static quad(center: Readonly<Vec3>, width: number, height: number, normal: Readonly<Vec3> = new Vec3(0, 0, 1), color: Color = Color.RED, opts: Partial<IAddQuadToNodeOptions> = {}) {
        const quadData = ControllerShape.calcQuadData(center, width, height, normal, opts.needBoundingBox);
        const quadNode = this.createShapeByData(quadData, color, opts);
        quadNode.name = 'Quad';
        return quadNode;
    }

    public static borderPlane(width: number, height: number, color: Color, opacity: number) {
        const halfWidth = width / 2;
        const halfHeight = height / 2;
        const borderPlane = create3DNode('borderPlane');
        // plane
        const planeData = ControllerShape.calcQuadData(new Vec3(), width, height);
        const planeNode = this.createShapeByData(planeData, color, { unlit: true });
        planeNode.name = 'Plane';
        setNodeOpacity(planeNode, opacity);
        planeNode.parent = borderPlane;
        const csc = planeNode.addComponent(ControllerShapeCollider);
        csc.isDetectMesh = false;

        const createBorder = (startPos: Vec3, endPos: Vec3, borderColor: Color) => {
            const lineData = ControllerShape.calcLineData(startPos, endPos);
            const borderNode = this.createShapeByData(lineData, borderColor, { alpha: 200, noDepthTestForLines: true });
            borderNode.name = 'BorderLine';
            borderNode.parent = borderPlane;
            return borderNode;
        };

        // borders
        createBorder(new Vec3(0, height / 2, 0), new Vec3(halfWidth, height / 2, 0), color);
        createBorder(new Vec3(halfWidth, halfHeight, 0), new Vec3(halfWidth, 0, 0), color);

        return borderPlane;
    }

    public static circle(center: Vec3, normal: Vec3, radius: number, color: Color) {
        const circleData = ControllerShape.calcCircleData(center, normal, radius);
        const circleNode = this.createShapeByData(circleData, color);
        circleNode.name = 'Circle';

        return circleNode;
    }

    public static torus(radius: number, tube: number, opts: any, color: Color) {
        const torusData = ControllerShape.torus(radius, tube, opts);
        const torusOpts = { cullMode: CullMode.BACK };
        const torusNode = this.createShapeByData(torusData, color, torusOpts);
        torusNode.name = 'Torus';
        const csc = torusNode.addComponent(ControllerShapeCollider);
        csc.isDetectMesh = true;
        csc.isRender = false;

        return torusNode;
    }

    public static cube(width: number, height: number, depth: number, color: Color, center?: IVec3, opts: Partial<IAddMeshToNodeOption> = {}) {
        const cubeData = ControllerShape.calcCubeData(width, height, depth, center);
        opts.cullMode ??= CullMode.BACK;
        const cubeNode = this.createShapeByData(cubeData, color, opts);
        cubeNode.name = 'Cube';
        const csc = cubeNode.addComponent(ControllerShapeCollider);
        csc.isDetectMesh = false;
        return cubeNode;
    }

    public static scaleSlider(headWidth: number, bodyHeight: number, color: Color, opts: Partial<IAddMeshToNodeOption> = {}) {
        const scaleSliderNode = create3DNode('scaleSlider');
        const headNode = this.cube(headWidth, headWidth, headWidth, color, undefined, opts);
        headNode.name = 'ScaleSliderHead';
        headNode.parent = scaleSliderNode;
        headNode.setPosition(0, bodyHeight + headWidth / 2, 0);

        const bodyOpts = { noDepthTestForLines: true };
        Object.assign(bodyOpts, opts);
        const bodyData = ControllerShape.lineWithBoundingBox(bodyHeight);
        const bodyNode = this.createShapeByData(bodyData, color, bodyOpts);
        bodyNode.name = 'ScaleSliderBody';
        bodyNode.parent = scaleSliderNode;
        bodyNode.eulerAngles = new Vec3(0, 0, 90);
        const csc = bodyNode.addComponent(ControllerShapeCollider);
        csc.isDetectMesh = false;

        return scaleSliderNode;
    }

    public static getCameraDistanceFactor(pos: Vec3, camera: Node) {
        const cameraPos = camera.getWorldPosition();
        const dist = Vec3.distance(pos, cameraPos);

        return dist;
    }

    public static lineTo(startPos: Vec3, endPos: Vec3, color: Color = Color.RED, opts: Partial<IAddMeshToNodeOption> = {}) {
        const lineData = ControllerShape.calcLineData(startPos, endPos);
        const lineNode = this.createShapeByData(lineData, color, opts);
        lineNode.name = opts.name ?? 'Line';

        return lineNode;
    }

    public static createLine(parent: Node, startPos: Vec3, endPos: Vec3, color: Color = Color.RED, opts: Partial<IAddMeshToNodeOption> = {}): MeshRenderer | null {
        const node = ControllerUtils.lineTo(startPos, endPos, color, opts);
        node.parent = parent;
        node.name = opts.name ?? 'Line';
        return node.getComponent(MeshRenderer);
    }

    // 圆盘
    public static disc(center: Readonly<Vec3>, normal: Readonly<Vec3>, radius: number, color: Color = Color.RED, opts: Partial<IAddMeshToNodeOption> = {}) {
        const discData = ControllerShape.calcDiscData(center, normal, radius);
        const discNode = this.createShapeByData(discData, color, opts);
        discNode.name = 'Disc';

        return discNode;
    }

    // 扇形
    public static sector(center: Vec3, normal: Vec3, fromDir: Vec3, radian: number, radius: number, color: Color = Color.RED, opts: Partial<IAddMeshToNodeOption> = {}) {
        const sectorData = ControllerShape.calcSectorData(center, normal, fromDir, radian, radius, 60);
        const sectorNode = this.createShapeByData(sectorData, color, opts);
        sectorNode.name = 'Sector';

        return sectorNode;
    }

    // 弧形
    public static arc(center: Vec3, normal: Vec3, fromDir: Vec3, radian: number, radius: number, color: Color = Color.RED, opts: Partial<IAddMeshToNodeOption> = {}) {
        const arcData = ControllerShape.calcArcData(center, normal, fromDir, radian, radius);
        const arcNode = this.createShapeByData(arcData, color, opts);
        arcNode.name = 'Arc';

        return arcNode;
    }

    public static arcDirectionLine(
        center: Vec3,
        normal: Vec3,
        fromDir: Vec3,
        radian: number,
        radius: number,
        length: number,
        segments: number,
        color: Color = Color.RED,
    ) {
        const arcDirData = ControllerShape.arcDirectionLine(center, normal, fromDir, radian, radius, length, segments);
        const arcDirNode = this.createShapeByData(arcDirData, color);
        arcDirNode.name = 'ArcDirectionLine';

        return arcDirNode;
    }

    public static lines(vertices: Vec3[], indices: number[], color: Color = Color.RED, opts: Partial<IAddMeshToNodeOption> = {}) {
        const linesData = ControllerShape.calcLinesData(vertices, indices);
        const linesNode = this.createShapeByData(linesData, color, opts);
        linesNode.name = 'Lines';

        return linesNode;
    }

    public static wireframeBox(center: Vec3, size: Vec3, color: Color, opts: Partial<IAddMeshToNodeOption> = {}) {
        const wireframeData = ControllerShape.wireframeBox(center, size);
        const boxNode = this.createShapeByData(wireframeData, color, opts);
        boxNode.name = 'WireFrameBox';

        return boxNode;
    }

    public static frustum(
        isOrtho: boolean,
        orthoHeight: number,
        fov: number,
        aspect: number,
        near: number,
        far: number,
        color: Color,
        opts: Partial<IAddMeshToNodeOption> = {},
    ) {
        const frustumData = ControllerShape.calcFrustum(isOrtho, orthoHeight, fov, aspect, near, far, true);
        const frustumNode = this.createShapeByData(frustumData, color, opts);
        frustumNode.name = 'Frustum';

        return frustumNode;
    }

    public static rectangle(center: Vec3, rotation: Readonly<Quat>, size: any, color: Color, opts: Partial<IAddMeshToNodeOption> = {}) {
        const rectangleData = ControllerShape.calcRectangleData(center, rotation, size);
        const rectangleNode = this.createShapeByData(rectangleData, color, opts);
        rectangleNode.name = 'Rectangle';

        return rectangleNode;
    }

    public static angle(from: Vec3, to: Vec3) {
        const denominator = Math.sqrt(Vec3.lengthSqr(from) * Vec3.lengthSqr(to));
        if (denominator < EPSILON) {
            return 0;
        }

        const dot = clamp(Vec3.dot(from, to) / denominator, -1, 1);
        return Math.acos(dot) * R2D;
    }

    public static sphere(center: Vec3, radius: number, color: Color, opts: Partial<IAddMeshToNodeOption> = {}, reuseMaterial?: Material) {
        const sphereData = ControllerShape.calcSphereData(center, radius, opts);
        const sphereNode = this.createShapeByData(sphereData, color, opts, reuseMaterial);
        sphereNode.name = 'SphereShape';
        return sphereNode;
    }

    public static octahedron(lowerPoint: Vec3, upperPoint: Vec3, width: number, length: number, ratio = 0.2, color: Color, opts: Partial<IAddMeshToNodeOption> = {}) {
        const octahedronData = ControllerShape.calcOctahedronData(lowerPoint, upperPoint, width, length, ratio);
        const octahedronNode = this.createShapeByData(octahedronData, color, opts);
        octahedronNode.name = 'OctahedronShape';

        return octahedronNode;
    }

    public static createShapeByData(shapeData: IMeshPrimitive, color: Color, opts: Partial<IAddMeshToNodeOption> = {}, reuseMaterial?: Material) {
        const shapeNode: Node = create3DNode(opts.name);
        addMeshToNode(shapeNode, createMesh(shapeData, opts), opts, reuseMaterial);
        setMeshColor(shapeNode, color);

        return shapeNode;
    }

    public static create3DNode(name?: string): Node {
        return create3DNode(name);
    }

    public static drawLines(node: Node, vertices: Vec3[], indices: number[], color: Color = Color.RED) {
        const linesData = ControllerShape.calcLinesData(vertices, indices);
        let meshRenderer = node.getComponent(MeshRenderer);
        if (!meshRenderer) {
            addMeshToNode(node, createDynamicMesh(new DynamicMeshPrimitive(linesData), {
                maxSubMeshes: 1,
                maxSubMeshVertices: 1024000,
                maxSubMeshIndices: 1024000,
            }), {
                depthTestForTriangles: true,
                priority: 127,
            });
            meshRenderer = node.getComponent(MeshRenderer);
        } else {
            updateDynamicMesh(meshRenderer, 0, new DynamicMeshPrimitive(linesData));
        }
        meshRenderer?.onGeometryChanged();
        setMeshColor(node, color);
    }

    public static findMinPosition(positions: Vec3[]) {
        return v3(
            Math.min(...positions.map(p => p.x)),
            Math.min(...positions.map(p => p.y)),
            Math.min(...positions.map(p => p.z)),
        );
    }

    public static findMaxPosition(positions: Vec3[]) {
        return v3(
            Math.max(...positions.map(p => p.x)),
            Math.max(...positions.map(p => p.y)),
            Math.max(...positions.map(p => p.z)),
        );
    }

    /**
     * LimitLerp utility - 从 GizmosUtils.LimitLerp 移植
     */
    public static LimitLerp(a: number, b: number, t: number, tMin: number, tMax: number) {
        t = clamp((t - tMin) / (tMax - tMin), 0, 1);
        return a * (1 - t) + b * t;
    }
}

export default ControllerUtils;
