import { Scene, Component, Node, Prefab, instantiate, find } from 'cc';
import { ICreateOptions, IEditorTarget, type INode, IPrefab } from '../../../common';
import { Rpc } from '../../rpc';
import { editorPrefabUtils } from '../prefab/prefab-editor-utils';
import { BaseEditor } from './base-editor';
import { sceneUtils } from '../scene/utils';
import { Service } from '../core';

import type { IAssetInfo } from '../../../../assets/@types/public';

/**
 * PrefabEditor - 预制体编辑器
 * 继承 BaseEditor，实现预制体相关的具体操作
 */
export class PrefabEditor extends BaseEditor {

    private virtualScene: Scene | null = null;

    async encode(entity?: IEditorTarget | null): Promise<IPrefab> {
        entity = entity ?? this.entity;
        if (!entity) {
            throw new Error('encode 失败，没有打开预制体');
        }
        return {
            ...entity.identifier,
            name: entity.instance.name,
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

    async open(asset: IAssetInfo): Promise<IPrefab> {
        // 获取预制体标识符
        const identifier = this.getIdentifier(asset);
        // 加载预制体资源
        this.virtualScene = await sceneUtils.runScene(new Scene(`virtual-scene-${asset.uuid}`));
        const prefabAsset = await sceneUtils.loadAny<Prefab>(identifier.assetUuid);

        // 实例化预制体
        const instance = instantiate(prefabAsset);
        this.virtualScene.addChild(instance);

        // 设置当前打开的预制体
        this.setCurrentOpen({
            identifier,
            instance
        });

        return this.encode();
    }

    async close(): Promise<boolean> {
        if (!this.entity) {
            throw new Error('没有打开预制体');
        }
        await this.save();
        await sceneUtils.runScene(new Scene(''));
        this.setCurrentOpen(null);
        return true;
    }

    async save(): Promise<IAssetInfo> {
        if (!this.entity) {
            throw new Error('没有打开预制体');
        }
        // 序列化预制体数据
        const serializedData = editorPrefabUtils.serialize(this.entity.instance);
        // 保存到磁盘
        return await Rpc.getInstance().request('assetManager', 'saveAsset', [this.entity.identifier.assetUuid, serializedData]);
    }

    async reload(): Promise<IPrefab> {
        if (!this.entity || !this.virtualScene) {
            throw new Error('没有打开预制体');
        }

        const prefabName = this.entity.instance.name;
        const prefabUUIDMap = editorPrefabUtils.storePrefabUUID(this.virtualScene);
        const sceneAsset = editorPrefabUtils.generateSceneAsset(this.virtualScene, this.getRootNode());
        const json = EditorExtends.serialize(sceneAsset);
        this.virtualScene = await sceneUtils.runSceneImmediateByJson(json);
        editorPrefabUtils.removePrefabInstanceRoots(this.virtualScene);
        editorPrefabUtils.restorePrefabUUID(this.virtualScene, prefabUUIDMap);
        this.entity.instance = find(prefabName) as Node;
        Prefab._utils.applyTargetOverrides(this.entity.instance);

        return this.encode();
    }

    async create(params: ICreateOptions): Promise<IPrefab> {
        const { targetDirectory, baseName, hasOpen } = params;
        try {
            const assetInfo = await Rpc.getInstance().request('assetManager', 'createAssetByType', [
                'prefab',
                targetDirectory,
                baseName
            ]);
            if (!assetInfo) {
                throw new Error('创建预制体资源失败');
            }

            if (hasOpen) {
                return await this.open(assetInfo);
            } else {
                const prefabAsset = await sceneUtils.loadAny<Prefab>(assetInfo.uuid);
                return this.encode({
                    identifier: this.getIdentifier(assetInfo),
                    instance: instantiate(prefabAsset),
                });
            }
        } catch (error) {
            console.error('创建预制体失败:', error);
            throw error;
        }
    }
}