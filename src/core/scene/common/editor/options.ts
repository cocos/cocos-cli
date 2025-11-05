import { ICreateType, TSceneTemplateType } from './type';

/**
 * 创建场景/预制体选项
 */
export interface ICreateOptions {
    type: ICreateType; // 创建类型：场景或预制体
    baseName: string;
    targetDirectory: string;
    templateType?: TSceneTemplateType;
}

/**
 * 保持场景/预制体选项
 */
export interface ISaveOptions {
    urlOrUUID?: string;
}

/**
 * 打开场景/预制体选项
 */
export interface IOpenOptions {
    urlOrUUID: string;
}

/**
 * 软刷新场景/预制体选项
 */
export interface IReloadOptions {
    urlOrUUID?: string;
}

/**
 * 关闭场景/预制体选项
 */
export interface ICloseOptions {
    urlOrUUID?: string;
}
