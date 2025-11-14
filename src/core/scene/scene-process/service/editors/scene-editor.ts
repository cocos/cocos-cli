import { Scene, SceneAsset, Component, Node } from 'cc';
import { type IBaseIdentifier, ICreateOptions, IEditorTarget, INode, IScene } from '../../../common';
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

    async encode(entity?: IEditorTarget | null): Promise<IScene> {
        entity = entity ?? this.entity;
        if (!entity) {
            throw new Error('encode 失败，没有打开场景');
        }
        return {
            ...entity.identifier,
            name: entity.instance.name,
            prefab: sceneUtils.generatePrefabInfo(entity.instance['_prefab']),
            children: entity.instance.children
                .map((node: Node) => {
                    return sceneUtils.generateNodeInfo(node, true);
                })
                .filter(child => child !== null) as INode[],
            components: entity.instance.components
                .map((component: Component) => {
                    return sceneUtils.generateComponentInfo(component);
                })
        };
    }

    async open(asset: IAssetInfo): Promise<IScene> {
        const identifier = this.getIdentifier(asset);

        if (this.entity?.identifier.assetUuid === identifier.assetUuid) {
            return await this.encode();
        }

        const sceneAsset = await sceneUtils.loadAny<SceneAsset>(identifier.assetUuid);
        const instance = await sceneUtils.runScene(sceneAsset);

        this.setCurrentOpen({
            instance,
            identifier,
        });

        return this.encode();
    }

    async close(): Promise<boolean> {
        if (!this.entity) {
            throw new Error('没有打开场景');
        }
        await this.save();
        await sceneUtils.runScene(new Scene(''));
        this.setCurrentOpen(null);
        return true;
    }

    async save(): Promise<IAssetInfo> {
        if (!this.entity) {
            throw new Error('没有打开场景');
        }
        const serializedData = sceneUtils.serialize(this.entity.instance as Scene);
        return await Rpc.getInstance().request('assetManager', 'saveAsset', [this.entity.identifier.assetUuid, serializedData]);
    }

    protected async _doReload(): Promise<IScene> {
        if (!this.entity) {
            throw new Error('没有打开场景');
        }
        const scene = this.entity.instance as Scene;
        const prefabUUIDMap = editorPrefabUtils.storePrefabUUID(scene);
        const serializeJSON = sceneUtils.serialize(scene);
        const sceneAfterLoad = await sceneUtils.runSceneImmediateByJson(serializeJSON);
        editorPrefabUtils.restorePrefabUUID(sceneAfterLoad, prefabUUIDMap);
        this.entity.instance = sceneAfterLoad;
        return this.encode();
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