import type { IPublicLightProbeBakeService, IPublicLightmapBakeService } from '../../common';
import { Rpc } from '../rpc';

export const LightProbeBakeProxy: IPublicLightProbeBakeService = {
    bake: (options) => Rpc.getInstance().request('LightProbeBake', 'bake', [options]),
    clearBake: (options) => Rpc.getInstance().request('LightProbeBake', 'clearBake', [options]),
    cancel: () => Rpc.getInstance().request('LightProbeBake', 'cancel'),
};

export const LightmapBakeProxy: IPublicLightmapBakeService = {
    bake: (options) => Rpc.getInstance().request('LightmapBake', 'bake', [options]),
    clearBake: (options) => Rpc.getInstance().request('LightmapBake', 'clearBake', [options]),
    cancel: () => Rpc.getInstance().request('LightmapBake', 'cancel'),
};
