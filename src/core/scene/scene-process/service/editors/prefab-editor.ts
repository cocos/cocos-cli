import { Canvas, find, instantiate, Node, Prefab, Scene, UITransform } from 'cc';
import { type IBaseIdentifier, ICreateOptions, IEditorTarget, INode, INodeDumpOptions } from '../../../common';
import { Rpc } from '../../rpc';
import { Service } from '../core';
import { editorPrefabUtils } from '../prefab/prefab-editor-utils';
import type { INodeStructureSnapshot } from '../undo/commands/node-structure-command-utils';
import { BaseEditor } from './base-editor';
import { sceneUtils } from '../scene/utils';
import { createShouldHideInHierarchyCanvasNode } from '../node/node-create';

import type { IAssetInfo } from '../../../../assets/@types/public';

/**
 * PrefabEditor - 预制体编辑器
 * 继承 BaseEditor，实现预制体相关的具体操作
 */
export class PrefabEditor extends BaseEditor {

    private virtualScene: Scene | null = null;
    private _savedPrefabContent: string | null = null;
    private _savedPrefabSnapshot: INodeStructureSnapshot | null = null;
    private _undoGroupId: string | null = null;

    async encode(entity?: IEditorTarget | null, options?: INodeDumpOptions): Promise<INode> {
        entity = entity ?? this.entity;
        if (!entity) {
            throw new Error('encode 失败，没有打开预制体');
        }
        return sceneUtils.generateNodeDump(entity.instance, options) as INode;
    }

    protected async _doOpen(asset: IAssetInfo, options?: INodeDumpOptions): Promise<INode> {
        // 获取预制体标识符
        const identifier = this.getIdentifier(asset);
        // 加载预制体资源
        const virtualScene = new Scene(`virtual-scene-${asset.uuid}`);
        const prefabAsset = await sceneUtils.loadAny<Prefab>(identifier.assetUuid);

        // 实例化预制体
        const instance = instantiate(prefabAsset);
        editorPrefabUtils.preparePrefabRootForEditing(instance);
        await this.mountPrefabInstanceForPreview(virtualScene, instance);
        this.virtualScene = await sceneUtils.runScene(virtualScene);

        // 设置当前打开的预制体
        this.setCurrentOpen({
            identifier,
            instance
        });

        return this.encode(undefined, options);
    }

    async close(options?: { save?: boolean }): Promise<boolean> {
        if (!this.entity) {
            throw new Error('没有打开预制体');
        }
        if (options?.save !== false) {
            await this.save();
        }
        await sceneUtils.runScene(new Scene(''));
        this.setCurrentOpen(null);
        return true;
    }

    async save(): Promise<IAssetInfo> {
        if (!this.entity) {
            throw new Error('没有打开预制体');
        }
        return this.saveSerializedDataToAsset(this.entity.identifier.assetUuid);
    }

    async saveAs(asset: IAssetInfo): Promise<IAssetInfo> {
        return this.saveSerializedDataToAsset(asset.uuid);
    }

    public async beginUndoGroup(): Promise<void> {
        this._savedPrefabContent = this._serializeCurrentPrefab();
        this._savedPrefabSnapshot = await this._captureCurrentPrefabSnapshot();
        this._undoGroupId = Service.Undo?.beginGroup({ label: 'Edit Prefab' }) ?? null;
    }

    private async saveSerializedDataToAsset(assetUuid: string): Promise<IAssetInfo> {
        if (!this.entity) {
            throw new Error('没有打开预制体');
        }
        const serializedData = this._serializeCurrentPrefab();
        const beforeContent = this._savedPrefabContent;
        const beforeSnapshot = this._savedPrefabSnapshot;
        const isRecordingUndo = !!this._undoGroupId;
        const changed = isRecordingUndo && !!beforeContent && beforeContent !== serializedData;
        if (changed) {
            this._preserveUndoHistoryForPrefabReload(assetUuid);
        }

        let saved: IAssetInfo;
        try {
            saved = await Rpc.getInstance().request('assetManager', 'saveAsset', [assetUuid, serializedData]);
        } catch (error) {
            if (changed) {
                this._cancelPreservedUndoHistoryForPrefabReload(assetUuid);
            }
            this._finishUndoGroup();
            if (isRecordingUndo) {
                await this.beginUndoGroup();
            }
            throw error;
        }
        if (!saved || saved.uuid !== assetUuid) {
            throw new Error(`保存目标资源标识不一致: 期望 ${assetUuid}，实际 ${saved?.uuid ?? 'undefined'}`);
        }
        const afterSnapshot = changed ? await this._captureCurrentPrefabSnapshot() : null;
        if (changed && beforeSnapshot && afterSnapshot) {
            const { PrefabApplyCommand } = await import('../undo/commands/prefab-apply-command');
            Service.Undo?.push(new PrefabApplyCommand(
                'prefab:edit',
                'Edit Prefab',
                beforeSnapshot,
                afterSnapshot,
                assetUuid,
                assetUuid,
                beforeContent,
                serializedData,
            ));
        }
        this._savedPrefabContent = serializedData;
        this._savedPrefabSnapshot = afterSnapshot ?? beforeSnapshot;
        this._finishUndoGroup();
        if (isRecordingUndo) {
            await this.beginUndoGroup();
        }
        return saved;
    }

    private _serializeCurrentPrefab(): string {
        if (!this.entity) {
            throw new Error('No prefab is open.');
        }
        return editorPrefabUtils.serialize(this.entity.instance);
    }

    private async _captureCurrentPrefabSnapshot(): Promise<INodeStructureSnapshot | null> {
        if (!this.entity) {
            return null;
        }
        const { captureNodeStructureSnapshot } = await import('../undo/commands/node-structure-command-utils');
        return captureNodeStructureSnapshot(this.entity.instance, '', { serialization: 'prefab' });
    }

    private _finishUndoGroup(): void {
        if (this._undoGroupId) {
            Service.Undo?.endGroup(this._undoGroupId);
            this._undoGroupId = null;
        }
    }

    private _preserveUndoHistoryForPrefabReload(assetUuid: string): void {
        const prefabService = Service.Prefab as unknown as {
            preserveUndoHistoryForPrefabReload?: (uuid: string) => void;
        };
        prefabService.preserveUndoHistoryForPrefabReload?.(assetUuid);
    }

    private _cancelPreservedUndoHistoryForPrefabReload(assetUuid: string): void {
        const prefabService = Service.Prefab as unknown as {
            cancelPreserveUndoHistoryForPrefabReload?: (uuid: string) => void;
        };
        prefabService.cancelPreserveUndoHistoryForPrefabReload?.(assetUuid);
    }

    protected async _doReload(): Promise<INode> {
        if (!this.entity || !this.virtualScene) {
            throw new Error('没有打开预制体');
        }

        const prefabName = this.entity.instance.name;
        const prefabUuid = this.entity.instance.uuid;
        const prefabUUIDMap = editorPrefabUtils.storePrefabUUID(this.virtualScene);
        const sceneAsset = editorPrefabUtils.generateSceneAsset(this.virtualScene, this.getRootNode());
        const json = EditorExtends.serialize(sceneAsset);
        this.virtualScene = await sceneUtils.runSceneImmediateByJson(json);
        editorPrefabUtils.removePrefabInstanceRoots(this.virtualScene);
        editorPrefabUtils.restorePrefabUUID(this.virtualScene, prefabUUIDMap);
        const instance = EditorExtends.Node.getNode(prefabUuid) as Node | null || find(prefabName) as Node | null;
        if (!instance) {
            throw new Error(`reload 失败，找不到预制体根节点: ${prefabName}`);
        }
        editorPrefabUtils.preparePrefabRootForEditing(instance);
        this.entity.instance = instance;
        Prefab._utils.applyTargetOverrides(this.entity.instance);
        await this.ensurePreviewCanvasForUI(this.entity.instance);
        return this.encode(undefined, this._lastOpenOptions);
    }

    private async mountPrefabInstanceForPreview(scene: Scene, instance: Node): Promise<void> {
        if (!this.shouldUsePreviewCanvas(instance)) {
            scene.addChild(instance);
            return;
        }

        const canvasNode = await createShouldHideInHierarchyCanvasNode(scene);
        instance.parent = canvasNode;
    }

    private async ensurePreviewCanvasForUI(instance: Node): Promise<void> {
        if (!this.virtualScene || !this.shouldUsePreviewCanvas(instance)) {
            return;
        }

        const canvasNode = await createShouldHideInHierarchyCanvasNode(this.virtualScene);
        instance.parent = canvasNode;
    }

    private shouldUsePreviewCanvas(instance: Node): boolean {
        const hasCanvas = Boolean(instance.getComponentInChildren(Canvas));
        if (hasCanvas) {
            return false;
        }

        return instance.getComponentsInChildren(UITransform).length > 0;
    }

    async create(params: ICreateOptions): Promise<IBaseIdentifier> {
        const { targetDirectory, baseName } = params;
        try {
            const assetInfo = await Rpc.getInstance().request('assetManager', 'createAssetByType', [
                'prefab',
                targetDirectory,
                baseName
            ]);
            if (!assetInfo) {
                throw new Error('创建预制体资源失败');
            }

            return this.getIdentifier(assetInfo);
        } catch (error) {
            console.error('创建预制体失败:', error);
            throw error;
        }
    }
}
