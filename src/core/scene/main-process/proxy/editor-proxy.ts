import {
    ICloseOptions,
    ICreateOptions,
    IOpenOptions,
    IPublicEditorService,
    IReloadOptions,
    ISaveOptions,
} from '../../common';
import { Rpc } from '../rpc';

export const EditorProxy: IPublicEditorService = {
    open(params: IOpenOptions) {
        return Rpc.getInstance().request('Editor', 'open', [params]);
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
    queryCurrent() {
        return Rpc.getInstance().request('Editor', 'queryCurrent', []);
    }
};