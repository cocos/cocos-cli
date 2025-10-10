import { ApiBase } from "../base/api-base";
import { build } from '../../core/builder'
import { HttpStatusCode, COMMON_STATUS, CommonResultType } from "../base/scheme-base";
import { BuildExitCode } from "../../core/builder/@types/protected";
import BuildErrorMap from "../../core/builder/error-map";
import { description, param, title, tool } from "../decorator/decorator";
import { SchemeBuildOption, SchemeBuildOptionType } from "./schema";

export class BuilderApi extends ApiBase {
    constructor() {
        super();
    }
    async init() {

    }

    @tool('build')
    @title('构建项目')
    @description('根据选项将项目构建成指定平台游戏包, 如项目内已经设置好构建选项，则不需要传入参数')
    async build(@param(SchemeBuildOption) options?: SchemeBuildOptionType) {
        let code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<{ exitCode: number }> = {
            code: code,
            data: {
                exitCode: 0,
            },
        };
        try {
            const exitCode = await build(options);
            if (exitCode !== BuildExitCode.BUILD_SUCCESS) {
                ret.code = COMMON_STATUS.FAIL;
                ret.reason = BuildErrorMap[exitCode];
            }
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error('build project failed:', e instanceof Error ? e.message : String(e));
            ret.reason = e instanceof Error ? e.message : String(e);
        }
    }
}