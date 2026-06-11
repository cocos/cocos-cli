import type { INodeDumpOptions } from '../node';

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
export interface IOpenOptions extends INodeDumpOptions {
    urlOrUUID: string;
}

/**
 * 软刷新场景/预制体选项
 */
export interface IReloadOptions {
    urlOrUUID?: string;
    /** Internal scene-process reloads can preserve undo state when the caller pushes its own command. */
    preserveUndoHistory?: boolean;
}

/**
 * 关闭场景/预制体选项
 */
export interface ICloseOptions {
    urlOrUUID?: string;
    /** Whether to save before closing. Defaults to true for backward compatibility. */
    save?: boolean;
}
