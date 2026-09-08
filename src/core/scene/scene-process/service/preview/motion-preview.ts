/*---------------------------------------------------------------------------------------------
 *  Copyright (c) SUD. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DirectionalLight, Node, Prefab, Scene, instantiate } from 'cc';
import { InteractivePreview, getBoundaryOfMeshNodes } from './interactive-preview';
import { loadPreviewAsset, removePreviewAssetCache } from './asset-reload';
import { Rpc } from '../../rpc';
import type { MotionPreviewDesc, MotionPreviewDescNode } from '../../../common/preview';

/**
 * engine editor 模块：与动画剪辑预览一致的加载方式（scene-process 的
 * engine-bootstrap 已把 cc/editor/new-gen-anim 作为必须模块加载）。
 */
function getNewGenAnim(): any {
    return require('cc/editor/new-gen-anim');
}

/**
 * 通用 Motion 预览器。
 *
 * 只理解中立的 {@link MotionPreviewDesc}：由业务方把各自资产数据翻译成描述后传入，
 * 本类负责加载预览 Prefab、按描述重建引擎 Motion、并驱动 `MotionPreviewer`
 * 采样姿态到模型节点上；`queryPreviewData` 由外层按帧轮询取图。
 *
 * ```mermaid
 * sequenceDiagram
 *     participant PinK as PinK 主进程(Preview 代理)
 *     participant Preview as MotionPreview(scene-process)
 *     participant Engine as MotionPreviewer(cc/editor/new-gen-anim)
 *     PinK->>Preview: showMotion(desc)
 *     Preview->>Engine: new MotionPreviewer(modelNode) + setMotion(built motion)
 *     PinK->>Preview: setMotionTime / playMotion / pauseMotion / setMotionVariable
 *     Preview->>Engine: setTime(time) + evaluate()
 *     PinK->>Preview: queryPreviewData({width,height})
 *     Preview-->>PinK: RGBA buffer(模型当前姿态帧)
 * ```
 */
export class MotionPreview extends InteractivePreview {
    private lightComp: DirectionalLight | any;
    private motionPreviewer: any = null;
    private motionPreview: any = null;
    private loadedClips = new Map<string, any>();
    private active = false;
    private playing = false;
    private time = 0;
    private lastPlayTick = 0;
    // 最近一次外部时间下发（Inspector rAF 时钟经 show/play/stop/setTime 写入）的时间戳；
    // headless 消费者（MCP/CLI 只轮询取帧）超过阈值未下发时，queryPreviewData 自推进。
    private lastExternalTimeAt = 0;
    // 未等到模型时的待处理描述（调用方可能先下发 Motion 描述、再设置模型）。
    private pendingDesc: MotionPreviewDesc | null = null;
    private operationVersion = 0;

    public createNodes(scene: Scene) {
        this.lightComp = new Node('Motion Preview Light').addComponent(DirectionalLight);
        this.lightComp.node.setRotationFromEuler(-45, -45, 0);
        this.lightComp.node.parent = scene;
    }

    public get isActive(): boolean {
        return this.active;
    }

    public async setModel(uuid: string): Promise<void> {
        const operationVersion = ++this.operationVersion;
        if (!uuid) {
            throw new Error('Motion preview model UUID must be a non-empty string.');
        }

        const prefabUuid = await this._resolvePrefabUuid(uuid);
        if (!prefabUuid) {
            throw new Error(`Unable to preview model ${uuid}: the imported cc.Prefab sub-asset is unavailable.`);
        }

        removePreviewAssetCache(uuid);
        const prefabAsset = await loadPreviewAsset<Prefab>(prefabUuid, 'model', { reloadAsset: true });
        if (operationVersion !== this.operationVersion) {
            return;
        }

        const nextModelNode = instantiate(prefabAsset) as Node;
        let nextMotionPreviewer: any;
        const pending = this.pendingDesc;
        let nextMotion: any = null;
        let nextLoadedClips: Map<string, any> | undefined;
        try {
            nextMotionPreviewer = this._createMotionPreviewer(nextModelNode);
            if (pending) {
                const prepared = await this._prepareMotion(pending);
                if (operationVersion !== this.operationVersion) {
                    nextMotionPreviewer.destroy?.();
                    nextModelNode.destroy();
                    return;
                }
                nextMotion = prepared.motion;
                nextLoadedClips = prepared.loadedClips;
                this._configureMotionPreviewer(nextMotionPreviewer, pending);
                nextMotionPreviewer.setMotion(nextMotion);
            }
        } catch (error) {
            nextMotionPreviewer.destroy?.();
            nextModelNode.destroy();
            throw error;
        }

        if (operationVersion !== this.operationVersion) {
            nextMotionPreviewer.destroy?.();
            nextModelNode.destroy();
            return;
        }

        this.motionPreviewer?.destroy?.();
        if (this._modelNode) {
            this.scene.removeChild(this._modelNode);
            if (this._modelNode.isValid) {
                this._modelNode.destroy();
            }
        }

        this._modelNode = nextModelNode;
        this._modelNode.parent = this.scene;

        this.motionPreviewer = nextMotionPreviewer;
        this.motionPreview = nextMotion;
        if (pending) {
            this.pendingDesc = null;
            this.active = true;
            this.loadedClips = nextLoadedClips ?? new Map();
            this.time = 0;
            this._evaluate();
        } else {
            this.active = false;
            this.playing = false;
            this.loadedClips = new Map();
        }

        this.cameraComp.enabled = true;
        this.resetCameraView();
    }

    public async showMotion(desc: MotionPreviewDesc): Promise<boolean> {
        const operationVersion = ++this.operationVersion;
        if (!this._modelNode) {
            // 暂无模型：记住描述，等 setModel 后接入；返回 false 表示“等待模型”。
            this.pendingDesc = desc;
            return false;
        }
        this.pendingDesc = null;
        const prepared = await this._prepareMotion(desc);
        if (operationVersion !== this.operationVersion) {
            return false;
        }
        const nextMotionPreviewer = this._createMotionPreviewer(this._modelNode);
        try {
            this._configureMotionPreviewer(nextMotionPreviewer, desc);
            nextMotionPreviewer.setMotion(prepared.motion);
        } catch (error) {
            nextMotionPreviewer.destroy?.();
            throw error;
        }
        if (operationVersion !== this.operationVersion) {
            nextMotionPreviewer.destroy?.();
            return false;
        }
        this.motionPreviewer?.destroy?.();
        this.motionPreviewer = nextMotionPreviewer;
        this.motionPreview = prepared.motion;
        this.loadedClips = prepared.loadedClips;
        this.active = true;
        this.time = 0;
        this.lastPlayTick = Date.now();
        this.lastExternalTimeAt = Date.now();
        this._evaluate();
        return true;
    }

    public async hideMotionPreview(): Promise<void> {
        ++this.operationVersion;
        this.pendingDesc = null;
        this.active = false;
        await this.pauseMotionPreview();
        if (this.motionPreviewer) {
            this.motionPreviewer.destroy?.();
            this.motionPreviewer = null;
        }
        this.motionPreview = null;
        this.hide();
    }

    public async playMotionPreview(): Promise<void> {
        if (!this.active) {
            return;
        }
        this.playing = true;
        this.lastPlayTick = Date.now();
        this.lastExternalTimeAt = Date.now();
        this._evaluate();
    }

    public async pauseMotionPreview(): Promise<void> {
        this.playing = false;
    }

    public async stopMotionPreview(): Promise<void> {
        this.playing = false;
        this.time = 0;
        this.lastExternalTimeAt = Date.now();
        this._evaluate();
    }

    public async setTimeMotionPreview(time: number): Promise<void> {
        this.time = Math.max(0, time);
        this.lastPlayTick = Date.now();
        this.lastExternalTimeAt = Date.now();
        this._evaluate();
    }

    /**
     * 更新预览变量。变量实例由业务方随描述下发（静态值）或经本方法注入
     * MotionPreviewer（等价于引擎 updateVariable 语义）。
     */
    public async setMotionPreviewVariable(name: string, value: number): Promise<void> {
        if (!this.motionPreviewer) {
            throw new Error('Motion preview is not active.');
        }
        this.motionPreviewer.updateVariable(name, value);
        this._evaluate();
    }

    /** 设置预览中 Blend Motion 的临时参数值，不回写任何资产。 */
    public async setMotionPreviewParameter(axis: 'value' | 'x' | 'y', value: number): Promise<void> {
        if (!this.motionPreview || !Number.isFinite(value)) {
            throw new Error('Motion preview parameter cannot be changed before a valid preview is active.');
        }
        const api = getNewGenAnim();
        if (this.motionPreview instanceof api.AnimationBlend1D && axis === 'value') {
            this.motionPreview.param.value = value;
        } else if (this.motionPreview instanceof api.AnimationBlend2D) {
            if (axis === 'x') {
                this.motionPreview.paramX.value = value;
            } else if (axis === 'y') {
                this.motionPreview.paramY.value = value;
            } else {
                throw new Error(`Motion preview parameter axis '${axis}' is not valid for Blend 2D.`);
            }
        } else {
            throw new Error(`Motion preview parameter axis '${axis}' is not valid for this Motion.`);
        }
        this._evaluate();
    }

    public getMotionPreviewTimelineStats(): { timeLineLength: number } | null {
        return this.motionPreviewer?.timelineStats ?? null;
    }

    public resetCameraView(): void {
        if (this._modelNode) {
            this.resetCamera(this._modelNode);
            this.perfectCameraView(getBoundaryOfMeshNodes([this._modelNode]));
        }
    }

    public async queryPreviewData(info: { width: number; height: number }) {
        if (this.playing && this.active && Date.now() - this.lastExternalTimeAt > 500) {
            // Headless 兜底：Inspector 以外的消费者（MCP/CLI）只轮询取帧、不下发 setTime，
            // 由场景进程按 wall-clock 推进；高频下发 setTime 的调用方存在时跳过，
            // 避免两边各推进一次造成双倍播放速度。
            const now = Date.now();
            const delta = Math.max(0, (now - this.lastPlayTick) / 1000);
            this.lastPlayTick = now;
            if (delta > 0) {
                this.time += delta;
                this._evaluate();
            }
        }
        return super.queryPreviewData(info);
    }

    /** 先完成所有资源加载，再创建 Motion，避免失败时破坏当前可用预览。 */
    private async _prepareMotion(desc: MotionPreviewDesc): Promise<{ motion: any; loadedClips: Map<string, any> }> {
        if (!desc?.motion) {
            throw new Error(`Motion preview desc is empty, nothing to show.`);
        }

        const loadedClips = new Map<string, any>();
        await Promise.all(
            Array.from(new Set(collectClipUuids(desc.motion)))
                .filter(Boolean)
                .map(async (clipUuid) => {
                    loadedClips.set(clipUuid, await loadPreviewAsset(clipUuid, 'animation-clip'));
                }),
        );

        return {
            motion: this._buildMotion(desc.motion, loadedClips),
            loadedClips,
        };
    }

    private _createMotionPreviewer(modelNode: Node): any {
        const { MotionPreviewer } = getNewGenAnim();
        if (!MotionPreviewer) {
            throw new Error('MotionPreviewer is not available in the engine module.');
        }
        return new MotionPreviewer(modelNode);
    }

    private _configureMotionPreviewer(previewer: any, desc: MotionPreviewDesc): void {
        const api = getNewGenAnim();
        for (const variable of desc.variables ?? []) {
            if (!variable.name) {
                continue;
            }
            const value = typeof variable.value === 'number' && Number.isFinite(variable.value) ? variable.value : 0;
            const description = api.createVariable(api.VariableType.FLOAT, value);
            previewer.addVariable(variable.name, description);
        }
    }

    private _buildMotion(node: MotionPreviewDescNode | null | undefined, loadedClips: Map<string, any>): any {
        const api = getNewGenAnim();
        if (!node) {
            return null;
        }
        switch (node.kind) {
        case 'clip': {
            const clipMotion = new api.ClipMotion();
            if (node.clipUuid) {
                clipMotion.clip = loadedClips.get(node.clipUuid) ?? null;
            }
            return clipMotion;
        }
        case 'blend-1d': {
            const blend = new api.AnimationBlend1D();
            blend.param.value = node.value;
            blend.param.variable = node.variable ?? '';
            blend.items = (node.children ?? []).map((child) => {
                const item = new api.AnimationBlend1D.Item();
                item.motion = this._buildMotion(child.motion, loadedClips);
                item.threshold = child.threshold;
                return item;
            });
            return blend;
        }
        case 'blend-2d': {
            const blend = new api.AnimationBlend2D();
            blend.paramX.value = node.valueX;
            blend.paramX.variable = node.variableX ?? '';
            blend.paramY.value = node.valueY;
            blend.paramY.variable = node.variableY ?? '';
            if (typeof node.algorithm === 'number') {
                blend.algorithm = node.algorithm;
            }
            blend.items = (node.children ?? []).map((child) => {
                const item = new api.AnimationBlend2D.Item();
                item.motion = this._buildMotion(child.motion, loadedClips);
                item.threshold.set(child.threshold.x, child.threshold.y);
                return item;
            });
            return blend;
        }
        case 'blend-direct': {
            const blend = new api.AnimationBlendDirect();
            blend.items = (node.children ?? []).map((child) => {
                const item = new api.AnimationBlendDirect.Item();
                item.motion = this._buildMotion(child.motion, loadedClips);
                item.weight.value = child.weight;
                item.weight.variable = '';
                return item;
            });
            return blend;
        }
        default:
            return null;
        }
    }

    private _evaluate(): void {
        if (!this.motionPreviewer) {
            return;
        }
        this.motionPreviewer.setTime(this.time);
        this.motionPreviewer.evaluate();
    }

    private async _resolvePrefabUuid(uuid: string): Promise<string | null> {
        const assetInfo = await Rpc.getInstance().request('assetManager', 'queryAssetInfo', [uuid, ['subAssets']]);
        if (assetInfo?.type === 'cc.Prefab') {
            return assetInfo.uuid || uuid;
        }
        for (const sub of Object.values(assetInfo?.subAssets || {})) {
            if (sub?.type === 'cc.Prefab' || sub?.importer === 'gltf-scene') {
                return sub.uuid;
            }
        }
        return null;
    }
}

/**
 * 收集 Motion 描述递归引用到的全部动画剪辑 uuid，供预览前并行加载。
 */
function collectClipUuids(node: MotionPreviewDescNode | null | undefined, out: string[] = []): string[] {
    if (!node) {
        return out;
    }
    if (node.kind === 'clip') {
        if (node.clipUuid) {
            out.push(node.clipUuid);
        }
        return out;
    }
    for (const child of node.children) {
        collectClipUuids(child.motion, out);
    }
    return out;
}
