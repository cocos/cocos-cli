import { BundleCompressionType } from '../public';

export type BundlePlatformType = 'native' | 'miniGame' | 'web';
export type BundleConfigProperty = 'compressionType' | 'isRemote';
export const enum BundleCompressionTypes {
    NONE = 'none',
    MERGE_DEP = 'merge_dep',
    MERGE_ALL_JSON = 'merge_all_json',
    SUBPACKAGE = 'subpackage',
    ZIP = 'zip',
}

export const enum BuiltinBundleName {
    RESOURCES = 'resources',
    MAIN = 'main',
    START_SCENE = 'start-scene',
    INTERNAL = 'internal',
}
export interface PlatformBundleConfig {
    platformName: string;
    platformType: BundlePlatformType;
    supportOptions: Record<string, any[]>;
}

export interface BundleRenderConfig {
    platformTypeInfo: PlatformTypeInfo;
    platformConfigs: Record<string, PlatformBundleConfig>;
    maxOptionList: Record<string, any[]>;
    // 当所有平台的选项都一致时，不添加 minOptionList
    minOptionList?: Record<string, any[]>;
    // TODO 平台插件注册 config 机制
}

export interface PlatformTypeInfo {
    icon: string;
    displayName: string;
}

export interface CustomBundleConfigItem {
    preferredOptions?: {
        isRemote: boolean;
        compressionType: BundleCompressionType;
    },
    fallbackOptions?: {
        compressionType: BundleCompressionType;
        isRemote?: boolean;
    },
    // 平台覆盖参数
    overwriteSettings?: Record<string, overwriteSettingItem>;
    // 配置模式，默认 auto 会自动根据优先级计算结果，fallback 会使用 fallbackOptions
    configMode?: 'auto' | 'fallback' | 'overwrite';
}

export interface CustomBundleConfig {
    displayName: string;
    configs: Record<BundlePlatformType, CustomBundleConfigItem>;
};

export interface BundleConfigItem {
    isRemote?: boolean;
    compressionType: BundleCompressionType;
}