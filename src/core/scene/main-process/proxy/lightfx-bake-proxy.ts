import type { IPublicLightProbeBakeService, IPublicLightmapBakeService } from '../../common';
import { lightFXBakeRenderer } from '../lightfx-bake-renderer';
import { Rpc } from '../rpc';

export const LightProbeBakeProxy: IPublicLightProbeBakeService = {
    queryCapabilities: () => lightFXBakeRenderer.invoke(
        'LightProbeBake', 'queryCapabilities', [], 30_000,
        () => Rpc.getInstance().request('LightProbeBake', 'queryCapabilities'),
    ),
    bake: (options) => lightFXBakeRenderer.invoke(
        'LightProbeBake', 'bake', [options], (options.timeoutMs ?? 600_000) + 30_000,
        () => Rpc.getInstance().request('LightProbeBake', 'bake', [options]), true,
    ),
    clearBake: (options) => lightFXBakeRenderer.invoke(
        'LightProbeBake', 'clearBake', [options], 120_000,
        () => Rpc.getInstance().request('LightProbeBake', 'clearBake', [options]),
    ),
    cancel: () => lightFXBakeRenderer.cancel(
        'LightProbeBake',
        () => Rpc.getInstance().request('LightProbeBake', 'cancel'),
    ),
};

export const LightmapBakeProxy: IPublicLightmapBakeService = {
    queryCapabilities: () => lightFXBakeRenderer.invoke(
        'LightmapBake', 'queryCapabilities', [], 30_000,
        () => Rpc.getInstance().request('LightmapBake', 'queryCapabilities'),
    ),
    bake: (options) => lightFXBakeRenderer.invoke(
        'LightmapBake', 'bake', [options], (options.timeoutMs ?? 600_000) + 30_000,
        () => Rpc.getInstance().request('LightmapBake', 'bake', [options]), true,
    ),
    queryBakeInfo: () => lightFXBakeRenderer.invoke(
        'LightmapBake', 'queryBakeInfo', [], 120_000,
        () => Rpc.getInstance().request('LightmapBake', 'queryBakeInfo'),
    ),
    clearBake: (options) => lightFXBakeRenderer.invoke(
        'LightmapBake', 'clearBake', [options], 120_000,
        () => Rpc.getInstance().request('LightmapBake', 'clearBake', [options]),
    ),
    cancel: () => lightFXBakeRenderer.cancel(
        'LightmapBake',
        () => Rpc.getInstance().request('LightmapBake', 'cancel'),
    ),
};
