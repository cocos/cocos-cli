/**
 * CocosCreator 配置迁移相关类型定义
 */

export type CocosConfigScope = 'local' | 'project' | 'global';

/**
 * 简单重定向规则（仅重命名字段）
 */
export type SimpleRedirect = string;

/**
 * 详细重定向规则（支持重命名、值转换、默认值）
 */
export interface DetailedRedirect {
    /** 新字段名 */
    newKey: string;
    /** 值转换函数 */
    transform?: (value: any) => any;
    /** 默认值（当原值为 undefined 时使用） */
    defaultValue?: any;
    /** 是否移除原字段 */
    remove?: boolean;
}

/**
 * 字段重定向规则（支持两种类型）
 */
export type RedirectRule = SimpleRedirect | DetailedRedirect;

/**
 * 迁移目标配置
 */
export interface IMigrationTarget {
    /** 源配置范围 */
    scope: CocosConfigScope;
    /** 插件名 */
    pluginName: string;
    /** 新配置中的目标路径 */
    targetPath?: string;
    /** 字段重定向映射（支持点号路径） */
    redirects?: {
        [oldKey: string]: RedirectRule;
    };
    /** 自定义 migrate 函数（可选，如果不提供则使用自动重定向） */
    migrate?(oldConfig: Record<string, any>): Promise<any>;
    /** 迁移后的后处理函数 */
    postProcess?(migratedConfig: Record<string, any>): Promise<any>;
}

export const VERSION: string = 'v2';
