import { join } from "path";
import { AssetDBRegisterInfo } from "./@types/private";

export interface AssetDBConfig {
    restoreAssetDBFromCache: boolean;
    flagReimportCheck: boolean;
    globList: string[];
    /**
     * 资源 userData 的默认值
     */
    userDataTemplate?: Record<string, any>;

    /**
     * 资源数据库信息列表
     */
    assetDBList: AssetDBRegisterInfo[];

    /**
     * 资源根目录，通常是项目目录
     */
    root: string;

    /**
     * 资源库导入后根目录，通常根据配置的 root 计算
     */
    libraryRoot: string;

    tempRoot: string;
    createTemplateRoot: string;

    sortingPlugin: string[];
}

class AssetConfig {
    /**
     * 环境共享的资源库配置
     */
    private _assetConfig: AssetDBConfig = {
        restoreAssetDBFromCache: false,
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
        assetDBList: [],

        root: '',
        libraryRoot: '',
        tempRoot: '',
        createTemplateRoot: '',
        sortingPlugin: [],
    }

    private _init = false;
    get data() {
        if (!this._init) {
            throw new Error('AssetConfig not init');
        }
        return this._assetConfig;
    }

    init(userConfig: Partial<AssetDBConfig> = {}) {
        if (this._init) {
            console.warn('AssetConfig already init');
            return;
        }
        Object.assign(this._assetConfig, userConfig);
        this._assetConfig.libraryRoot = this._assetConfig.libraryRoot || join(this._assetConfig.root, 'library');
        this._assetConfig.tempRoot = join(this._assetConfig.root, 'temp/asset-db');
        this._init = true;
    }
}

export default new AssetConfig();