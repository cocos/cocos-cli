import { Scene, SceneAsset, Component, Node } from 'cc';
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
        const serializedData = sceneUtils.serialize(this.entity.instance as Scene);
        return await Rpc.getInstance().request('assetManager', 'saveAsset', [this.entity.identifier.assetUuid, serializedData]);
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
