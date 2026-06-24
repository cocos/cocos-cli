import EventEmitter from 'events';
import { basename, join } from 'path';
import { checkBuildCommonOptionsByKey, checkBundleCompressionSetting } from '../share/common-options-validator';
import { NATIVE_PLATFORM, PLATFORMS } from '../share/platforms-options';
import { validator, validatorManager } from '../share/validator-manager';
import { checkConfigDefault, defaultMerge, defaultsDeep, getOptionsDefault, resolveToRaw } from '../share/utils';
import { Platform, IDisplayOptions, IBuildTaskOption, IConsoleType, TextureCompressRenderConfig, TextureCompressFullRenderConfig } from '../@types';
import { IInternalBuildPluginConfig, IPlatformBuildPluginConfig, PlatformBundleConfig, BundleQueryConfig, IBuildStageItem, BuildCheckResult, BuildTemplateConfig, IConfigGroupsInfo, IPlatformConfig, ITextureCompressConfig, IBuildHooksInfo, IBuildCommandOption, MakeRequired, IBuilderConfigItem, IPlatformRegisterInfo, IPluginRegisterInfo, IPackageRegisterInfo, IBuilderRegisterInfo, PlatformBuildSchema, PlatformConfigItem } from '../@types/protected';
import Utils from '../../base/utils';
import i18n from '../../base/i18n';
import lodash from 'lodash';
import { configGroups, textureFormatConfigs, formatsInfo, defaultSupport } from '../share/texture-compress';
import { BundlecompressionTypeMap, BundlePlatformTypes } from '../share/bundle-utils';
import { newConsole } from '../../base/console';
import builderConfig from '../share/builder-config';
import { createBuilderPlatformMetadataNodes } from '../share/metadata';
import { configurationRegistry } from '../../configuration';
import { convertConfigItem, ICocosConfigurationPropertySchema } from '../../configuration/script/metadata';
import { GlobalPaths } from '../../../global';
import { existsSync, readdirSync } from 'fs';
import utils from '../../base/utils';
import { copy, outputJSON, readJSON, readJSONSync } from 'fs-extra';

export interface InternalPackageInfo {
    name: string; // 插件名
    path: string; // 插件路径
    buildPath: string; // 注册到构建的入口
    doc?: string; // 插件注册到构建面板上，显示的文档入口
    displayName?: string; // 插件的显示名称
    version: string; // 版本号
}

type ICustomAssetHandlerType = 'compressTextures';
type IAssetHandlers = Record<ICustomAssetHandlerType, Record<string, (...args: unknown[]) => unknown>>;
// 对外支持的对外公开的资源处理方法汇总
const CustomAssetHandlerTypes: ICustomAssetHandlerType[] = ['compressTextures'];

type DisplayValueField = 'displayName' | 'label' | 'description';
type I18nDisplayRecord = Record<string, any>;

function translateDisplayValue(value?: string): string | undefined {
    if (typeof value !== 'string') {
        return value;
    }
    return i18n.transI18nName(value) || value;
}

function materializeDisplayI18nKey(target: I18nDisplayRecord | undefined, key: DisplayValueField) {
    if (!target) {
        return;
    }
    const keyField = `${key}I18nKey`;
    const rawValue = typeof target[keyField] === 'string' ? target[keyField] : target[key];
    if (typeof rawValue !== 'string') {
        return;
    }
    if (rawValue.startsWith('i18n:')) {
        target[keyField] = rawValue;
    }
    target[key] = translateDisplayValue(rawValue);
}

const pluginRoots = [
    join(__dirname, '../platforms'),
    join(GlobalPaths.workspace, 'packages/platforms'),
];

function getRegisterInfo(root: string, dirName: string) : IPlatformRegisterInfo | null {
    const packageJSONPath = join(root, 'package.json');
    if (existsSync(packageJSONPath)) {
        const packageJSON = require(packageJSONPath);
        const builder: IPackageRegisterInfo = packageJSON.contributes.builder;
        if (!builder.register) {
            return null;
        }
        return {
            platform: builder.platform,
            hooks: builder.hooks ? join(root, builder.hooks) : undefined,
            config: require(join(root, builder.config)).default,
            path: root,
            conifgPath: join(root, builder.config),
            type: 'register',
        };
    }

    if (utils.Path.contains(GlobalPaths.workspace, root)) {
        if (PLATFORMS.includes(dirName)) {
            return {
                platform: basename(root),
                path: root,
                config: require(join(root, 'config')).default,
                hooks: join(root, 'hooks'),
                conifgPath: join(root, 'config'),
                type: 'register',
            };
        }
        return null;
    }

    throw new Error(`Can not find package.json in root: ${root}`);
}

async function scanPluginRoot(root: string): Promise<IPlatformRegisterInfo[]>{
    const dirNames = readdirSync(root);
    const res: IPlatformRegisterInfo[] = [];
    for (const dirName of dirNames) {
        try {
            const registerInfo = await getRegisterInfo(join(root, dirName), dirName);
            // eslint-disable-next-line @typescript-eslint/no-unused-expressions
            registerInfo && res.push(registerInfo);
        } catch (error) {
            console.error(error);
            console.error(`Register platform package failed in root: ${root}`);
        }
    }
    return res;
}

export class PluginManager extends EventEmitter {
    // 平台选项信息
    public bundleConfigs: Record<string, PlatformBundleConfig> = {};
    public commonOptionConfig: Record<string, Record<string, IBuilderConfigItem  & { verifyKey: string }>> = {};
    public pkgOptionConfigs: Record<string, Record<string, IDisplayOptions>> = {};
    public platformConfig: Record<string, IPlatformConfig> = {};
    public buildTemplateConfigMap: Record<string, BuildTemplateConfig> = {};
    public configMap: Record<string, Record<string, IInternalBuildPluginConfig>>; // 存储注入进来的 config
    // 存储注册进来的，带有 hooks 的插件路径，[pkgName][platform]: hooks
    private builderPathsMap: Record<string, Record<string, string>> = {};
    private customBuildStagesMap: {
        [pkgName: string]: {
            [platform: string]: IBuildStageItem[];
        };
    } = {};
    protected customBuildStages: Record<string, {
        [pkgName: string]: IBuildStageItem[];
    }>;

    // 存储注册进来的，带有 assetHandlers 配置的一些方法 [ICustomAssetHandlerType][pkgName]: Function
    private assetHandlers = {} as IAssetHandlers;
    // 存储插件优先级（TODO 目前优先级记录在 config 内，针对不同平台可能有不同的优先级）
    protected readonly pkgPriorities: Record<string, number> = {};

    // 记录已注册的插件名称
    public packageRegisterInfo: Map<string, InternalPackageInfo> = new Map();

    private platformRegisterInfoPool: Map<string, IPlatformRegisterInfo> = new Map();

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
        for (const root of pluginRoots) {
            if (!existsSync(root)) {
                continue;
            }
            const infos = await scanPluginRoot(root);
            for (const info of infos) {
                this._registerI18n(info);
                this.translateConfigDisplayFields(info.config);
                this.platformRegisterInfoPool.set(info.platform, info);
            }
        }
        this.translateConfigItemsDisplayFields(builderConfig.commonOptionConfigs);
    }

    public async registerAllPlatform() {
        for (const platform of this.platformRegisterInfoPool.keys()) {
            try {
                await this.register(platform);
            } catch (error) {
                console.error(error);
                console.error(`register platform ${platform} failed!`);
            }
        }
    }

    public async register(platform: string) {
        if (this.platformConfig[platform]) {
            console.debug(`platform ${platform} has register already!`);
            return;
        }
        const info = this.platformRegisterInfoPool.get(platform);
        if (!info) {
            throw new Error(`Can not find platform register info for ${platform}`);
        }
        await this.registerPlatform(info);
        await this.internalRegister(info);
        console.log(`register platform ${platform} success!`);
    }

    public checkPlatform(platform: string) {
        try {
            return !!platform && !!this.platformConfig[platform].platformType;
        } catch (error) {
            return false;
        }
    }

    private async registerPlatform(registerInfo: IPlatformRegisterInfo) {
        const { platform, config } = registerInfo;
        if (this.platformConfig[platform]) {
            console.error(`platform ${platform} has register already!`);
            return;
        }
        this.configMap[platform] = {};
        this.platformConfig[platform] = {} as IPlatformConfig;
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
        const configWithDisplayKeys = config as I18nDisplayRecord;
        this.platformConfig[platform].name = config.displayName;
        this.platformConfig[platform].nameI18nKey = configWithDisplayKeys.displayNameI18nKey;
        if (config.doc && !config.doc.startsWith('http')) {
            config.doc = Utils.Url.getDocUrl(config.doc);
        }
        this.platformConfig[platform].doc = config.doc;
        this.platformConfig[platform].pluginPath = registerInfo.path;
        this.platformConfig[platform].platformType = (config as IPlatformBuildPluginConfig).platformType;

        if (config.buildTemplateConfig && config.buildTemplateConfig.templates.length) {
            const label = config.displayName || platform;
            config.buildTemplateConfig.pkgName = platform;
            this.platformConfig[platform].createTemplateLabel = label;
            this.platformConfig[platform].createTemplateLabelI18nKey = configWithDisplayKeys.displayNameI18nKey;
            this.buildTemplateConfigMap[label] = config.buildTemplateConfig;
        }
        if (this.bundleConfigs[platform]) {
            this.platformConfig[platform].type = this.bundleConfigs[platform].platformType;
        }
    }

    private async internalRegister(registerInfo: IBuilderRegisterInfo): Promise<void> {
        const { platform, config, path } = registerInfo;
        if (!this.platformConfig[platform] || !this.platformConfig[platform].name) {
            throw new Error(`platform ${platform} has been registered!`);
        }

        const pkgName = registerInfo.pkgName || platform;
        this.pkgPriorities[pkgName] = config.priority || (path.includes(GlobalPaths.workspace) ? 1 : 0);
        // 注册校验方法
        if (typeof config.verifyRuleMap === 'object') {
            for (const [ruleName, item] of Object.entries(config.verifyRuleMap)) {
                // 添加以 平台 + 插件 作为 key 的校验规则
                validatorManager.addRule(ruleName, item, platform + pkgName);
            }
        }

        if (typeof config.options === 'object') {
            lodash.set(this.pkgOptionConfigs, `${registerInfo.platform}.${pkgName}`, config.options);
            Object.keys(config.options).forEach((key) => {
                checkConfigDefault(config.options![key]);
            });
            await builderConfig.setProject(`platforms.${platform}.packages.${platform}`, getOptionsDefault(config.options), 'default');
        }

        // 整理通用构建选项的校验规则
        if (config.commonOptions) {
            // 此机制依赖了插件的启动顺序来写入配置
            if (!this.commonOptionConfig[platform]) {
                // 使用默认通用配置和首个插件自定义的通用配置进行融合
                this.commonOptionConfig[platform] = Object.assign({}, lodash.defaultsDeep({}, config.commonOptions, JSON.parse(JSON.stringify(builderConfig.commonOptionConfigs))));
            } else {
                this.commonOptionConfig[platform] = defaultMerge({}, this.commonOptionConfig[platform], config.commonOptions || {});
            }
            const commonOptions = config.commonOptions;
            for (const key in commonOptions) {
                if (commonOptions[key].verifyRules) {
                    this.commonOptionConfig[platform][key] = Object.assign({}, this.commonOptionConfig[platform][key], {
                        verifyKey: platform + pkgName,
                    });
                }
            }
        }
        if (config.customBuildStages) {
            // 注册构建阶段性任务
            lodash.set(this.customBuildStages, `${platform}.${pkgName}`, config.customBuildStages);
            lodash.set(this.customBuildStagesMap, `${pkgName}.${platform}`, config.customBuildStages);
            await builderConfig.setProject(`platforms.${platform}.generateCompileConfig`, this.shouldGenerateOptions(platform), 'default');
        }

        this.pkgPriorities[pkgName] = config.priority || 0;
        this.configMap[platform][pkgName] = config;
        await configurationRegistry.register('builder', {
            nodes: () => createBuilderPlatformMetadataNodes(platform, {
                commonOptionConfigs: builderConfig.commonOptionConfigs as unknown as Record<string, ICocosConfigurationPropertySchema>,
                useCacheDefaults: {},
                commonOptionConfig: this.commonOptionConfig as unknown as Record<string, Record<string, ICocosConfigurationPropertySchema>>,
                configMap: {
                    [platform]: this.configMap[platform],
                } as unknown as Record<string, Record<string, {
                    displayName?: string;
                    options?: Record<string, ICocosConfigurationPropertySchema>;
                }>>,
                platformTitles: {
                    [platform]: this.platformConfig[platform]?.name || platform,
                },
            }),
        });
        // 注册 hooks 路径
        if (registerInfo.hooks) {
            config.hooks = registerInfo.hooks;
            lodash.set(this.builderPathsMap, `${pkgName}.${platform}`, config.hooks);
        }
        // 注册构建模板菜单项
        console.debug(`[Build] internalRegister pkg(${pkgName}) in ${platform} platform success!`);
    }

    _registerI18n(registerInfo: IBuilderRegisterInfo) {
        const { platform, path } = registerInfo;
        const i18nPath = join(path, 'i18n');
        if (existsSync(i18nPath)) {
            try {
                const patchPath = registerInfo.pkgName || platform;
                readdirSync(i18nPath).forEach((file) => {
                    const filePath = join(i18nPath, file);
                    if (file.endsWith('.json')) {
                        const lang = basename(file, '.json');
                        i18n.registerLanguagePatch(lang, patchPath, readJSONSync(filePath));
                    } else if (file.endsWith('.js')) {
                        const lang = basename(file, '.js');
                        const resolved = require.resolve(filePath);
                        const data = require(resolved);
                        i18n.registerLanguagePatch(lang, patchPath, data);
                    }
                });
            } catch (error) {
                if (registerInfo.type === 'register') {
                    throw error;
                }
                console.error(error);
            }
        }
    }

    private translateConfigItemDisplayFields(config?: Partial<IBuilderConfigItem>) {
        if (!config || typeof config !== 'object') {
            return;
        }
        const item = config as I18nDisplayRecord;
        materializeDisplayI18nKey(item, 'label');
        materializeDisplayI18nKey(item, 'description');

        if (item.properties && typeof item.properties === 'object') {
            Object.values(item.properties).forEach((property) => {
                this.translateConfigItemDisplayFields(property as Partial<IBuilderConfigItem>);
            });
        }

        if (Array.isArray(item.items)) {
            item.items.forEach((child: unknown) => {
                if (child && typeof child === 'object') {
                    this.translateConfigItemDisplayFields(child as Partial<IBuilderConfigItem>);
                }
            });
        } else if (item.items && typeof item.items === 'object') {
            this.translateConfigItemDisplayFields(item.items as Partial<IBuilderConfigItem>);
        }
    }

    private translateConfigItemsDisplayFields(configs?: Record<string, Partial<IBuilderConfigItem>>) {
        if (!configs || typeof configs !== 'object') {
            return;
        }
        Object.values(configs).forEach((option) => {
            this.translateConfigItemDisplayFields(option);
        });
    }

    private translateConfigDisplayFields(config: IInternalBuildPluginConfig | IPlatformBuildPluginConfig) {
        const configWithDisplayKeys = config as I18nDisplayRecord;
        materializeDisplayI18nKey(configWithDisplayKeys, 'displayName');

        this.translateConfigItemsDisplayFields(config.options);
        this.translateConfigItemsDisplayFields(config.commonOptions);

        if (Array.isArray(config.customBuildStages)) {
            config.customBuildStages.forEach((stage) => {
                const stageWithDisplayKeys = stage as I18nDisplayRecord;
                materializeDisplayI18nKey(stageWithDisplayKeys, 'displayName');
                materializeDisplayI18nKey(stageWithDisplayKeys, 'description');
            });
        }

        const buildTemplateConfig = (config as IPlatformBuildPluginConfig).buildTemplateConfig as I18nDisplayRecord | undefined;
        if (buildTemplateConfig) {
            materializeDisplayI18nKey(buildTemplateConfig, 'displayName');
        }
    }

    public refreshDisplayI18nFields() {
        this.translateConfigItemsDisplayFields(builderConfig.commonOptionConfigs);

        for (const info of this.platformRegisterInfoPool.values()) {
            this.translateConfigDisplayFields(info.config);
        }

        for (const platformConfigs of Object.values(this.configMap)) {
            for (const config of Object.values(platformConfigs)) {
                this.translateConfigDisplayFields(config);
            }
        }

        for (const commonOptions of Object.values(this.commonOptionConfig)) {
            this.translateConfigItemsDisplayFields(commonOptions);
        }

        for (const platformStages of Object.values(this.customBuildStages)) {
            for (const stages of Object.values(platformStages)) {
                stages.forEach((stage) => {
                    const stageWithDisplayKeys = stage as I18nDisplayRecord;
                    materializeDisplayI18nKey(stageWithDisplayKeys, 'displayName');
                    materializeDisplayI18nKey(stageWithDisplayKeys, 'description');
                });
            }
        }

        for (const template of Object.values(this.buildTemplateConfigMap)) {
            materializeDisplayI18nKey(template as I18nDisplayRecord, 'displayName');
        }

        for (const [platform, registerInfo] of this.platformRegisterInfoPool.entries()) {
            const platformConfig = this.platformConfig[platform];
            if (!platformConfig) {
                continue;
            }
            const { config } = registerInfo;
            const configWithDisplayKeys = config as I18nDisplayRecord;
            platformConfig.name = config.displayName;
            platformConfig.nameI18nKey = configWithDisplayKeys.displayNameI18nKey;

            if (config.buildTemplateConfig && config.buildTemplateConfig.templates.length) {
                const label = config.displayName || platform;
                platformConfig.createTemplateLabel = label;
                platformConfig.createTemplateLabelI18nKey = configWithDisplayKeys.displayNameI18nKey;
                this.buildTemplateConfigMap[label] = config.buildTemplateConfig;
            }
        }
    }

    public getCommonOptionConfigs(platform: Platform): Record<string, IBuilderConfigItem> {
        return this.commonOptionConfig[platform];
    }

    public getCommonOptionConfigByKey(key: keyof IBuildTaskOption, options: IBuildTaskOption): IBuilderConfigItem | null {
        const config = this.commonOptionConfig[options.platform as Platform] && this.commonOptionConfig[options.platform as Platform][key] || {};
        if (builderConfig.commonOptionConfigs[key]) {
            const defaultConfig = JSON.parse(JSON.stringify(builderConfig.commonOptionConfigs[key]));
            lodash.defaultsDeep(config, defaultConfig);
        }
        if (!config || !config.verifyRules) {
            return null;
        }
        return config;
    }

    public getPackageOptionConfigByKey(key: string, pkgName: string, options: IBuildTaskOption): IBuilderConfigItem | null {
        if (!key || !pkgName) {
            return null;
        }
        const configs = this.pkgOptionConfigs[options.platform as Platform][pkgName];
        if (!configs) {
            return null;
        }
        return lodash.get(configs, key);
    }

    public getOptionConfigByKey(key: keyof IBuildTaskOption, options: IBuildTaskOption): IBuilderConfigItem | null {
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

    private hasFixedValue(result: BuildCheckResult): boolean {
        return Object.prototype.hasOwnProperty.call(result, 'fixedValue');
    }

    private getFixedValue<T>(result: BuildCheckResult, value: T): T {
        return this.hasFixedValue(result) ? result.fixedValue as T : value;
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
            const fixedCompressionType = this.getFixedValue(compressionTypeResult, options.mainBundleCompressionType);
            const isValid = validator.checkWithInternalRule('valid', fixedCompressionType);
            if (isValid) {
                lodash.set(options, 'mainBundleCompressionType', fixedCompressionType);
            }
            // 有报错信息，也有修复值，只发报错不中断，使用新值
            if (!compressionTypeResult.valid && isValid) {
                console.warn(i18n.t('builder.warn.check_failed_with_new_value', {
                    key: 'mainBundleCompressionType',
                    value: options.mainBundleCompressionType,
                    error: compressionTypeResult.message || '',
                    newValue: JSON.stringify(fixedCompressionType),
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
            const res = await this.checkCommonOptionByKey(key as keyof IBuildTaskOption, rightOptions[key], rightOptions);
            const fixedValue = this.getFixedValue(res, rightOptions[key]);
            if (res && !res.valid && (res.level || 'error') === 'error') {
                const errMsg = res.message || '';
                if (!validator.checkWithInternalRule('valid', fixedValue)) {
                    checkRes = false;
                    console.error(i18n.t('builder.error.check_failed', {
                        key,
                        value: JSON.stringify(rightOptions[key]),
                        error: errMsg,
                    }));
                    // 出现检查错误，直接中断构建
                    return;
                } else {
                    // 常规构建如果新的值可用，不中断，只警告
                    console.warn(i18n.t('builder.warn.check_failed_with_new_value', {
                        key,
                        value: JSON.stringify(rightOptions[key]),
                        error: errMsg,
                        newValue: JSON.stringify(fixedValue),
                    }));
                }
            }
            rightOptions[key] = fixedValue;
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
        const checkRes: Record<string, BuildCheckResult> = {};
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
                valid: true,
            };
        }

        const error = await validatorManager.check(
            value,
            config.verifyRules!,
            options,
            this.commonOptionConfig[options.platform as Platform] && this.commonOptionConfig[options.platform as Platform][key]?.verifyKey || (options.platform + options.platform),
        );
        if (!error) {
            return {
                valid: true,
            };
        }

        const result: BuildCheckResult = {
            valid: false,
            level: config.verifyLevel === 'warn' ? 'warn' : 'error',
            message: translateDisplayValue(error) || error,
        };
        if (!lodash.isEqual(config.default, value)) {
            result.fixedValue = config.default;
        }
        return result;
    }

    /**
     * 校验构建插件注册的构建参数
     * @param options
     */
    private createVerifyOptions(platform: string, key: string, value: unknown, options: IBuildTaskOption): IBuildTaskOption {
        const nextOptions = lodash.cloneDeep(options || {}) as IBuildTaskOption;
        nextOptions.platform = platform;
        if (!nextOptions.outputName) {
            nextOptions.outputName = platform;
        }
        if (!nextOptions.packages) {
            nextOptions.packages = {};
        }
        if (!nextOptions.packages[platform]) {
            nextOptions.packages[platform] = {};
        }
        const platformOptions = this.configMap[platform]?.[platform]?.options || this.platformRegisterInfoPool.get(platform)?.config?.options;
        if (platformOptions?.[key]) {
            nextOptions.packages[platform][key] = value;
        } else {
            (nextOptions as unknown as Record<string, unknown>)[key] = value;
        }
        return nextOptions;
    }

    private async checkPlatformOptionByKey(platform: string, key: string, value: unknown, options: IBuildTaskOption): Promise<BuildCheckResult> {
        const pkgName = platform;
        const buildConfig = this.configMap[platform]?.[pkgName] || this.platformRegisterInfoPool.get(platform)?.config;
        const config = buildConfig?.options?.[key];
        const rules = config?.verifyRules;
        if (!config || !rules) {
            return {
                valid: true,
            };
        }
        const error = await validatorManager.check(
            value,
            rules,
            options,
            platform + pkgName,
        );
        if (!error) {
            return {
                valid: true,
            };
        }

        const result: BuildCheckResult = {
            valid: false,
            level: config.verifyLevel === 'warn' ? 'warn' : 'error',
            message: translateDisplayValue(error) || error,
        };
        if (!lodash.isEqual(config.default, value)) {
            result.fixedValue = config.default;
        }
        return result;
    }

    public async checkBuildOption(platform: string, key: string, value: unknown, options: IBuildTaskOption): Promise<BuildCheckResult> {
        const verifyOptions = this.createVerifyOptions(platform, key, value, options);
        const commonOptions = this.commonOptionConfig[platform] || {};
        if (key === 'mainBundleCompressionType') {
            const supportedCompressionTypes = this.bundleConfigs[platform]?.supportOptions?.compressionType;
            if (supportedCompressionTypes) {
                const compressionTypeResult = checkBundleCompressionSetting(value as any, supportedCompressionTypes);
                if (!compressionTypeResult.valid) {
                    return compressionTypeResult;
                }
            }
        }

        if (builderConfig.commonOptionConfigs[key] || commonOptions[key]) {
            return this.checkCommonOptionByKey(key as keyof IBuildTaskOption, value, verifyOptions);
        }

        return this.checkPlatformOptionByKey(platform, key, value, verifyOptions);
    }

    public async checkBuildOptions(platform: string, options: IBuildTaskOption): Promise<Record<string, BuildCheckResult>> {
        const result: Record<string, BuildCheckResult> = {};
        const schema = this.collectPlatformConfigItems(platform);
        const verifyOptions = lodash.cloneDeep(options || {}) as IBuildTaskOption;
        verifyOptions.platform = platform;

        for (const key of Object.keys(schema.common)) {
            result[key] = await this.checkBuildOption(platform, key, (verifyOptions as any)[key], verifyOptions);
        }

        for (const key of Object.keys(schema.platformOptions)) {
            result[key] = await this.checkBuildOption(platform, key, lodash.get(verifyOptions, ['packages', platform, key]), verifyOptions);
        }

        return result;
    }

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
                    pluginManager.commonOptionConfig[options.platform as Platform]?.[key]?.verifyKey || (options.platform + pkgName),
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
                        pluginManager.commonOptionConfig[options.platform as Platform]?.[key]?.verifyKey || (options.platform + pkgName),
                    ));
                }
                const verifyLevel: IConsoleType = buildConfig.options[key].verifyLevel || 'error';
                const errMsg = (typeof error === 'string' && i18n.transI18nName(error)) || error;

                if (!useDefault && verifyLevel === 'error') {
                    console.error(i18n.t('builder.error.check_failed', {
                        key: `options.packages.${pkgName}.${key}`,
                        value: JSON.stringify(value),
                        error: errMsg,
                    }));
                    checkRes = false;
                    continue;
                } else {
                    const consoleType = (verifyLevel !== 'error' && newConsole[verifyLevel]) ? verifyLevel : 'warn';
                    // 有报错信息，但有默认值，报错后填充默认值
                    newConsole[consoleType](i18n.t('builder.warn.check_failed_with_new_value', {
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

    public shouldGenerateOptions(platform: Platform | string): boolean {
        const customBuildStageMap = this.customBuildStages[platform];
        return !!Object.values(customBuildStageMap).find((stages) => stages.find((stageItem => stageItem.requiredBuildOptions !== false)));
    }

    /**
     * 获取平台默认值
     * @param platform
     */
    public async getOptionsByPlatform<P extends Platform | string>(platform: P): Promise<IBuildTaskOption> {
        const options = await builderConfig.getProject<IBuildTaskOption>(`platforms.${platform}`);
        const commonOptions = await builderConfig.getProject<IBuildCommandOption>(`common`);
        commonOptions.platform = platform;
        commonOptions.outputName = platform;
        return Object.assign(commonOptions, options);
    }

    public getTexturePlatformConfigs(): Record<string, ITextureCompressConfig> {
        const result: Record<string, ITextureCompressConfig> = {};
        Object.keys(this.platformConfig).forEach((platform) => {
            result[platform] = {
                name: translateDisplayValue(this.platformConfig[platform].name || platform) || platform,
                textureCompressConfig: this.platformConfig[platform].texture,
            };
        });
        return result;
    }

    private cloneDisplayOptions(options?: Record<string, IBuilderConfigItem>): Record<string, IBuilderConfigItem> {
        return lodash.cloneDeep(options || {});
    }

    private cloneConfigItem(config: IBuilderConfigItem & { verifyKey?: string }): IBuilderConfigItem {
        const item = lodash.cloneDeep(config) as IBuilderConfigItem & { verifyKey?: string };
        delete item.verifyKey;
        return item;
    }

    private applySupportedCompressionTypes(platform: string, common: Record<string, IBuilderConfigItem>) {
        const supportedCompressionTypes = this.bundleConfigs[platform]?.supportOptions?.compressionType;
        if (!supportedCompressionTypes || !common.mainBundleCompressionType) {
            return;
        }

        Object.assign(common.mainBundleCompressionType, {
            type: 'enum',
            items: supportedCompressionTypes.map((value) => ({
                label: translateDisplayValue(BundlecompressionTypeMap[value as keyof typeof BundlecompressionTypeMap]) || value,
                labelI18nKey: BundlecompressionTypeMap[value as keyof typeof BundlecompressionTypeMap],
                value,
            })),
        });
    }

    /**
     * 装配某平台的原始配置项(IBuilderConfigItem):
     *   common = CLI 内置 common 项 + 该平台 commonOptions 覆盖(已应用支持的压缩类型);
     *   platformOptions = 平台 config.options。
     * key 顺序即显示顺序。供构建面板 schema(getPlatformBuildSchema)与配置校验(checkBuildOptions)共用。
     */
    private collectPlatformConfigItems(platform: Platform | string): {
        common: Record<string, IBuilderConfigItem>;
        platformOptions: Record<string, IBuilderConfigItem>;
    } {
        const common: Record<string, IBuilderConfigItem> = {};
        const platformCommonOptions = this.commonOptionConfig[platform] || {};
        for (const key of Object.keys(builderConfig.commonOptionConfigs)) {
            common[key] = this.cloneConfigItem(platformCommonOptions[key] || builderConfig.commonOptionConfigs[key]);
        }
        for (const key of Object.keys(platformCommonOptions)) {
            if (!common[key]) {
                common[key] = this.cloneConfigItem(platformCommonOptions[key]);
            }
        }
        // 应用支持的压缩类型
        this.applySupportedCompressionTypes(platform, common);

        const config = this.configMap[platform]?.[platform] || this.platformRegisterInfoPool.get(platform)?.config;
        return {
            common,
            platformOptions: this.cloneDisplayOptions(config?.options),
        };
    }

    /**
     * 把 IBuilderConfigItem 映射成配置系统 schema(ICocosConfigurationPropertySchema)。
     * 复用配置系统的 convertConfigItem(label->title、type:'enum'->string|number+enum、对象/数组递归、i18n 翻译)。
     * hidden 项直接过滤(配置系统 schema 无 hidden 字段;如 md5CacheOptions 不渲染,其值仍随构建参数透传)。
     */
    private toRenderSchema(items: Record<string, IBuilderConfigItem>): ICocosConfigurationPropertySchema {
        const properties: Record<string, ICocosConfigurationPropertySchema> = {};
        const required: string[] = [];
        for (const [key, item] of Object.entries(items)) {
            if (!item || item.hidden) {
                continue;
            }
            properties[key] = convertConfigItem(item, key);
            // 必填:从 verifyRules:['required'] 派生,收进父对象节点的 required(JSON Schema 对象级);拦构建仍由 checkBuildOption 负责
            if (item.verifyRules?.includes('required')) {
                required.push(key);
            }
        }
        const node: ICocosConfigurationPropertySchema = { type: 'object', properties };
        if (required.length) {
            node.required = required;
        }
        return node;
    }

    public getPlatformBuildSchema(platform: Platform | string): PlatformBuildSchema {
        if (!this.platformConfig[platform]) {
            throw new Error(`Can not find platform config for ${platform}`);
        }

        const { common, platformOptions } = this.collectPlatformConfigItems(platform);
        return {
            common: this.toRenderSchema(common),
            platformOptions: this.toRenderSchema(platformOptions),
        };
    }

    public queryPlatformConfig(): PlatformConfigItem[] {
        // HACK(临时): fb-instant-games / google-play 暂不对外,在平台查询的总出口处过滤掉。
        //   PinK 构建面板(走 pluginManager.queryPlatformConfig)、core/lib 接口等所有消费方都经此方法,
        //   统一隐藏。待平台就绪后移除此过滤。
        const HIDDEN_PLATFORMS = new Set(['fb-instant-games', 'google-play']);
        return Object.entries(this.platformConfig)
            .filter(([platform]) => !HIDDEN_PLATFORMS.has(platform))
            .map(([platform, config]) => {
            const customStages = this.customBuildStages[platform];
            const stageConfigs = customStages
                ? this.sortPkgNameWidthPriority(Object.keys(customStages))
                    .flatMap((pkgName) => customStages[pkgName] || [])
                    .map((stage) => lodash.cloneDeep(stage))
                : undefined;

            return {
                platform,
                displayName: translateDisplayValue(config.name || platform) || platform,
                platformType: config.platformType,
                isNative: NATIVE_PLATFORM.includes(platform as Platform),
                doc: config.doc,
                // 打包平台路径
                pluginPath: config.pluginPath || this.platformRegisterInfoPool.get(platform)?.path || '',
                createTemplateLabel: config.createTemplateLabel && translateDisplayValue(config.createTemplateLabel),
                supportTextureCompress: !!config.texture,
                customBuildStages: stageConfigs?.length ? stageConfigs : undefined,
            };
        });
    }

    public getRegisteredPlatforms(): string[] {
        return Object.keys(this.platformConfig);
    }

    /**
     * 查询所有平台的 Bundle 配置，按平台类型分组
     */
    public queryBundleConfig(): Record<string, BundleQueryConfig> {
        const result: Record<string, BundleQueryConfig> = {};

        for (const [platform, bundleConfig] of Object.entries(this.bundleConfigs)) {
            const platformType = bundleConfig.platformType;
            if (!result[platformType]) {
                const typeInfo = BundlePlatformTypes[platformType as keyof typeof BundlePlatformTypes];
                result[platformType] = {
                    displayName: typeInfo ? i18n.transI18nName(typeInfo.displayName) : platformType,
                    platformConfigs: {},
                };
            }

            const platformConfig = this.platformConfig[platform];
            const platformName = translateDisplayValue(platformConfig?.name || platform) || platform;
            result[platformType].platformConfigs[platform] = {
                platformName,
                platformType: bundleConfig.platformType,
                supportOptions: bundleConfig.supportOptions,
            };
        }

        return result;
    }

    /**
     * 查询所有平台的纹理压缩配置，按纹理压缩平台类型分组
     */
    public queryTextureCompressConfig(): TextureCompressFullRenderConfig {
        const platformRenderConfigs: Record<string, TextureCompressRenderConfig> = {};

        for (const [platform, config] of Object.entries(this.platformConfig)) {
            if (!config.texture) {
                continue;
            }
            const platformType = config.texture.platformType;
            if (!platformRenderConfigs[platformType]) {
                const groupInfo = configGroups[platformType];
                platformRenderConfigs[platformType] = {
                    displayName: groupInfo ? translateDisplayValue(groupInfo.displayName) || groupInfo.displayName : platformType,
                    platformConfigs: {},
                };
            }

            const platformName = translateDisplayValue(config.name || platform) || platform;
            platformRenderConfigs[platformType].platformConfigs[platform] = {
                platformName,
                platformType: config.texture.platformType,
                support: config.texture.support,
            };
        }

        return {
            configGroups,
            textureFormatConfigs,
            formatsInfo,
            defaultSupport,
            platformRenderConfigs,
        };
    }

    /**
     * 获取带有钩子函数的构建阶段任务
     * @param platform 
     * @returns 
     */
    public getBuildStageWithHookTasks(platform: Platform | string, taskName: string): IBuildStageItem | null {
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
     * 查询某个平台的阶段性任务按钮配置信息
     * @param platform
     */
    public getBuildStageConfigByPlatform(platform: Platform) {
        if (!this.customBuildStages[platform]) {
            return null;
        }
        const result: Record<string, any> = {};
        if (this.customBuildStages[platform]) {
            result.buttons = [];
            const pkgNames = Object.keys(this.customBuildStages[platform]);
            if (pkgNames.length) {
                pkgNames.sort((a, b) => this.pkgPriorities[b] - this.pkgPriorities[a]);
                pkgNames.forEach((pkgName) => {
                    const buttons = this.customBuildStages[platform][pkgName]
                        .filter((config) => !config.hidden)
                        .map((config) => lodash.cloneDeep(config));
                    result.buttons.push(...buttons);
                });
            }
        }

        return result;
    }


    /**
     * 根据插件权重传参的插件数组
     * @param pkgNames 
     * @returns 
     */
    private sortPkgNameWidthPriority(pkgNames: string[]) {
        return pkgNames.sort((a, b) => {
            // 平台构建插件的顺序始终在外部注册的任意插件之上
            if (!PLATFORMS.includes(a) && PLATFORMS.includes(b)) {
                return 1;
            } else if (PLATFORMS.includes(a) && !PLATFORMS.includes(b)) {
                return -1;
            }
            return this.pkgPriorities[b] - this.pkgPriorities[a];
        });
    }

    /**
     * 获取平台插件的构建路径信息
     * @param platform
     */
    public getHooksInfo(platform: Platform | string): IBuildHooksInfo {
        // 为了保障插件的先后注册顺序，采用了数组的方式传递
        const result: IBuildHooksInfo = {
            pkgNameOrder: [],
            infos: {},
        };
        Object.keys(this.builderPathsMap[platform]).forEach((pkgName) => {
            result.infos[pkgName] = {
                path: this.builderPathsMap[platform][pkgName],
                internal: pkgName === platform,
            };
        });
        result.pkgNameOrder = this.sortPkgNameWidthPriority(Object.keys(result.infos));
        return result;
    }

    public getBuildTemplateConfig(platform: string): BuildTemplateConfig {
        const config = this.buildTemplateConfigMap[this.platformConfig[platform].createTemplateLabel];
        if (!config) {
            return config;
        }
        return lodash.cloneDeep(config);
    }

    /**
     * 根据类型获取对应的执行方法
     * @param type 
     * @returns 
     */
    public async createBuildTemplate(nameOrPlatform: string): Promise<void> {
        const platformConfig = this.platformConfig[nameOrPlatform];
        if (platformConfig) {
            const createTemplateLabel = platformConfig.createTemplateLabel;
            if (!createTemplateLabel) {
                console.debug(`no build template for ${nameOrPlatform}`);
                return;
            }
            nameOrPlatform = createTemplateLabel;
        }

        const templateConfig = this.buildTemplateConfigMap[nameOrPlatform];
        if (!templateConfig) {
            console.debug(`no build template for ${nameOrPlatform}`);
            return;
        }

        const buildTemplateDir = builderConfig.buildTemplateDir;
        const versionKey = templateConfig.pkgName || nameOrPlatform;
        const target = join(buildTemplateDir, templateConfig.dirname || versionKey);

        await Promise.all(templateConfig.templates.map(async (info) => copy(info.path, join(target, info.destUrl))));

        const templateVersionPath = join(buildTemplateDir, 'templates-version.json');
        let contents: Record<string, string> = {
            [versionKey]: templateConfig.version,
        };

        if (existsSync(templateVersionPath)) {
            const versions = await readJSON(templateVersionPath);
            if (versions[versionKey] === templateConfig.version) {
                console.log(`${versionKey} ${i18n.t('builder.tips.create_template_success')}({link(${target})})`);
                return;
            }
            contents = Object.assign({}, versions, contents);
        }

        await outputJSON(templateVersionPath, contents, {
            spaces: 4,
        });

        console.log(`${versionKey} ${i18n.t('builder.tips.create_template_success')}({link(${target})})`);
    }

    public getAssetHandlers(type: ICustomAssetHandlerType) {
        const pkgNames = Object.keys(this.assetHandlers[type]);
        return {
            pkgNameOrder: this.sortPkgNameWidthPriority(pkgNames),
            handles: this.assetHandlers[type],
        };
    }
}

export const pluginManager = new PluginManager();
