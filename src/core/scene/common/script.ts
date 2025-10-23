export interface IScriptService {
    investigatePackerDriver(): Promise<void>;
    loadScript(uuid: string): Promise<void>;
    removeScript(info: IAssetInfo): Promise<void>;
    scriptChange(info: IAssetInfo): Promise<void>;
    queryScriptCid(uuid: string): Promise<string | null>;
    queryScriptName(uuid: string): Promise<string | null>;
    isCustomComponent(classConstructor: Function): Promise<boolean>;
}
