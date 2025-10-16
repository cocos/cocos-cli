import {
    IScriptService,
} from '../../common';
import { Rpc } from '../rpc';
import type { IAssetInfo } from '../../../assets/@types/public';

export const ScriptProxy: IScriptService = {
    removeScript(info: IAssetInfo): Promise<void> {
        return Rpc.request('Script', 'removeScript', [info]);
    },
    scriptChange(info: IAssetInfo): Promise<void> {
        return Rpc.request('Script', 'scriptChange', [info]);
    },
    investigatePackerDriver(): Promise<void> {
        return Rpc.request('Script', 'investigatePackerDriver');
    },
    loadScript(uuid: string): Promise<void> {
        return Rpc.request('Script', 'loadScript', [uuid]);
    },
}