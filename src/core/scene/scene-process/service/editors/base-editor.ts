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

    // 抽象方法，子类必须实现
    abstract encode(entity?: IEditorTarget): Promise<TEditorEntity>;
    abstract open(asset: IAssetInfo): Promise<TEditorEntity>;
    abstract close(): Promise<boolean>;
    abstract save(): Promise<IAssetInfo>;
    abstract reload(): Promise<TEditorEntity>;
    abstract create(params: ICreateOptions): Promise<IBaseIdentifier>;
}
