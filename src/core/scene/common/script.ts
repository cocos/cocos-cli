import type { IAssetInfo } from '../../assets/@types/public';

export interface IScriptService {
    investigatePackerDriver(): Promise<void>;
    loadScript(uuid: string): Promise<void>;
    removeScript(info: IAssetInfo): Promise<void>;
    scriptChange(info: IAssetInfo): Promise<void>;
}
