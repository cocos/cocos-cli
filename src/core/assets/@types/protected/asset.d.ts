import { Asset, VirtualAsset } from '@editor/asset-db';
import { CCON } from 'cc/editor/serialization';

export interface IExportData {
    import: {
        type: 'buffer' | 'json';
        path: string;
    };
    // 例如 { 'test.font': 'test.font' }
    native?: Record<string, string>;
}

export * from '../public';
export * from './plugin';

export class VirtualAsset extends VirtualAsset {
    /**
     * 获取资源的导出数据
     */
    getData: (name: 'output') => IExportData;
    setData: (name: 'output', data: IExportData) => void;
}

export class Asset extends Asset, IVirtualAsset { };

export type IAsset = VirtualAsset | Asset;

export type QueryAssetType = 'asset' | 'script' | 'all';

export interface ISerializedOptions {
    debug: boolean;
    _exporting?: boolean;
    dontStripDefault?: boolean;
}

export type SerializedAsset = string | object | CCON;
