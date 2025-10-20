import { ApiBase } from '../base/api-base';
import { build, getPreviewSettings } from '../../core/builder';
import { HttpStatusCode, COMMON_STATUS, CommonResultType } from '../base/schema-base';
import { BuildExitCode } from '../../core/builder/@types/protected';
import BuildErrorMap from '../../core/builder/error-map';
import { description, param, result, title, tool } from '../decorator/decorator';
import { SchemaBuildOption, SchemaBuildOptionType, SchemaBuildResult, SchemaPreviewSettingsResult, TPreviewSettingsResult } from './schema';

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

    @tool('builder-get-preview-settings')
    @title('获取预览设置')
    @description('获取预览设置')
    @result(SchemaPreviewSettingsResult)
    async getPreviewSettings() {
        const code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<TPreviewSettingsResult> = {
            code: code,
            data: null,
        };
        try {
            ret.data = await getPreviewSettings();
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error('get preview settings fail:', e instanceof Error ? e.message : String(e));
            ret.reason = e instanceof Error ? e.message : String(e);
        }
        return ret;
    }
}