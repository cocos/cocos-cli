import { webDesktopOptions, IBuildCommonOptions, webMobileOptions, IBuildCacheUseConfig } from '../builder/@types/public'

export interface BuildConfiguration {
    common: IBuildCommonOptions;
    platforms: {
        'web-desktop'?: webDesktopOptions & OverwriteProjectSettings;
        // 'web-mobile': webMobileOptions & OverwriteProjectSettings;
    };
    useCacheConfig?: IBuildCacheUseConfig;
    bundleConfig: {
        custom: Record<string, IBundleOptions>;
    };
    textureCompressConfig: UserCompressConfig;
}

export interface ImportConfiguration {
    globList: string[];
    restoreAssetDBFromCache: boolean;
    createTemplateRoot: string;
    /**
     * 资源 userData 的默认值
     */
    userDataTemplate?: Record<string, any>;
}