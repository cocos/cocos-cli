export { Asset, Importer, VirtualAsset } from '@editor/asset-db';
export interface MessageResult {
    error: Error | null;
    result: any;
}
export interface IMessage {
    name: string;
    args: any[];
}

export interface IAssetDBProfileJSON {
    ignoreGlobList: string[];
    /**
     * @deprecated use ignoreGlobList instead
     */
    ignoreGlob: string;
}

export * from './public';
export * from './protected/global';
export * from './protected/asset';
export * from './protected/asset-handler';