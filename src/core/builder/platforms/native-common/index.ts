'use strict';

import { join } from 'path';
import { IDisplayOptions } from '../../@types';
import { IBuildStageItem, IInternalBuildPluginConfig, IPlatformBuildPluginConfig } from '../../@types/protected';
import Utils from '../../../base/utils';

const customBuildStages: IBuildStageItem[] = [{
    name: 'make',
    hook: 'make',
    displayName: 'i18n:native.options.make',
}, {
    name: 'run',
    displayName: 'i18n:native.options.run',
    hook: 'run',
}];

export const baseNativeCommonOptions: IDisplayOptions = {
    hotModuleReload: {
        label: 'Hot Module Reload',
        type: 'boolean',
        default: false,
        experiment: true,
    },
    serverMode: {
        label: 'Server Mode',
        type: 'boolean',
        default: false,
    },
    netMode: {
        label: 'NetMode',
        type: 'enum',
        default: 0,
        items: [
            { label: 'Client', value: 0 },
            { label: 'Host Server', value: 1 },
            { label: 'Listen Server', value: 2 },
        ],
    },
    encrypted: {
        label: 'i18n:native.options.encrypted',
        type: 'boolean',
        default: false,
    },
    xxteaKey: {
        label: 'i18n:native.options.xxtea_key',
        type: 'string',
        default: Utils.UUID.generate().substr(0, 16),
    },
    compressZip: {
        label: 'i18n:native.options.compress_zip',
        type: 'boolean',
        default: false,
    },
    JobSystem: {
        label: 'Job System',
        type: 'enum',
        default: 'none',
        items: [
            { label: 'None', value: 'none' },
            { label: 'TaskFlow', value: 'taskFlow' },
            { label: 'TBB', value: 'tbb' },
        ],
        verifyRules: [],
    },
};

export const commonOptions: IInternalBuildPluginConfig & Pick<IPlatformBuildPluginConfig, 'assetBundleConfig' | 'buildTemplateConfig'> = {
        doc: 'editor/publish/native-options.html',
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
    customBuildStages,
};
