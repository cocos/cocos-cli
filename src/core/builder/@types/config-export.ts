import { webDesktopOptions, IBuildCommonOptions, webMobileOptions, IBuildCacheUseConfig, OverwriteProjectSettings, IBundleOptions, UserCompressConfig } from './public'

export interface BuildConfiguration {
    common: IBuildCommonOptions;
    platforms: {
        'web-desktop'?: webDesktopOptions & OverwriteProjectSettings;
        'web-mobile'?: webMobileOptions & OverwriteProjectSettings;
    };
    useCacheConfig?: IBuildCacheUseConfig;
    bundleConfig: {
        custom: Record<string, IBundleOptions>;
    };
    textureCompressConfig: UserCompressConfig;
}