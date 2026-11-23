import { z } from 'zod';
import { createCommonResult } from '../base/schema-base';
import { getPlatformBuildSchema, queryPlatformConfig } from '../../core/builder';
import { queryEngineModules, validateBuildConfig } from '../../core/builder/configuration';
import { build, createBuildTemplate as createCoreBuildTemplate, executeBuildStageTask, queryDefaultBuildConfigByPlatform } from '../../core/builder';
import { HttpStatusCode, COMMON_STATUS, CommonResultType } from '../base/schema-base';
import { BuildExitCode } from '../../core/builder/@types/protected';
import { description, param, result, title, tool } from '../decorator/decorator';
import { SchemaBuildConfigResult, SchemaBuildOption, SchemaBuildResult, SchemaPlatform, SchemaBuildDest, SchemaRunResult, TBuildConfigResult, TBuildOption, TBuildResultData, TPlatform, TBuildDest, TRunResult, SchemaPlatformCanMake, TPlatformCanMake, IMakeResultData, IRunResultData, IUploadResultData, IPublishResultData, SchemaMakeResult, SchemaUploadResult, SchemaPublishResult, SchemaUploadAccessToken, TUploadAccessToken, SchemaBuildTemplateName, TBuildTemplateName, SchemaCreateBuildTemplateResult, TCreateBuildTemplateResult } from './schema';

const SchemaConfigurationResult = createCommonResult(z.object({}).passthrough());
const SchemaConfigurationOptions = z.object({}).passthrough().describe('Partial build configuration. Fields are described by builder-query-build-config-schema.');
const SchemaConfigurationIssue = z.object({ code: z.string(), path: z.string(), message: z.string() });
const SchemaValidationResult = createCommonResult(z.object({
    valid: z.boolean(),
    errors: z.array(SchemaConfigurationIssue),
    warnings: z.array(SchemaConfigurationIssue),
    checks: z.record(z.object({
        valid: z.boolean(), level: z.enum(['error', 'warn']).optional(),
        message: z.string().optional(), fixedValue: z.unknown().optional(),
    })),
}));
const SchemaModulesResult = createCommonResult(z.object({
    modules: z.array(z.object({ id: z.string(), dependencies: z.array(z.string()) }).passthrough()),
    selectedModules: z.array(z.string()),
}));

export class BuilderApi {
    private async configurationResult(operation: () => unknown | Promise<unknown>) {
        try {
            return { code: COMMON_STATUS.SUCCESS, data: await operation() };
        } catch (error) {
            return { code: COMMON_STATUS.FAIL, reason: error instanceof Error ? error.message : String(error) };
        }
    }

    @tool('builder-query-platforms')
    @title('Query Build Platforms')
    @description('List platforms registered with the initialized builder. Use their platform identifiers in build requests.')
    @result(SchemaConfigurationResult)
    async queryPlatforms() {
        return this.configurationResult(() => ({ platforms: queryPlatformConfig() }));
    }

    @tool('builder-query-build-config-schema')
    @title('Query Build Configuration Schema')
    @description('Query common and platform-specific field schemas. Common fields are top-level; platformOptions belong under packages[platform]. This is the builder field schema, not a standalone JSON Schema document.')
    @result(SchemaConfigurationResult)
    async queryBuildConfigSchema(@param(SchemaPlatform) platform: TPlatform) {
        return this.configurationResult(() => getPlatformBuildSchema(platform));
    }

    @tool('builder-query-engine-modules')
    @title('Query Engine Modules')
    @description('List available includeModules identifiers, declared dependencies, environment restrictions and project-selected modules for the current engine.')
    @result(SchemaModulesResult)
    async queryEngineModules() {
        return this.configurationResult(() => queryEngineModules());
    }

    @tool('builder-validate-build-config')
    @title('Validate Build Configuration')
    @description('Check partial build options against platform defaults and builder rules without starting a build. Inspect data.valid, errors, warnings and per-field checks. This does not resolve the final engine dependency graph or validate toolchain availability.')
    @result(SchemaValidationResult)
    async validateBuildConfig(@param(SchemaPlatform) platform: TPlatform, @param(SchemaConfigurationOptions) options: Record<string, unknown>) {
        return this.configurationResult(() => validateBuildConfig(platform, options));
    }


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
            const res = await build(platform, {
                ...options,
                isApiBuild: true,
            });
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

    @tool('builder-publish')
    @title('Publish Build Package') // 发布构建产物
    @description('Publish a previously uploaded game package, supported only by some platforms. Requires a successful upload stage to have produced a packageId.') // 发布已经上传成功的游戏包，仅部分平台支持，需要先成功执行过上传阶段以获取 packageId
    @result(SchemaPublishResult)
    async publish(@param(SchemaPlatform) platform: TPlatform, @param(SchemaBuildDest) dest: TBuildDest): Promise<CommonResultType<IPublishResultData>> {
        const code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<IPublishResultData> = {
            code: code,
            data: null,
        };
        try {
            const res = await executeBuildStageTask(platform, 'publish', {
                dest,
                platform,
            });
            ret.data = res as IPublishResultData;
            if (res.code !== BuildExitCode.BUILD_SUCCESS) {
                ret.code = COMMON_STATUS.FAIL;
                ret.reason = res.reason || `Publish ${platform} in ${dest} failed!`;
            }
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error(`publish project ${dest} in platform ${platform} failed:`, e instanceof Error ? e.message : String(e));
            ret.reason = e instanceof Error ? e.message : String(e);
        }
        return ret;
    }
}
