import type { IReflectionProbeTaskState, IReflectionProbeCancelOptions, IReflectionProbeSceneIdentity, IReflectionProbeCapabilities } from '../../core/scene/common/reflection-probe';
import { description, param, result, title, tool } from '../decorator/decorator';
import { COMMON_STATUS, CommonResultType } from '../base/schema-base';
import { Scene } from '../../core/scene';
import {
    SchemaReflectionProbeBakeAllOptions,
    SchemaReflectionProbeTaskState, SchemaReflectionProbeTaskQuery, SchemaReflectionProbeCancelOptions, SchemaReflectionProbeCapabilities,
    SchemaReflectionProbeBakeAllResult,
    SchemaReflectionProbeBakeOptions,
    SchemaReflectionProbeBakeResult,
    SchemaReflectionProbeClearOptions,
    SchemaReflectionProbeClearResult,
    TReflectionProbeBakeAllOptions,
    TReflectionProbeBakeAllResult,
    TReflectionProbeBakeOptions,
    TReflectionProbeBakeResult,
    TReflectionProbeClearOptions,
    TReflectionProbeClearResult,
} from './reflection-probe-schema';

export class ReflectionProbeApi {
    @tool('scene-start-reflection-probe-bake')
    @title('Start or queue reflection-probe baking')
    @description('Accept a reflection-probe bake task immediately, or append selected component UUIDs to the running task. Query the task to observe completion.')
    @result(SchemaReflectionProbeTaskState)
    async startBake(@param(SchemaReflectionProbeBakeAllOptions) options: TReflectionProbeBakeAllOptions): Promise<CommonResultType<IReflectionProbeTaskState>> {
        try { return { code: COMMON_STATUS.SUCCESS, data: await Scene.ReflectionProbe.startBake(options) }; }
        catch (error) { return { code: COMMON_STATUS.FAIL, reason: String(error) }; }
    }

    @tool('scene-query-reflection-probe-bake')
    @title('Query reflection-probe task')
    @description('Read the current reflection-probe bake or clear snapshot, including task identity, source scene, queue, progress, logs and terminal state. Does not replay operations.')
    @result(SchemaReflectionProbeTaskState)
    async getTaskState(@param(SchemaReflectionProbeTaskQuery) options: { source?: IReflectionProbeSceneIdentity }): Promise<CommonResultType<IReflectionProbeTaskState>> {
        try { return { code: COMMON_STATUS.SUCCESS, data: await Scene.ReflectionProbe.getTaskState(options.source) }; }
        catch (error) { return { code: COMMON_STATUS.FAIL, reason: String(error) }; }
    }

    @tool('scene-cancel-reflection-probe-bake')
    @title('Cancel reflection-probe task')
    @description('Request cancellation of the specified reflection-probe task. A cancelling response is not completion; query until cancelled or another terminal state.')
    @result(SchemaReflectionProbeTaskState)
    async cancelBake(@param(SchemaReflectionProbeCancelOptions) options: IReflectionProbeCancelOptions): Promise<CommonResultType<IReflectionProbeTaskState>> {
        try { return { code: COMMON_STATUS.SUCCESS, data: await Scene.ReflectionProbe.cancelBake(options) }; }
        catch (error) { return { code: COMMON_STATUS.FAIL, reason: String(error) }; }
    }

    @tool('scene-query-reflection-probe-capabilities')
    @title('Query reflection-probe capabilities')
    @description('Check the Node bake host, native cmft executable, image processor and writable project assets before enabling bake operations.')
    @result(SchemaReflectionProbeCapabilities)
    async getCapabilities(): Promise<CommonResultType<IReflectionProbeCapabilities>> {
        try { return { code: COMMON_STATUS.SUCCESS, data: await Scene.ReflectionProbe.getCapabilities() }; }
        catch (error) { return { code: COMMON_STATUS.FAIL, reason: String(error) }; }
    }

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

    @tool('scene-clear-reflection-probes')
    @title('Clear all baked reflection probes')
    @description('Clear all baked cubemap bindings in the active Pink/browser scene, optionally delete CLI-generated assets, and save the scene. No scene-open call is required.')
    @result(SchemaReflectionProbeClearResult)
    async clearAll(
        @param(SchemaReflectionProbeClearOptions) options: TReflectionProbeClearOptions,
    ): Promise<CommonResultType<TReflectionProbeClearResult>> {
        try {
            const data = await Scene.ReflectionProbe.clearAll(options);
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
