/**
 * 场景
 */

import { INode } from './node';
import { IComponent } from './component';

/**
 * 场景模板类型
 */
export type TSceneTemplateType = '2d' | '3d' | 'quality';

/**
 * 场景标识
 */
export interface ISceneIdentifier {
    assetName: string;
    assetUuid: string;
    assetUrl: string;
    assetType: string;
}

export interface ISceneProperties extends ISceneIdentifier {
    name: string;
}

/**
 * 场景基础信息
 */
export interface IScene extends ISceneProperties {
    children: INode[];
    components: IComponent[];
}

/**
 * 创建场景选项
 */
export interface ICreateSceneOptions {
    baseName: string;
    targetDirectory: string;
    templateType?: TSceneTemplateType;
}

/**
 * 保持场景选项
 */
export interface ISaveSceneOptions {
    urlOrUUID?: string;
}

/**
 * 打开场景选项
 */
export interface IOpenSceneOptions {
    urlOrUUID: string;
}

/**
 * 软刷新场景选项
 */
export interface ISoftReloadSceneOptions {
    urlOrUUID?: string;
}

/**
 * 关闭场景选项
 */
export interface ICloseSceneOptions {
    urlOrUUID?: string;
}

/**
 * 场景相关处理接口
 */
export interface ISceneService {
    /**
     * 打开场景
     * @param params
     */
    open(params: IOpenSceneOptions): Promise<IScene>;

    /**
     * 关闭当前场景
     */
    close(params: ICloseSceneOptions): Promise<boolean>;

    /**
     * 保存场景
     */
    save(params: ISaveSceneOptions): Promise<boolean>;

    /**
     * 重载场景
     */
    reload(): Promise<boolean>;

    /**
     * 软重载场景
     * @param params
     */
    softReload(params: ISoftReloadSceneOptions): Promise<IScene>;

    /**
     * 创建新场景
     * @param params
     */
    create(params: ICreateSceneOptions): Promise<ISceneIdentifier>;

    /**
     * 获取当前打开的场景
     */
    queryCurrentScene(): Promise<IScene | null>;

    /**
     * 获取当前所有场景
     */
    queryScenes(): Promise<IScene[]>;
}
