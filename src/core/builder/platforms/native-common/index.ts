'use strict';

import { join } from 'path';
import { IDisplayOptions } from '../../@types';
import { IBuildStageItem, IInternalBuildPluginConfig } from '../../@types/protected';
import Utils from '../../../base/utils';

const customBuildStages: IBuildStageItem[] = [{
    name: 'make',
    hook: 'make',
    displayName: 'i18n:native.options.make',
}, {
    name: 'run',
    displayName: 'i18n:native.options.run',
    hook: 'make',
}];

export const baseNativeCommonOptions: IInternalBuildPluginConfig = {
    doc: 'editor/publish/native-options.html',
    options: {
        encrypted: {
            default: false,
        },
        xxteaKey: {
            default: Utils.UUID.generate().substr(0, 16),
        },
        compressZip: {
            default: false,
        },
        JobSystem: {
            default: 'none',
            verifyRules: [],
        },
    },
    hooks: './hooks',
    priority: 2,
    assetBundleConfig: {
        supportedCompressionTypes: ['none', 'merge_dep', 'merge_all_json'],
        platformType: 'native',
    },
    buildTemplateConfig: {
        templates: [{
            path: join(__dirname, '../../../../../resources/3d/engine/templates/native/index.ejs'),
            destUrl: 'index.ejs',
        }],
        version: '1.0.0',
        dirname: 'native',
        displayName: 'i18n:native.title',
    },
};

export const serverOptions: IDisplayOptions = {
    hotModuleReload: {
        default: false,
        label: 'Hot Module Reload',
        render: {
            ui: 'ui-checkbox',
        },
        experiment: true,
    },
    serverMode: {
        default: false,
        label: 'Server Mode',
        render: {
            ui: 'ui-checkbox',
        },
    },
    netMode: {
        label: 'NetMode',
        default: '0',
        render: {
            ui: 'ui-select-pro',
            items: [{
                label: 'Client',
                value: '0',
            }, {
                label: 'ListenServer',
                value: '1',
            }, {
                label: 'HostServer',
                value: '2',
            }],
        },
    },
};

export const commonOptions = {
    ...baseNativeCommonOptions,
    customBuildStages,
};
