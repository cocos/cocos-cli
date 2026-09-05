import type {
    IAppendLightFXInputOptions,
    IBeginLightFXBakeOptions,
    IBeginLightFXBakeResult,
    ILightFXBakeHostService,
    ILightFXOperationOptions,
    IRemoveLightmapAssetsOptions,
    IResolveLightFXTextureSourceOptions,
    IResolvedLightFXTextureSource,
    IRunLightFXBakeOptions,
    IRunLightFXBakeResult,
} from '../../../../common/lightfx-host';
import { Rpc } from '../../../rpc';

/** JSON-only bridge from either a child scene process or a browser scene Webview to the Node host. */
export const lightFXBakeHost: ILightFXBakeHostService = {
    resolveTextureSource: (options: IResolveLightFXTextureSourceOptions): Promise<IResolvedLightFXTextureSource | null> => Rpc.getInstance().request('lightFXBakeHost', 'resolveTextureSource', [options]),
    begin: (options: IBeginLightFXBakeOptions): Promise<IBeginLightFXBakeResult> => Rpc.getInstance().request('lightFXBakeHost', 'begin', [options]),
    appendInput: (options: IAppendLightFXInputOptions): Promise<void> => Rpc.getInstance().request('lightFXBakeHost', 'appendInput', [options]),
    run: (options: IRunLightFXBakeOptions): Promise<IRunLightFXBakeResult> => Rpc.getInstance().request('lightFXBakeHost', 'run', [options]),
    commit: (options: ILightFXOperationOptions): Promise<void> => Rpc.getInstance().request('lightFXBakeHost', 'commit', [options]),
    rollback: (options: ILightFXOperationOptions): Promise<void> => Rpc.getInstance().request('lightFXBakeHost', 'rollback', [options]),
    cancel: (): Promise<{ cancelled: boolean; target: 'light-probe' | 'lightmap' | null }> => Rpc.getInstance().request('lightFXBakeHost', 'cancel'),
    removeLightmapAssets: (options: IRemoveLightmapAssetsOptions): Promise<void> => Rpc.getInstance().request('lightFXBakeHost', 'removeLightmapAssets', [options]),
};
