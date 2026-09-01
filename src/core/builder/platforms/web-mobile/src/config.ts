'use strict';

import { join } from 'path';
import { IPlatformBuildPluginConfig } from '../../../@types/protected';
import { GlobalPaths } from '../../../../../global';

const PLATFORM = 'web-mobile';
const ENCRYPT_KEY_PATTERN = /^\w{32}$/;

const buildTemplateDir = join(GlobalPaths.enginePath, `templates/${PLATFORM}`);

const config: IPlatformBuildPluginConfig = {
    displayName: 'i18n:web-mobile.title',
    platformType: 'HTML5',
    doc: 'editor/publish/publish-web.html',
    hooks: './src/hooks',
    verifyRuleMap: {
        encryptKey: {
            func: (value: string) => ENCRYPT_KEY_PATTERN.test(String(value ?? '').trim()),
            message: 'i18n:web-mobile.tips.encrypt_key_error',
        },
    },
    textureCompressConfig: {
        platformType: 'web',
        support: {
            rgb: [
                'etc2_rgb',
                'etc1_rgb',
                'pvrtc_4bits_rgb',
                'pvrtc_2bits_rgb',
                'astc_4x4',
                'astc_5x5',
                'astc_6x6',
                'astc_8x8',
                'astc_10x5',
                'astc_10x10',
                'astc_12x12',
            ],
            rgba: [
                'etc2_rgba',
                'etc1_rgb_a',
                'pvrtc_4bits_rgb_a',
                'pvrtc_4bits_rgba',
                'pvrtc_2bits_rgb_a',
                'pvrtc_2bits_rgba',
                'astc_4x4',
                'astc_5x5',
                'astc_6x6',
                'astc_8x8',
                'astc_10x5',
                'astc_10x10',
                'astc_12x12',
            ],
        },
    },
    assetBundleConfig: {
        supportedCompressionTypes: ['none', 'merge_dep', 'merge_all_json'],
        platformType: 'web',
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
    options: {
        appid: {
            label: 'i18n:web-mobile.options.app_id',
            description: 'i18n:web-mobile.options.app_id_hint',
            type: 'string',
        },
        versionName: {
            default: '1.0.0',
            type: 'string',
            label: 'i18n:web-mobile.options.version_name',
            description: 'i18n:web-mobile.options.version_name_hint',
        },
        uploadEnv: {
            default: 'prod',
            label: 'i18n:web-mobile.options.upload_env',
            description: 'i18n:web-mobile.options.upload_env_hint',
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
            label: 'i18n:web-mobile.options.access_token',
            description: 'i18n:web-mobile.options.access_token_hint',
        },
        codeVersion: {
            default: '',
            type: 'string',
            hidden: true,
            label: 'i18n:web-mobile.options.code_version',
            description: 'i18n:web-mobile.options.code_version_hint',
        },
        bridgeLink: {
            default: '',
            type: 'string',
            hidden: true,
            label: 'i18n:web-mobile.options.bridge_link',
            description: 'i18n:web-mobile.options.bridge_link_hint',
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
            label: 'i18n:web-mobile.options.encrypt_key',
            description: 'i18n:web-mobile.options.encrypt_key_hint',
            verifyRules: ['required', 'encryptKey'],
        },
        useWebGPU: {
            label: 'WEBGPU',
            type: 'boolean',
            default: false,
            description: 'i18n:web-mobile.tips.webgpu',
            experiment: true,
        },
        orientation: {
            label: 'i18n:web-mobile.options.orientation',
            default: 'auto',
            type: 'enum',
            items: ['auto', 'landscape', 'portrait'],
        },
        embedWebDebugger: {
            label: 'i18n:web-mobile.options.web_debugger',
            type: 'boolean',
            default: false,
        },
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
        displayName: 'i18n:web-mobile.publish.label',
        description: 'i18n:web-mobile.publish.description',
        parallelism: 'all',
    }],
};

export default config;
