import EventEmitter from 'events';
import { dirname, isAbsolute, join, resolve } from 'path';
import { checkBuildCommonOptionsByKey, checkBundleCompressionSetting, commonOptionConfigs } from '../share/common-options-validator';
import { builtinPlugins, NATIVE_PLATFORM, platformPlugins, PLATFORMS } from '../share/platforms-options';
import { validator, validatorManager } from '../share/validator-manager';
import { checkConfigDefault, defaultMerge, defaultsDeep, getOptionsDefault, resolveToRaw } from '../share/utils';
import { Platform, IConfigItem, IDisplayOptions, IBuildTaskOption, IConsoleType } from '../@types';
import { IInternalBuildPluginConfig, IPlatformBuildPluginConfig, PlatformBundleConfig, IPlatformInfo, IBuildStageItem, IBuildIconItem, BuildCheckResult, BuildTemplateConfig, IConfigGroupsInfo, IPlatformConfig, ITextureCompressConfig, IBuildHooksInfo, IBuildCommandOption, MakeRequired } from '../@types/protected';
import Utils from '../../base/utils';
import i18n from '../../base/i18n';
import lodash from 'lodash';
import { configGroups } from '../share/texture-compress';
import utils from '../../base/utils';
import { newConsole } from '../../base/console';
import builderConfig, { BuildGlobalInfo, getBuildCommonOptions } from '../share/builder-config';
export interface InternalPackageInfo {
    name: string; // 插件名
    path: string; // 插件路径
    buildPath: string; // 注册到构建的入口
    doc?: string; // 插件注册到构建面板上，显示的文档入口
    displayName?: string; // 插件的显示名称
    version: string; // 版本号
}

export interface IRegisterPlatformInfo {
    platform: Platform;
    config: IInternalBuildPluginConfig | IPlatformBuildPluginConfig;
    path: string;
}
type ICustomAssetHandlerType = 'compressTextures';
type IAssetHandlers = Record<ICustomAssetHandlerType, Record<string, Function>>;
// 对外支持的对外公开的资源处理方法汇总
const CustomAssetHandlerTypes: ICustomAssetHandlerType[] = ['compressTextures'];
export class PluginManager extends EventEmitter {
    // 平台选项信息
    public bundleConfigs: Record<string, PlatformBundleConfig> = {};
    public commonOptionConfig: Record<string, Record<string, IConfigItem>> = {};
    public pkgOptionConfigs: Record<string, Record<string, IDisplayOptions>> = {};
    public platformConfig: Record<string, IPlatformConfig> = {};
    public buildTemplateConfigMap: Record<string, BuildTemplateConfig> = {};
    public configMap: Record<Platform, Record<string, IInternalBuildPluginConfig>>; // 存储注入进来的 config
    // 存储注册进来的，带有 hooks 的插件路径，[pkgName][platform]: hooks
    private builderPathsMap: Record<string, Record<string, string>> = {};
    private customBuildStagesMap: {
        [pkgName: string]: {
            [platform: string]: IBuildStageItem[];
        };
    } = {};
    protected customBuildStages: Record<Platform, {
        [pkgName: string]: IBuildStageItem[];
    }>;

    // 存储注册进来的，带有 assetHandlers 配置的一些方法 [ICustomAssetHandlerType][pkgName]: Function
    private assetHandlers = {} as IAssetHandlers;
    // 存储插件优先级（TODO 目前优先级记录在 config 内，针对不同平台可能有不同的优先级）
    protected readonly pkgPriorities: Record<string, number> = {};

    // 记录已注册的插件名称
    public packageRegisterInfo: Map<string, InternalPackageInfo> = new Map();

    private enablePlatforms: Platform[] = [];

    constructor() {
        super();
        const compsMap: any = {};
        this.pkgOptionConfigs = compsMap;
        this.configMap = JSON.parse(JSON.stringify(compsMap));
        this.customBuildStages = JSON.parse(JSON.stringify(compsMap));
        CustomAssetHandlerTypes.forEach((handlerName) => {
            this.assetHandlers[handlerName] = {};
        });
    }

    async init() {
        const platformMap: Record<string, Object> = {};
        BuildGlobalInfo.platforms.forEach((platform) => platformMap[platform] = {});
        this.platformConfig = JSON.parse(JSON.stringify(platformMap));
        this.configMap = JSON.parse(JSON.stringify(platformMap));
        await Promise.all(BuildGlobalInfo.platforms.map(async (platform) => {
            const config = (await import(`../platforms/${platform}`));
            const platformRoot = join(__dirname, `../platforms/${platform}`);
            await this.internalRegister({
                platform,
                config: config.default,
                path: platformRoot,
            });
        }));
    }

    /*
     * 注册接口（插件路径写入，默认参数注入，参数校验方法注入）
     * 兼容旧插件的逻辑
     */
    async register(buildPath: string, pkg: { name: string, version: string, path: string }) {

        try {
            const buildMain = Utils.File.requireFile(buildPath);
            if (!buildMain.configs) {
                return false;
            }
            if (buildMain.load) {
                await buildMain.load();
            }
            const configs = buildMain.configs;
            const pkgInfo: InternalPackageInfo = {
                path: pkg.path,
                name: pkg.name,
                buildPath,
                version: pkg.version,
            };
            for (const key of Object.keys(configs)) {
                const platform = key as Platform;
                if (!this.enablePlatforms.includes(platform)) {
                    continue;
                }
                const config: IInternalBuildPluginConfig = configs[platform];
                const registerInfo: IRegisterPlatformInfo = {
                    platform,
                    config,
                    path: pkg.path,
                };
                if (key === '*') {
                    for (const platform of this.enablePlatforms) {
                        registerInfo.platform = platform;
                        await this.internalRegister(JSON.parse(JSON.stringify(registerInfo)), pkgInfo);
                    }
                    continue;
                }
                await this.internalRegister(registerInfo, pkgInfo);
            }
            if (buildMain.assetHandlers) {
                const handles = utils.File.requireFile(resolveToRaw(buildMain.assetHandlers, dirname(buildPath)));
                for (const key of CustomAssetHandlerTypes) {
                    if (!handles[key]) {
                        continue;
                    }
                    if (!this.assetHandlers[key]) {
                        this.assetHandlers[key] = {
                            [pkg.name]: handles[key],
                        };
                    } else {
                        this.assetHandlers[key][pkg.name] = handles[key];
                    }
                }
            }
            this.packageRegisterInfo.set(pkg.name, pkgInfo);
        } catch (error) {
            console.error(error);
            console.error(`${pkg.name} register panelInfo failed!`);
            return false;
        }
        return true;
    }

    protected async internalRegister(registerInfo: IRegisterPlatformInfo, pkgInfo?: InternalPackageInfo): Promise<void> {
        const { platform, config, path } = registerInfo;

        const pkgName = pkgInfo?.name || platform;
        // 插件显示顺序需要由 service 提供查询接口
        this.pkgPriorities[pkgName] = config.priority || (builtinPlugins.includes(pkgName) ? 1 : 0);

        // 注册校验方法
        if (typeof config.verifyRuleMap === 'object') {
            for (const [ruleName, item] of Object.entries(config.verifyRuleMap)) {
                // 添加以 平台 + 插件 作为 key 的校验规则
                validatorManager.addRule(ruleName, item, platform + pkgName);
            }
        }

        if (config.doc && !config.doc.startsWith('http')) {
            config.doc = Utils.Url.getDocUrl(config.doc);
        }
        if (typeof config.options === 'object') {
            lodash.set(this.pkgOptionConfigs, `${registerInfo.platform}.${pkgName}`, config.options)
            Object.keys(config.options).forEach((key) => {
                checkConfigDefault(config.options![key]);
            });
            await builderConfig.setProject(`platforms.${platform}.packages.${platform}`, getOptionsDefault(config.options), 'default');
        }

        if (config.customBuildStages) {
            // 注册构建阶段性任务
            this.customBuildStages[platform][pkgName] = config.customBuildStages;
        }

        // 整理通用构建选项的校验规则
        if (config.commonOptions) {
            // 此机制依赖了插件的启动顺序来写入配置
            if (!this.commonOptionConfig[platform]) {
                // 使用默认通用配置和首个插件自定义的通用配置进行融合
                this.commonOptionConfig[platform] = Object.assign({}, lodash.defaultsDeep({}, config.commonOptions, JSON.parse(JSON.stringify(commonOptionConfigs))));
            } else {
                this.commonOptionConfig[platform] = defaultMerge({}, this.commonOptionConfig[platform], config.commonOptions || {});
            }
            const commonOptions: Record<string, IConfigItem> = config.commonOptions;
            for (const key in commonOptions) {
                if (commonOptions[key].verifyRules) {
                    this.commonOptionConfig[platform][key] = Object.assign({}, this.commonOptionConfig[platform][key], {
                        verifyKey: platform + pkgName,
                    });
                }
            }
        }

        if (config.assetBundleConfig) {
            this.bundleConfigs[platform] = Object.assign(this.bundleConfigs[platform] || {}, {
                platformType: config.assetBundleConfig.platformType,
                supportOptions: {
                    compressionType: config.assetBundleConfig.supportedCompressionTypes,
                },
            });
        }
        // 注册压缩纹理配置，需要在平台剔除之前
        if (typeof config.textureCompressConfig === 'object') {
            const configGroupsInfo: IConfigGroupsInfo = configGroups[config.textureCompressConfig.platformType];
            if (!configGroupsInfo) {
                console.error(`Invalid platformType ${config.textureCompressConfig.platformType}`);
            } else {
                configGroupsInfo.support.rgb = lodash.union(configGroupsInfo.support.rgb, config.textureCompressConfig.support.rgb);
                configGroupsInfo.support.rgba = lodash.union(configGroupsInfo.support.rgba, config.textureCompressConfig.support.rgba);
                if (configGroupsInfo.defaultSupport) {
                    config.textureCompressConfig.support.rgb = lodash.union(
                        config.textureCompressConfig.support.rgb,
                        configGroupsInfo.defaultSupport.rgb,
                    );
                    config.textureCompressConfig.support.rgba = lodash.union(
                        config.textureCompressConfig.support.rgba,
                        configGroupsInfo.defaultSupport.rgba,
                    );
                }
            }
            this.platformConfig[platform].texture = config.textureCompressConfig;
        }
        if (config.platformName) {
            this.platformConfig[platform].name = config.platformName;
            this.platformConfig[platform].platformType = (config as IPlatformBuildPluginConfig).platformType;
        }
        if (this.bundleConfigs[platform]) {
            this.platformConfig[platform].type = this.bundleConfigs[platform].platformType;
        }

        if (config.customBuildStages) {
            lodash.set(this.customBuildStagesMap, `${pkgName}.${platform}`, config.customBuildStages);
        }

        // ----------------------------------- 剔除平台分割线 -------------------------------

        this.pkgPriorities[pkgName] = config.priority || 0;
        this.configMap[platform][pkgName] = config;
        // 注册 hooks 路径
        if (typeof config.hooks === 'string') {
            config.hooks = resolveToRaw(config.hooks, path);
            lodash.set(this.builderPathsMap, `${pkgName}.${platform}`, config.hooks);
        }
        // 注册构建模板菜单项
        if (config.buildTemplateConfig && config.buildTemplateConfig.templates.length) {
            config.buildTemplateConfig.pkgName = pkgName;
            const label = config.displayName || config.platformName || pkgName;
            this.platformConfig[platform].createTemplateLabel = label;
            this.buildTemplateConfigMap[label] = config.buildTemplateConfig;
        }
        console.debug(`[Build] internalRegister pkg(${pkgName}) in ${platform} platform success!`);
    }

    public getCommonOptionConfigs(platform: Platform): Record<string, IConfigItem> {
        return this.commonOptionConfig[platform];
    }

    public getCommonOptionConfigByKey(key: keyof IBuildTaskOption, options: IBuildTaskOption): IConfigItem | null {
        const config = this.commonOptionConfig[options.platform as Platform] && this.commonOptionConfig[options.platform as Platform][key] || {};
        if (commonOptionConfigs[key]) {
            const defaultConfig = JSON.parse(JSON.stringify(commonOptionConfigs[key]));
            lodash.defaultsDeep(config, defaultConfig);
        }
        if (!config || !config.verifyRules) {
            return null;
        }
        return config;
    }

    public getPackageOptionConfigByKey(key: string, pkgName: string, options: IBuildTaskOption): IConfigItem | null {
        if (!key || !pkgName) {
            return null;
        }
        const configs = this.pkgOptionConfigs[options.platform as Platform][pkgName];
        if (!configs) {
            return null;
        }
        return lodash.get(configs, key);
    }

    public getOptionConfigByKey(key: keyof IBuildTaskOption, options: IBuildTaskOption): IConfigItem | null {
        if (!key) {
            return null;
        }
        const keyMatch = key && (key).match(/^options.packages.(([^.]*).*)$/);
        if (!keyMatch || !keyMatch[2]) {
            return this.getCommonOptionConfigByKey(key, options);
        }

        const [, path, pkgName] = keyMatch;
        return this.getPackageOptionConfigByKey(path, pkgName, options);
    }

    /**
     * 完整校验构建参数（校验平台插件相关的参数校验）
     * @param options
     */
    public async checkOptions(options: MakeRequired<IBuildCommandOption, 'platform' | 'mainBundleCompressionType'>): Promise<undefined | IBuildTaskOption> {
        // 对参数做数据验证
        let checkRes = true;
        if (this.bundleConfigs[options.platform as Platform]) {
            const supportedCompressionTypes = this.bundleConfigs[options.platform as Platform].supportOptions.compressionType;
            const compressionTypeResult = await checkBundleCompressionSetting(options.mainBundleCompressionType, supportedCompressionTypes);
            const isValid = validator.checkWithInternalRule('valid', compressionTypeResult.newValue);
            if (isValid) {
                lodash.set(options, 'mainBundleCompressionType', compressionTypeResult.newValue);
            }
            // 有报错信息，也有修复值，只发报错不中断，使用新值
            if (compressionTypeResult.error && isValid) {
                console.warn(i18n.t('builder.warn.checkFailedWithNewValue', {
                    key: 'mainBundleCompressionType',
                    value: options.mainBundleCompressionType,
                    error: i18n.t(compressionTypeResult.error.replace('i18n:', '')) || compressionTypeResult.error,
                    newValue: JSON.stringify(compressionTypeResult.newValue),
                }));
            }
        } else {
            console.debug(`Can not find bundle config with platform ${options.platform}`);
        }

        // (校验处已经做了错误数据使用默认值的处理)检验数据通过后做一次数据融合
        const defaultOptions = await this.getOptionsByPlatform(options.platform);
        // lodash 的 defaultsDeep 会对数组也进行深度合并，不符合我们的使用预期，需要自己编写该函数
        const rightOptions = defaultsDeep(JSON.parse(JSON.stringify(options)), defaultOptions);
        // 传递了 buildStageGroup 的选项，不需要做默认值合并
        if ('buildStageGroup' in options) {
            rightOptions.buildStageGroup = options.buildStageGroup;
        }
        // 通用参数的构建校验, 需要使用默认值补全所有的 key
        for (const key of Object.keys(rightOptions)) {
            if (key === 'packages') {
                continue;
            }
            // @ts-ignore
            const res = await this.checkCommonOptionByKey(key as keyof IBuildTaskOption, rightOptions[key], rightOptions);
            if (res && res.error && res.level === 'error') {
                const errMsg = i18n.t(res.error.replace('i18n:', '')) || res.error;
                if (!validator.checkWithInternalRule('valid', res.newValue)) {
                    checkRes = false;
                    console.error(i18n.t('builder.error.checkFailed', {
                        key,
                        value: JSON.stringify(rightOptions[key]),
                        error: errMsg,
                    }));
                    // 出现检查错误，直接中断构建
                    return;
                } else {
                    // 常规构建如果新的值可用，不中断，只警告
                    console.warn(i18n.t('builder.warn.checkFailedWithNewValue', {
                        key,
                        value: JSON.stringify(rightOptions[key]),
                        error: errMsg,
                        newValue: JSON.stringify(res.newValue),
                    }));
                }
            }
            // @ts-ignore
            rightOptions[key] = res.newValue;
        }
        const result = await this.checkPluginOptions(rightOptions);
        if (!result) {
            checkRes = false;
        }
        if (checkRes) {
            return rightOptions;
        }
    }

    public async checkCommonOptions(options: IBuildTaskOption) {
        const checkRes = {};
        for (const key of Object.keys(options)) {
            if (key === 'packages') {
                continue;
            }
            // @ts-ignore
            checkRes[key] = await this.checkCommonOptionByKey(key as keyof IBuildTaskOption, options[key], options);
        }
        return checkRes;
    }

    public async checkCommonOptionByKey(key: keyof IBuildTaskOption, value: any, options: IBuildTaskOption): Promise<BuildCheckResult> {
        // 优先使用自定义的校验函数
        const res = await checkBuildCommonOptionsByKey(key, value, options);
        if (res) {
            return res;
        }
        const config = this.getCommonOptionConfigByKey(key, options);
        if (!config) {
            return {
                newValue: value,
                error: '',
                level: 'error',
            };
        }

        const error = await validatorManager.check(
            value,
            config.verifyRules!,
            options,
            this.commonOptionConfig[options.platform as Platform] && this.commonOptionConfig[options.platform as Platform][key]?.verifyKey || (options.platform + options.platform),
        );
        return {
            error,
            newValue: error ? config.default : value,
            level: config.verifyLevel || 'error',
        };
    }

    /**
     * 校验构建插件注册的构建参数
     * @param options
     */
    private async checkPluginOptions(options: IBuildTaskOption) {
        if (typeof options.packages !== 'object') {
            return false;
        }
        let checkRes = true;
        for (const pkgName of Object.keys(options.packages)) {
            const packageOptions = options.packages[pkgName as Platform];
            if (!packageOptions) {
                continue;
            }

            const buildConfig = pluginManager.configMap[options.platform as Platform][pkgName];
            if (!buildConfig || !buildConfig.options) {
                continue;
            }
            for (const key of Object.keys(packageOptions)) {
                if (!buildConfig.options[key] || !buildConfig.options[key].verifyRules) {
                    continue;
                }
                // @ts-ignore
                const value: any = packageOptions[key];
                const error = await validatorManager.check(
                    value,
                    buildConfig.options[key].verifyRules!,
                    options,
                    pluginManager.commonOptionConfig[options.platform as Platform][key]?.verifyKey || (options.platform + pkgName),
                );
                if (!error) {
                    continue;
                }
                let useDefault = validator.checkWithInternalRule('valid', buildConfig.options[key].default);
                // 有默认值也需要再走一遍校验
                if (useDefault) {
                    useDefault = !(await validatorManager.check(
                        buildConfig.options[key].default,
                        buildConfig.options[key].verifyRules!,
                        options,
                        pluginManager.commonOptionConfig[options.platform as Platform][key]?.verifyKey || (options.platform + pkgName),
                    ));
                }
                const verifyLevel: IConsoleType = buildConfig.options[key].verifyLevel || 'error';
                const errMsg = (typeof error === 'string' && i18n.t(error.replace('i18n:', ''))) || error;

                if (!useDefault && verifyLevel === 'error') {
                    console.error(i18n.t('builder.error.checkFailed', {
                        key: `options.packages.${pkgName}.${key}`,
                        value: JSON.stringify(value),
                        error: errMsg,
                    }));
                    checkRes = false;
                    continue;
                } else {
                    const consoleType = (verifyLevel !== 'error' && newConsole[verifyLevel]) ? verifyLevel : 'warn';
                    // 有报错信息，但有默认值，报错后填充默认值
                    newConsole[consoleType](i18n.t('builder.warn.checkFailedWithNewValue', {
                        key: `options.packages.${pkgName}.${key}`,
                        value: JSON.stringify(value),
                        error: errMsg,
                        newValue: JSON.stringify(buildConfig.options[key].default),
                    }));
                    lodash.set(packageOptions, key, buildConfig.options[key].default);
                }
            }
        }

        return checkRes;
    }

    /**
     * 获取平台默认值
     * @param platform
     */
    public async getOptionsByPlatform(platform: Platform) {
        const options = await builderConfig.getProject<IBuildTaskOption>(`platforms.${platform}`);
        return Object.assign(getBuildCommonOptions(), options);
    }

    public getTexturePlatformConfigs(): Record<string, ITextureCompressConfig> {
        const result: Record<string, ITextureCompressConfig> = {};
        Object.keys(this.platformConfig).forEach((platform) => {
            result[platform] = {
                name: this.platformConfig[platform].name,
                textureCompressConfig: this.platformConfig[platform].texture,
            };
        });
        return result;
    }

    public queryPlatformConfig() {
        return {
            native: BuildGlobalInfo.platforms.filter((platform) => NATIVE_PLATFORM.includes(platform)),
            config: this.platformConfig,
        };
    }

    /**
     * 获取带有钩子函数的构建阶段任务
     * @param platform 
     * @returns 
     */
    public getBuildStageWithHookTasks(platform: Platform, taskName: string): IBuildStageItem | null {
        const customStages = this.customBuildStages[platform];
        if (!customStages) {
            return null;
        }
        const pkgNameOrder = this.sortPkgNameWidthPriority(Object.keys(customStages));
        for (const pkgName of pkgNameOrder) {
            const stage = customStages[pkgName].find((item: IBuildStageItem) => item.hook === taskName);
            if (stage) {
                return stage;
            }
        }
        return null;
    }

    /**
     * 根据插件权重传参的插件数组
     * @param pkgNames 
     * @returns 
     */
    private sortPkgNameWidthPriority(pkgNames: string[]) {
        return pkgNames.sort((a, b) => {
            // 平台构建插件的顺序始终在外部注册的任意插件之上
            if (!platformPlugins.includes(a) && platformPlugins.includes(b)) {
                return 1;
            } else if (platformPlugins.includes(a) && !platformPlugins.includes(b)) {
                return -1;
            }
            return this.pkgPriorities[b] - this.pkgPriorities[a];
        });
    }

    /**
 * 获取平台插件的构建路径信息
 * @param platform
 */
    public getHooksInfo(platform: Platform): IBuildHooksInfo {
        // 为了保障插件的先后注册顺序，采用了数组的方式传递
        const result: IBuildHooksInfo = {
            pkgNameOrder: [],
            infos: {},
        };
        Object.keys(this.builderPathsMap[platform]).forEach((pkgName) => {
            result.infos[pkgName] = {
                path: this.builderPathsMap[platform][pkgName],
                internal: builtinPlugins.includes(pkgName as Platform),
            };
        });
        result.pkgNameOrder = this.sortPkgNameWidthPriority(Object.keys(result.infos));
        return result;
    }

    public getBuildTemplateConfig(platform: string) {
        return this.buildTemplateConfigMap[this.platformConfig[platform].createTemplateLabel];
    }

    /**
     * 根据类型获取对应的执行方法
     * @param type 
     * @returns 
     */
    public getAssetHandlers(type: ICustomAssetHandlerType) {
        const pkgNames = Object.keys(this.assetHandlers[type]);
        return {
            pkgNameOrder: this.sortPkgNameWidthPriority(pkgNames),
            handles: this.assetHandlers[type],
        };
    }
}

export const pluginManager = new PluginManager();
