'use strict';

import { join } from 'path';
import { IPlatformBuildPluginConfig } from '../../@types/protected';
import { GlobalPaths } from '../../../../global';
const PLATFORM = 'web-desktop';
const buildTemplateDir = join(GlobalPaths.staticDir, `build-templates/${PLATFORM}`);

const config: IPlatformBuildPluginConfig = {
    displayName: 'i18n:web-desktop.title',
    platformType: 'HTML5',
    doc: 'editor/publish/publish-web.html',
    options: {
        useWebGPU: {
            label: 'WEBGPU',
            type: 'boolean',
            default: false,
            description: 'i18n:web-desktop.tips.webgpu',
            experiment: true,
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
    customBuildStages: [{
        hook: 'run',
        name: 'run',
        requiredBuildOptions: false,
    }],
};

export default config;