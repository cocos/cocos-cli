/**
 * 场景信息
 */
export interface ISceneInfo {
    path: string;
    uuid: string;
    url: string;
    name: string;
}

/**
 * 场景模板类型
 */
export type TSceneTemplateType = 'default' | '2d' | '3d' | 'quality';

/**
 * 创建场景选项
 */
export interface ICreateSceneOptions {
    name: string;
    targetPath: string;
    templateType?: TSceneTemplateType;
}

/**
 * 保持场景选项
 */
export interface ISaveSceneOptions {
    uuid?: string;
}

/**
 * 打开场景选项
 */
export interface IOpenSceneOptions {
    uuid: string;
}

/**
 * 场景相关处理接口
 */
export interface ISceneManager {
    /**
     * 打开场景
     * @param params
     */
    openScene(params: IOpenSceneOptions): Promise<ISceneInfo | null>;

    /**
     * 关闭当前场景
     */
    closeScene(): Promise<ISceneInfo | null>;

    /**
     * 保存场景
     */
    saveScene(params: ISaveSceneOptions): Promise<ISceneInfo | null>;

    /**
     * 创建新场景
     * @param params
     */
    createScene(params: ICreateSceneOptions): Promise<ISceneInfo | null>;

    /**
     * 获取当前打开的场景
     */
    getCurrentScene(): Promise<ISceneInfo | null>;
}