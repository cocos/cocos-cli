import { IPublicScriptService } from '../../common';
import { Rpc } from '../rpc';

export const ScriptProxy: IPublicScriptService = {
    removeScript(): Promise<void> {
        return Rpc.getInstance().request('Script', 'removeScript');
    },
    scriptChange(): Promise<void> {
        return Rpc.getInstance().request('Script', 'scriptChange');
    },
    investigatePackerDriver(): Promise<void> {
        return Rpc.getInstance().request('Script', 'investigatePackerDriver');
    },
    loadScript(): Promise<void> {
        return Rpc.getInstance().request('Script', 'loadScript');
    },
    queryScriptCid(uuid: string): Promise<string | null> {
        return Rpc.getInstance().request('Script', 'queryScriptCid', [uuid]);
    },
    queryScriptName(uuid: string): Promise<string | null> {
        return Rpc.getInstance().request('Script', 'queryScriptName', [uuid]);
    }
};
