'use strict';

import { join } from 'path';
import { IPlatformBuildPluginConfig } from '../../@types/protected';
import { GlobalPaths } from '../../../../global';
const PLATFORM = 'web-desktop';
const buildTemplateDir = join(GlobalPaths.staticDir, `build-templates/${PLATFORM}`);

const config: IPlatformBuildPluginConfig = {
    platformName: 'i18n:web-desktop.title',
    platformType: 'HTML5',
    doc: 'editor/publish/publish-web.html',
    options: {
        useWebGPU: {
            label: 'WEBGPU',
            default: false,
            description: 'i18n:web-desktop.tips.webgpu',
            render: {
                ui: 'ui-checkbox',
            },
            experiment: true,
        },
        resolution: {
            type: 'object',
            label: 'i18n:web-desktop.options.resolution',
            itemConfigs: {
                designWidth: {
                    label: 'i18n:web-desktop.options.design_width',
                    default: 1280,
                    render: {
                        ui: 'ui-num-input',
                    },
                },
                designHeight: {
                    label: 'i18n:web-desktop.options.design_height',
                    default: 960,
                    render: {
                        ui: 'ui-num-input',
                    },
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
    hooks: './hooks',
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
};

export default config;