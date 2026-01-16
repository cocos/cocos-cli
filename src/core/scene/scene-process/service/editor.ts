import cc from 'cc';
import { BaseService, register, Service } from './core';
import {
    IBaseIdentifier,
    ICloseOptions,
    ICreateOptions,
    IEditorEvents,
    IEditorService,
    INode,
    IOpenOptions,
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
    private needReloadAgain: IReloadOptions | null = null;
    private lastSceneOrNode: IScene | INode | undefined;
    private reloadPromise: Promise<IScene | INode> | null = null;
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
     * 是否打开场景
     */
    public async hasOpen(): Promise<boolean> {
        return this.isOpen;
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

    async queryCurrent(): Promise<IScene | INode | null> {
        const editor = this.currentEditorUuid && this.editorMap.get(this.currentEditorUuid);
        console.log(`current editor: ${this.currentEditorUuid} `);
        return editor ? await editor.encode() : null;
    }

    getRootNode(): cc.Scene | cc.Node | null {
        const editor = this.currentEditorUuid && this.editorMap.get(this.currentEditorUuid);
        return editor ? editor.getRootNode() : null;
    }

    async open(params: IOpenOptions): Promise<IScene | INode> {
        const { urlOrUUID } = params;

        const assetInfo = await Rpc.getInstance().request('assetManager', 'queryAssetInfo', [urlOrUUID]);
        if (!assetInfo) {
            throw new Error(`通过 ${urlOrUUID} 无法打开，查询不到该资源信息`);
        }

        if (this.currentEditorUuid) {
            const currentEditor = this.editorMap.get(this.currentEditorUuid);
            if (currentEditor) {
                try {
                    // 关闭当前场景
                    const assetInfo = await Rpc.getInstance().request('assetManager', 'queryAssetInfo', [this.currentEditorUuid]);
                    if (assetInfo) {
                        await currentEditor.close();
                    }
                } catch (error) {
                    console.error(error);
                } finally {
                    this.editorMap.delete(this.currentEditorUuid);
                }
            }
        }

        const outputDependentInfo = async function (err: any) {
            try {
                const errInfo = err.message || '';
                const regexObj = /^download failed: .*\/([\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12})\.json/i;
                const result = regexObj.exec(errInfo);
                let uuid = '';
                if (result) {
                    uuid = result[1];
                }
                err.message = `The asset ${urlOrUUID} cannot be loaded because a dependent asset is missing: ${uuid}`;
            } catch (error) {
                //
            }
        };

        const uuid = assetInfo.uuid;
        try {
            // 检查是否已经有对应的编辑器实例
            let editor = this.editorMap.get(uuid);
            if (!editor) {
                editor = this.createEditor(assetInfo.type);
                this.editorMap.set(uuid, editor);
            }
            const encode = await editor.open(assetInfo);
            // 设置当前打开的编辑器
            this.currentEditorUuid = assetInfo.uuid;
            this.emit('editor:open');
            this.isOpen = true;
            console.log(`打开 ${assetInfo.url}`);
            return encode;
        } catch (err) {
            await outputDependentInfo(err);
            this.editorMap.delete(uuid);
            console.error(err);
            throw err;
        }
    }

    async close(params: ICloseOptions): Promise<boolean> {
        const urlOrUUID = params.urlOrUUID ?? this.currentEditorUuid;
        try {
            if (!urlOrUUID) return true;

            const assetInfo = await Rpc.getInstance().request('assetManager', 'queryAssetInfo', [urlOrUUID]);
            if (!assetInfo) {
                throw new Error(`通过 ${urlOrUUID} 请求资源失败`);
            }

            const uuid = assetInfo.uuid;
            const editor = this.editorMap.get(uuid);
            if (!editor) return true;

            const result = await editor.close();

            // 如果关闭的是当前打开的编辑器，清除当前状态
            if (uuid === this.currentEditorUuid) {
                this.currentEditorUuid = null;
            }

            // 移除编辑器实例以释放内存
            this.editorMap.delete(uuid);

            this.emit('editor:close');
            this.isOpen = false;
            console.log(`关闭 ${assetInfo.url}`);
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

            console.log(`保存 ${assetInfo.url}`);
            return result;
        } catch (error) {
            console.error(`保存失败: [${urlOrUUID}]`, error);
            throw error;
        }
    }

    async reload(params: IReloadOptions): Promise<boolean> {
        if (this.reloadPromise) {
            this.needReloadAgain = params;
            return false;
        }
        const urlOrUUID = params.urlOrUUID ?? this.currentEditorUuid;
        if (!urlOrUUID) {
            console.warn('当前没有打开任何编辑器');
            return false;
        }

        const assetInfo = await Rpc.getInstance().request('assetManager', 'queryAssetInfo', [urlOrUUID]);
        if (!assetInfo) {
            console.warn(`通过 ${urlOrUUID} 请求资源失败`);
            return false;
        }

        const editor = this.editorMap.get(assetInfo.uuid);
        if (!editor) {
            console.warn(`当前没有打开任何编辑器`);
            return false;
        }

        try {
            await editor.reload();

            if (this.needReloadAgain) {
                this.reload(this.needReloadAgain);
                this.needReloadAgain = null;
            }

            this.emit('editor:reload');
            this.broadcast('editor:reload');
            console.log(`重载 ${assetInfo.url}`);
            return true;
        } catch (error) {
            console.error(error);
            return false;
        }
    }

    async create(params: ICreateOptions): Promise<IBaseIdentifier> {
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
