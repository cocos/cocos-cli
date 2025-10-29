import { IBuildOptionBase, Platform } from './options';

import { IOptions as webDesktopOptions } from './../platforms/web-desktop';
export { webDesktopOptions };
import { IOptions as webMobileOptions } from './../platforms/web-mobile';
export { webMobileOptions };
import { IOptions as windowsOptions, IExtraOptions as windowsExtraOptions } from './../platforms/windows';
export { windowsOptions };
/**
 * 构建所需的完整参数
 */
export interface IBuildTaskOption<P extends Platform = Platform> extends IBuildOptionBase {
    platform: P;
    packages: Record<P, PlatformPackageOptionMap[P]>;
}

export interface PlatformPackageOptionMap {
    'web-desktop': webDesktopOptions;
    'web-mobile': webMobileOptions;
    'windows': windowsOptions;
}

export interface PlatformExtraOptionsMap {
    [x: Platform]: {};
    'windows': windowsExtraOptions;
}

// 主要为了生成 schema
export type WebDesktopBuildOptions = IBuildTaskOption<'web-desktop'>;
export type WebMobileBuildOptions = IBuildTaskOption<'web-mobile'>;