/// 这个模块存放公用的缓存

export interface TypeScriptAssetInfoCache {
    version?: MTime,
    content?: string,

    filePath: string,
    uuid: string,
    isPluginScript: boolean,
    url: Readonly<URL>;
}

export interface FileInfo {
    version?: string,
    content?: string,
    filePath: string,
    uuid: string,
}

/** 与脚本解析相关的所有资源的缓存*/
export const tsScriptAssetCache: Map<FilePath, TypeScriptAssetInfoCache> = new Map();
export const blockAssetUUIDSet = new Set<UUID>();
