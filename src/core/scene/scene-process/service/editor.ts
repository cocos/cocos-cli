import cc from 'cc';
import { BaseService, register, Service } from './core';
import { InternalServiceEvents } from './core/internal-events';
import {
    IBaseIdentifier,
    ICloseOptions,
    ICreateOptions,
    IEditorEvents,
    IEditorService,
    IOpenOptions,
    IReloadOptions,
    ISaveOptions,
    ReloadResult,
    TEditorEntity,
} from '../../common';
import { PrefabEditor, SceneEditor } from './editors';
import { IAssetInfo } from '../../../assets/@types/public';
import { Rpc } from '../rpc';
import { enrichMissingDependencyError } from './error-utils';
import type { IEditorSessionService, IEditorSessionSnapshot } from './core/editor-session';

/**
 * EditorAsset - 统一的编辑器管理入口
 * 作为调度器，根据资源类型动态创建和管理编辑器实例
 */
@register('Editor')
export class EditorService extends BaseService<IEditorEvents> implements IEditorService, IEditorSessionService {
    private needReloadAgain: IReloadOptions | null = null;
    private lastSceneOrNode: TEditorEntity | undefined;
    private reloadPromise: Promise<TEditorEntity> | null = null;
    private currentEditorUuid: string | null = null; // 当前打开的编辑器 UUID
    private editorMap: Map<string, SceneEditor | PrefabEditor> = new Map(); // uuid -> editor

    private lockCount = 0;
    private lockPromise: Promise<void> | null = null;
    private lockResolve: (() => void) | null = null;
    private _isReloading = false;
    private lifecyclePromise: Promise<void> = Promise.resolve();
    private editorSessionGeneration = 0;

    public async lock() {
        if (this.reloadPromise) {
            await this.reloadPromise;
        }
        this.lockCount++;
        if (this.lockCount === 1) {
            this.lockPromise = new Promise((resolve) => {
                this.lockResolve = resolve;
            });
        }
    }

    public unlock() {
        this.lockCount--;
        if (this.lockCount === 0) {
            this.lockResolve?.();
            this.lockPromise = null;
            this.lockResolve = null;
        }
    }

    async waitLocks() {
        if (this.lockPromise) {
            await this.lockPromise;
        }
    }

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

    public getCurrentEditorUuid(): string | null {
        return this.currentEditorUuid;
    }

    public getEditorSession(): IEditorSessionSnapshot {
        return {
            uuid: this.currentEditorUuid,
            generation: this.editorSessionGeneration,
        };
    }

    public isCurrentEditorSession(session: IEditorSessionSnapshot): boolean {
        return session.generation === this.editorSessionGeneration
            && session.uuid === this.currentEditorUuid
            && this.isOpen;
    }

    private invalidateEditorSession(): void {
        this.editorSessionGeneration++;
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

    async queryCurrent(): Promise<TEditorEntity | null> {
        const editor = this.currentEditorUuid && this.editorMap.get(this.currentEditorUuid);
        console.log(`current editor: ${this.currentEditorUuid} `);
        return editor ? await editor.encode() : null;
    }

    getRootNode(): cc.Scene | cc.Node | null {
        const editor = this.currentEditorUuid && this.editorMap.get(this.currentEditorUuid);
        return editor ? editor.getRootNode() : null;
    }

    async open(params: IOpenOptions): Promise<TEditorEntity> {
        return this.runLifecycle(() => this.openUnlocked(params));
    }

    private async openUnlocked(params: IOpenOptions): Promise<TEditorEntity> {
        const { urlOrUUID } = params;

        const assetInfo = await Rpc.getInstance().request('assetManager', 'queryAssetInfo', [urlOrUUID]);
        if (!assetInfo) {
            throw new Error(`通过 ${urlOrUUID} 无法打开，查询不到该资源信息`);
        }

        const currentEditorUuid = this.currentEditorUuid;
        if (currentEditorUuid) {
            const currentEditor = this.editorMap.get(currentEditorUuid);
            if (currentEditor) {
                this.invalidateEditorSession();
                try {
                    const currentAssetInfo = await Rpc.getInstance().request('assetManager', 'queryAssetInfo', [currentEditorUuid]);
                    await currentEditor.close({ save: Boolean(currentAssetInfo) });
                } catch (error) {
                    console.error(error);
                    throw error;
                }
                this.editorMap.delete(currentEditorUuid);
                if (this.currentEditorUuid === currentEditorUuid) {
                    this.currentEditorUuid = null;
                    this.isOpen = false;
                }
                this.emitInternal(InternalServiceEvents.EditorDisposed);
            } else {
                this.invalidateEditorSession();
                this.currentEditorUuid = null;
                this.isOpen = false;
            }
        }

        const outputDependentInfo = async (err: any) => {
            try {
                const rpc = Rpc.getInstance();
                err.message = await enrichMissingDependencyError(err.message || '', urlOrUUID,
                    (uuid) => rpc.request('assetManager', 'queryAssetInfo', [uuid]),
                    (mainUuid, subId) => rpc.request('assetManager', 'querySubAssetName', [mainUuid, subId]),
                );
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
            const encode = await editor.open(assetInfo, params);

            this._clearUndoHistory();

            // 设置当前打开的编辑器
            this.currentEditorUuid = assetInfo.uuid;
            this.invalidateEditorSession();
            this.emit('editor:open', cc.director.getScene());
            this.isOpen = true;
            console.log(`打开 ${assetInfo.url}`);
            return encode;
        } catch (err) {
            await outputDependentInfo(err);
            this.editorMap.delete(uuid);
            if (this.currentEditorUuid === uuid) {
                this.currentEditorUuid = null;
                this.isOpen = false;
            }
            console.error(err);
            throw err;
        }
    }

    async close(params: ICloseOptions): Promise<boolean> {
        return this.runLifecycle(() => this.closeUnlocked(params));
    }

    private async closeUnlocked(params: ICloseOptions): Promise<boolean> {
        const urlOrUUID = params.urlOrUUID ?? this.currentEditorUuid;
        try {
            const currentEditorUuid = this.currentEditorUuid;
            if (!urlOrUUID || !currentEditorUuid) return true;

            const assetInfo = await Rpc.getInstance().request('assetManager', 'queryAssetInfo', [urlOrUUID]);
            const editor = assetInfo
                ? this.editorMap.get(assetInfo.uuid)
                : params.allowDeletedSourceFallback && params.expectedCurrentUuid === currentEditorUuid
                    ? this.editorMap.get(currentEditorUuid)
                    : undefined;
            if (!editor) {
                if (!assetInfo) {
                    throw new Error(`通过 ${urlOrUUID} 请求资源失败`);
                }
                return true;
            }

            this.invalidateEditorSession();
            const result = await editor.close({ save: params.save ?? true });

            if (editor === this.editorMap.get(currentEditorUuid)) {
                this._clearUndoHistory();
                this.currentEditorUuid = null;
            }
            for (const [uuid, candidate] of this.editorMap) {
                if (candidate === editor) {
                    this.editorMap.delete(uuid);
                }
            }

            this.emit('editor:close');
            // 真正关闭编辑器时的会话清理边界；重载只复用内容卸载/挂载边界。
            this.emitInternal(InternalServiceEvents.EditorDisposed);
            this.isOpen = false;
            console.log(`关闭 ${assetInfo?.url ?? urlOrUUID}`);
            return result;
        } catch (error) {
            console.error(`关闭失败: [${urlOrUUID}]`, error);
            throw error;
        }
    }

    async save(params: ISaveOptions): Promise<IAssetInfo> {
        return this.runLifecycle(() => this.saveUnlocked(params));
    }

    async saveAs(params: ISaveOptions): Promise<IAssetInfo> {
        return this.runLifecycle(() => this.saveAsUnlocked(params));
    }

    private async saveUnlocked(params: ISaveOptions): Promise<IAssetInfo> {
        const urlOrUUID = params.urlOrUUID ?? this.currentEditorUuid;
        try {
            const { assetInfo, currentEditorUuid, editor } = await this.resolveSaveTarget(urlOrUUID);
            const result = assetInfo.uuid === currentEditorUuid
                ? await editor.save()
                : await this.recoverDeletedSourceTo(assetInfo, currentEditorUuid, editor);
            this.assertSavedTarget(result, assetInfo);

            this._markUndoSaved();

            this.emit('editor:save');
            console.log(`保存 ${assetInfo.url}`);
            return result;
        } catch (error) {
            console.error(`保存失败: [${urlOrUUID}]`, error);
            throw error;
        }
    }

    private async recoverDeletedSourceTo(assetInfo: IAssetInfo, currentEditorUuid: string, editor: SceneEditor | PrefabEditor): Promise<IAssetInfo> {
        const currentAssetInfo = await Rpc.getInstance().request('assetManager', 'queryAssetInfo', [currentEditorUuid]);
        if (currentAssetInfo) {
            throw new Error(`不能保存到非当前资源 ${assetInfo.url}，请使用另存为`);
        }

        const result = await editor.saveAs(assetInfo);
        this.assertSavedTarget(result, assetInfo);
        await this.openUnlocked({ urlOrUUID: result.uuid });
        return result;
    }

    private async saveAsUnlocked(params: ISaveOptions): Promise<IAssetInfo> {
        const urlOrUUID = params.urlOrUUID;
        if (!urlOrUUID) {
            throw new Error('另存为需要指定目标资源');
        }
        try {
            const { assetInfo, editor } = await this.resolveSaveTarget(urlOrUUID);
            const result = await editor.saveAs(assetInfo);
            this.assertSavedTarget(result, assetInfo);
            console.log(`另存为 ${assetInfo.url}`);
            return result;
        } catch (error) {
            console.error(`另存为失败: [${urlOrUUID}]`, error);
            throw error;
        }
    }

    private async resolveSaveTarget(urlOrUUID: string | null | undefined): Promise<{ assetInfo: IAssetInfo; currentEditorUuid: string; editor: SceneEditor | PrefabEditor }> {
        const currentEditorUuid = this.currentEditorUuid;
        if (!urlOrUUID || !currentEditorUuid) {
            throw new Error('当前没有打开任何编辑器');
        }

        const assetInfo = await Rpc.getInstance().request('assetManager', 'queryAssetInfo', [urlOrUUID]);
        if (!assetInfo) {
            throw new Error(`通过 ${urlOrUUID} 请求资源失败`);
        }

        const editor = this.editorMap.get(currentEditorUuid);
        if (!editor) {
            throw new Error('当前没有打开任何编辑器');
        }
        if (!this.isSaveTargetCompatible(editor, assetInfo.type)) {
            throw new Error(`不能将 ${editor instanceof SceneEditor ? 'scene' : 'prefab'} 保存到 ${assetInfo.type} 资源`);
        }

        return { assetInfo, currentEditorUuid, editor };
    }

    private assertSavedTarget(result: IAssetInfo, target: IAssetInfo): void {
        if (result.uuid !== target.uuid) {
            throw new Error(`保存目标资源标识不一致: 期望 ${target.uuid}，实际 ${result.uuid}`);
        }
    }

    private isSaveTargetCompatible(editor: SceneEditor | PrefabEditor, targetType: string): boolean {
        if (editor instanceof SceneEditor) {
            return targetType === 'scene' || targetType === 'cc.SceneAsset';
        }
        return targetType === 'prefab' || targetType === 'cc.Prefab';
    }

    async reload(params: IReloadOptions): Promise<ReloadResult> {
        return this.runLifecycle(() => this.reloadUnlocked(params));
    }

    public async reloadForSession(params: IReloadOptions, session: IEditorSessionSnapshot): Promise<ReloadResult> {
        return this.runLifecycle(async () => {
            if (!this.isCurrentEditorSession(session)) {
                return ReloadResult.EDITOR_NOT_FOUND;
            }
            return this.reloadUnlocked(params);
        });
    }

    private async reloadUnlocked(params: IReloadOptions): Promise<ReloadResult> {
        if (this._isReloading) {
            this.needReloadAgain = params;
            return ReloadResult.QUEUED;
        }
        this._isReloading = true;

        try {
            const urlOrUUID = params.urlOrUUID ?? this.currentEditorUuid;
            if (!urlOrUUID) {
                console.warn('当前没有打开任何编辑器');
                this._isReloading = false;
                return ReloadResult.NO_EDITOR;
            }

            const assetInfo = await Rpc.getInstance().request('assetManager', 'queryAssetInfo', [urlOrUUID]);
            if (!assetInfo) {
                console.warn(`通过 ${urlOrUUID} 请求资源失败`);
                this._isReloading = false;
                return ReloadResult.ASSET_NOT_FOUND;
            }

            const editor = this.editorMap.get(assetInfo.uuid);
            if (!editor || assetInfo.uuid !== this.currentEditorUuid) {
                console.warn('当前没有打开任何编辑器');
                this._isReloading = false;
                return ReloadResult.EDITOR_NOT_FOUND;
            }

            this.reloadPromise = (async () => {
                try {
                    let currentParams: IReloadOptions | null = params;
                    while (currentParams) {
                        await this.waitLocks();
                        // 重载不是对外的编辑器关闭/打开；这里只复用内部内容卸载/挂载边界。
                        this.emitInternal(InternalServiceEvents.EditorReloadClose);
                        try {
                            await editor.reload();
                        } finally {
                            this.emitInternal(InternalServiceEvents.EditorReloadOpen);
                        }

                        if (!currentParams.preserveUndoHistory) {
                            this._clearUndoHistory();
                        }

                        if (this.needReloadAgain) {
                            currentParams = this.needReloadAgain;
                            this.needReloadAgain = null;
                        } else {
                            currentParams = null;
                        }

                        this.broadcast('editor:reload');
                        console.log(`重载 ${assetInfo.url}`);
                    }
                    return ReloadResult.SUCCESS;
                } catch (error) {
                    console.error(error);
                    return ReloadResult.FAILED;
                } finally {
                    this.reloadPromise = null;
                    this._isReloading = false;
                }
            })() as any;

            return this.reloadPromise as unknown as Promise<ReloadResult>;
        } catch (error) {
            console.error(error);
            this._isReloading = false;
            return ReloadResult.FAILED;
        }
    }

    private async runLifecycle<T>(operation: () => Promise<T>): Promise<T> {
        const previous = this.lifecyclePromise;
        let release!: () => void;
        this.lifecyclePromise = new Promise<void>((resolve) => {
            release = resolve;
        });
        await previous;
        try {
            return await operation();
        } finally {
            release();
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

    private _clearUndoHistory(): void {
        try {
            Service.Undo?.clearHistory();
        } catch (_e) {
            // UndoService may not be registered during early editor setup.
        }
    }

    private _markUndoSaved(): void {
        try {
            Service.Undo?.markSaved();
        } catch (_e) {
            // UndoService may not be registered during early editor setup.
        }
    }
}
