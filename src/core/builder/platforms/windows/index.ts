'use strict';

import { basename } from 'path';
import { executableNameOrDefault } from './utils';
import { IPlatformBuildPluginConfig } from '../../@types/protected';
import { commonOptions, serverOptions } from '../native-common';
import { BuildGlobalInfo } from '../../share/builder-config';

const config: IPlatformBuildPluginConfig = {
    ...commonOptions,
    platformName: 'Windows',
    platformType: 'WINDOWS',
    doc: 'editor/publish/windows/build-example-windows.html',
    commonOptions: {
        polyfills: {
            hidden: true,
        },
        useBuiltinServer: {
            hidden: false,
        },
        nativeCodeBundleMode: {
            default: 'wasm',
        },
    },
    verifyRuleMap: {
        executableName: {
            func: (str: string) => {
                // allow empty string
                return /^[0-9a-zA-Z_-]*$/.test(str);
            },
            message: 'Invalid executable name specified',
        },
    },
    options: {
        ...serverOptions,
        executableName: {
            label: 'i18n:windows.options.executable_name',
            default: '',
            render: {
                ui: 'ui-input',
                attributes: {
                    placeholder: executableNameOrDefault(BuildGlobalInfo.projectName),
                },
            },
            verifyRules: ['executableName'],
        },
        renderBackEnd: {
            label: 'Render BackEnd',
            default: {
                vulkan: false,
                gles3: true,
                gles2: true,
            },
        },
        targetPlatform: {
            label: 'i18n:windows.options.targetPlatform',
            default: 'x64',
            render: {
                ui: 'ui-label',
            },
        },
    },
    hooks: './hooks',
    panel: './view',
    // textureCompressConfig: {
    //     platformType: 'pc',
    //     support: {
    //         rgb: ['etc2_rgb', 'etc1_rgb', 'pvrtc_4bits_rgb', 'pvrtc_2bits_rgb'],
    //         rgba: ['etc2_rgba', 'etc1_rgb_a', 'pvrtc_4bits_rgb_a', 'pvrtc_4bits_rgba', 'pvrtc_2bits_rgb_a', 'pvrtc_2bits_rgba'],
    //     },
    // },
};

export default config;