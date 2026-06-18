import { build, createBuildTemplate as createCoreBuildTemplate, executeBuildStageTask, queryDefaultBuildConfigByPlatform } from '../../core/builder';
import { HttpStatusCode, COMMON_STATUS, CommonResultType } from '../base/schema-base';
import { BuildExitCode, IBuildCommandOption } from '../../core/builder/@types/protected';
import { description, param, result, title, tool } from '../decorator/decorator';
import { SchemaBuildConfigResult, SchemaBuildOption, SchemaBuildResult, SchemaPlatform, SchemaBuildDest, SchemaRunResult, TBuildConfigResult, TBuildOption, TBuildResultData, TPlatform, TBuildDest, TRunResult, SchemaPlatformCanMake, TPlatformCanMake, IMakeResultData, IRunResultData, IUploadResultData, SchemaMakeResult, SchemaUploadResult, SchemaUploadAccessToken, TUploadAccessToken, SchemaBuildTemplateName, TBuildTemplateName, SchemaCreateBuildTemplateResult, TCreateBuildTemplateResult } from './schema';

export class BuilderApi {

    @tool('builder-build')
    @title('Build Project') // 构建项目
    @description('Compile and package the project for the specified platform (e.g. web-mobile, android, ios). This is a BUILD step only — it does NOT launch or run the game. To launch the built game afterward, use builder-run separately.') // 将项目编译并打包为指定平台的游戏包（例如 web-mobile、android、ios），这是构建步骤，不会启动或运行游戏。如需启动游戏请单独使用 builder-run
    @result(SchemaBuildResult)
    async build(@param(SchemaPlatform) platform: TPlatform, @param(SchemaBuildOption) options?: TBuildOption) {
        const code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<TBuildResultData> = {
            code: code,
            data: null,
        };
        try {
            const res = await build(platform, options);
            ret.data = res as TBuildResultData;
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
    // @title('Get Preview Settings') // 获取预览设置
    // @description('Get Preview Settings') // 获取预览设置
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
    @title('Get Default Build Config') // 获取平台默认构建配置
    @description('Get default build configuration for platform') // 获取平台默认构建配置
    @result(SchemaBuildConfigResult)
    async queryDefaultBuildConfig(@param(SchemaPlatform) platform: TPlatform) {
        const code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<TBuildConfigResult> = {
            code: code,
            data: null,
        };

        try {
            // Temporarily bypassed // 暂时绕过
            ret.data = await queryDefaultBuildConfigByPlatform(platform) as unknown as TBuildConfigResult;
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error('query default build config by platform fail:', e instanceof Error ? e.message : String(e));
            ret.reason = e instanceof Error ? e.message : String(e);
        }
        return ret;
    }

    @tool('builder-create-build-template')
    @title('Create Build Template')
    @description('Create or update the user build template for a platform or build template display name.')
    @result(SchemaCreateBuildTemplateResult)
    async createBuildTemplate(@param(SchemaBuildTemplateName) nameOrPlatform: TBuildTemplateName): Promise<CommonResultType<TCreateBuildTemplateResult>> {
        const code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<TCreateBuildTemplateResult> = {
            code: code,
            data: null,
        };

        try {
            await createCoreBuildTemplate(nameOrPlatform);
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error('create build template failed:', e instanceof Error ? e.message : String(e));
            ret.reason = e instanceof Error ? e.message : String(e);
        }
        return ret;
    }

    @tool('builder-make')
    @title('Make Build Package') // 编译构建包
    @description('Compile the built game package, supported only by some platforms') // 编译构建后的游戏包，仅部分平台支持
    @result(SchemaMakeResult)
    async make(@param(SchemaPlatformCanMake) platform: TPlatformCanMake, @param(SchemaBuildDest) dest: TBuildDest) {
        const code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<IMakeResultData> = {
            code: code,
            data: null,
        };
        try {
            const res = await executeBuildStageTask(platform, 'make', {
                dest,
                platform,
            });
            ret.data = res as IMakeResultData;
            if (res.code !== BuildExitCode.BUILD_SUCCESS) {
                ret.code = COMMON_STATUS.FAIL;
                ret.reason = res.reason || `Make ${platform} in ${dest} failed!`;
            }
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error(`make project ${dest} in platform ${platform} failed:`, e instanceof Error ? e.message : String(e));
            ret.reason = e instanceof Error ? e.message : String(e);
        }
        return ret;
    }

    @tool('builder-run')
    @title('Run Build Result') // 运行构建结果
    @description('Launch and run a previously built game package. This is NOT a build step — it requires that builder-build has already completed successfully. Do NOT call this instead of builder-build; the two are separate sequential steps: build first, then run.') // 启动并运行已经构建好的游戏包，这不是构建步骤——需要先成功执行过 builder-build。不要用此命令代替 builder-build，两者是独立的顺序步骤：先构建，再运行
    @result(SchemaBuildResult)
    async run(@param(SchemaPlatform) platform: TPlatform, @param(SchemaBuildDest) dest: TBuildDest): Promise<CommonResultType<IRunResultData>> {
        const code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<IRunResultData> = {
            code: code,
            data: null,
        };
        try {
            const res = await executeBuildStageTask(platform, 'run', {
                dest,
                platform,
            });
            ret.data = res;
            if (res.code !== BuildExitCode.BUILD_SUCCESS) {
                ret.code = COMMON_STATUS.FAIL;
                ret.reason = res.reason || `Run ${platform} in ${dest} failed!`;
            }
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error('run build result failed:', e instanceof Error ? e.message : String(e));
            ret.reason = e instanceof Error ? e.message : String(e);
        }
        return ret;
    }

    @tool('builder-upload')
    @title('Upload Build Package') // 上传构建产物
    @description('Upload a previously built game package, supported only by some platforms') // 上传已经构建好的游戏包，仅部分平台支持
    @result(SchemaUploadResult)
    async upload(@param(SchemaPlatform) platform: TPlatform, @param(SchemaBuildDest) dest: TBuildDest, @param(SchemaUploadAccessToken) accessToken?: TUploadAccessToken): Promise<CommonResultType<IUploadResultData>> {
        const code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<IUploadResultData> = {
            code: code,
            data: null,
        };
        try {
            const res = await executeBuildStageTask(platform, 'upload', {
                dest,
                platform,
                packages: accessToken ? {
                    [platform]: {
                        accessToken,
                    },
                } : undefined,
            });
            ret.data = res as IUploadResultData;
            if (res.code !== BuildExitCode.BUILD_SUCCESS) {
                ret.code = COMMON_STATUS.FAIL;
                ret.reason = res.reason || `Upload ${platform} in ${dest} failed!`;
            }
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error(`upload project ${dest} in platform ${platform} failed:`, e instanceof Error ? e.message : String(e));
            ret.reason = e instanceof Error ? e.message : String(e);
        }
        return ret;
    }
}
