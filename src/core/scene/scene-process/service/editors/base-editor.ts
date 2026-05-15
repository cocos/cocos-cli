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

        try {
            let result: TEditorEntity | undefined;
            // 使用循环处理待处理的 reload 请求，避免递归
            do {
                // 重置待处理标志
                this._pendingReload = false;
                try {
                    // 执行 reload
                    result = await this._doReload();
                } catch (error) {
                    // 如果出错，但有新的 reload 请求，则忽略错误继续重试
                    if (this._pendingReload) {
                        console.warn('Reload failed, retrying due to pending request:', error);
                        continue;
                    }
                    // 否则抛出错误
                    throw error;
                }
            } while (this._pendingReload);

            if (!result) {
                throw new Error('Reload returned no result');
            }

            resolveCurrent!(result);
            return result;
        } catch (error) {
            rejectCurrent!(error);
            throw error;
        } finally {
            this._reloadPromise = null;
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
