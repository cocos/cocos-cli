'use strict';

import { join } from 'path';
import { IPlatformBuildPluginConfig } from '../../../@types/protected';
import { GlobalPaths } from '../../../../../global';
const PLATFORM = 'web-desktop';
const ENCRYPT_KEY_PATTERN = /^\w{32}$/;
const buildTemplateDir = join(GlobalPaths.enginePath, `templates/${PLATFORM}`);

const config: IPlatformBuildPluginConfig = {
    displayName: 'i18n:web-desktop.title',
    platformType: 'HTML5',
    doc: 'editor/publish/publish-web.html',
    verifyRuleMap: {
        encryptKey: {
            func: (value: string) => ENCRYPT_KEY_PATTERN.test(String(value ?? '').trim()),
            message: 'i18n:web-desktop.tips.encrypt_key_error',
        },
    },
    options: {
        app_id: {
            label: 'i18n:web-desktop.options.app_id',
            description: 'i18n:web-desktop.options.app_id_hint',
            type: 'string',
        },
        versionName: {
            default: '1.0.0',
            type: 'string',
            label: 'i18n:web-desktop.options.version_name',
            description: 'i18n:web-desktop.options.version_name_hint',
        },
        uploadEnv: {
            default: 'prod',
            label: 'i18n:web-desktop.options.upload_env',
            description: 'i18n:web-desktop.options.upload_env_hint',
            type: 'enum',
            hidden: true,
            items: [{
                label: 'dev',
                value: 'dev',
            }, {
                label: 'fat',
                value: 'fat',
            }, {
                label: 'prod',
                value: 'prod',
            }],
        },
        accessToken: {
            default: '',
            type: 'string',
            hidden: true,
            label: 'i18n:web-desktop.options.access_token',
            description: 'i18n:web-desktop.options.access_token_hint',
        },
        codeVersion: {
            default: '',
            type: 'string',
            hidden: true,
            label: 'i18n:web-desktop.options.code_version',
            description: 'i18n:web-desktop.options.code_version_hint',
        },
        bridgeLink: {
            default: '',
            type: 'string',
            hidden: true,
            label: 'i18n:web-desktop.options.bridge_link',
            description: 'i18n:web-desktop.options.bridge_link_hint',
        },
        bridgeBuildToken: {
            default: '',
            type: 'string',
            hidden: true,
            label: 'Bridge Build Token',
        },
        entryPath: {
            default: '',
            type: 'string',
            hidden: true,
            label: 'Entry Path',
        },
        encryptKey: {
            default: '00112233445566778899aabbccddeeff',
            type: 'string',
            hidden: true,
            label: 'i18n:web-desktop.options.encrypt_key',
            description: 'i18n:web-desktop.options.encrypt_key_hint',
            verifyRules: ['required', 'encryptKey'],
        },
        useWebGPU: {
            label: 'WEBGPU',
            type: 'boolean',
            default: false,
            description: 'i18n:web-desktop.tips.webgpu',
            experiment: true,
            hidden: true,
        },
        resolution: {
            type: 'object',
            label: 'i18n:web-desktop.options.resolution',
            properties: {
                designWidth: {
                    label: 'i18n:web-desktop.options.design_width',
                    type: 'number',
                    default: 1280,
                },
                designHeight: {
                    label: 'i18n:web-desktop.options.design_height',
                    type: 'number',
                    default: 960,
                },
            },
            default: {
                designWidth: 1280,
                designHeight: 960,
            },
        },
    },
    commonOptions: {
        polyfills: {
            default: {
                asyncFunctions: true,
            },
        },
        nativeCodeBundleMode: {
            default: 'both',
        },
        overwriteProjectSettings: {
            default: {
                includeModules: {
                    'gfx-webgl2': 'on',
                },
            },
        },
    },
    hooks: './src/hooks',
    textureCompressConfig: {
        platformType: 'web',
        support: {
            rgb: [],
            rgba: [],
        },
    },
    assetBundleConfig: {
        supportedCompressionTypes: ['none', 'merge_dep', 'merge_all_json'],
        platformType: 'web',
    },
    buildTemplateConfig: {
        templates: ['index.ejs'].map((url) => {
            return {
                path: join(buildTemplateDir, url),
                destUrl: url,
            };
        }),
        version: '1.0.0',
    },
    customBuildStages: [{
        hook: 'run',
        name: 'run',
        requiredBuildOptions: false,
    }, {
        name: 'upload',
        hook: 'upload',
        displayName: 'i18n:web-desktop.publish.label',
        description: 'i18n:web-desktop.publish.description',
        parallelism: 'all',
    }],
};

export default config;
