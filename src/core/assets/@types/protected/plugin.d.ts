import { AssetDBOptions } from '@editor/asset-db/libs/asset-db';
import { IAssetWorkerInfo } from '../private';

export interface IAssetDBInfo extends AssetDBOptions {
    // 当前数据库的启动状态
    state: 'none' | 'start' | 'startup' | 'refresh'; // 是否已启动

    // 数据库是否可见
    visible: boolean;

    // 提前预导入的资源后缀，将会在 afterPreStart 之前完成预导入的资源
    preImportExtList: string[];
}

export type AssetDBHookType =
    'beforeInit' | 'afterInit'
    | 'beforePreStart' | 'afterPreStart'
    | 'beforeReady' | 'afterReady'
    | 'beforeStartDB' | 'afterStartDB'
    | 'beforeStopDB' | 'afterStopDB'
    | 'beforeRefresh' | 'afterRefresh'
    ;

export namespace GlobalHook {
    /**
     * 初始化资源进程环境的前后钩子，每次启动后仅调用一次
     * @param info 
     */
    export function beforeInit(info: IAssetWorkerInfo): void | Promise<void>;
    export function afterInit(info: IAssetWorkerInfo): void | Promise<void>;

    /**
     * 预启动所有数据库的前后钩子，每次启动后仅调用一次
     * 这对钩子，仅对编辑器内部使用
     * @param assetDBInfoMap 
     */
    export function beforePreStart(assetDBInfoMap: Record<string, IAssetDBInfo>): void | Promise<void>;
    export function afterPreStart(assetDBInfoMap: Record<string, IAssetDBInfo>): void | Promise<void>;

    /**
     * 所有数据库 ready 的前后钩子，每次启动后仅调用一次
     */
    export function beforeReady(): void | Promise<void>;
    export function afterReady(): void | Promise<void>;

    /**
     * 刷新所有所有数据库的前后钩子，将会调用多次
     */
    export function beforeRefresh(): void | Promise<void>;
    export function afterRefresh(): void | Promise<void>;
}

export namespace MountHook {
    // --------------- 在数据库全部启动后, 针对单个数据库启动的钩子 -------------------

    /**
     * 在数据库全部启动后，新增启动某个数据库的前后钩子
     * @param dbInfo 
     */
    export function beforeStartDB(dbInfo: IAssetDBInfo): void | Promise<void>;
    export function afterStartDB(dbInfo: IAssetDBInfo): void | Promise<void>;

    /**
     * 在数据库全部启动后，单独关闭某个数据库的前后钩子
     * @param dbInfo 
     */
    export function beforeStopDB(dbInfo: IAssetDBInfo): void | Promise<void>;
    export function afterStopDB(dbInfo: IAssetDBInfo): void | Promise<void>;

}

export interface AssetDBPluginInfo {
    contribution: AssetDBContribution;
    name: string;
    path: string;
}

export interface AssetDBMountInfo {
    path: string;
    name: string;
    readonly?: boolean;
    visible?: boolean;
    enable?: string;
}

export interface ImporterRegisterInfo {
    list: string[];
    script: string;
}

export interface AssetHandlerInfo {
    extnames: string[];
    handler: string;
    name: string;
}

/**
 * package.json 内定义的扩展信息
 */
export interface AssetDBContribution {
    script?: string; // db 脚本机制，db 扩展机制主入口
    'asset-handler': Array<AssetHandlerInfo>,
    'global-hook'?: string[];
    'mount-hook'?: string[];

    // 注册的资源数据库信息
    mount?: AssetDBMountInfo;

    // ----------------- 3.9 已废弃 --------------------------
    // 注册的导入器
    importer?: ImporterRegisterInfo;
    // 之前的插件机制，注册资源的打开信息
    openMessage?: {
        [importerName: string]: string;
    };
}