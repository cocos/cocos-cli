'use strict';

import { IPlatformBuildPluginConfig } from '../../@types/protected';
import { commonOptions, serverOptions } from '../native-common';

const config: IPlatformBuildPluginConfig = {
    ...commonOptions,
    displayName: 'Windows',
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
        },
    },
    hooks: './hooks',
};

export default config;