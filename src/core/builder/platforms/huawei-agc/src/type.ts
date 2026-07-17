import { IInternalBuildOptions, InternalBuildResult } from '../../../@types/protected';
import { CocosParams } from '../../native-common/pack-tool/base/default';
import { ICustomBuildScriptParam } from '../../native-common/type';
import { IOptions as AndroidOptions } from '../../android/src/type';

export interface IOptions extends AndroidOptions {
    serviceConfigPath: string;
}

export interface IHuaweiAgcInternalBuildOptions extends IInternalBuildOptions {
    packages: {
        'huawei-agc': IOptions;
    };
    buildScriptParam: ICustomBuildScriptParam;
    cocosParams: CocosParams<Record<string, unknown>>;
    platform: 'huawei-agc';
}

export interface IBuildResult extends InternalBuildResult {
    userFrameWorks: boolean;
}
