import { join } from 'path';
import { AssetDBRegisterInfo } from './@types/private';
import { configurationRegistry, ConfigurationScope, IBaseConfiguration } from '../configuration';
import project from '../project';
import { Engine } from '../engine';

export interface AssetDBConfig {
    restoreAssetDBFromCache: boolean;
    flagReimportCheck: boolean;
    globList?: string[];
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
        flagReimportCheck: false,
        assetDBList: [],
        root: '',
        libraryRoot: '',
        tempRoot: '',
        createTemplateRoot: '',
        sortingPlugin: [],
        // fbx.material.smart
    };

    private _init = false;

    /**
     * 持有的可双向绑定的配置管理实例
     */
    private _configInstance!: IBaseConfiguration;
    get data() {
        if (!this._init) {
            throw new Error('AssetConfig not init');
        }
        return this._assetConfig;
    }

    async init() {
        if (this._init) {
            console.warn('AssetConfig already init');
            return;
        }
        this._configInstance = await configurationRegistry.register('import', {
            restoreAssetDBFromCache: this._assetConfig.restoreAssetDBFromCache,
            globList: this._assetConfig.globList,
            createTemplateRoot: join(this._assetConfig.root, '.creator/templates'),
        });
        if (!project.path) {
            throw new Error('Project not found');
        }
        this._assetConfig.root = project.path;
        const enginePath = Engine.getInfo().typescript.path;
        this._assetConfig.libraryRoot = this._assetConfig.libraryRoot || join(this._assetConfig.root, 'library');
        this._assetConfig.tempRoot = join(this._assetConfig.root, 'temp/asset-db');
        this._assetConfig.assetDBList = [{
            name: 'assets',
            target: join(this._assetConfig.root, 'assets'),
            readonly: false,
            visible: true,
            library: join(this._assetConfig.root, 'library'),
        }, {
            name: 'internal',
            target: join(enginePath, 'editor/assets'),
            readonly: false,
            visible: true,
            library: join(enginePath, 'editor/library'),
        }];
        this._init = true;
    }

    getProject<T>(path: string, scope?: ConfigurationScope): Promise<T> {
        return this._configInstance.get(path, scope);
    }

    setProject(path: string, value: any, scope?: ConfigurationScope) {
        return this._configInstance.set(path, value, scope);
    }
}

export default new AssetConfig();
