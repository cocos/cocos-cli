import type { IPublicLightProbeBakeService, IPublicLightmapBakeService } from '../../common';
import { Rpc } from '../rpc';
export const LightProbeBakeProxy: IPublicLightProbeBakeService = {
 querySettings: () => Rpc.getInstance().request('LightProbeBake', 'querySettings'),
 queryCapabilities: () => Rpc.getInstance().request('LightProbeBake', 'queryCapabilities'),
 bake: options => Rpc.getInstance().request('LightProbeBake', 'bake', [options], { timeout: (options.timeoutMs ?? 600000) + 30000 }),
 clearBake: options => Rpc.getInstance().request('LightProbeBake', 'clearBake', [options]),
 cancel: () => Rpc.getInstance().request('LightProbeBake', 'cancel'),
};
export const LightmapBakeProxy: IPublicLightmapBakeService = {
 queryCapabilities: () => Rpc.getInstance().request('LightmapBake', 'queryCapabilities'),
 bake: options => Rpc.getInstance().request('LightmapBake', 'bake', [options], { timeout: (options.timeoutMs ?? 600000) + 30000 }),
 queryBakeInfo: () => Rpc.getInstance().request('LightmapBake', 'queryBakeInfo'),
 clearBake: options => Rpc.getInstance().request('LightmapBake', 'clearBake', [options]),
 cancel: () => Rpc.getInstance().request('LightmapBake', 'cancel'),
};
