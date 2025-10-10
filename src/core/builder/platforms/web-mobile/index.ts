'use strict';

import { join } from 'path';
import { IPlatformBuildPluginConfig } from '../../@types/protected';
import { GlobalPaths } from '../../../../global';

const PLATFORM = 'web-mobile';

const buildTemplateDir = join(GlobalPaths.staticDir, `build-templates/${PLATFORM}`);

const config: IPlatformBuildPluginConfig = {
    platformName: 'i18n:web-mobile.title',
    platformType: 'HTML5',
    doc: 'editor/publish/publish-web.html',
    hooks: './hooks',
    panel: './panel',
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
            hidden: false,
            default: {
                asyncFunctions: true,
            },
        },
        buildScriptTargets: {
            hidden: false,
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
        useWebGPU: {
            label: 'WEBGPU',
            default: false,
            description: 'i18n:web-mobile.tips.webgpu',
            render: {
                ui: 'ui-checkbox',
            },
            experiment: true,
        },
        orientation: {
            label: 'i18n:web-mobile.options.orientation',
            default: 'auto',
            render: {
                ui: 'ui-select-pro',
                items: [
                    {
                        label: 'i18n:web-mobile.options.landscape',
                        value: 'landscape',
                    },
                    {
                        label: 'i18n:web-mobile.options.portrait',
                        value: 'portrait',
                    },
                    {
                        label: 'i18n:web-mobile.options.auto',
                        value: 'auto',
                    },
                ],
            },
        },
        embedWebDebugger: {
            label: 'i18n:web-mobile.options.web_debugger',
            render: {
                ui: 'ui-checkbox',
            },
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
};

export default config;