import cc from 'cc';
import { BaseService, register, Service } from './core';
import {
    ICloseOptions,
    ICreateOptions,
    IEditorEvents,
    IEditorService,
    IOpenOptions,
    IPrefab,
    IReloadOptions,
    ISaveOptions,
    IScene,
} from '../../common';
import { PrefabEditor, SceneEditor } from './editors';
import { Rpc } from '../rpc';
import { IAssetInfo } from '../../../assets/@types/public';

/**
 * EditorAsset - 统一的编辑器管理入口
 * 作为调度器，根据资源类型动态创建和管理编辑器实例
 */
@register('Editor')
export class EditorService extends BaseService<IEditorEvents> implements IEditorService {
    private currentEditorUuid: string | null = null; // 当前打开的编辑器 UUID
    private editorMap: Map<string, SceneEditor | PrefabEditor> = new Map(); // uuid -> editor

    /**
     * 当前编辑的类型
     */
    public getCurrentEditorType(): 'scene' | 'prefab' | 'unknown' {
        const editor = this.currentEditorUuid && this.editorMap.get(this.currentEditorUuid);
        if (editor instanceof SceneEditor) {
            return 'scene';
        } else if (editor instanceof PrefabEditor) {
            return 'prefab';
        }
        return 'unknown';
    }

    /**
     * 根据资源类型创建对应的编辑器
     */
    private createEditor(type: string): SceneEditor | PrefabEditor {
        switch (type) {
            case 'scene':
            case 'cc.SceneAsset':
                return new SceneEditor();
            case 'prefab':
            case 'cc.Prefab':
                return new PrefabEditor();
            default:
                throw new Error(`不支持的资源类型: ${type}`);
        }
    }

    async queryCurrent(): Promise<IScene | IPrefab | null> {
        const editor = this.currentEditorUuid && this.editorMap.get(this.currentEditorUuid);
        return editor ? await editor.encode() : null;
    }

    getRootNode(): cc.Scene | cc.Node | null {
        const editor = this.currentEditorUuid && this.editorMap.get(this.currentEditorUuid);
        return editor ? editor.getRootNode() : null;
    }

    async open(params: IOpenOptions): Promise<IScene | IPrefab> {
        const { urlOrUUID } = params;

        const assetInfo = await Rpc.getInstance().request('assetManager', 'queryAssetInfo', [urlOrUUID]);
        if (!assetInfo) {
            throw new Error(`通过 ${urlOrUUID} 无法打开`);
        }

        const uuid = assetInfo.uuid;
        // 检查是否已经有对应的编辑器实例
        let editor = this.editorMap.get(uuid);
        if (!editor) {
            editor = this.createEditor(assetInfo.type);
            this.editorMap.set(uuid, editor);
        }

        const lastEditor = this.currentEditorUuid && this.editorMap.get(this.currentEditorUuid);
        if (lastEditor) {
            await lastEditor.close();
        }
        // 设置当前打开的编辑器
        this.currentEditorUuid = assetInfo.uuid;
        const encode = await editor.open(assetInfo);

        this.emit('editor:open');
        return encode;
    }

    async close(params: ICloseOptions): Promise<boolean> {
        const urlOrUUID = params.urlOrUUID ?? this.currentEditorUuid;
        try {
            if (!urlOrUUID) {
                throw new Error('当前没有打开任何编辑器');
            }

            const assetInfo = await Rpc.getInstance().request('assetManager', 'queryAssetInfo', [urlOrUUID]);
            if (!assetInfo) {
                throw new Error(`通过 ${urlOrUUID} 请求资源失败`);
            }

            const uuid = assetInfo.uuid;
            const editor = this.editorMap.get(uuid);
            if (!editor) {
                throw new Error(`当前没有打开任何编辑器`);
            }

            const result = await editor.close();

            // 如果关闭的是当前打开的编辑器，清除当前状态
            if (uuid === this.currentEditorUuid) {
                this.currentEditorUuid = null;
            }

            // 移除编辑器实例以释放内存
            this.editorMap.delete(uuid);

            this.emit('editor:close');
            return result;
        } catch (error) {
            console.error(`关闭失败: [${urlOrUUID}]`, error);
            throw error;
        }
    }

    async save(params: ISaveOptions): Promise<IAssetInfo> {
        const urlOrUUID = params.urlOrUUID ?? this.currentEditorUuid;
        try {
            if (!urlOrUUID) {
                throw new Error('当前没有打开任何编辑器');
            }

            const assetInfo = await Rpc.getInstance().request('assetManager', 'queryAssetInfo', [urlOrUUID]);
            if (!assetInfo) {
                throw new Error(`通过 ${urlOrUUID} 请求资源失败`);
            }

            const uuid = assetInfo.uuid;
            const editor = this.editorMap.get(uuid);
            if (!editor) {
                throw new Error(`当前没有打开任何编辑器`);
            }

            const result = await editor.save();

            this.emit('editor:save');

            return result;
        } catch (error) {
            console.error(`保存失败: [${urlOrUUID}]`, error);
            throw error;
        }
    }

    async reload(params: IReloadOptions): Promise<IScene | IPrefab> {
        const urlOrUUID = params.urlOrUUID ?? this.currentEditorUuid;
        try {
            if (!urlOrUUID) {
                throw new Error('当前没有打开任何编辑器');
            }

            const assetInfo = await Rpc.getInstance().request('assetManager', 'queryAssetInfo', [urlOrUUID]);
            if (!assetInfo) {
                throw new Error(`通过 ${urlOrUUID} 请求资源失败`);
            }

            const uuid = assetInfo.uuid;
            const editor = this.editorMap.get(uuid);
            if (!editor) {
                throw new Error(`当前没有打开任何编辑器`);
            }

            const result = await editor.reload();

            this.emit('editor:reload');
            this.broadcast('editor:reload');
            return result;
        } catch (error) {
            console.error(`重载失败: [${urlOrUUID}]`, error);
            throw error;
        }
    }

    async create(params: ICreateOptions): Promise<IScene | IPrefab> {
        const editor = this.createEditor(params.type);
        if (!editor) {
            throw new Error('不支持该类型资源创建');
        }
        return await editor.create(params);
    }

    onScriptExecutionFinished(): void {
        console.log('[Scene] Script execution-finished');
        const editor = this.currentEditorUuid && this.editorMap.get(this.currentEditorUuid);
        if (!editor) return;

        // releaseAsset 资源，为了让 Prefab 资源能够加载到新的脚本，在脚本更新后需要遍历释放所有的 prefab 资源
        cc.assetManager.assets.forEach((asset: any) => {
            if (asset instanceof cc.Prefab) {
                cc.assetManager.releaseAsset(asset);
            }
        });
        console.log('[Scene] Script suspend soft reload');
        Service.Script.suspend(Promise.resolve(this.reload({})));
    }
}
