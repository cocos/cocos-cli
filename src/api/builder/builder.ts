import { ApiBase } from '../base/api-base';
import { build, getPreviewSettings, queryDefaultBuildConfigByPlatform } from '../../core/builder';
import { HttpStatusCode, COMMON_STATUS, CommonResultType } from '../base/schema-base';
import { BuildExitCode, IBuildTaskOption } from '../../core/builder/@types/protected';
import BuildErrorMap from '../../core/builder/error-map';
import { description, param, result, title, tool } from '../decorator/decorator';
import { SchemaBuildConfigResult, SchemaBuildOption, SchemaBuildOptionType, SchemaBuildResult, SchemaPlatform, SchemaPlatformType, SchemaPreviewSettingsResult, TBuildConfigResult, TPreviewSettingsResult } from './schema';

export class BuilderApi extends ApiBase {
    constructor() {
        super();
    }
    async init() {

    }

    @tool('builder-build')
    @title('构建项目')
    @description('根据选项将项目构建成指定平台游戏包, 如项目内已经设置好构建选项，则不需要传入参数')
    @result(SchemaBuildResult)
    async build(@param(SchemaBuildOption) options?: SchemaBuildOptionType) {
        const code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<number> = {
            code: code,
            data: -1,
        };
        try {
            const exitCode = await build(options);
            ret.data = exitCode;
            if (exitCode !== BuildExitCode.BUILD_SUCCESS) {
                ret.code = COMMON_STATUS.FAIL;
                ret.reason = BuildErrorMap[exitCode];
            }
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error('build project failed:', e instanceof Error ? e.message : String(e));
            ret.reason = e instanceof Error ? e.message : String(e);
        }
        return ret;
    }

    // @tool('builder-get-preview-settings')
    // @title('获取预览设置')
    // @description('获取预览设置')
    // @result(SchemaPreviewSettingsResult)
    // async getPreviewSettings() {
    //     const code: HttpStatusCode = COMMON_STATUS.SUCCESS;
    //     const ret: CommonResultType<TPreviewSettingsResult> = {
    //         code: code,
    //         data: null,
    //     };
    //     try {
    //         ret.data = await getPreviewSettings();
    //     } catch (e) {
    //         ret.code = COMMON_STATUS.FAIL;
    //         console.error('get preview settings fail:', e instanceof Error ? e.message : String(e));
    //         ret.reason = e instanceof Error ? e.message : String(e);
    //     }
    //     return ret;
    // }

    @tool('builder-query-default-build-config-by-platform')
    @title('获取平台默认构建配置')
    @description('获取平台默认构建配置')
    @result(SchemaBuildConfigResult)
    async queryDefaultBuildConfigByPlatform(@param(SchemaPlatform) platform: SchemaPlatformType) {
        const code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<TBuildConfigResult> = {
            code: code,
            data: null,
        };

        try {
            // 暂时绕过
            ret.data = await queryDefaultBuildConfigByPlatform(platform) as unknown as TBuildConfigResult;
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error('query default build config by platform fail:', e instanceof Error ? e.message : String(e));
            ret.reason = e instanceof Error ? e.message : String(e);
        }
        return ret;
    }
}