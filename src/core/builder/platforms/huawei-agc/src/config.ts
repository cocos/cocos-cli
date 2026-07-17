'use strict';

import { IPlatformBuildPluginConfig } from '../../../@types/protected';
import androidConfig from '../../android/src/config';

const config: IPlatformBuildPluginConfig = {
    ...androidConfig,
    displayName: 'i18n:huawei-agc.title',
    platformType: 'ANDROID',
    doc: 'editor/publish/publish-huawei-agc.html',
    hooks: './src/hooks',
    options: {
        ...(androidConfig.options || {}),
        serviceConfigPath: {
            label: 'i18n:huawei-agc.options.service_config_path',
            type: 'string',
            default: '',
            verifyRules: ['required']
        }
    },
};

export default config;
