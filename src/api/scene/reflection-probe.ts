import { description, param, result, title, tool } from '../decorator/decorator';
import { COMMON_STATUS, CommonResultType } from '../base/schema-base';
import { Scene } from '../../core/scene';
import {
    SchemaReflectionProbeBakeAllOptions,
    SchemaReflectionProbeBakeAllResult,
    SchemaReflectionProbeBakeOptions,
    SchemaReflectionProbeBakeResult,
    TReflectionProbeBakeAllOptions,
    TReflectionProbeBakeAllResult,
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

    @tool('scene-bake-reflection-probes')
    @title('Bake all reflection probes')
    @description('Bake all active cube reflection probes, or the requested node paths, in the active Pink/browser scene. The scene is saved once after all successful probes are applied; no scene-open call is required.')
    @result(SchemaReflectionProbeBakeAllResult)
    async bakeAll(
        @param(SchemaReflectionProbeBakeAllOptions) options: TReflectionProbeBakeAllOptions,
    ): Promise<CommonResultType<TReflectionProbeBakeAllResult>> {
        try {
            const data = await Scene.ReflectionProbe.bakeAll(options);
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
