import { description, param, result, title, tool } from '../decorator/decorator';
import { COMMON_STATUS, CommonResultType } from '../base/schema-base';
import { Scene } from '../../core/scene';
import {
    SchemaReflectionProbeBakeOptions,
    SchemaReflectionProbeBakeResult,
    TReflectionProbeBakeOptions,
    TReflectionProbeBakeResult,
} from './reflection-probe-schema';

export class ReflectionProbeApi {
    @tool('scene-bake-reflection-probe')
    @title('Bake reflection probe')
    @description('Bake a cube reflection probe in the active Pink/browser scene, hot-apply its TextureCube to that same scene, and optionally save it. No scene-open call is required.')
    @result(SchemaReflectionProbeBakeResult)
    async bake(
        @param(SchemaReflectionProbeBakeOptions) options: TReflectionProbeBakeOptions,
    ): Promise<CommonResultType<TReflectionProbeBakeResult>> {
        try {
            const data = await Scene.ReflectionProbe.bake(options);
            return { code: COMMON_STATUS.SUCCESS, data };
        } catch (error) {
            console.error(error);
            return {
                code: COMMON_STATUS.FAIL,
                reason: error instanceof Error ? error.message : String(error),
            };
        }
    }
}
