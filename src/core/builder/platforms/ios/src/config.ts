'use strict';

import { IPlatformBuildPluginConfig, ITextureCompressType } from '../../../@types/protected';
import { commonOptions, baseNativeCommonOptions } from '../../native-common';
import { checkPackageNameValidity } from './utils';

const astcTypes: ITextureCompressType[] = ['astc_4x4', 'astc_5x5', 'astc_6x6', 'astc_8x8', 'astc_10x5', 'astc_10x10', 'astc_12x12'];

// JobSystem 由 baseNativeCommonOptions 声明在平台自己的 options 里，取值时按 options.platform 定位包名
function pkgOptions(options: any): any {
    return options?.packages?.[options?.platform] || options?.packages?.ios || {};
}

function hasEnabledEntry(value: unknown): boolean {
    if (!value || typeof value !== 'object') {
        return false;
    }
    return Object.values(value as Record<string, unknown>).some((v) => !!v);
}

// 逐段比较，不用 utils.compareVersion：后者把版本号拼成一个数字（只替换第一个 '.'），'9.10' 会被判成 >= '11.0'
function versionGte(value: string, min: string): boolean {
    const left = value.split('.').map((s) => Number.parseInt(s, 10));
    const right = min.split('.').map((s) => Number.parseInt(s, 10));
    for (let i = 0; i < Math.max(left.length, right.length); i++) {
        const a = left[i] || 0;
        const b = right[i] || 0;
        if (a !== b) {
            return a > b;
        }
    }
    return true;
}

const config: IPlatformBuildPluginConfig = {
    ...commonOptions,
    displayName: 'iOS',
    platformType: 'IOS',
    doc: 'editor/publish/ios/build-example-ios.html',
    verifyRuleMap: {
        packageName: {
            func: (value: string) => {
                if (!checkPackageNameValidity(value)) {
                    return false;
                }
                return true;
            },
            message: 'i18n:ios.tips.packageNameRuleMessage',
        },
        executableName: {
            func: (str) => {
                // allow empty string
                return /^[0-9a-zA-Z_-]*$/.test(str);
            },
            message: 'Invalid executable name specified',
        },
        // 迁移自 editor 的 verificationFunc（CLI 侧 utils.ts 里有同名实现但没有接入校验流）
        targetVersionStyle: {
            // 2~3 段，x.x(.x) 的形式，每段范围分别为 1-99 / 0-99 / 0-99
            func: (value: unknown) => /^([1-9]\d|[1-9])(\.([1-9]\d|\d)){1,2}$/.test(String(value)),
            message: 'targetVersion must look like "12.0" or "12.0.1"',
        },
        targetVersionTaskFlow: {
            func: (value: unknown, options: any) => {
                if (pkgOptions(options).JobSystem !== 'taskFlow') {
                    return true;
                }
                return versionGte(String(value), '12.0');
            },
            message: 'When TaskFlow is enabled, the minimum target version required is 12.0.',
        },
        targetVersionMin: {
            func: (value: unknown) => versionGte(String(value), '11.0'),
            message: 'The minimum target version required is 11.0.',
        },
        orientation: {
            func: hasEnabledEntry,
            message: 'orientation must have at least one direction enabled',
        },
        osTarget: {
            func: hasEnabledEntry,
            message: 'osTarget must have at least one target enabled',
        },
    },
    commonOptions: {
        polyfills: {
            hidden: true,
        },
        useBuiltinServer: {
            hidden: false,
        }
    },
    options: {
        executableName: {
            label: 'i18n:ios.options.executable_name',
            default: '',
            type: 'string',
            verifyRules: ['executableName'],
        },
        packageName: {
            label: 'i18n:ios.options.package_name',
            description: 'i18n:ios.options.package_name_hint',
            type: 'string',
            verifyRules: ['required', 'packageName'],
            default: '',
        },
        renderBackEnd: {
            label: 'i18n:ios.options.render_back_end',
            type: 'object',
            default: {
                metal: true,
            },
            properties: {
                metal: {
                    label: 'Metal',
                    type: 'boolean',
                    default: true,
                },
            },
        },
        skipUpdateXcodeProject: {
            label: 'i18n:ios.options.skipUpdateXcodeProject',
            default: false,
            type: 'boolean'
        },
        orientation: {
            type: 'object',
            default: {
                portrait: false,
                upsideDown: false,
                landscapeRight: true,
                landscapeLeft: true,
            },
            properties: {

            },
            verifyRules: ['orientation'],
        },
        osTarget: {
            type: 'object',
            default: {
                iphoneos: false,
                simulator: true,
            },
            properties: {

            },
            verifyRules: ['osTarget'],
        },
        developerTeam: {
            label: 'i18n:ios.options.developerTeam',
            default: '',
            type: 'string'
        },
        targetVersion: {
            default: '12.0',
            type: 'string',
            // 顺序敏感（validator 短路）：required → 格式 → TaskFlow 下限 12.0 → 通用下限 11.0
            verifyRules: ['required', 'targetVersionStyle', 'targetVersionTaskFlow', 'targetVersionMin'],
        },
    },
    hooks: './src/hooks',
    textureCompressConfig: {
        platformType: 'ios',
        support: {
            rgb: ['pvrtc_4bits_rgb', 'pvrtc_2bits_rgb', 'etc2_rgb', 'etc1_rgb', ...astcTypes],
            rgba: ['pvrtc_4bits_rgb_a', 'pvrtc_4bits_rgba', 'pvrtc_2bits_rgb_a', 'pvrtc_2bits_rgba', 'etc2_rgba', 'etc1_rgb_a', ...astcTypes],
        },
    },
};

export default config;
