import { build, queryDefaultBuildConfigByPlatform, run } from '../../core/builder';
import { HttpStatusCode, COMMON_STATUS, CommonResultType } from '../base/schema-base';
import { BuildExitCode, IBuildCommandOption } from '../../core/builder/@types/protected';
import { description, param, result, title, tool } from '../decorator/decorator';
import { SchemaBuildConfigResult, SchemaBuildOption, SchemaBuildResult, SchemaPlatform, SchemaRunDest, SchemaRunResult, TBuildConfigResult, TBuildOption, TBuildResultData, TPlatform, TRunDest, TRunResult } from './schema';

export class BuilderApi {

    @tool('builder-build')
    @title('构建项目')
    @description('根据选项将项目构建成指定平台游戏包, 如项目内已经设置好构建选项，则不需要传入参数')
    @result(SchemaBuildResult)
    async build(@param(SchemaPlatform) platform: TPlatform, @param(SchemaBuildOption) options?: TBuildOption) {
        const code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<TBuildResultData> = {
            code: code,
            data: null,
        };
        try {
            const res = await build(platform, options as unknown as IBuildCommandOption<TPlatform>);
            ret.data = res;
            if (res.code !== BuildExitCode.BUILD_SUCCESS) {
                ret.code = COMMON_STATUS.FAIL;
                ret.reason = res.reason || 'Build failed!';
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

    @tool('builder-query-default-build-config')
    @title('获取平台默认构建配置')
    @description('获取平台默认构建配置')
    @result(SchemaBuildConfigResult)
    async queryDefaultBuildConfig(@param(SchemaPlatform) platform: TPlatform) {
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

    @tool('builder-run')
    @title('运行构建结果')
    @description('运行构建后的游戏，不同平台的效果不同，目前 web 平台支持启动构建结果的预览服务器，返回运行 URL')
    @result(SchemaRunResult)
    async run(@param(SchemaRunDest) dest: TRunDest): Promise<CommonResultType<TRunResult>> {
        const code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<TRunResult> = {
            code: code,
            data: '',
        };
        try {
            ret.data = await run(dest);
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error('run build result failed:', e instanceof Error ? e.message : String(e));
            ret.reason = e instanceof Error ? e.message : String(e);
        }
        return ret;
    }
}