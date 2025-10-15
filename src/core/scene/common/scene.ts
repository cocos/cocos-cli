/**
 * 场景
 */

/**
 * 场景模板类型
 */
export type TSceneTemplateType = '2d' | '3d' | 'quality';

/**
 * 场景标识
 */
export interface ISceneIdentifier {
    uuid: string;
    path: string;
    url: string;
    type: string;
}

/**
 * 场景基础信息
 */
export interface IScene extends ISceneIdentifier {
    name: string;
}


/**
 * 创建场景选项
 */
export interface ICreateSceneOptions {
    targetPathOrURL: string;
    templateType?: TSceneTemplateType;
}

/**
 * 保持场景选项
 */
export interface ISaveSceneOptions {
    urlOrUUIDOrPath?: string;
}

/**
 * 打开场景选项
 */
export interface IOpenSceneOptions {
    urlOrUUIDOrPath: string;
}

/**
 * 软刷新场景选项
 */
export interface ISoftReloadSceneOptions {
    urlOrUUIDOrPath?: string;
}

/**
 * 关闭场景选项
 */
export interface ICloseSceneOptions {
    urlOrUUIDOrPath?: string;
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
    softReload(params: ISoftReloadSceneOptions): Promise<boolean>;

    /**
     * 创建新场景
     * @param params
     */
    create(params: ICreateSceneOptions): Promise<IScene>;

    /**
     * 获取当前打开的场景
     */
    queryCurrentScene(): Promise<IScene | null>;

    /**
     * 获取当前所有场景
     */
    queryScenes(): Promise<IScene[]>;
}