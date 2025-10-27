import { IPublicScriptService } from '../../common';
import { Rpc } from '../rpc';

export const ScriptProxy: IPublicScriptService = {
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
    queryScriptCid(uuid: string): Promise<string | null> {
        return Rpc.request('Script', 'queryScriptCid', [uuid]);
    },
    queryScriptName(uuid: string): Promise<string | null> {
        return Rpc.request('Script', 'queryScriptName', [uuid]);
    },
    isCustomComponent(classConstructor: Function): Promise<boolean> {
        return Rpc.request('Script', 'isCustomComponent', [classConstructor]);
    }
};
