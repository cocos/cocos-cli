
export interface AssetDBConfig {
    restoreAssetDBFromCache: boolean;
    globalInternalLibrary: boolean;
    flagReimportCheck: boolean;
    globList: string[];
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