import {
    IScriptService,
} from '../../common';
import { Rpc } from '../rpc';
import type { IAssetInfo } from '../../../assets/@types/public';

export const ScriptProxy: IScriptService = {
    removeScript(): Promise<void> {
        return Rpc.request('Script', 'removeScript');
    },
    scriptChange(): Promise<void> {
        return Rpc.request('Script', 'scriptChange');
    },
    investigatePackerDriver(): Promise<void> {
        return Rpc.request('Script', 'investigatePackerDriver');
    },
    loadScript(): Promise<void> {
        return Rpc.request('Script', 'loadScript');
    },
};