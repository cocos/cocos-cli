import type {
    IAppendLightFXInputOptions,
    IBeginLightFXBakeOptions,
    IBeginLightFXBakeResult,
    ILightFXBakeHostService,
    ILightFXOperationOptions,
    IQueryLightmapTextureInfoOptions,
    IQueryLightmapTextureInfoResult,
    IRemoveLightmapAssetsOptions,
    IRemoveLightmapAssetsResult,
    IResolveLightFXTextureSourceOptions,
    IResolvedLightFXTextureSource,
    IRunLightFXBakeOptions,
    IRunLightFXBakeResult,
    ICancelLightFXOperationOptions,
} from '../../../../common/lightfx-host';
import { Rpc } from '../../../rpc';

/** JSON-only bridge from either a child scene process or a browser scene Webview to the Node host. */
export const lightFXBakeHost: ILightFXBakeHostService = {
    queryDiagnostics: options => Rpc.getInstance().request('lightFXBakeHost', 'queryDiagnostics', [options]),
    queryCapabilities: () => Rpc.getInstance().request('lightFXBakeHost', 'queryCapabilities'),
    reserveSceneOperation: (options) => Rpc.getInstance().request('lightFXBakeHost', 'reserveSceneOperation', [options]),
    releaseSceneOperation: (options) => Rpc.getInstance().request('lightFXBakeHost', 'releaseSceneOperation', [options]),
    resolveTextureSource: (options: IResolveLightFXTextureSourceOptions): Promise<IResolvedLightFXTextureSource | null> => Rpc.getInstance().request('lightFXBakeHost', 'resolveTextureSource', [options]),
    begin: (options: IBeginLightFXBakeOptions): Promise<IBeginLightFXBakeResult> => Rpc.getInstance().request('lightFXBakeHost', 'begin', [options]),
    appendInput: (options: IAppendLightFXInputOptions): Promise<void> => Rpc.getInstance().request('lightFXBakeHost', 'appendInput', [options]),
    run: (options: IRunLightFXBakeOptions): Promise<IRunLightFXBakeResult> => Rpc.getInstance().request('lightFXBakeHost', 'run', [options]),
    commit: (options: ILightFXOperationOptions): Promise<void> => Rpc.getInstance().request('lightFXBakeHost', 'commit', [options]),
    publishLightmapAssets: options => Rpc.getInstance().request('lightFXBakeHost', 'publishLightmapAssets', [options]),
    rollback: (options: ILightFXOperationOptions): Promise<void> => Rpc.getInstance().request('lightFXBakeHost', 'rollback', [options]),
    cancel: (options?: ICancelLightFXOperationOptions): Promise<{ cancelled: boolean; target: 'light-probe' | 'lightmap' | null }> => Rpc.getInstance().request('lightFXBakeHost', 'cancel', [options]),
    removeLightmapAssets: (options: IRemoveLightmapAssetsOptions): Promise<IRemoveLightmapAssetsResult> => Rpc.getInstance().request('lightFXBakeHost', 'removeLightmapAssets', [options]),
    queryLightmapTextureInfo: (options: IQueryLightmapTextureInfoOptions): Promise<IQueryLightmapTextureInfoResult> => Rpc.getInstance().request('lightFXBakeHost', 'queryLightmapTextureInfo', [options]),
};
