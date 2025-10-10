import { readJSON, existsSync, copy, emptyDirSync } from 'fs-extra';
import { dirname, join, relative } from 'path';

import type { TextureCompress } from '../texture-compress';
import { Bundle } from './bundle';
import { bundleDataTask, bundleOutputTask } from './texture-compress';
import type { PacInfo } from '../texture-packer/pac-info';
import { sortBundleInPac } from './pac';
import { getCCONFormatAssetInLibrary, getDesiredCCONExtensionMap, hasCCONFormatAssetInLibrary } from '../../utils/cconb';
import { ScriptBuilder } from '../script';
import { BuiltinBundleName, BundleCompressionTypes, DefaultBundleConfig, getBundleDefaultName, transformPlatformSettings } from '../../../../share/bundle-utils';
import { buildAssetLibrary } from '../../manager/asset-library';
import { BuilderAssetCache } from '../../manager/asset';
import { getLibraryDir, queryImageAssetFromSubAssetByUuid } from '../../utils';
import { handleJsonGroup, outputJsonGroup } from './json-group';
import { defaultsDeep } from '../../../../share/utils';
import { EffectAsset, Material } from 'cc';
import { BuildTaskBase } from '../../manager/task-base';
import { compareUUID } from '../../../../share/utils';
import { handleBinGroup, outputBinGroup } from './bin-group';
import { newConsole } from '../../../../../base/console';
import i18n from '../../../../../base/i18n';
import { IAsset } from '../../../../../assets/@types/protected';
import { IBundleOptions } from '../../../../@types';
import { IBundleManager, IBuilder, IInternalBundleBuildOptions, IBuildHooksInfo, IBundle, CustomBundleConfig, BundleRenderConfig, BundlePlatformType, IBundleInitOptions, IBundleBuildOptions, IBuildTaskOption } from '../../../../@types/protected';
import { pluginManager } from '../../../../manager/plugin';
import utils from '../../../../../base/utils';
import script from '../../../../../scripting';
import builderConfig, { BuildGlobalInfo } from '../../../../share/builder-config';
import { IPluginScriptInfo } from '../../../../../scripting/interface';
import assetQuery from '../../../../../assets/manager/query';

const { MAIN, START_SCENE, INTERNAL, RESOURCES } = BuiltinBundleName;
// 只 Bundle 构建时，可走此类的生成执行函数
export class BundleManager extends BuildTaskBase implements IBundleManager {
    static BuiltinBundleName = BuiltinBundleName;
    static BundleConfigs: Record<string, Record<string, { isRemote: boolean, compressionType: BundleCompressionTypes }>> = {};

    private _task?: IBuilder;
    options: IInternalBundleBuildOptions;
    destDir: string;
    public hooksInfo: IBuildHooksInfo;

    bundleMap: Record<string, IBundle> = {};
    bundles: IBundle[] = [];

    _pacAssets: string[] = [];

    // 按照优先级排序过的 bundle 数组
    _bundleGroupInPriority?: Array<IBundle[]>;

    // 纹理压缩管理器
    imageCompressManager?: TextureCompress;
    scriptBuilder: ScriptBuilder;
    packResults: PacInfo[] = [];
    cache: BuilderAssetCache;

    public hookMap = {
        onBeforeBundleInit: 'onBeforeBundleInit',
        onAfterBundleInit: 'onAfterBundleInit',
        onBeforeBundleDataTask: 'onBeforeBundleDataTask',
        onAfterBundleDataTask: 'onAfterBundleDataTask',
        onBeforeBundleBuildTask: 'onBeforeBundleBuildTask',
        onAfterBundleBuildTask: 'onAfterBundleBuildTask',
    };

    // 执行整个构建流程的顺序流程
    public pipeline: (string | Function)[] = [
        this.initOptions,
        this.hookMap.onBeforeBundleInit,
        this.initBundle,
        this.hookMap.onAfterBundleInit,
        this.hookMap.onBeforeBundleDataTask,
        this.initAsset,
        this.bundleDataTask,
        this.hookMap.onAfterBundleDataTask,
        this.hookMap.onBeforeBundleBuildTask,
        this.clearBundleDest,
        this.buildScript,
        this.buildAsset,
        this.hookMap.onAfterBundleBuildTask,
        this.outputBundle,
    ];

    get bundleGroupInPriority() {
        if (this._bundleGroupInPriority) {
            return this._bundleGroupInPriority;
        }
        // bundle 按优先级分组
        let bundleGroupInPriority = new Array<IBundle[]>(21);
        this.bundles.forEach((bundle) => {
            if (!bundleGroupInPriority[bundle.priority - 1]) {
                bundleGroupInPriority[bundle.priority - 1] = [];
            }
            bundleGroupInPriority[bundle.priority - 1].push(bundle);
        });
        bundleGroupInPriority = bundleGroupInPriority.filter((group) => group).reverse();
        this._bundleGroupInPriority = bundleGroupInPriority;
        return bundleGroupInPriority;

    }

    static internalBundlePriority: Record<string, number> = {
        [MAIN]: 7,
        [START_SCENE]: 20,
        [INTERNAL]: 21,
        [RESOURCES]: 8,
    };

    private constructor(options: IBuildTaskOption, imageCompressManager: TextureCompress | null, task?: IBuilder) {
        super(options.taskId!, 'Bundle Task');
        // @ts-ignore TODO 补全 options 为 IInternalBundleBuildOptions
        this.options = options as IInternalBundleBuildOptions;
        if (imageCompressManager) {
            this.imageCompressManager = imageCompressManager;
            imageCompressManager.on('update-progress', (message) => {
                this.updateProcess(message);
            });
        }
        this._task = task;
        this.destDir = this.options.dest && utils.Path.resolveToRaw(this.options.dest) || join(BuildGlobalInfo.projectRoot, 'build', 'assetBundle');
        this.scriptBuilder = new ScriptBuilder();
        // @ts-ignore
        this.cache = task ? task.cache : new BuilderAssetCache();
        this.hooksInfo = task ? task.hooksInfo : pluginManager.getHooksInfo(this.options.platform);
    }

    static async create(options: IBuildTaskOption, task?: IBuilder) {
        if (!options.skipCompressTexture) {
            const { TextureCompress } = await import('../texture-compress');
            const imageCompressManager = new TextureCompress(options.platform, options.useCacheConfig?.textureCompress);
            return new BundleManager(options, imageCompressManager, task);
        }
        return new BundleManager(options, null, task);
    }

    async loadScript(scriptUuids: string[], pluginScripts: IPluginScriptInfo[]) {
        if (this.options.preview) {
            return;
        }
        await script.loadScript(scriptUuids, pluginScripts);
    }

    /**
     * 初始化项目设置的一些 bundle 配置信息
     */
    static async initStaticBundleConfig() {
        const bundleConfig: Record<string, CustomBundleConfig> = (await builderConfig.getProject('bundleConfig.custom')) || {};
        if (!bundleConfig.default) {
            bundleConfig.default = DefaultBundleConfig;
        }
        const res: Record<string, any> = {};
        Object.keys(bundleConfig).forEach((ID) => {
            const configs = bundleConfig[ID].configs;
            res[ID] = {};
            Object.keys(configs).forEach((platformType) => {
                const platformOption = transformPlatformSettings(configs[platformType as BundlePlatformType], pluginManager.bundleConfigs);
                Object.assign(res[ID], platformOption);
            });
        });
        BundleManager.BundleConfigs = res;
    }

    getUserConfig(ID = 'default') {
        const configMap = BundleManager.BundleConfigs[ID];
        if (!configMap) {
            return null;
        }

        return configMap[this.options.platform];
    }

    /**
     * 对 options 上的数据做补全处理
     */
    async initOptions() {
        this.options.platformType = pluginManager.platformConfig[this.options.platform].platformType;
        this.options.buildScriptParam = {
            experimentalEraseModules: this.options.experimentalEraseModules,
            outputName: 'project',
            flags: {
                DEBUG: !!this.options.debug,
                ...this.options.flags,
            },
            polyfills: this.options.polyfills,
            hotModuleReload: false,
            platform: this.options.platformType || 'INVALID_PLATFORM', // v3.8.6 开始 ccbuild 支持 'INVALID_PLATFORM' 表示无效平台，防止之前初始化为 'HTML5' 后，平台插件忘记覆盖 platform 参数导致走 'HTML5' 的引擎打包流程导致的较难排查的问题
            commonDir: '',
            bundleCommonChunk: this.options.bundleCommonChunk ?? false,
        };

        this.options.assetSerializeOptions = {
            'cc.EffectAsset': {
                glsl1: this.options.includeModules.includes('gfx-webgl'),
                glsl3: this.options.includeModules.includes('gfx-webgl2'),
                glsl4: false,
            },
        };
    }

    clearBundleDest() {
        this.bundles.forEach((bundle) => {
            if (bundle.output) {
                emptyDirSync(bundle.dest);
            }
        });
    }

    /**
     * 初始化整理资源列表
     */
    public async initAsset() {
        await this.initBundleRootAssets();
        // 需要在 this.cache 初始化后之后执行
        await this.loadScript(this.cache.scriptUuids, assetQuery.querySortedPlugins());
        await this.initBundleShareAssets();
        await this.initBundleConfig();
    }

    public async initBundleConfig() {
        for (const bundle of this.bundles) {
            // TODO 废弃 bundle 的 config 结构，输出 config 时即时整理即可
            // 此处的整理实际上仅为预览服务
            bundle.initConfig();
            if (this.options.preview) {
                await bundle.initAssetPaths();
            }
        }
    }

    public async buildAsset() {
        // 先自动图集再纹理压缩
        await this.packImage();
        await this.compressImage();
        await this.outputAssets();
    }

    /**
     * 独立构建 Bundle 时调用
     * @returns 
     */
    public async run() {
        // 独立构建 Bundle 时，不能抽取公共脚本到 src
        this.options.bundleCommonChunk = true;
        await this.runAllTask();
        return true;
    }

    public async outputBundle() {
        this.updateProcess('Output asset in bundles start');
        await Promise.all(this.bundles.map(async (bundle) => {
            if (!bundle.output) {
                return;
            }
            await bundle.build();
        }));
        this.updateProcess('Output asset in bundles success');
    }

    private addBundle(options: IBundleInitOptions) {
        if (this.bundleMap[options.name]) {
            const newName = options.name + Date.now();
            // Bundle 重名会导致脚本内动态加载出错，需要及时提示
            console.error(i18n.t('builder.asset_bundle.duplicate_name_messaged_auto_rename', {
                name: options.name,
                newName,
                url: this.bundleMap[options.name].root,
                newUrl: options.root,
            }));
            options.name = newName;
        }
        this.bundleMap[options.name] = new Bundle(options);
    }

    private getDefaultBundleConfig(name: string): IBundleInitOptions {
        const dest = join(this.destDir, name);
        const defaultPriority: number = BundleManager.internalBundlePriority[name];
        return {
            name,
            dest,
            root: '',
            scriptDest: join(dest, BuildGlobalInfo.SCRIPT_NAME),
            priority: defaultPriority || 1,
            compressionType: BundleCompressionTypes.MERGE_DEP,
            isRemote: false,
            md5Cache: this.options.md5Cache,
            debug: this.options.debug,
        };
    }

    /**
     * 根据参数初始化一些信息配置，整理所有的 bundle 分组信息
     */
    public async initBundle() {
        await BundleManager.initStaticBundleConfig();
        const options = this.options;
        const cocosBundles: string[] = [MAIN, START_SCENE, INTERNAL];
        const internalBundleConfigMap: Record<string, IBundleOptions> = {};
        this.updateProcess('Init all bundles start...');
        const bundleAssets = await buildAssetLibrary.queryAssetsByOptions({ isBundle: true });
        options.bundleConfigs = options.bundleConfigs || [];
        // 整理所有的 bundle 信息
        if (options.bundleConfigs.length) {
            options.bundleConfigs.forEach((customConfig) => {
                if (cocosBundles.includes(customConfig.name)) {
                    internalBundleConfigMap[customConfig.name] = customConfig;
                    return;
                }
                const config = this.patchProjectBundleConfig(customConfig);
                if (!config) {
                    console.warn('Invalid bundle config: ', customConfig);
                    return;
                }
                this.addBundle(config);
            });
        }
        const otherBundleOutput = options.bundleConfigs.length ? false : (this._task ? true : false);
        if (!options.buildBundleOnly) {
            // 非只 Bundle 构建模式下，需要补全其他项目内存在的 bundle 信息
            bundleAssets.forEach((assetInfo) => {
                const config = this.patchProjectBundleConfig({
                    root: assetInfo.url,
                    name: '',
                });
                if (!config || this.bundleMap[config.name]) {
                    return;
                }
                config.output = otherBundleOutput;
                this.addBundle(config);
            });
        }
        // 正常构建模式，或者仅构建 Bundle 模式有内置 Bundle 的自定义配置才自动补全
        if (!options.buildBundleOnly || Object.keys(internalBundleConfigMap).length) {
            // 检查填充编辑器内置 Bundle
            this.initInternalBundleConfigs(internalBundleConfigMap);
        }
        this.bundles = Object.values(this.bundleMap).sort((bundleA, bundleB) => {
            return (bundleB.priority - bundleA.priority) || compareUUID(bundleA.name, bundleB.name);
        });
        // 存在 bundleConfigs 时，如果循环完没有获取到任何 bundle 则代表配置有误，需要报错中断
        if (!this.bundles.length) {
            throw new Error('Invalid bundle config, please check your bundle config');
        }
        this.updateProcess(`Num of bundles: ${this.bundles.length}...`);
    }

    /**
     * 初始化内置 Bundle（由于一些历史的 bundle 行为配置，内置 Bundle 的配置需要单独处理）
     */
    private initInternalBundleConfigs(internalBundleConfigMap: Record<string, IBundleOptions>) {
        // 注意顺序，START_SCENE, INTERNAL 的默认配置会取自 MAIN 的配置
        const cocosBundles: string[] = [MAIN, START_SCENE, INTERNAL];
        const output = this.options.buildBundleOnly ? false : true;

        cocosBundles.forEach((name) => {
            if (name === START_SCENE && !this.options.startSceneAssetBundle && !internalBundleConfigMap[name]) {
                return;
            }
            if (this.options.buildBundleOnly && !internalBundleConfigMap[name]) {
                return;
            }
            let config: IBundleInitOptions = this.getDefaultBundleConfig(name);
            const customConfig: IBundleOptions = internalBundleConfigMap[name] || { name };
            config = defaultsDeep(Object.assign({}, customConfig), config);
            // 整理后的数据，其他内置 Bundle 可能会再次使用，需要存到 internalBundleConfigMap
            internalBundleConfigMap[name] = config;
            config.output = customConfig.output ?? output;
            if (customConfig.name === MAIN) {
                const isRemote = this.options.mainBundleIsRemote;
                // 如未配置远程服务器地址，取消主包的远程包配置，需要导出的 bundle 才警告
                if (customConfig.output && isRemote && !this.options.server && !this.options.preview) {
                    console.warn(i18n.t('builder.warn.assetBundleIsRemoteInvalid', {
                        directoryName: 'main',
                    }));
                }
                config.isRemote = customConfig.isRemote || isRemote;
                config.compressionType = customConfig.compressionType || this.options.mainBundleCompressionType;
            } else {
                // START_SCENE, INTERNAL 的默认配置是根据实际的项目经验设定的一套规则
                config.isRemote = !!(customConfig.isRemote ?? (this.options.startSceneAssetBundle ? false : internalBundleConfigMap[MAIN].isRemote));
                if (!customConfig.compressionType) {
                    config.compressionType = (this.options.startSceneAssetBundle || internalBundleConfigMap[MAIN].compressionType === BundleCompressionTypes.MERGE_DEP) ?
                        BundleCompressionTypes.MERGE_ALL_JSON : internalBundleConfigMap[MAIN].compressionType!;
                }
            }
            // TODO 提取以及单元测试，后续此配置还会调整，临时处理
            if (!customConfig.dest && config.compressionType === 'subpackage') {
                config.dest = join(dirname(this.destDir), BuildGlobalInfo.SUBPACKAGES_HEADER, config.name);
                config.scriptDest = join(config.dest, BuildGlobalInfo.SCRIPT_NAME);
            } else if (!customConfig.dest) {
                config.dest = config.isRemote ? join(dirname(this.destDir), BuildGlobalInfo.REMOTE_HEADER, config.name) : join(this.destDir, config.name);
                config.scriptDest = join(config.dest, BuildGlobalInfo.SCRIPT_NAME);
            }
            if ((this.options.moveRemoteBundleScript && config.isRemote) && !customConfig.scriptDest) {
                config.scriptDest = this._task ? join(this._task.result.paths.bundleScripts, config.name, BuildGlobalInfo.SCRIPT_NAME) : join(config.dest, BuildGlobalInfo.SCRIPT_NAME);
            }

            this.addBundle(config);
        });
    }

    /**
     * 填充成完整可用的项目 Bundle 配置（传入自定义配置 > Bundle 文件夹配置 > 默认配置）
     * @param customConfig 
     * @returns IBundleInitOptions | null
     */
    private patchProjectBundleConfig(customConfig: Partial<IBundleOptions>): IBundleInitOptions | null {
        // 非内置 Bundle 的配置必须填写 root 选项
        if (!customConfig.root) {
            console.debug(`Invalid Bundle config with bundle root:${customConfig.root}`);
            return null;
        }
        const uuid = buildAssetLibrary.url2uuid(customConfig.root);
        if (!uuid) {
            console.debug(`Invalid Bundle config with bundle ${customConfig.root}`);
            return null;
        }

        const assetInfo = buildAssetLibrary.getAsset(uuid);
        if (!assetInfo) {
            console.debug(`Invalid Bundle config with bundle ${customConfig.root}`);
            return null;
        }

        const { bundleFilterConfig, priority, bundleConfigID, bundleName } = assetInfo.meta.userData;
        const name = customConfig.name || bundleName || getBundleDefaultName(assetInfo);
        const userBundleConfig = this.getUserConfig(bundleConfigID);
        let config = this.getDefaultBundleConfig(name);
        const validCustomConfig = defaultsDeep({
            compressionType: userBundleConfig && userBundleConfig.compressionType,
            isRemote: userBundleConfig && userBundleConfig.isRemote,
            priority,
            bundleFilterConfig,
            name,
        }, customConfig);
        config = defaultsDeep(validCustomConfig, config);
        if (!userBundleConfig) {
            console.warn(`Invalid Bundle config ID ${bundleConfigID} in bundle ${customConfig.root}, the bundle config will use the default config ${JSON.stringify(config)}`);
        }
        // 未配置远程服务器地址，给用户警告提示
        if (config.isRemote && !this.options.server && !this.options.preview) {
            console.warn(i18n.t('builder.warn.assetBundleIsRemoteInvalid', {
                directoryName: name,
            }));
        }

        // TODO 提取以及单元测试，后续此配置还会调整，临时处理
        if (!customConfig.dest && config.compressionType === 'subpackage' && !this.options.buildBundleOnly) {
            config.dest = join(dirname(this.destDir), BuildGlobalInfo.SUBPACKAGES_HEADER, config.name);
            config.scriptDest = join(config.dest, BuildGlobalInfo.SCRIPT_NAME);
        } else if (!customConfig.dest && config.isRemote && !this.options.buildBundleOnly) {
            config.dest = join(dirname(this.destDir), BuildGlobalInfo.REMOTE_HEADER, config.name);
            config.scriptDest = join(config.dest, BuildGlobalInfo.SCRIPT_NAME);
        }

        if ((this.options.moveRemoteBundleScript && config.isRemote) && !customConfig.scriptDest) {
            config.scriptDest = this._task ? join(this._task.result.paths.bundleScripts, config.name, BuildGlobalInfo.SCRIPT_NAME) : join(config.dest, BuildGlobalInfo.SCRIPT_NAME);
        }
        return config;
    }

    /**
     * 初始化 bundle 分组内的根资源信息
     * 初始化 bundle 内的各项不同的处理任务
     */
    private async initBundleRootAssets() {
        this.updateProcess('Init bundle root assets start...');
        if (this.bundleMap[INTERNAL]) {
            const internalAssets = await queryPreloadAssetList(this.options.includeModules, this.options.engineInfo.typescript.path);
            // 添加引擎依赖的预加载内置资源/脚本到 internal 包内
            console.debug(`Query preload assets/scripts from cc.config.json`);
            internalAssets.forEach((uuid) => {
                this.bundleMap[INTERNAL].addRootAsset(buildAssetLibrary.getAsset(uuid));
            });
        }
        const launchBundle = this.bundleMap[START_SCENE] || this.bundleMap[MAIN];
        const assets = buildAssetLibrary.assets;
        for (let i = 0; i < assets.length; i++) {
            const assetInfo = assets[i];
            if (assetInfo.isDirectory()) {
                continue;
            }
            const assetType = buildAssetLibrary.getAssetProperty(assetInfo, 'type');
            this.cache.addAsset(assetInfo, assetType);
            let bundleWithAsset = this.bundles.find((bundle) => assetInfo.url.startsWith(bundle.root + '/'));
            // 不在 Bundle 内的脚本默认加到启动 bundle 内
            if (assetType === 'cc.Script') {
                if (assetInfo.url.startsWith('db://internal')) {
                    // internal db 下的脚本，不全量构建，以 dependentScripts 为准
                    continue;
                }
                bundleWithAsset = bundleWithAsset || launchBundle;
                if (bundleWithAsset) {
                    bundleWithAsset.addScript(assetInfo);
                }
                continue;
            }

            // 场景作为特殊资源管理: 只要包含在 bundle 内默认参与构建 > 没有指定 scenes 的情况下默认参与 > 指定 scenes 按照此名单
            if (assetType === 'cc.SceneAsset' && (bundleWithAsset || !this.options.scenes || this.options.scenes.find(item => item.uuid === assetInfo.uuid))) {
                // 初始场景加入到初始场景 bundle 内
                if (launchBundle && this.options.startScene === assetInfo.uuid) {
                    launchBundle.addRootAsset(assetInfo);
                    continue;
                }

                if (bundleWithAsset) {
                    bundleWithAsset.addRootAsset(assetInfo);
                } else {
                    // 不在 bundle 内的其他场景，放入主包，由于支持 bundle 剔除，main bundle 可能不存在
                    this.bundleMap[MAIN] && this.bundleMap[MAIN].addRootAsset(assetInfo);
                }
                continue;
            }

            if (assetInfo.source.endsWith('.pac')) {
                this._pacAssets.push(assetInfo.uuid);
            }

            if (bundleWithAsset && assetType !== 'cc.SceneAsset') {
                bundleWithAsset.addRootAsset(assetInfo);
                continue;
            }

        }

        if (launchBundle) {
            // 加入项目设置中的 renderPipeline 资源
            if (this.options.renderPipeline) {
                launchBundle.addRootAsset(buildAssetLibrary.getAsset(this.options.renderPipeline));
            }

            // 加入项目设置中的物理材质
            if (this.options.physicsConfig.defaultMaterial) {
                const asset = buildAssetLibrary.getAsset(this.options.physicsConfig.defaultMaterial);
                launchBundle.addRootAsset(asset);
            }
        }
        console.debug(`  Number of all scenes: ${this.cache.scenes.length}`);
        console.debug(`  Number of all scripts: ${this.cache.scriptUuids.length}`);
        console.debug(`  Number of other assets: ${this.cache.assetUuids.length}`);
        this.updateProcess('Init bundle root assets success...');
    }

    /**
     * 按照 Bundle 优先级整理 Bundle 的资源列表
     */
    private async initBundleShareAssets() {
        // 预览无需根据优先级分析共享资源，预览本身就是按需加载的，不需要提前整理完整的 bundle 资源列表
        if (this.options.preview) {
            return;
        }
        this.updateProcess('Init bundle share assets start...');
        // 处理共享资源
        const sharedAssets: Record<string, string> = {};
        const manager = this;
        async function walkDepend(uuid: string, bundle: IBundle, checked: Set<string>, fatherUuid?: string) {
            if (checked.has(uuid)) {
                return;
            }
            const asset = buildAssetLibrary.getAsset(uuid);
            if (!asset) {
                if (fatherUuid) {
                    // const fatherAsset = buildAssetLibrary.getAsset(fatherUuid);
                    // console.warn(i18n.t('builder.error.required_asset_missing', {
                    //     uuid: `{asset(${uuid})}`,
                    //     fatherUrl: `{asset(${fatherAsset.url})}`,
                    // }));
                } else {
                    console.warn(i18n.t('builder.error.missing_asset', {
                        uuid: `{asset(${uuid})}`,
                    }));
                }
                return;
            }
            checked.add(uuid);
            bundle.addAsset(asset);

            if (hasCCONFormatAssetInLibrary(asset)) {
                // TODO 需要优化流程，后续可能被 removeAsset
                const cconExtension = getDesiredCCONExtensionMap(manager.options.assetSerializeOptions);
                (bundle.config.extensionMap[cconExtension] ??= []).push(asset.uuid);
            }

            if (sharedAssets[uuid]) {
                bundle.addRedirect(uuid, sharedAssets[uuid]);
                return;
            }
            const depends = await buildAssetLibrary.getDependUuids(uuid);
            await Promise.all(
                depends.map(async (dependUuid) => {
                    return await walkDepend(dependUuid, bundle, checked, uuid);
                }),
            );
        }

        const bundleGroupInPriority = this.bundleGroupInPriority;
        // 递归处理所有 bundle 中场景与根资源
        for (const bundleGroup of bundleGroupInPriority) {
            await Promise.all(bundleGroup.map(async (bundle) => {
                const checked = new Set<string>();
                return await Promise.all(bundle.rootAssets.map(async (uuid) => await walkDepend(uuid, bundle, checked)));
            }));

            // 每循环一组，将该组包含的 uuid 增加到 sharedAssets 中，供下一组 bundle 复用
            bundleGroup.forEach((bundle) => {
                bundle.assetsWithoutRedirect.forEach((uuid) => {
                    if (!sharedAssets[uuid]) {
                        sharedAssets[uuid] = bundle.name;
                    }
                });
            });
        }
        this.updateProcess('Init bundle share assets success...');
    }

    /**
     * 根据不同的选项做不同的 bundle 任务注册
     */
    async bundleDataTask() {
        const imageCompressManager = this.imageCompressManager;
        imageCompressManager && (await imageCompressManager.init());
        await Promise.all(this.bundles.map(async (bundle) => {
            if (!bundle.output) {
                return;
            }
            await handleJsonGroup(bundle);
            await handleBinGroup(bundle, this.options.binGroupConfig);
            imageCompressManager && await bundleDataTask(bundle, imageCompressManager);
        }));
    }

    /**
     * 纹理压缩处理
     * @returns 
     */
    private async compressImage() {
        if (!this.imageCompressManager) {
            return;
        }
        this.updateProcess('Compress image start...');
        await this.imageCompressManager.run();
        this.updateProcess('Compress image success...');
    }

    /**
     * 执行自动图集任务
     */
    private async packImage() {
        this.updateProcess('Pack Images start');
        newConsole.trackTimeStart('builder:pack-auto-atlas-image');
        // 确认实际参与构建的图集资源列表
        let pacAssets: (IAsset)[] = [];
        if (this.options.buildBundleOnly) {
            this._pacAssets.reduce((pacAssets, pacUuid) => {
                const pacInfo = buildAssetLibrary.getAsset(pacUuid);
                const inBundle = this.bundles.some((bundle) => {
                    if (!bundle.output) {
                        return false;
                    }
                    if (utils.Path.contains(pacInfo.url, bundle.root) || utils.Path.contains(bundle.root, pacInfo.url)) {
                        return true;
                    }
                });
                if (inBundle) {
                    pacAssets.push(pacInfo);
                }
                return pacAssets;
            }, pacAssets);
        } else {
            // 非独立构建 Bundle 模式下，所有的图集都需要参与构建，TODO 需要优化
            pacAssets = this._pacAssets.map((pacUuid) => buildAssetLibrary.getAsset(pacUuid));
        }
        if (!pacAssets.length) {
            console.debug('No pac assets');
            return;
        }
        console.debug(`Number of pac assets: ${pacAssets.length}`);
        const includeAssets = new Set<string>();
        this.bundles.forEach((bundle => bundle.assets.forEach((asset) => includeAssets.add(asset))));
        const { TexturePacker } = await import('../texture-packer/index');
        this.packResults = await (await new TexturePacker().init(pacAssets, Array.from(includeAssets))).pack();
        if (!this.packResults.length) {
            console.debug('No pack results');
            return;
        }
        const imageCompressManager = this.imageCompressManager;
        const dependedAssets: Record<string, string[]> = {};
        console.debug(`Number of pack results: ${this.packResults.length}`);
        await Promise.all(this.packResults.map(async (pacRes) => {
            if (!pacRes.result) {
                console.debug('No pack result in pac', pacRes.uuid);
                return;
            }
            const atlases = pacRes.result.atlases;
            const assetInfo = buildAssetLibrary.getAsset(pacRes.uuid);
            const { createAssetInstance } = await import('../texture-packer/pac-info');
            // atlases 是可被序列化的缓存信息，不包含 spriteFrames
            const pacInstances = createAssetInstance(atlases, assetInfo, pacRes.spriteFrames);
            pacInstances.forEach((instance) => {
                this.cache.addInstance(instance);
            });

            console.debug('start collect depend assets in pac', pacRes.uuid);
            // includeAssets 是 Bundle 根据依赖关系整理的配置，包含了所有有被依赖的构建资源
            await collectDependAssets(pacRes.uuid, includeAssets, dependedAssets);
            for (const spriteFrameInfo of pacRes.spriteFrameInfos) {
                await collectDependAssets(spriteFrameInfo.uuid, includeAssets, dependedAssets);

                await collectDependAssets(spriteFrameInfo.textureUuid, includeAssets, dependedAssets);
                if (dependedAssets[spriteFrameInfo.textureUuid]) {
                    // 由于图集小图内部之间会存在互相依赖，属于伪依赖，不作为真实项目依赖考虑
                    dependedAssets[spriteFrameInfo.textureUuid] = dependedAssets[spriteFrameInfo.textureUuid].filter((uuid) => uuid !== spriteFrameInfo.uuid);
                    if (!dependedAssets[spriteFrameInfo.textureUuid].length) {
                        delete dependedAssets[spriteFrameInfo.textureUuid];
                    }
                }

                await collectDependAssets(spriteFrameInfo.imageUuid, includeAssets, dependedAssets);
                if (dependedAssets[spriteFrameInfo.imageUuid]) {
                    dependedAssets[spriteFrameInfo.imageUuid] = dependedAssets[spriteFrameInfo.imageUuid].filter((uuid) => uuid !== spriteFrameInfo.textureUuid);
                    if (!dependedAssets[spriteFrameInfo.imageUuid].length) {
                        delete dependedAssets[spriteFrameInfo.imageUuid];
                    }
                    imageCompressManager && imageCompressManager.removeTask(queryImageAssetFromSubAssetByUuid(spriteFrameInfo.uuid));
                }
            }
            console.debug('start sort bundle in pac', pacRes.uuid);
            await Promise.all((atlases).map(async (atlas) => {
                await sortBundleInPac(this.bundles, atlas, pacRes, dependedAssets, imageCompressManager);
            }));
            console.debug('end sort bundle in pac', pacRes.uuid);
        }));
        await newConsole.trackTimeEnd('builder:pack-auto-atlas-image', { output: true });
        this.updateProcess('Pack Images success');
    }

    /**
     * 编译项目脚本
     */
    async buildScript() {
        this.updateProcess(`${i18n.t('builder.tasks.build_project_script')} start...`);
        newConsole.trackTimeStart('builder:build-project-script');
        if (this.options.buildScriptParam && !this.options.buildScriptParam.commonDir) {
            this.options.buildScriptParam.commonDir = join(this.destDir, 'src', 'chunks');
        }
        await this.scriptBuilder.initProjectOptions(this.options);
        const res = await this.scriptBuilder.buildBundleScript(this.bundles);
        const buildProjectTime = await newConsole.trackTimeEnd('builder:build-project-script');
        this.updateProcess(`${i18n.t('builder.tasks.build_project_script')} in (${buildProjectTime} ms) √`);
        return res;
    }

    /**
     * 输出所有的 bundle 资源，包含脚本、json、普通资源、纹理压缩、图集等
     */
    private async outputAssets() {
        this.updateProcess('Output asset in bundles start');
        const hasCheckedAsset = new Set();
        await Promise.all(this.bundles.map(async (bundle) => {
            if (!bundle.output) {
                return;
            }
            if (this.imageCompressManager) {
                await bundleOutputTask(bundle, this.cache);
            }

            // 输出 json 分组
            await outputJsonGroup(bundle, this);
            await outputBinGroup(bundle, this.options.binGroupConfig);
            // 循环分组内的资源
            await Promise.all(bundle.assetsWithoutRedirect.map(async (uuid: string) => {
                if (uuid.length <= 15 || bundle.compressTask[uuid]) {
                    // 合图资源、已参与纹理压缩的资源无需拷贝原图
                    return Promise.resolve();
                }
                // 将资源复制到指定位置
                const asset = buildAssetLibrary.getAsset(uuid);
                if (!asset) {
                    console.error(`Can not get asset info with uuid(${uuid})`);
                    return;
                }

                if (!hasCheckedAsset.has(uuid)) {
                    hasCheckedAsset.add(uuid);
                    // 校验 effect 是否需要 mipmap
                    await checkEffectTextureMipmap(asset, uuid);
                }

                try {
                    await copyAssetFile(asset, bundle, this.options);
                } catch (error) {
                    console.error(error);
                    console.error(`output asset file error with uuid(${uuid})`);
                    return Promise.resolve();
                }
            }));
        }));
        this.updateProcess('Output asset in bundles success');
    }

    async handleHook(func: Function, internal: boolean, ...args: any[]) {
        if (internal) {
            await func.call(this, this.options, this.bundles, this.cache);
        } else {
            await func();
        }
    }

    async runAllTask() {
        const weight = 1 / this.pipeline.length;
        for (const task of this.pipeline) {
            if (typeof task === 'string') {
                await this.runPluginTask(task, weight);
            } else if (typeof task === 'function') {
                await this.runBuildTask(task, weight);
            }
        }
    }

    async runBuildTask(handle: Function, increment: number) {
        if (this.error) {
            await this.onError(this.error);
            return;
        }
        try {
            await handle.bind(this)();
            this.updateProcess(`run bundle task ${handle.name} success!`, increment);
        } catch (error: any) {
            this.updateProcess(`run bundle task failed!`, increment);
            await this.onError(error);
        }
    }
}

async function collectDependAssets(uuid: string, allAssets: Set<string>, dependedAssets: Record<string, string[]>) {
    if (allAssets.has(uuid)) {
        const res = await buildAssetLibrary.queryAssetUsers(uuid);
        res && res.length && (dependedAssets[uuid] = res);
    }
}

const featuresWithDependencies: string[] = [];
const preloadAssets: string[] = []; // 预加载资源 uuid 数组（包含脚本）

/**
 * 将资源复制到指定位置
 * @param rawAssetDir 输出文件夹路径
 * @param asset
 */
function copyAssetFile(asset: IAsset, bundle: IBundle, options: IInternalBundleBuildOptions): Promise<any> {
    const cconFormatSource = getCCONFormatAssetInLibrary(asset);

    if (cconFormatSource) {
        const isCconHandledInGroup = !!bundle.groups.find(group => group.type == 'BIN' && group.uuids.includes(asset.uuid));
        if (isCconHandledInGroup) {
            return Promise.resolve();
        }
        const rawAssetDir = join(bundle.dest, bundle.importBase);
        const source = cconFormatSource;
        const relativeName = relative(getLibraryDir(source), source);
        const dest = join(join(rawAssetDir, relativeName));
        return buildAssetLibrary.outputCCONAsset(
            asset.uuid,
            dest,
            options,
        );
    }

    const excludeExtName = ['.json'];
    return Promise.all(
        asset.meta.files.map((extname) => {
            if (excludeExtName.includes(extname)) {
                return Promise.resolve();
            }
            // 规则：构建不打包 __ 开头的资源数据
            if (extname.startsWith('__')) {
                return Promise.resolve();
            }

            const rawAssetDir = join(bundle.dest, bundle.nativeBase);
            const source = extname.startsWith('.') ? asset.library + extname : join(asset.library, extname);
            // 利用相对路径来获取资源相对地址，避免耦合一些特殊资源的路径拼写规则，比如 font 
            const relativeName = relative(getLibraryDir(source), source);
            if (!existsSync(source)) {
                console.error(
                    i18n.t('builder.error.missing_import_files', {
                        path: `{link(${source})}`,
                        url: `{asset(${asset.url})}`,
                    }),
                );
                return Promise.resolve();
            }
            const dest = join(rawAssetDir, relativeName);
            // 其他流程可能生成同类型后缀资源，比如压缩纹理，不能将其覆盖
            if (existsSync(dest)) {
                return Promise.resolve();
            }
            return copy(source, dest);
        }),
    );
}

function traversalDependencies(features: string[], featuresInJson: any): void {
    features.forEach((featureName) => {
        if (featuresInJson[featureName]) {
            if (!featuresWithDependencies.includes(featureName)) {
                featuresWithDependencies.push(featureName);
                if (featuresInJson[featureName].dependentAssets) {
                    preloadAssets.push(...featuresInJson[featureName].dependentAssets);
                }
                if (featuresInJson[featureName].dependentScripts) {
                    preloadAssets.push(...featuresInJson[featureName].dependentScripts);
                }
                if (featuresInJson[featureName].dependentModules) {
                    const dependentModules: string[] = featuresInJson[featureName].dependentModules;
                    traversalDependencies(dependentModules, featuresInJson);
                }
            }
        }
    });
}

/**
 * 根据模块信息，查找需要预加载的资源列表（包含普通资源与脚本）
 * @param features 
 * @returns 
 */
async function queryPreloadAssetList(features: string[], enginePath: string) {
    const ccConfigJson = await readJSON(join(enginePath, 'cc.config.json'));
    const featuresInJson = ccConfigJson.features;
    featuresWithDependencies.length = 0;
    preloadAssets.length = 0;
    traversalDependencies(features, featuresInJson);
    return Array.from(new Set(preloadAssets));
}

/**
 * effect 设置了 requireMipmaps，对材质进行校验，若发现关联的纹理没有开启 mipmap 则输出警告
 */
async function checkEffectTextureMipmap(asset: IAsset, uuid: string) {
    try {
        if (buildAssetLibrary.getAssetProperty(asset, 'type') === 'cc.Material') {
            const mtl = (await buildAssetLibrary.getInstance(buildAssetLibrary.getAsset(uuid))) as Material;
            if (mtl.effectAsset && mtl.effectAsset._uuid) {
                const effect = (await buildAssetLibrary.getInstance(buildAssetLibrary.getAsset(mtl.effectAsset._uuid))) as EffectAsset;
                // 遍历 effect.techniques[mtl._techIdx] 下的所有 pass
                // @ts-ignore
                effect.techniques[mtl._techIdx].passes.forEach(async (pass: any, index: number) => {
                    if (pass.properties && pass.properties.mainTexture && pass.properties.mainTexture.requireMipmaps) {
                        // 引擎接口报错
                        // const mainTexture = mtl.getProperty('mainTexture', index);

                        // 获取 mainTexture 的 uuid
                        // @ts-ignore
                        const prop = mtl._props && mtl._props[index];
                        // @ts-ignore
                        if (prop.mainTexture && prop.mainTexture._uuid) {
                            // requireMipmaps === ture 的 mainTexture 校验是否开启了 mipmap
                            // @ts-ignore
                            const meta = await buildAssetLibrary.getMeta(prop.mainTexture._uuid);
                            if (!['nearest', 'linear'].includes(meta.userData.mipfilter)) {
                                console.warn(i18n.t('builder.warn.requireMipmaps', {
                                    effectUUID: effect._uuid,
                                    // @ts-ignore
                                    textureUUID: prop.mainTexture._uuid,
                                }));
                            }
                        }
                    }
                });
            }
        }
    } catch (error) {
        console.debug(error);
    }
}