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
import { DumpConverter, IDumpConvertOptions } from './dump-converter';
import { requestSceneService } from './scene-authority-request';

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
        const result: any = await requestSceneService('Editor', 'open', [params]);
        return convertEditorResult(result);
    },
    close(params: ICloseOptions) {
        return requestSceneService('Editor', 'close', [params]);
    },
    save(params: ISaveOptions) {
        return requestSceneService('Editor', 'save', [params]);
    },
    reload(params: IReloadOptions) {
        return requestSceneService('Editor', 'reload', [params]);
    },
    create(params: ICreateOptions) {
        return requestSceneService('Editor', 'create', [params]);
    },
    async queryCurrent() {
        const result: any = await requestSceneService('Editor', 'queryCurrent');
        if (!result) return null;
        return convertEditorResult(result);
    },
    hasOpen() {
        return requestSceneService('Editor', 'hasOpen');
    }
};
