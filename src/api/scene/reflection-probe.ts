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
    @description('Capture and bake a cube reflection probe, import its TextureCube, bind it to the component, and optionally save the scene.')
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
