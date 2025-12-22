'use strict';

import { IPlatformBuildPluginConfig } from '../../@types/protected';
import { commonOptions, baseNativeCommonOptions } from '../native-common';
import { checkPackageNameValidity } from './utils';

const config: IPlatformBuildPluginConfig = {
    ...commonOptions,
    displayName: 'Mac',
    platformType: 'MAC',
    doc: 'editor/publish/mac/build-example-mac.html',
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
        packageName: {
            func: (value: string) => {
                if (!checkPackageNameValidity(value)) {
                    return false;
                }
                return true;
            },
            message: 'i18n:mac.error.packageNameRuleMessage',
        },
        targetVersion: {
            func: (value: string) => {
                if (!/^\d+(\.\d+){1,2}$/.test(value)) {
                    return false;
                }
                return true;
            },
            message: 'i18n:mac.error.targetVersionError',
        },
        executableName: {
            func: (str) => {
                // allow empty string
                return /^[0-9a-zA-Z_-]*$/.test(str);
            },
            message: 'Invalid executable name specified',
        },
    },
    options: {
        ...baseNativeCommonOptions,
        executableName: {
            label: 'i18n:mac.options.executable_name',
            default: '',
            type: 'string',
            verifyRules: ['executableName'],
        },
        packageName: {
            label: 'i18n:mac.options.package_name',
            description: 'i18n:mac.options.package_name_hint',
            verifyRules: ['packageName', 'required'],
            default: '',
            type: 'string',
        },
        renderBackEnd: {
            label: 'i18n:mac.options.render_back_end',
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
        targetVersion: {
            label: 'i18n:mac.options.targetVersion',
            default: '10.14',
            type: 'string',
            verifyRules: ['required', 'targetVersion'],
        },
        supportM1: {
            label: 'Support Apple Silicon',
            description: 'Support Apple Silicon',
            default: false,
            type: 'boolean'
        },
        skipUpdateXcodeProject: {
            label: 'i18n:mac.options.skipUpdateXcodeProject',
            default: false,
            type: 'boolean'
        },
    },
    hooks: './hooks',
};

export default config;