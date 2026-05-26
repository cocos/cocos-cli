import { IPublicScriptService } from '../../common';
import { Rpc } from '../rpc';

export const ScriptProxy: IPublicScriptService = {
    remove(): Promise<void> {
        return Rpc.getInstance().request('Script', 'remove');
    },
    change(): Promise<void> {
        return Rpc.getInstance().request('Script', 'change');
    },
    investigatePackerDriver(): Promise<void> {
        return Rpc.getInstance().request('Script', 'investigatePackerDriver');
    },
    load(): Promise<void> {
        return Rpc.getInstance().request('Script', 'load');
    },
    queryCid(uuid: string): Promise<string | null> {
        return Rpc.getInstance().request('Script', 'queryCid', [uuid]);
    },
    queryName(uuid: string): Promise<string | null> {
        return Rpc.getInstance().request('Script', 'queryName', [uuid]);
    }
};
