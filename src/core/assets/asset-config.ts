import { join } from 'path';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { AssetDBRegisterInfo } from './@types/private';
import { configurationManager, configurationRegistry, ConfigurationScope, IBaseConfiguration } from '../configuration';
import { MessageType } from '../configuration/script/interface';
import project from '../project';
import { Engine } from '../engine';
import { createImportMetadataNodes } from './metadata';
import { DEFAULT_CREATE_TEMPLATE_ROOT, resolveImportTemplateRoot } from './import-config-defaults';

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

/** package.json 中 asset-db mount 声明的形状 */
interface AssetDBMountContribution {
    name?: string;
    path?: string;
    readonly?: boolean;
    visible?: boolean;
    enable?: string;
}

/**
 * 定位正式打包产物中的内置扩展根目录。
 * Cocos 进程为 Electron Utility Process，可通过 process.resourcesPath 定位 resources 目录；
 * 打包后的内置扩展位于 <resources>/app/extensions；开发/解包环境无该目录时返回 undefined。
 */
function resolveBuiltinExtensionsRoot(): string | undefined {
    const resourcesPath = (process as { resourcesPath?: string }).resourcesPath;
    if (!resourcesPath) {
        return undefined;
    }
    const builtinExtensionsRoot = join(resourcesPath, 'app', 'extensions');
    return existsSync(builtinExtensionsRoot) ? builtinExtensionsRoot : undefined;
}

/**
 * 判断带开关的 asset-db mount 是否启用。
 * mount.enable 引用项目包配置中的布尔开关键（原 1.0.4 为 localization-editor.json 的 L10nEnable），
 * 文件路径沿用 Creator 包配置约定 <project>/settings/v2/packages/<dbName>.json。
 * 文件缺失、解析失败或开关不为 true 时均视为未启用，不注册对应数据库。
 */
function isMountEnabled(projectRoot: string, dbName: string, enableKey?: string): boolean {
    if (!enableKey) {
        return true;
    }
    try {
        const settingsPath = join(projectRoot, 'settings', 'v2', 'packages', `${dbName}.json`);
        if (!existsSync(settingsPath)) {
            return false;
        }
        const settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as Record<string, unknown> | null;
        return settings?.[enableKey] === true;
    } catch {
        return false;
    }
}

class AssetConfig {
    /**
     * 环境共享的资源库配置
     */
    private _assetConfig: AssetDBConfig = {
        restoreAssetDBFromCache: false,
        flagReimportCheck: false,
        globList: [],
        assetDBList: [],
        root: '',
        libraryRoot: '',
        tempRoot: '',
        createTemplateRoot: '',
        sortingPlugin: [],
        // fbx.material.smart
    };

    private _init = false;
    private _watchingConfiguration = false;

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
            defaults: {
                restoreAssetDBFromCache: this._assetConfig.restoreAssetDBFromCache,
                globList: this._assetConfig.globList ?? [],
                createTemplateRoot: DEFAULT_CREATE_TEMPLATE_ROOT,
            },
            nodes: () => createImportMetadataNodes(),
        });
        if (!project.path) {
            throw new Error('Project not found');
        }
        this._assetConfig.root = project.path;
        const enginePath = Engine.getInfo().typescript.path;
        this._assetConfig.libraryRoot = this._assetConfig.libraryRoot || join(this._assetConfig.root, 'library');
        this._assetConfig.tempRoot = join(this._assetConfig.root, 'temp/asset-db');
        this.watchConfigurationChanges();
        await this.syncRuntimeConfigFromConfiguration();
        this._assetConfig.assetDBList = [{
            name: 'assets',
            target: join(this._assetConfig.root, 'assets'),
            readonly: false,
            visible: true,
            library: join(this._assetConfig.root, 'library'),
        }, {
            name: 'internal',
            target: join(enginePath, 'editor/assets'),
            readonly: true,
            visible: true,
            library: join(enginePath, 'editor/library'),
        }];

        // 扫描项目扩展与打包内置扩展的 asset-db mount 声明，并注册 db:// 域
        const registeredNames = new Set<string>();
        const registerExtensionMounts = (extensionsRoot: string | undefined): void => {
            if (!extensionsRoot || !existsSync(extensionsRoot)) {
                return;
            }
            try {
                const entries = readdirSync(extensionsRoot, { withFileTypes: true });
                for (const entry of entries) {
                    if (!entry.isDirectory()) {
                        continue;
                    }
                    const extDir = join(extensionsRoot, entry.name);
                    const pkgJsonPath = join(extDir, 'package.json');
                    if (!existsSync(pkgJsonPath)) {
                        continue;
                    }
                    try {
                        const pkgJson = JSON.parse(readFileSync(pkgJsonPath, 'utf8')) as Record<string, any> | null;
                        const mount = (pkgJson?.contributions?.['asset-db']?.mount ?? null) as AssetDBMountContribution | null;
                        if (!mount?.path) {
                            continue;
                        }
                        const mountTarget = join(extDir, mount.path);
                        if (!existsSync(mountTarget)) {
                            continue;
                        }
                        // AssetDB 域名优先使用 mount.name，manifest name 仅作回退，
                        // 以保持旧项目 db://localization-editor 兼容
                        const dbName = mount.name || pkgJson?.name || entry.name;
                        if (registeredNames.has(dbName)) {
                            console.warn(`[AssetConfig] Ignore duplicate asset-db mount '${dbName}' from ${extDir}`);
                            continue;
                        }
                        if (!isMountEnabled(this._assetConfig.root, dbName, mount.enable)) {
                            console.info(`[AssetConfig] Skip disabled asset-db mount '${dbName}' from ${extDir}`);
                            continue;
                        }
                        registeredNames.add(dbName);
                        this._assetConfig.assetDBList.push({
                            name: dbName,
                            target: mountTarget,
                            readonly: mount.readonly ?? true,
                            visible: mount.visible ?? false,
                            library: join(this._assetConfig.root, `library/${dbName}`),
                        });
                    } catch {
                        // Skip extensions with invalid package.json
                    }
                }
            } catch {
                // Ignore errors scanning extensions directory
            }
        };

        // 1. 项目扩展保持原有扫描范围（项目下 extensions 目录）
        registerExtensionMounts(join(this._assetConfig.root, 'extensions'));
        // 2. 正式打包产物的内置扩展根（<resources>/app/extensions），开发模式自动跳过
        const builtinExtensionsRoot = resolveBuiltinExtensionsRoot();
        console.info('[AssetConfig] asset-db mount scan roots: projectExtensions=' + join(this._assetConfig.root, 'extensions') + ', builtin=' + (builtinExtensionsRoot ?? 'none'));
        registerExtensionMounts(builtinExtensionsRoot);

        this._init = true;
    }

    getProject<T>(path: string, scope?: ConfigurationScope): Promise<T> {
        return this._configInstance.get(path, scope);
    }

    setProject(path: string, value: any, scope?: ConfigurationScope) {
        return this._configInstance.set(path, value, scope);
    }

    setSortingPlugin(value: unknown) {
        this._assetConfig.sortingPlugin = Array.isArray(value)
            ? value.filter((item): item is string => typeof item === 'string')
            : [];
    }

    async syncSortingPluginFromConfiguration() {
        const scriptConfigInstance = configurationRegistry.getInstances().script;
        if (!scriptConfigInstance) {
            return;
        }

        const scriptConfig = await scriptConfigInstance.get<{ sortingPlugin?: unknown }>();
        this.setSortingPlugin(scriptConfig?.sortingPlugin);
    }

    private async syncRuntimeConfigFromConfiguration() {
        const importConfig = await this._configInstance.get<Partial<Pick<AssetDBConfig, 'restoreAssetDBFromCache' | 'globList' | 'createTemplateRoot'>>>();
        this._assetConfig.restoreAssetDBFromCache = importConfig.restoreAssetDBFromCache ?? false;
        this._assetConfig.globList = importConfig.globList ?? [];
        this._assetConfig.createTemplateRoot = resolveImportTemplateRoot(
            this._assetConfig.root,
            importConfig.createTemplateRoot ?? DEFAULT_CREATE_TEMPLATE_ROOT
        );
        await this.syncSortingPluginFromConfiguration();
    }

    private watchConfigurationChanges() {
        if (this._watchingConfiguration) {
            return;
        }
        this._watchingConfiguration = true;

        configurationRegistry.on(MessageType.Registry, (instance: IBaseConfiguration) => {
            if (instance.moduleName === 'script') {
                void this.syncSortingPluginFromConfiguration();
            }
        });

        configurationManager.on(MessageType.Update, (key: string) => {
            if (key === 'script.sortingPlugin' || key === 'script') {
                void this.syncSortingPluginFromConfiguration();
            }
        });

        configurationManager.on(MessageType.Remove, (key: string) => {
            if (key === 'script.sortingPlugin' || key === 'script') {
                this.setSortingPlugin([]);
            }
        });

        configurationManager.on(MessageType.Reload, () => {
            void this.syncRuntimeConfigFromConfiguration();
        });
    }
}

export default new AssetConfig();
