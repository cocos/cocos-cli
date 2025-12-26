'use strict';

import { IPlatformBuildPluginConfig, ITextureCompressType } from '../../@types/protected';
import { commonOptions, baseNativeCommonOptions } from '../native-common';
import { checkPackageNameValidity } from './utils';

const astcTypes: ITextureCompressType[] = ['astc_4x4', 'astc_5x5', 'astc_6x6', 'astc_8x8', 'astc_10x5', 'astc_10x10', 'astc_12x12'];

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
                
            }
        },
        osTarget: {
            type: 'object',
            default: {
                iphoneos: false,
                simulator: true,
            },
            properties: {

            }
        },
        targetVersion: {
            default: '12.0',
            type: 'string'
        },
    },
    hooks: './hooks',
    textureCompressConfig: {
        platformType: 'ios',
        support: {
            rgb: ['pvrtc_4bits_rgb', 'pvrtc_2bits_rgb', 'etc2_rgb', 'etc1_rgb', ...astcTypes],
            rgba: ['pvrtc_4bits_rgb_a', 'pvrtc_4bits_rgba', 'pvrtc_2bits_rgb_a', 'pvrtc_2bits_rgba', 'etc2_rgba', 'etc1_rgb_a', ...astcTypes],
        },
    },
};

export default config;