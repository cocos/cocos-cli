import { ApiBase } from "../base/api-base";
import { build } from '../../core/builder'
import { TCreateJsonFileResult } from "../assets/scheme";
import { HttpStatusCode, COMMON_STATUS, CommonResultType } from "../base/scheme-base";
import { BuildExitCode, IBuildCommandOption } from "../../core/builder/@types/protected";
import BuildErrorMap from "../../core/builder/error-map";

export class Builder extends ApiBase {
    async init() {

    }

    async build(options: IBuildCommandOption) {
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