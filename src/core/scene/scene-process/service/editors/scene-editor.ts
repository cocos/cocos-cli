import { Scene, SceneAsset } from 'cc';
import { type IBaseIdentifier, ICreateOptions, IEditorTarget, IScene, INodeDumpOptions } from '../../../common';
import { Rpc } from '../../rpc';
import { sceneUtils } from '../scene/utils';
import { BaseEditor } from './base-editor';

import type { IAssetInfo } from '../../../../assets/@types/public';
import { editorPrefabUtils } from '../prefab/prefab-editor-utils';

/**
 * SceneEditor - 场景编辑器
 * 继承 BaseEditor，实现场景相关的具体操作
 */
export class SceneEditor extends BaseEditor {

    async encode(entity?: IEditorTarget | null, options?: INodeDumpOptions): Promise<IScene> {
        entity = entity ?? this.entity;
        if (!entity) {
            throw new Error('encode 失败，没有打开场景');
        }
        const scene = sceneUtils.generateNodeDump(entity.instance, options) as IScene;
        const d = scene as any;
        d.__identifier__ = entity.identifier;
        return scene;
    }

    protected async _doOpen(asset: IAssetInfo, options?: INodeDumpOptions): Promise<IScene> {
        const identifier = this.getIdentifier(asset);

        if (this.entity?.identifier.assetUuid === identifier.assetUuid) {
            return await this.encode(undefined, options);
        }

        const sceneAsset = await sceneUtils.loadAny<SceneAsset>(identifier.assetUuid);
        const instance = await sceneUtils.runScene(sceneAsset);

        this.setCurrentOpen({
            instance,
            identifier,
        });

        return this.encode(undefined, options);
    }

    async close(options?: { save?: boolean }): Promise<boolean> {
        if (!this.entity) {
            throw new Error('[close] 没有打开场景');
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
            throw new Error('[save] 没有打开场景');
        }
        return this.saveToAsset(this.entity.identifier.assetUuid);
    }

    async saveTo(asset: IAssetInfo): Promise<IAssetInfo> {
        return this.saveToAsset(asset.uuid);
    }

    private async saveToAsset(assetUuid: string): Promise<IAssetInfo> {
        if (!this.entity) {
            throw new Error('[save] 没有打开场景');
        }
        const serializedData = sceneUtils.serialize(this.entity.instance as Scene);
        const saved = await Rpc.getInstance().request('assetManager', 'saveAsset', [assetUuid, serializedData]);
        if (!saved || saved.uuid !== assetUuid) {
            throw new Error(`保存目标资源标识不一致: 期望 ${assetUuid}，实际 ${saved?.uuid ?? 'undefined'}`);
        }
        this.entity.identifier = this.getIdentifier(saved);
        return saved;
    }

    protected async _doReload(): Promise<IScene> {
        if (!this.entity) {
            throw new Error('[reload] 没有打开场景');
        }
        const scene = this.entity.instance as Scene;
        const prefabUUIDMap = editorPrefabUtils.storePrefabUUID(scene);
        const serializeJSON = sceneUtils.serialize(scene);
        const sceneAfterLoad = await sceneUtils.runSceneImmediateByJson(serializeJSON);
        editorPrefabUtils.restorePrefabUUID(sceneAfterLoad, prefabUUIDMap);
        this.entity.instance = sceneAfterLoad;
        return this.encode(undefined, this._lastOpenOptions);
    }

    async create(params: ICreateOptions): Promise<IBaseIdentifier> {
        const { baseName, targetDirectory, templateType = '2d' } = params;

        try {
            // 创建场景资源
            const assetInfo = await Rpc.getInstance().request('assetManager', 'createAssetByType', [
                'scene',
                targetDirectory,
                baseName,
                { templateName: templateType }
            ]);

            if (!assetInfo) {
                throw new Error('创建场景资源失败');
            }

            return this.getIdentifier(assetInfo) as IBaseIdentifier;
        } catch (error) {
            console.error('创建场景失败:', error);
            throw error;
        }
    }
}
