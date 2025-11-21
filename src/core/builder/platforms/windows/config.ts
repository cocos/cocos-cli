'use strict';

import { IPlatformBuildPluginConfig } from '../../@types/protected';
import { commonOptions, baseNativeCommonOptions } from '../native-common';

const config: IPlatformBuildPluginConfig = {
    ...commonOptions,
    displayName: 'Windows',
    platformType: 'WINDOWS',
    doc: 'editor/publish/windows/build-example-windows.html',
    commonOptions: {
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
        ...baseNativeCommonOptions,
        executableName: {
            label: 'i18n:windows.options.executable_name',
            type: 'string',
            default: '',
            verifyRules: ['executableName'],
        },
        renderBackEnd: {
            label: 'Render BackEnd',
            type: 'object',
            properties: {
                vulkan: {
                    label: 'Vulkan',
                    type: 'boolean',
                    default: false,
                },
                gles3: {
                    label: 'GLES3',
                    type: 'boolean',
                    default: true,
                },
                gles2: {
                    label: 'GLES2',
                    type: 'boolean',
                    default: true,
                },
            },
            default: {
                vulkan: false,
                gles3: true,
                gles2: true,
            },
        },
        targetPlatform: {
            label: 'i18n:windows.options.targetPlatform',
            type: 'enum',
            items: ['x64', 'x86'],
            default: 'x64',
        },
    },
    hooks: './hooks',
};

export default config;