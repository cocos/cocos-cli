import { COMMON_STATUS, CommonResultType } from '../base/schema-base';
import { description, param, result, title, tool } from '../decorator/decorator';
import { Scene } from '../../core/scene';
import {
    SchemaClearCountResult, SchemaLightFXCancelResult, SchemaLightmapBakeOptions, SchemaLightmapBakeResult,
    SchemaLightmapClearOptions, SchemaLightProbeBakeOptions, SchemaLightProbeBakeResult, SchemaLightProbeClearOptions,
    TLightmapBakeOptions, TLightmapBakeResult, TLightProbeBakeOptions, TLightProbeBakeResult,
} from './lightfx-bake-schema';

async function execute<T>(operation: () => Promise<T>): Promise<CommonResultType<T>> {
    try { return { code: COMMON_STATUS.SUCCESS, data: await operation() }; }
    catch (error) { return { code: COMMON_STATUS.FAIL, reason: error instanceof Error ? error.message : String(error) }; }
}

export class LightFXBakeApi {
    @tool('scene-bake-light-probes')
    @title('Bake light probes')
    @description('Bake all light probes in the current scene with LightFX and write spherical-harmonic coefficients back to the scene.')
    @result(SchemaLightProbeBakeResult)
    bakeLightProbes(@param(SchemaLightProbeBakeOptions) options: TLightProbeBakeOptions): Promise<CommonResultType<TLightProbeBakeResult>> {
        return execute(() => Scene.LightProbeBake.bake(options));
    }

    @tool('scene-clear-light-probes')
    @title('Clear baked light probes')
    @description('Clear spherical-harmonic bake results from all light probes in the current scene.')
    @result(SchemaClearCountResult)
    clearLightProbes(@param(SchemaLightProbeClearOptions) options: { saveScene?: boolean }): Promise<CommonResultType<{ probeCount: number }>> {
        return execute(() => Scene.LightProbeBake.clearBake(options));
    }

    @tool('scene-bake-lightmap')
    @title('Bake lightmap')
    @description('Bake the current scene lightmap with LightFX, import generated textures, bind them to renderers and save the scene.')
    @result(SchemaLightmapBakeResult)
    bakeLightmap(@param(SchemaLightmapBakeOptions) options: TLightmapBakeOptions): Promise<CommonResultType<TLightmapBakeResult>> {
        return execute(() => Scene.LightmapBake.bake(options));
    }

    @tool('scene-clear-lightmap')
    @title('Clear baked lightmap')
    @description('Unbind baked lightmaps from the current scene and optionally delete generated assets.')
    @result(SchemaClearCountResult)
    clearLightmap(@param(SchemaLightmapClearOptions) options: { saveScene?: boolean; deleteAssets?: boolean }): Promise<CommonResultType<{ clearedCount: number }>> {
        return execute(() => Scene.LightmapBake.clearBake(options));
    }

    @tool('scene-cancel-lightfx-bake')
    @title('Cancel LightFX bake')
    @description('Cancel the currently running light-probe or lightmap bake.')
    @result(SchemaLightFXCancelResult)
    cancel(): Promise<CommonResultType<{ cancelled: boolean; target: 'light-probe' | 'lightmap' | null }>> {
        return execute(async () => {
            const probe = await Scene.LightProbeBake.cancel();
            return probe.cancelled ? probe : Scene.LightmapBake.cancel();
        });
    }
}
