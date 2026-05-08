/// <reference types="node" />

import { ChunkInfo } from '@cocos/creator-programming-quick-pack/lib/loader';

export declare enum AssetActionEnum {
    'add' = 0,
    'change' = 1,
    'delete' = 2,
    'none' = 3
}

export declare interface AssetChangeInfo {
    type: AssetChangeType;
    uuid: string;
    filePath: string;
    importer: string;
    userData: object;
}

export declare type AssetChangeType = AssetActionEnum;

export declare interface FilterPluginOptions {
    loadPluginInEditor?: boolean;
    loadPluginInWeb?: boolean;
    loadPluginInNative?: boolean;
    loadPluginInMiniGame?: boolean;
}

export declare function getProgrammingFacet(): Promise<ProgrammingFacet>;

export declare interface IEngineOptions {
    /**
     * 引擎仓库根目录。
     */
    root: string;
    /**
     * 引擎编译后的根目录。
     */
    distRoot: string;
    /**
     * 引擎基础 URL。
     */
    baseUrl: string;
    /**
     * 使用的引擎功能。
     */
    features: string[];
}

export declare interface ImportMap {
    imports?: Record<string, string>;
    scopes?: Record<string, Record<string, string>>;
}

export declare function init(projectPath: string): Promise<void>;

export declare function initProgrammingFacet(): Promise<ProgrammingFacet>;

export declare interface IPluginScriptInfo extends PluginScriptInfo {
    url: string;
}

export declare interface PluginScriptInfo {
    /**
     * 脚本文件。
     */
    file: string;
    uuid: string;
}

export declare class ProgrammingFacet {
    private _packerDriverUpdateCount;
    private _asyncIteration;
    static create(engine: IEngineOptions, projectPath: string): Promise<ProgrammingFacet>;
    get engineRoot(): string;
    get engineDistRoot(): string;
    get systemJsHomeDir(): string;
    get systemJsIndexFile(): string;
    get engineImportMapURL(): string;
    get packImportMapURL(): string;
    get packResolutionDetailMapURL(): string;
    loadPackResource(url: string): Promise<{
        type: "json";
        json: unknown;
    } | {
        type: "chunk";
        chunk: ChunkInfo;
    }>;
    getGlobalImportMap(): Promise<ImportMap & {
        imports: NonNullable<ImportMap["imports"]>;
    }>;
    private reload;
    notifyPackDriverUpdated(): Promise<any>;
    private _staticImportMap;
    private _engineRoot;
    private _engineDistRoot;
    private _systemJsHomeDir;
    private _systemJsBundleFileName;
    private _engineStatsQuery;
    private _quickPackLoader;
    private constructor();
    private _getQuickPackLoader;
    private _initialize;
    private _buildSystemJs;
    private _resetQuickPackLoader;
}

export declare interface SharedSettings {
    useDefineForClassFields: boolean;
    allowDeclareFields: boolean;
    loose: boolean;
    guessCommonJsExports: boolean;
    exportsConditions: string[];
    preserveSymlinks: boolean;
    importMap?: {
        json: {
            imports?: Record<string, string>;
            scopes?: Record<string, Record<string, string>>;
        };
        url: string;
    };
}

/**
 * 在独立的子进程中运行项目脚本编译
 * 以避免阻塞主进程
 */
export declare function startCompileScript(assetChanges?: AssetChangeInfo[]): Promise<void>;

export { }
