import { Camera, Color, geometry, gfx, Node, Quat, renderer, Scene, Layers, Vec3, EventMouse, SkyboxInfo, UITransform } from 'cc';
import PreviewBuffer from './buffer';
import { PreviewBase } from './preview-base';
import { PreviewWorldAxis } from './preview-axis';
import { Grid } from './grid';
import { smoothMouseWheelScale } from '../camera/camera-controller-3d';
import { Service } from '../core/decorator';
import type { IPreviewInstance } from '../../../common/preview';

const tempVec3A = new Vec3();
const tempVec3B = new Vec3();

function getBoundaryOfMeshNodes(nodes: Node[]): geometry.AABB | null {
    let minPos = new Vec3(Infinity, Infinity, Infinity);
    let maxPos = new Vec3(-Infinity, -Infinity, -Infinity);
    let found = false;

    for (const node of nodes) {
        const renderers = node.getComponentsInChildren('cc.MeshRenderer');
        for (const mr of renderers) {
            const model = (mr as any).model;
            if (model && model.worldBounds) {
                const bounds = model.worldBounds as geometry.AABB;
                const bMin = new Vec3(
                    bounds.center.x - bounds.halfExtents.x,
                    bounds.center.y - bounds.halfExtents.y,
                    bounds.center.z - bounds.halfExtents.z,
                );
                const bMax = new Vec3(
                    bounds.center.x + bounds.halfExtents.x,
                    bounds.center.y + bounds.halfExtents.y,
                    bounds.center.z + bounds.halfExtents.z,
                );
                Vec3.min(minPos, minPos, bMin);
                Vec3.max(maxPos, maxPos, bMax);
                found = true;
            }
        }
    }
    if (!found) return null;

    const center = new Vec3();
    Vec3.add(center, minPos, maxPos);
    Vec3.multiplyScalar(center, center, 0.5);
    const halfExtents = new Vec3();
    Vec3.subtract(halfExtents, maxPos, minPos);
    Vec3.multiplyScalar(halfExtents, halfExtents, 0.5);
    return new geometry.AABB(center.x, center.y, center.z, halfExtents.x, halfExtents.y, halfExtents.z);
}

function makeVec3InRange(v: Vec3, min: number, max: number) {
    v.x = Math.max(min, Math.min(max, v.x));
    v.y = Math.max(min, Math.min(max, v.y));
    v.z = Math.max(min, Math.min(max, v.z));
}

class InteractivePreview extends PreviewBase implements IPreviewInstance {
    protected scene!: Scene;
    protected cameraComp!: Camera;
    protected camera: renderer.scene.Camera | any;

    protected isMouseLeft = false;
    protected isMouseMiddle = false;

    protected enableResetCamera = true;
    protected enableViewToggle = true;

    protected enableGrid = true;
    protected grid: Grid | null = null;

    protected enableAxis = true;
    protected worldAxis: PreviewWorldAxis | null = null;

    protected is2D = false;

    protected enableSkybox = true;
    protected skybox: SkyboxInfo | null = null;

    public async queryPreviewData(info: any) {
        this.ensurePreviewGlobalsActive();
        this.previewBuffer.ensureWindow(info.width, info.height);
        this.ensureCameraAttached();
        if (this.worldAxis && this.previewBuffer?.window) {
            this.worldAxis._sceneGizmoCamera.camera.changeTargetWindow(this.previewBuffer.window);
            if (this.enableAxis) {
                this.worldAxis.show();
            }
        }
        return super.queryPreviewData(info);
    }

    private ensurePreviewGlobalsActive() {
        if (!this.enableSkybox) return;
        const psd = (cc.director.root as any)?.pipeline?.pipelineSceneData;
        if (!psd?.skybox) return;
        if (!psd.skybox.enabled) {
            this.scene.globals.activate(this.scene);
        }
    }

    protected readonly _minScalar = 1;
    protected orthoScale = 0.1;

    private get isOrtho() {
        return this.cameraComp.projection === Camera.ProjectionType.ORTHO;
    }

    protected get wheelSpeed() {
        try {
            const cam = Service.Camera as any;
            if (this.isOrtho) {
                return cam.controller2D?.wheelSpeed ?? 6;
            }
            return cam.controller3D?.wheelSpeed ?? 0.01;
        } catch {
            return this.isOrtho ? 6 : 0.01;
        }
    }

    protected get scale2D(): number {
        try {
            return Service.Gizmo?.transformToolData?.scale2D ?? 1;
        } catch {
            return 1;
        }
    }

    protected wheelBaseScale = 1 / 12;
    private lastMouseWheelDeltaY = 0;
    private maxMouseWheelDeltaY = 1000;

    protected disableMouseWheel = false;
    protected disableRotate = false;
    protected disablePan = false;

    public queryViewToolState() {
        return {
            enableResetCamera: this.enableResetCamera,
            enableViewToggle: this.enableViewToggle,
        };
    }

    public is2DView() {
        return this.is2D;
    }

    public viewToggle() {
        this.is2D = !this.is2D;
        this.switchViewModeState();
        this.initCamera();
        this.initGrid();
        this.updatePreviewWorldAxisVisibility();
        if (this._modelNode) {
            this.autoPerfectCameraViewOnModel(this._modelNode);
        }
        Service.Engine.repaintInEditMode();
    }

    public initScene(registerName: string, queryName: string) {
        this.scene = new Scene(registerName);
        if (this.enableSkybox) {
            this.skybox = this.scene.globals.skybox;
            this.scene.globals.skybox.enabled = true;
        }
        this.previewBuffer = new PreviewBuffer(registerName, queryName, this.scene);
    }

    public createNodes(scene: Scene) {
    }

    public createCamera(registerName: string) {
        this.cameraComp = new Node(registerName + 'camera').addComponent(Camera);
        this.cameraComp.node.setParent(this.scene);
    }

    public initCamera() {
        if (this.is2D) {
            this.cameraComp.node.setPosition(0, 0, 1000);
            this.cameraComp.orthoHeight = 1;
            this.cameraComp.node.setRotationFromEuler(0, 0, 0);
            this.cameraComp.projection = Camera.ProjectionType.ORTHO;
            this.cameraComp.clearFlags = Camera.ClearFlag.SOLID_COLOR;
        } else {
            this.cameraComp.node.setPosition(0, 1, 2.5);
            this.cameraComp.node.lookAt(Vec3.ZERO);
            this.cameraComp.projection = Camera.ProjectionType.PERSPECTIVE;
        }
        this.cameraComp.clearColor = new Color(76, 76, 76, 255);
        this.cameraComp.near = 0.01;
        this.cameraComp.far = 10000;
        this.cameraComp.visibility = Layers.makeMaskExclude([Layers.BitMask.PROFILER, Layers.Enum.GIZMOS, Layers.Enum.SCENE_GIZMO]);
    }

    public initSceneCamera() {
        this.camera = this.cameraComp.camera;
        if (!this.camera) {
            console.warn(`[InteractivePreview] initSceneCamera: cameraComp.camera is null, forcing _createCamera`);
            (this.cameraComp as any)._createCamera();
            this.camera = this.cameraComp.camera;
        }
        this.camera.isWindowSize = false;
        if (this.cameraComp.projection === Camera.ProjectionType.PERSPECTIVE) {
            this.camera.clearFlag = (gfx.ClearFlagBit.STENCIL << 1) | gfx.ClearFlagBit.DEPTH_STENCIL;
        }
        this.camera.cameraUsage = renderer.scene.CameraUsage.EDITOR;
        // Disable until a preview window is available — scene._activate() already
        // enabled the camera targeting mainWindow, which causes framebuffer errors.
        this.camera.enabled = false;
        this.ensureCameraAttached();
    }

    protected ensureCameraAttached() {
        if (!this.camera || !this.previewBuffer?.window) return;

        this.cameraComp.enabled = true;
        if (!this.camera.scene && this.scene?.renderScene) {
            this.scene.renderScene.addCamera(this.camera);
        }
        this.camera.changeTargetWindow(this.previewBuffer.window);
        this.camera.enabled = true;
    }

    public loadScene() {
        // @ts-ignore
        this.scene._load();
        // @ts-ignore
        this.scene._activate();

    }

    protected switchViewModeState() {
        if (this.is2D) {
            this.enableGrid = false;
            this.enableAxis = false;
            this.disablePan = true;
            this.disableRotate = true;
        } else {
            this.enableGrid = true;
            this.enableAxis = true;
            this.disablePan = false;
            this.disableRotate = false;
        }
    }

    public init(registerName: string, queryName: string) {
        this.switchViewModeState();
        this.initScene(registerName, queryName);
        this.createCamera(registerName);
        this.createNodes(this.scene);
        this.initCamera();
        // Disable camera component before scene activation so that _activate()
        // does not add the camera to mainWindow's render list.
        this.cameraComp.enabled = false;
        this.loadScene();
        this.initSceneCamera();
        this.initPreviewWorldAxis();
        this.initGrid();
    }

    public initPreviewWorldAxis() {
        if (!this.worldAxis) {
            this.worldAxis = new PreviewWorldAxis(this.scene, this.cameraComp);
        }
        if (this.previewBuffer?.window) {
            this.worldAxis._sceneGizmoCamera.camera.changeTargetWindow(this.previewBuffer.window);
            this.updatePreviewWorldAxisVisibility();
        } else {
            this.worldAxis.hide();
        }
    }

    protected updatePreviewWorldAxisVisibility() {
        if (!this.worldAxis) {
            this.worldAxis = new PreviewWorldAxis(this.scene, this.cameraComp);
        }
        if (this.enableAxis) {
            this.worldAxis.show();
        } else {
            this.worldAxis.hide();
        }
    }

    public initGrid() {
        if (!this.grid) {
            this.grid = new Grid(this.scene, this.cameraComp);
        }
        if (this.enableGrid) {
            this.grid.show();
        } else {
            this.grid.hide();
        }
    }

    resetCamera(modelNode: Node) {
        if (this.isOrtho) {
            tempVec3A.set(0, 0, 1000);
        } else {
            tempVec3A.set(0, 1, 2.5);
        }
        this.cameraComp.node.setPosition(tempVec3A);
        if (this.isOrtho) {
            this.cameraComp.node.setRotationFromEuler(0, 0, 0);
        } else {
            this.cameraComp.node.lookAt(Vec3.ZERO);
        }
        modelNode.getWorldPosition(tempVec3B);
        Vec3.set(this.viewCenter, 0, 0, 0);
        this.viewDist = Vec3.distance(tempVec3A, tempVec3B);
        Service.Engine.repaintInEditMode();
    }

    protected autoPerfectCameraViewOnModel(model: Node) {
        this.perfectCameraView(getBoundaryOfMeshNodes([model]));
    }

    public panningSpeed = 4;
    public orbitRotateSpeed = 0.01;
    public viewDist = 10;
    public viewCenter = new Vec3();

    private _isMouseDown = false;
    private _right: Vec3 = new Vec3();
    private _up: Vec3 = new Vec3();
    private _v3a = cc.v3();
    private _v3b = cc.v3();
    private _curPos = cc.v3();
    private _curRot = new Quat();
    private _forward = cc.v3(Vec3.UNIT_Z);

    protected perfectCameraView(boundary: geometry.AABB | null | undefined) {
        let orthoHeight = 1;
        if (boundary) {
            const radius = Math.max(boundary.halfExtents.x, boundary.halfExtents.y, boundary.halfExtents.z);
            const fov = this.cameraComp.fov * Math.PI / 180;
            const requiredDist = radius / Math.tan(fov / 2);
            const dist = Vec3.distance(this.cameraComp.node.worldPosition, boundary.center);
            this.viewDist = Math.max(dist, requiredDist);
            Vec3.set(this.viewCenter, boundary.center.x, boundary.center.y, boundary.center.z);
            orthoHeight = Math.max(1, radius * 1.2);
        } else if (this._modelNode) {
            const uiTransform = this._modelNode.getComponent(UITransform);
            if (uiTransform) {
                const bbox = uiTransform.getBoundingBoxToWorld();
                Vec3.set(this.viewCenter, bbox.x + bbox.width / 2, bbox.y + bbox.height / 2, 0);
                orthoHeight = Math.max(1, bbox.height / 2);
            } else {
                const pos = this._modelNode.worldPosition;
                Vec3.set(this.viewCenter, pos.x, pos.y, pos.z);
                orthoHeight = Math.max(1, Math.abs(this.viewCenter.y));
            }
        }

        if (this.isOrtho) {
            const position = this.cameraComp.node.position.clone();
            position.x = this.viewCenter.x;
            position.y = this.viewCenter.y;
            position.z = 1000;
            this.cameraComp.node.position = position;
            const uiTransform = this._modelNode && this._modelNode.getComponent(UITransform);
            if (uiTransform) {
                const bbox = uiTransform.getBoundingBoxToWorld();
                this.cameraComp.orthoHeight = Math.max(1, bbox.height / 2);
            } else {
                this.cameraComp.orthoHeight = orthoHeight;
            }
        } else {
            this.cameraComp.node.getWorldRotation(this._curRot);
            Vec3.transformQuat(tempVec3A, Vec3.UNIT_Z, this._curRot);
            Vec3.multiplyScalar(tempVec3A, tempVec3A, this.viewDist);
            Vec3.add(tempVec3B, this.viewCenter, tempVec3A);
            this.cameraComp.node.setWorldPosition(tempVec3B);
            this.cameraComp.node.lookAt(this.viewCenter);
        }
        Service.Engine.repaintInEditMode();
    }

    public onMouseDown(event: any) {
        this._isMouseDown = true;
        this.cameraComp.node.getWorldRotation(this._curRot);
        this.cameraComp.node.getWorldPosition(this._curPos);

        if ((event.button === EventMouse.BUTTON_LEFT || !event.button) && !this.disableRotate) {
            this.isMouseLeft = true;
        }

        if (event.button === EventMouse.BUTTON_MIDDLE && !this.disablePan) {
            this.isMouseMiddle = true;
            Vec3.transformQuat(this._right, Vec3.UNIT_X, this._curRot);
            Vec3.normalize(this._right, this._right);
            Vec3.transformQuat(this._up, Vec3.UNIT_Y, this._curRot);
            Vec3.normalize(this._up, this._up);
        }
    }

    public onMouseMove(event: any) {
        if (!this._isMouseDown) { return; }

        if (this.isMouseMiddle && !this.disablePan) {
            this.pan(event.movementX | 0, event.movementY | 0);
        }
        if (this.isMouseLeft) {
            this.rotate(event.movementX | 0, event.movementY | 0);
        }
    }

    public onMouseUp(event: any) {
        this._isMouseDown = false;
        this.isMouseLeft = false;
        this.isMouseMiddle = false;
    }

    public onMouseWheel(event: any) {
        if (this.disableMouseWheel) { return; }

        let deltaY = event.wheelDeltaY;
        if (Math.abs(deltaY - this.lastMouseWheelDeltaY) > this.maxMouseWheelDeltaY) {
            deltaY = this.lastMouseWheelDeltaY + Math.sign(deltaY) * this.maxMouseWheelDeltaY;
        }
        this.scale(deltaY * this.wheelBaseScale);
    }

    protected _modelNode: Node | undefined;

    public onKeyDown(event: any) {
    }

    smoothScale2D(curScale: number, delta: number) {
        return Math.pow(2, delta * 0.002) * curScale;
    }

    protected scale(delta: number) {
        if (this.isOrtho) {
            const newScale = this.smoothScale2D(this.scale2D, delta);
            let newOrthoHeight = this.cameraComp.orthoHeight;
            newOrthoHeight += delta * this.wheelSpeed * newScale * this.orthoScale;
            if (newOrthoHeight < 0) {
                newOrthoHeight = 0.01;
            }
            this.cameraComp.orthoHeight = newOrthoHeight;
        } else {
            let scalar = this.viewDist;
            if (Math.abs(scalar) < this._minScalar) {
                scalar = 1;
            }

            delta = smoothMouseWheelScale(delta);

            const cameraNode = this.cameraComp.node;
            cameraNode.getWorldPosition(this._curPos);
            cameraNode.getWorldRotation(this._curRot);
            Vec3.transformQuat(this._forward, Vec3.UNIT_Z, this._curRot);

            Vec3.multiplyScalar(this._v3a, this._forward, delta * this.wheelSpeed * scalar);
            Vec3.add(this._curPos, this._curPos, this._v3a);
            makeVec3InRange(this._curPos, -1e12, 1e12);

            this.viewDist = Vec3.distance(this._curPos, this.viewCenter);
            cameraNode.setWorldPosition(this._curPos);
        }
    }

    protected rotate(dx: number, dy: number) {
        if (!this._isMouseDown && !this.isMouseLeft) { return; }
        this.cameraComp.node.getWorldRotation(this._curRot);
        const rot = this._curRot;
        const euler = cc.v3();

        Quat.rotateX(rot, rot, -dy * this.orbitRotateSpeed);
        Quat.rotateAround(rot, rot, Vec3.UNIT_Y, -dx * this.orbitRotateSpeed);
        Quat.toEuler(euler, rot);

        Quat.fromEuler(rot, euler.x, euler.y, 0);
        const offset = cc.v3(0, 0, 1);
        Vec3.transformQuat(offset, offset, rot);
        Vec3.normalize(offset, offset);

        Vec3.multiplyScalar(offset, offset, this.viewDist);
        Vec3.add(this._curPos, this.viewCenter, offset);
        this.cameraComp.node.setWorldPosition(this._curPos);

        const up = cc.v3(0, 1, 0);
        Vec3.transformQuat(up, up, rot);
        Vec3.normalize(up, up);
        this.cameraComp.node.lookAt(this.viewCenter, up);
    }

    protected pan(dx: number, dy: number) {
        if (!this._isMouseDown && !this.isMouseMiddle) { return; }
        const scalar = this.viewDist / 800;
        const node = this.cameraComp.node;
        const curPos = this._curPos;

        Vec3.multiplyScalar(this._v3a, this._right, -dx * this.panningSpeed * scalar);
        Vec3.multiplyScalar(this._v3b, this._up, dy * this.panningSpeed * scalar);

        node.getWorldPosition(curPos);
        Vec3.add(curPos, curPos, this._v3a);
        Vec3.add(curPos, curPos, this._v3b);
        node.setWorldPosition(curPos);

        Vec3.add(this.viewCenter, this.viewCenter, this._v3a);
        Vec3.add(this.viewCenter, this.viewCenter, this._v3b);
        this.viewDist = Vec3.distance(curPos, this.viewCenter);
    }

    public updateViewCenterByDist(viewDist: number) {
        const node = this.cameraComp.node;
        const curPos = this._curPos;
        node.getWorldPosition(curPos);
        node.getWorldRotation(this._curRot);
        Vec3.transformQuat(this._forward, Vec3.UNIT_Z, this._curRot);
        Vec3.multiplyScalar(this._v3a, this._forward, viewDist);
        Vec3.add(this.viewCenter, curPos, this._v3a);
    }

    public hide() {
        this.cameraComp.enabled = false;
        if (this.camera) {
            this.camera.enabled = false;
        }
        if (this.worldAxis) {
            this.worldAxis.hide();
            this.worldAxis._sceneGizmoCamera.camera.enabled = false;
        }
    }

    public resetCameraView() {
    }
}

export { InteractivePreview, getBoundaryOfMeshNodes };
