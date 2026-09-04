import type { IPublicLightProbeBakeService, IPublicLightmapBakeService } from '../../common';
import { lightFXBakeRenderer } from '../lightfx-bake-renderer';
import { Rpc } from '../rpc';

export const LightProbeBakeProxy: IPublicLightProbeBakeService = {
    bake: (options) => lightFXBakeRenderer.invoke(
        'LightProbeBake', 'bake', [options], (options.timeoutMs ?? 600_000) + 30_000,
        () => Rpc.getInstance().request('LightProbeBake', 'bake', [options]), true,
    ),
    clearBake: (options) => lightFXBakeRenderer.invoke(
        'LightProbeBake', 'clearBake', [options], 120_000,
        () => Rpc.getInstance().request('LightProbeBake', 'clearBake', [options]),
    ),
    cancel: () => lightFXBakeRenderer.cancel(
        () => Rpc.getInstance().request('LightProbeBake', 'cancel'),
    ),
};

export const LightmapBakeProxy: IPublicLightmapBakeService = {
    bake: (options) => lightFXBakeRenderer.invoke(
        'LightmapBake', 'bake', [options], (options.timeoutMs ?? 600_000) + 30_000,
        () => Rpc.getInstance().request('LightmapBake', 'bake', [options]), true,
    ),
    clearBake: (options) => lightFXBakeRenderer.invoke(
        'LightmapBake', 'clearBake', [options], 120_000,
        () => Rpc.getInstance().request('LightmapBake', 'clearBake', [options]),
    ),
    cancel: () => lightFXBakeRenderer.cancel(
        () => Rpc.getInstance().request('LightmapBake', 'cancel'),
    ),
};
