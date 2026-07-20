import { PreviewBase } from './preview-base';
import { scenePreview, ScenePreview } from './scene-preview';
import { MiniPreview } from './mini-preview';
import { MaterialPreview } from './material-preview';
import { ModelPreview } from './model-preview';
import { MeshPreview } from './mesh-preview';
import { SkeletonPreview } from './skeleton-preview';
import { PrefabPreview } from './prefab-preview';
import { SpinePreview } from './spine-preview';
import { BaseService, register, Service } from '../core';
import { Rpc } from '../../rpc';
import type { InteractivePreview } from './interactive-preview';
import type { IPreviewService, IPreviewEvents, IPreviewInstance } from '../../../common/preview';

interface PreviewTypeEntry {
    instance: PreviewBase;
    setup: string;
}

@register('Preview')
export class PreviewService extends BaseService<IPreviewEvents> implements IPreviewService {
    private _previewMap: Map<string, PreviewBase> = new Map();
    private _typeMap: Map<string, PreviewTypeEntry> = new Map();
    private _initialized = false;
    private _activePreview: IPreviewInstance | null = null;

    scenePreview = scenePreview;
    materialPreview = new MaterialPreview();
    miniPreview = new MiniPreview();
    modelPreview = new ModelPreview();
    meshPreview = new MeshPreview();
    skeletonPreview = new SkeletonPreview();
    prefabPreview = new PrefabPreview();
    spinePreview = new SpinePreview();

    get activePreview(): IPreviewInstance | null {
        return this._activePreview;
    }

    async init() {
        if (this._initialized) return;
        this._initialized = true;
        this.initPreview('scene:preview', 'query-preview-data', this.scenePreview);
        this.initPreview('scene:mini-preview', 'query-mini-preview-data', this.miniPreview);
        this.initPreview('scene:material-preview', 'query-material-preview-data', this.materialPreview);
        this.initPreview('scene:model-preview', 'query-model-preview-data', this.modelPreview);
        this.initPreview('scene:mesh-preview', 'query-mesh-preview-data', this.meshPreview);
        this.initPreview('scene:skeleton-preview', 'query-skeleton-preview-data', this.skeletonPreview);
        this.initPreview('scene:prefab-preview', 'query-prefab-preview-data', this.prefabPreview);
        this.initPreview('scene:spine-preview', 'query-spine-preview-data', this.spinePreview);
        this.initTypeMap();
        console.log('[Preview] PreviewService initialized');
    }

    private initTypeMap() {
        const entries: [string[], PreviewTypeEntry][] = [
            [['material', 'cc.Material'], { instance: this.materialPreview, setup: 'setMaterialByUuid' }],
            [['model', 'cc.FBX', 'cc.GLTF', 'cc.ModelAsset'], { instance: this.modelPreview, setup: 'setModel' }],
            [['mesh', 'cc.Mesh'], { instance: this.meshPreview, setup: 'setMesh' }],
            [['prefab', 'cc.Prefab'], { instance: this.prefabPreview, setup: 'setPrefab' }],
            [['skeleton', 'cc.Skeleton'], { instance: this.skeletonPreview, setup: 'setSkeleton' }],
            [['spine', 'sp.SkeletonData'], { instance: this.spinePreview, setup: 'setSpine' }],
        ];
        for (const [keys, entry] of entries) {
            for (const key of keys) {
                this._typeMap.set(key, entry);
            }
        }
    }

    // importer name → preview type 的映射（用于 assetType 为 cc.Asset 等泛型的回退）
    private static readonly IMPORTER_MAP: Record<string, string> = {
        'gltf': 'model',
        'fbx': 'model',
        'spine-data': 'spine',
    };

    private resolvePreview(assetType: string): PreviewTypeEntry | null {
        return this._typeMap.get(assetType) ?? null;
    }

    private async resolveAssetType(uuid: string): Promise<string | null> {
        const info = await Rpc.getInstance().request('assetManager', 'queryAssetInfo', [uuid]);
        if (!info) return null;
        // 优先用 type 匹配；若 type 为泛型（如 cc.Asset），用 importer 回退
        if (info.type && this._typeMap.has(info.type)) {
            return info.type;
        }
        if (info.importer && PreviewService.IMPORTER_MAP[info.importer]) {
            return PreviewService.IMPORTER_MAP[info.importer];
        }
        return info.type ?? null;
    }

    private initPreview(registerName: string, queryName: string, mgr: PreviewBase) {
        this._previewMap.set(registerName, mgr);
        mgr.init(registerName, queryName);
    }

    public async callPreviewFunction(previewName: string, funcName: string, ...args: any[]) {
        if (this._previewMap.has(previewName)) {
            const preview: any = this._previewMap.get(previewName);
            if (preview[funcName]) {
                return await preview[funcName](...args);
            }
        }
        return false;
    }

    // --- 上屏预览 ---

    async open(uuid: string): Promise<IPreviewInstance | null> {
        const assetType = await this.resolveAssetType(uuid);
        if (!assetType) {
            console.warn(`[Preview] Cannot resolve asset type for uuid: ${uuid}`);
            return null;
        }

        const entry = this.resolvePreview(assetType);
        if (!entry) {
            console.warn(`[Preview] Unsupported asset type: ${assetType}`);
            return null;
        }

        // 清理上一个预览的相机
        if (this._activePreview) {
            const prev = this._activePreview as any;
            if (prev.cameraComp) {
                prev.cameraComp.enabled = false;
            }
        }

        // 设置资源
        await (entry.instance as any)[entry.setup](uuid);
        this._activePreview = entry.instance as unknown as IPreviewInstance;

        // 将相机挂到 mainWindow 上屏渲染
        this.attachToMainWindow(entry.instance as InteractivePreview);
        Service.Engine.repaintInEditMode();

        return this._activePreview;
    }

    private attachToMainWindow(previewInstance: InteractivePreview) {
        const inst = previewInstance as any;
        if (!inst?.cameraComp) return;

        const mainWindow = cc.director.root.mainWindow;
        const camera = inst.cameraComp.camera || inst.camera;
        if (!camera || !mainWindow) return;

        camera.changeTargetWindow(mainWindow);
        camera.isWindowSize = true;
        camera.enabled = true;
        inst.cameraComp.enabled = true;

        if (inst.scene?.renderScene && !camera.scene) {
            inst.scene.renderScene.addCamera(camera);
        }

        if (inst.worldAxis) {
            inst.worldAxis._sceneGizmoCamera.camera.changeTargetWindow(mainWindow);
            if (inst.enableAxis) {
                inst.worldAxis.show();
            }
        }
    }

    // --- 缩略图生成 ---

    public async generateThumbnail(uuid: string, assetType: string, width = 128, height = 128) {
        const entry = this.resolvePreview(assetType);
        if (!entry) return null;
        await (entry.instance as any)[entry.setup](uuid);
        return await entry.instance.queryPreviewData({ width, height });
    }

    // --- Service 事件钩子 ---

    onComponentAdded(comp: any) {
        this.scenePreview.onComponentAdded(comp);
    }
}

export { PreviewBase } from './preview-base';
export { InteractivePreview } from './interactive-preview';
export { ScenePreview } from './scene-preview';
export { MiniPreview } from './mini-preview';
export { MaterialPreview } from './material-preview';
export { ModelPreview } from './model-preview';
export { MeshPreview } from './mesh-preview';
export { SkeletonPreview } from './skeleton-preview';
export { PrefabPreview } from './prefab-preview';
export { SpinePreview } from './spine-preview';
