import type { IScene } from './scene';
import type { Node, Scene } from 'cc';
import type { INode } from '../node';
import type { ICloseOptions, ICreateOptions, IOpenOptions, IReloadOptions, ISaveOptions } from './options';
import { ReloadResult } from './type';
import { IAssetInfo } from '../../../assets/@types/public';
import { IBaseIdentifier } from './base';
import { IServiceEvents } from '../../scene-process/service/core';

export type TEditorEntity = IScene | INode;
export type TEditorInstance = Scene | Node;

export * from './type';
export * from './base';
export * from './options';
export * from './scene';

/**
 * 事件类型
 */
export interface IEditorEvents {
    'editor:open': [scene?: any];
    'editor:close': [];
    'editor:save': [];
    'editor:reload': [scene?: any];
}

/**
 * 存储场景基础信息以及实例
 */
export interface IEditorTarget {
    identifier: IBaseIdentifier;
    instance: TEditorInstance,
}

export interface IPublicEditorService extends Omit<IEditorService,
    'getRootNode' |
    'getCurrentEditorType' |
    'adoptRuntimeScene' |
    'releaseRuntimeScene' |
    'lock' |
    'unlock' |
    keyof IServiceEvents
> {

}

export interface IEditorService extends IServiceEvents {

    /**
     * 当前编辑器类型
     */
    getCurrentEditorType(): 'scene' | 'prefab' | 'unknown';

    /**
     * 打开资产
     * @param params
     */
    open(params: IOpenOptions): Promise<TEditorEntity>;

    /**
     * 关闭当前资产
     */
    close(params: ICloseOptions): Promise<boolean>;

    /**
     * 保存资产
     */
    save(params: ISaveOptions): Promise<IAssetInfo>;

    /**
     * 重载资产
     * @param params
     */
    reload(params: IReloadOptions): Promise<ReloadResult>;

    /**
     * 创建新资产
     * @param params
     */
    create(params: ICreateOptions): Promise<IBaseIdentifier>;

    /**
     * 是否有打开编辑器
     */
    hasOpen(): Promise<boolean>;

    /**
     * 获取当前打开的资产
     */
    queryCurrent(): Promise<TEditorEntity | null>;

    /**
     * 序列化当前正在编辑的场景（含未保存改动），返回可被 loadWithJson 加载的 JSON 字符串。
     * 用于「Preview in Editor」把编辑器实时场景交给游戏运行时预览。
     */
    querySceneSerializedData(): Promise<string>;

    /**
     *
     */
    getRootNode(): TEditorInstance | null;

    /**
     * 「Preview in Editor」游戏视图：把一个正在运行的运行时场景登记为当前编辑实体
     * （不走 open() 的资产查询/事件发射），使 NodeService.queryNodeTree、选择、组件等
     * 依赖 getRootNode()/isOpen 的服务层状态对运行场景生效。由 PreviewPlay 在
     * 'editor:open' 扇出之前调用。
     */
    adoptRuntimeScene(scene: Scene, identity?: { url?: string }): void;

    /** 释放 adoptRuntimeScene 登记的运行时场景实体（PreviewPlay.stop 时调用；幂等）。 */
    releaseRuntimeScene(): void;

    lock(): Promise<void>;

    unlock(): void;
}
