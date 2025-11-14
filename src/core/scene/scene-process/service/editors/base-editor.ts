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
     * reload 操作的 Promise，用于防止并发调用导致序列化失败
     * 所有调用者都等待这个 Promise，最终会得到基于最新数据的结果
     */
    protected _reloadPromise: Promise<TEditorEntity> | null = null;

    /**
     * 标记是否有待处理的 reload 请求
     * 如果在一个 reload 执行期间有新的调用，设置此标志，确保最终基于最新数据执行
     */
    private _pendingReload: boolean = false;

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
        // 如果已有 reload 正在执行，标记需要重新执行，确保基于最新数据
        if (this._reloadPromise) {
            this._pendingReload = true;
            // 等待当前执行完成，最终会得到基于最新数据的结果
            return this._reloadPromise;
        }

        // 开始执行 reload
        return this._executeReload();
    }

    /**
     * 执行 reload 操作，支持自动重新执行以确保基于最新数据
     */
    private async _executeReload(): Promise<TEditorEntity> {
        // 创建新的 Promise，所有调用者都等待这个 Promise
        let resolveCurrent: (value: TEditorEntity) => void;
        let rejectCurrent: (reason?: any) => void;
        this._reloadPromise = new Promise<TEditorEntity>((resolve, reject) => {
            resolveCurrent = resolve;
            rejectCurrent = reject;
        });

        // 执行实际的 reload 操作
        try {
            // 重置待处理标志
            this._pendingReload = false;

            // 执行 reload
            const result = await this._doReload();

            // 如果执行期间有新的 reload 请求，基于最新数据重新执行
            if (this._pendingReload) {
                // 递归执行，等待最新的结果
                const latestResult = await this._executeReload();
                // 解析当前 Promise 为最新结果
                resolveCurrent!(latestResult);
                return latestResult;
            } else {
                // 没有待处理的请求，返回当前结果并清空 Promise
                resolveCurrent!(result);
                this._reloadPromise = null;
                return result;
            }
        } catch (error) {
            // 如果出错，也要检查是否有待处理的请求
            if (this._pendingReload) {
                try {
                    // 尝试执行新的 reload，可能会成功
                    const latestResult = await this._executeReload();
                    resolveCurrent!(latestResult);
                    return latestResult;
                } catch {
                    // 如果新的 reload 也失败，抛出原始错误
                    rejectCurrent!(error);
                    this._reloadPromise = null;
                    throw error;
                }
            } else {
                // 没有待处理的请求，抛出错误并清空 Promise
                rejectCurrent!(error);
                this._reloadPromise = null;
                throw error;
            }
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
