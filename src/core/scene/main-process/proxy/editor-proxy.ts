import {
    ICloseOptions,
    ICreateOptions,
    IOpenOptions,
    IPublicEditorService,
    IReloadOptions,
    ISaveOptions,
    ISceneInfo,
    INodeInfo,
} from '../../common';
import { Rpc } from '../rpc';
import { DumpConverter, IDumpConvertOptions } from './dump-converter';

export interface IEditorProxy extends Omit<IPublicEditorService, 'open' | 'queryCurrent'> {
    open(params: IOpenOptions): Promise<ISceneInfo | INodeInfo>;
    queryCurrent(): Promise<ISceneInfo | INodeInfo | null>;
}

function convertEditorResult(dump: any, options?: IDumpConvertOptions): ISceneInfo | INodeInfo {
    if ('isScene' in dump && dump.isScene) {
        return DumpConverter.toScene(dump, options);
    }
    return DumpConverter.toNode(dump, options);
}

export const EditorProxy: IEditorProxy = {
    async open(params: IOpenOptions) {
        const result: any = await Rpc.getInstance().request('Editor', 'open', [params]);
        return convertEditorResult(result);
    },
    close(params: ICloseOptions) {
        return Rpc.getInstance().request('Editor', 'close', [params]);
    },
    save(params: ISaveOptions) {
        return Rpc.getInstance().request('Editor', 'save', [params]);
    },
    reload(params: IReloadOptions) {
        return Rpc.getInstance().request('Editor', 'reload', [params]);
    },
    create(params: ICreateOptions) {
        return Rpc.getInstance().request('Editor', 'create', [params]);
    },
    async queryCurrent() {
        const result: any = await Rpc.getInstance().request('Editor', 'queryCurrent');
        if (!result) return null;
        return convertEditorResult(result);
    },
    hasOpen() {
        return Rpc.getInstance().request('Editor', 'hasOpen');
    }
};
