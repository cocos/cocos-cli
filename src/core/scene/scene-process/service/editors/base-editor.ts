import type { IBaseIdentifier, ICreateOptions, IEditorTarget, TEditorEntity, TEditorInstance } from '../../../common';
import type { IAssetInfo } from '../../../../assets/@types/public';

/**
 * 编辑器基类
 * 提供通用的编辑器功能和状态管理
 * @template TEditorAsset 编辑器处理的资产类型，如 IScene、INode 等
 * @template TEvents 事件类型
 */
export abstract class BaseEditor {
    /**
     * 当前打开的资源
     */
    protected entity: IEditorTarget | null = null;

    /**
     * reload 队列控制
     * - 永远只会有一个正在执行的 reload
     * - 新的 reload 调用会被折叠为“再执行一次”
     * - 最终返回 Promise，所有调用者都会拿到最终结果
     */
    private _isReloading = false;
    private _needsReload = false;
    private _reloadWaiters: ((value: TEditorEntity) => void)[] = [];
    private _reloadErrorWaiters: ((error: any) => void)[] = [];

    public getRootNode(): TEditorInstance | null {
        return this.entity ? this.entity.instance : null;
    }

    public setCurrentOpen(entity: IEditorTarget | null): void {
        this.entity = entity;
    }

    protected getIdentifier(assetInfo: IAssetInfo) {
        return {
            assetType: assetInfo.type,
            assetName: assetInfo.name,
            assetUuid: assetInfo.uuid,
            assetUrl: assetInfo.url,
        };
    }

    /**
     * 重载编辑器内容，提供并发保护
     * 如果已有 reload 正在执行，标记待处理标志，确保最终基于最新数据执行
     */
    async reload(): Promise<TEditorEntity> {
        // 如果已经有 reload 在进行
        if (this._isReloading) {
            this._needsReload = true;
            return new Promise((resolve, reject) => {
                this._reloadWaiters.push(resolve);
                this._reloadErrorWaiters.push(reject);
            });
        }

        this._isReloading = true;

        try {
            let result: TEditorEntity | null = null;
            do {
                this._needsReload = false;
                result = await this._doReload();
            } while (this._needsReload);

            // 让所有等待者都拿到最终结果
            for (const r of this._reloadWaiters) r(result!);
            this._reloadWaiters = [];
            this._reloadErrorWaiters = [];

            return result!;
        } catch (err) {
            for (const rej of this._reloadErrorWaiters) rej(err);
            this._reloadWaiters = [];
            this._reloadErrorWaiters = [];
            throw err;
        } finally {
            this._isReloading = false;
        }
    }

    // 抽象方法，子类必须实现
    abstract encode(entity?: IEditorTarget): Promise<TEditorEntity>;
    abstract open(asset: IAssetInfo): Promise<TEditorEntity>;
    abstract close(): Promise<boolean>;
    abstract save(): Promise<IAssetInfo>;
    /**
     * 执行实际的重载操作，子类需要实现具体的重载逻辑
     */
    protected abstract _doReload(): Promise<TEditorEntity>;
    abstract create(params: ICreateOptions): Promise<IBaseIdentifier>;
}
