
export interface AssetDBConfig {
    restoreAssetDBFromCache: boolean;
    globalInternalLibrary: boolean;
    flagReimportCheck: boolean;
    globList: string[];
    /**
     * 资源 userData 的默认值
     */
    userDataTemplate?: Record<string, any>;
}

export const assetConfig: AssetDBConfig = {
    restoreAssetDBFromCache: true,
    globalInternalLibrary: false,
    flagReimportCheck: true,
    globList: [
        '**/.DS_Store',
        '**/Thumbs.db',
        '**/desktop.ini',
        '**/node_modules/**',
        '**/package.json',
        '**/package-lock.json',
        '**/yarn.lock',
        '**/pnpm-lock.yaml',
    ],
}

export function init() {

}