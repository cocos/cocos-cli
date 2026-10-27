import { Asset as DatabaseAsset, VirtualAsset as DatabaseVirtualAsset } from '@cocos/asset-db';
import { CCON } from 'cc/editor/serialization';
import type { IAssetInfo } from '../public';
import type { IAssetDBInfo } from './plugin';
export type IAssetEvent = 'asset-add' | 'asset-change' | 'asset-delete';
export type IAssetEventCallback = (asset: IAsset) => void;
export interface IExportData {
    import: {
        type: 'buffer' | 'json';
        path: string;
    };
    // 例如 { 'test.font': 'test.font' }
    native?: Record<string, string>;
}

/**
 * AssetManager 事件类型定义
 * 
 * **时序说明 (Timing Notice)**:
 * - `asset-add`, `asset-change`, `asset-delete`: 仅在**就绪阶段**（即触发过一次 `ready` 之后）才会对外触发。启动阶段发生的批量资源变动将被屏蔽并转换为 `progress` 进度消息。
 * - `progress`: 仅在**启动阶段**有效，提供启动导入进度，启动完成后将不再触发。
 */
export interface AssetManagerEvents {
    'asset-add': (asset: IAsset) => void;
    'asset-change': (asset: IAsset) => void;
    'asset-delete': (asset: IAsset) => void;
    'onAssetAdded': (info: IAssetInfo) => void;
    'onAssetChanged': (info: IAssetInfo) => void;
    'onAssetRemoved': (info: IAssetInfo) => void;
    'progress': (current: number, total: number, url: string, state: 'processing' | 'success' | 'failed') => void;
    'db-ready': (dbInfo: IAssetDBInfo) => void;
    'ready': () => void;
}

export * from '../public';
export * from './plugin';

export class VirtualAsset extends DatabaseVirtualAsset {
    /**
     * 获取资源的导出数据
     */
    getData(name: 'output'): IExportData;
    getData(name: string): any;
    setData(name: 'output', data: IExportData): void;
    setData(name: string, data: any): void;
}

export class Asset extends DatabaseAsset {
    getData(name: 'output'): IExportData;
    getData(name: string): any;
    setData(name: 'output', data: IExportData): void;
    setData(name: string, data: any): void;
}

export type IAsset = VirtualAsset | Asset;

export type QueryAssetType = 'asset' | 'script' | 'all';

export interface ISerializedOptions {
    debug: boolean;
    _exporting?: boolean;
    dontStripDefault?: boolean;
}

export type SerializedAsset = string | object | CCON;
