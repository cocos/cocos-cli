import { Importer as AssetDBImporter, Asset, setDefaultUserData, get } from '@editor/asset-db';
import { copy, copyFile, ensureDir, existsSync, outputFile, outputFileSync, outputJSON, outputJSONSync, readJSONSync } from 'fs-extra';
import { basename, dirname, extname, isAbsolute, join } from 'path';
import { url2path } from '../utils';
import lodash, { extend } from 'lodash';
import fg from 'fast-glob';
import Sharp from 'sharp';
import Utils from '../../base/utils';
import i18n from '../../base/i18n';
import { IAsset, IExportData } from '../@types/protected/asset';
import { ICONConfig, AssetHandler, CustomHandler, CustomAssetHandler, ICreateMenuInfo, CreateAssetOptions, ThumbnailSize, ThumbnailInfo, IExportOptions, IAssetConfig, ImporterHook } from '../@types/protected/asset-handler';
import { AssetHandlerInfo } from '../asset-handler/config';
import assetConfig from '../asset-config';

interface HandlerInfo extends AssetHandlerInfo {
    pkgName: string;
    internal: boolean;
}

const databaseIconConfig: ICONConfig = {
    type: 'icon',
    value: 'database',
    thumbnail: false,
};

export class CustomImporter extends AssetDBImporter {
    constructor(extensions: string[], assetHandler: AssetHandler) {
        super();
        const { migrations, migrationHook, version, versionCode, force, import: ImportAsset } = assetHandler.importer as AssetDBImporter;

        if (!ImportAsset) {
            throw new Error(`Can not find import function in assetHandler(${assetHandler.name})`);
        }
        const { validate, name } = assetHandler;
        this._name = name;
        this._version = version || '0.0.0';
        this._versionCode = versionCode || 1;
        migrations && (this._migrations = migrations);
        migrationHook && (this._migrationHook = migrationHook);
        validate && (this.validate = validate);
        force && (this.force = force);
        // TODO 调整命名
        this.extnames = extensions;

        this.import = async (asset: IAsset) => {
            await assetHandlerManager.runImporterHook(asset, 'before');
            const res = await ImportAsset.call(assetHandler, asset);
            await assetHandlerManager.runImporterHook(asset, 'after');
            return res;
        };
    }
}

class AssetHandlerManager {
    static createTemplateRoot: string;
    name2handler: Record<string, AssetHandler> = {};
    type2handler: Record<string, AssetHandler[]> = {};
    name2importer: Record<string, CustomImporter> = {};
    // 缓存已经查找到的处理器
    // TODO 与 importer2custom 整合
    importer2OperateRecord: { [importer: string]: { [operate: string]: AssetHandler | CustomHandler } } = {};
    // [importer 懒加载] 1/3
    extname2registerInfo: Record<string, HandlerInfo[]> = {};
    name2registerInfo: Record<string, HandlerInfo> = {};

    // 扩展资源处理
    name2custom: Record<string, CustomHandler> = {};
    importer2custom: Record<string, CustomHandler[]> = {};

    _iconConfigMap: Record<string, ICONConfig> | null = null;

    // 用户配置里的 userData 缓存
    _userDataCache: Record<string, any> = {};
    // 导入器里注册的默认 userData 值， 注册后不可修改
    _defaultUserData: Record<string, any> = {};

    clear() {
        this.name2handler = {};
        this.extname2registerInfo = {};
        this.name2registerInfo = {};
        this.name2custom = {};
        this.importer2OperateRecord = {};
        this.importer2custom = {};
        this._iconConfigMap = null;
    }

    async init() {
        const { assetHandlerInfos } = await import('../../assets/asset-handler/config');
        this.register('cocos-cli', assetHandlerInfos, true);
        AssetHandlerManager.createTemplateRoot = await assetConfig.getProject('createTemplateRoot');
    }

    /**
     * 激活剩余未注册完成的资源处理器
     */
    async activateRegisterAll() {
        await Promise.all(Object.values(this.name2registerInfo).map((info) => {
            console.debug(`lazy register asset handler ${info.name}`);
            return this.activateRegister(info);
        }));
    }

    private async activateRegister(registerInfos: HandlerInfo) {
        const { pkgName, name, extensions, internal } = registerInfos;
        if (this.name2importer[name]) {
            return this.name2importer[name];
        }
        try {
            const assetHandler: AssetHandler = await registerInfos.load();
            if (assetHandler) {
                this.name2handler[name] = Object.assign(assetHandler, {
                    from: {
                        pkgName,
                        internal,
                    },
                });
                const extendsHandlerName = (assetHandler as CustomAssetHandler).extends;
                if (extendsHandlerName) {
                    if (!this.name2handler[extendsHandlerName]) {
                        console.error(`Can not find extend asset-handler ${extendsHandlerName}`);
                        if (this.name2handler[name].assetType) {
                            const type = this.name2handler[name].assetType!;
                            this.type2handler[type] = (this.type2handler[type] || []).concat([this.name2handler[name]]);
                        }
                        return null;
                    }
                    this.name2handler[name] = Object.assign({}, this.name2handler[extendsHandlerName], this.name2handler[name]);
                    this.name2handler[name].importer = Object.assign({}, this.name2handler[extendsHandlerName].importer, this.name2handler[name].importer);
                }
                if (this.name2handler[name].assetType) {
                    const type = this.name2handler[name].assetType!;
                    this.type2handler[type] = (this.type2handler[type] || []).concat([this.name2handler[name]]);
                }
                // 收集默认配置，注册到导入系统内
                if (assetHandler.userDataConfig) {
                    for (const key in assetHandler.userDataConfig.default) {
                        if (this._userDataCache[name] && this._userDataCache[name][key]) {
                            assetHandler.userDataConfig.default[key].default = this._userDataCache[name][key];
                        }
                        if ([undefined, null].includes(assetHandler.userDataConfig.default[key].default)) {
                            continue;
                        }
                        lodash.set(this._defaultUserData, `${name}.${key}`, assetHandler.userDataConfig.default[key].default);
                    }
                    const combineUserData = {
                        ...(this._defaultUserData[name] || {}),
                        ...(this._userDataCache[name] || {}),
                    };

                    Object.keys(combineUserData).length && setDefaultUserData(name, combineUserData);
                }
                return this.name2importer[name] = new CustomImporter(extensions, this.name2handler[name]);
            }
        } catch (error) {
            delete this.name2registerInfo[name];
            console.error(error);
            console.error(`register asset-handler ${name} failed!`);
        }
        return null;
    }

    register(pkgName: string, assetHandlerInfos: AssetHandlerInfo[], internal: boolean) {
        assetHandlerInfos.forEach((info) => {
            // 未传递 extname 的视为子资源导入器，extname = '-'
            const extensions = info.extensions && info.extensions.length ? info.extensions : ['-'];
            this.name2registerInfo[info.name] = {
                ...info,
                pkgName,
                extensions,
                internal,
            };
            extensions.forEach((extname) => {
                this.extname2registerInfo[extname] = this.extname2registerInfo[extname] || [];
                this.extname2registerInfo[extname].push(this.name2registerInfo[info.name]);
            });
        });
    }

    unregister(pkgName: string, assetHandlerInfos: AssetHandlerInfo[]) {
        assetHandlerInfos.forEach((info) => {
            delete this.name2registerInfo[info.name];
            info.extensions.forEach((extname) => {
                if (!this.extname2registerInfo[extname]) {
                    return;
                }
                this.extname2registerInfo[extname] = this.extname2registerInfo[extname].filter((info) => info.pkgName === pkgName);
            });
            this.extname2registerInfo['-'] = this.extname2registerInfo['-'].filter((info) => info.pkgName === pkgName);

        });
    }

    async findImporter(asset: IAsset, withoutDefaultImporter?: boolean): Promise<AssetDBImporter | null> {
        let extname = '';
        if (asset instanceof Asset && asset.extname) {
            extname = asset.extname;
        }
        // 尝试使用标记的导入器, * 的导入器是每次找不到合适导入器时才会走的，再次进入时要重新走流程查找导入器
        if (asset.meta.importer && asset.meta.importer !== '*') {
            let importer: AssetDBImporter | null = this.name2importer[asset.meta.importer];
            if (importer) {
                return importer;
            }
            const registerInfo = this.name2registerInfo[asset.meta.importer];
            if (registerInfo) {
                importer = await this.activateRegister(registerInfo);
                // 与标记导入器一致的不需要走检验
                if (importer && importer.name === asset.meta.importer) {
                    return importer;
                }
            }
            // 上面的逻辑走完还没有找到导入器，则说明以往标记的导入器已经无法找到，需要报错，之后重新寻找合适的导入器
            console.log(`Can not find the importer ${asset.meta.importer} in editor`);
        }

        // 尝试通过后缀找到适合这个资源的导入器
        const registerInfos = this.extname2registerInfo[extname] || [];
        if (registerInfos.length) {
            const importer = await this._findImporterInRegisterInfo(asset, registerInfos);
            if (importer) {
                return importer;
            }
        }

        if (withoutDefaultImporter) {
            return null;
        }

        // 找不到合适资源的导入器，尝试使用通过导入器
        return await this.getDefaultImporter(asset);
    }

    async getDefaultImporter(asset: IAsset) {
        return (await this._findImporterInRegisterInfo(asset, this.extname2registerInfo['*'] || []) || null);
    }

    async _findImporterInRegisterInfo(asset: IAsset, registerInfos: HandlerInfo[]) {
        for (let i = registerInfos.length - 1; i >= 0; i--) {
            const { name } = registerInfos[i];
            // 有可能在第一步的流程里已经获取到缓存在 name2importer 内了
            let importer: AssetDBImporter | null = this.name2importer[name];
            if (!importer) {
                importer = await this.activateRegister(registerInfos[i]);
            }
            if (!importer) {
                continue;
            }
            try {
                const validate = await importer.validate(asset);
                if (validate) {
                    return importer;
                }
            } catch (error) {
                console.warn(`Importer(${name}) validate failed: ${asset.uuid}`);
                console.warn(error);
            }
        }
    }

    add(assetHandler: AssetHandler, extensions: string[]) {
        // 如果已经存在同名的导入器则跳过
        if (
            assetHandler.name !== '*' &&
            this.name2handler[assetHandler.name] &&
            this.name2handler[assetHandler.name] !== assetHandler
        ) {
            console.warn(`The AssetHandler[${assetHandler.name}] is already registered.`);
            return;
        }

        this.name2handler[assetHandler.name] = assetHandler;

        const importer = new CustomImporter(extensions, assetHandler);
        this.name2importer[assetHandler.name] = importer;
    }

    /**
     * 获取各个资源的新建列表数据
     */
    async getCreateMap(): Promise<ICreateMenuInfo[]> {
        const result: Omit<ICreateMenuInfo, 'create'>[] = [];
        for (const importer of Object.keys(this.name2handler)) {
            const handler = this.name2handler[importer];
            if (!handler.createInfo || !handler.createInfo.generateMenuInfo) {
                continue;
            }
            const { generateMenuInfo, preventDefaultTemplateMenu } = handler.createInfo;
            try {
                const defaultMenuInfo = await generateMenuInfo();
                const templateDir = getUserTemplateDir(importer);
                let templates = preventDefaultTemplateMenu ? [] : await queryUserTemplates(templateDir);
                // TODO 统一命名为 extensions
                const extensions = this.name2importer[importer].extnames;
                // 如果存在后缀则过滤不合法后缀的模板数据，无后缀作为正常模板处理（主要兼容旧版本无后缀的资源模板放置方式）
                templates = templates.filter((file) => {
                    const extName = extname(file);
                    if (!extName) {
                        return true;
                    }
                    return extensions.includes(extName);
                });

                const importMenu: ICreateMenuInfo[] = [];
                defaultMenuInfo.forEach((info) => {
                    // 存在用户模板时检查是否有覆盖默认模板的情况
                    if (info.template && templates.length) {
                        const userTemplateIndex = templates.findIndex((templatePath) => {
                            return basename(templatePath) === basename(info.template!);
                        });
                        if (userTemplateIndex !== -1) {
                            info = JSON.parse(JSON.stringify(info));
                            info.template = templates[userTemplateIndex];
                            templates.splice(userTemplateIndex, 1);
                        }
                    }
                    importMenu.push(patchHandler(info, importer, extensions));
                });

                // 与默认模板非同名的模板文件为用户自定义模板
                if (templates.length && importMenu.length) {
                    let menuAddTarget = importMenu;
                    if (importMenu[0].submenu) {
                        menuAddTarget = importMenu[0].submenu;
                    } else {
                        importMenu[0] = {
                            ...importMenu[0],
                            submenu: [{
                                ...importMenu[0],
                                label: 'Default',
                            }],
                        };
                        menuAddTarget = importMenu[0].submenu!;
                    }
                    templates.forEach((templatePath) => {
                        menuAddTarget.push(patchHandler({
                            label: basename(templatePath, extname(templatePath)),
                            template: templatePath,
                        }, importer, extensions));
                    });
                    // 存在模板的情况下，添加资源模板管理的菜单入口
                    menuAddTarget.push({
                        label: 'i18n:asset-db.createAssetTemplate.manageTemplate',
                        // TODO 与 vs 桥接层
                        // message: {
                        //     target: 'asset-db',
                        //     name: 'show-asset-template-dir',
                        //     params: [templateDir],
                        // },
                    });
                }

                result.push(...importMenu);
            } catch (error) {
                console.error(`Generate create list in handler ${importer} failed`);
            }
        }
        return result;
    }

    /**
     * 生成创建资源模板
     * @param importer 
     */
    async createAssetTemplate(importer: string, templatePath: string, target: string): Promise<boolean> {
        templatePath = isAbsolute(templatePath) ? templatePath : url2path(templatePath);
        if (!templatePath || !existsSync(templatePath)) {
            return false;
        }
        const assetTemplateDir = getUserTemplateDir(importer);
        await ensureDir(assetTemplateDir);
        await copy(templatePath, target);
        return true;
    }

    async queryIconConfigMap(): Promise<Record<string, ICONConfig>> {
        if (this._iconConfigMap) {
            return this._iconConfigMap;
        }
        const result: Record<string, ICONConfig> = {};
        for (const importer of Object.keys(this.name2handler)) {
            const handler = this.name2handler[importer];
            if (!handler.iconInfo) {
                result[importer] = {
                    type: 'icon',
                    value: importer,
                    thumbnail: false,
                };
                continue;
            }
            const { default: defaultConfig, generateThumbnail } = handler.iconInfo;
            result[importer] = {
                ...defaultConfig,
                thumbnail: !!generateThumbnail,
            };
        }
        // 手动补充 database 的资源处理器
        result['database'] = databaseIconConfig;
        this._iconConfigMap = result;
        return result;
    }

    async createAsset(options: CreateAssetOptions): Promise<null | string | string[]> {
        if (!options.handler) {
            const registerInfos = this.extname2registerInfo[extname(options.target)];
            options.handler = registerInfos && registerInfos.length ? registerInfos[0].name : undefined;
        }

        const newTarget = Utils.File.getName(options.target);
        if (newTarget !== options.target) {
            if (options.overwrite) {
                options.target = newTarget;
            } else {
                throw new Error(`Target file already exists: ${options.target}`);
            }
        }

        if (options.handler) {
            const assetHandler = this.name2handler[options.handler];
            if (assetHandler && assetHandler.createInfo && assetHandler.createInfo.create) {
                // 优先使用自定义的创建方法，若创建结果不存在则走默认的创建流程
                const result = await assetHandler.createInfo.create(options);
                if (result !== null) {
                    await afterCreateAsset(result, options);
                    return result;
                }
            }
        }

        if (options.content === undefined || options.content === null) {
            // 如果给定了模板信息，使用 db 默认的创建拷贝方式
            if (options.template) {
                const path = url2path(options.template);
                if (existsSync(path)) {
                    await copy(path, options.target, { overwrite: options.overwrite });
                    await afterCreateAsset(options.target, options);
                    return options.target;
                }
            }
            // content 不存在，新建一个文件夹
            await ensureDir(options.target);
        } else {
            if (typeof options.content === 'object') {
                options.content = JSON.stringify(options.content, null, 4);
            }
            // 部分自定义创建资源没有模板，内容为空，只需要一个空文件即可完成创建
            await outputFile(options.target, options.content);
        }
        await afterCreateAsset(options.target, options);
        return options.target;
    }

    async saveAsset(asset: IAsset, content: string | Buffer) {
        const assetHandler = this.name2handler[asset.meta.importer];
        if (assetHandler && assetHandler.createInfo && assetHandler.createInfo.save) {
            // 优先使用自定义的保存方法
            return await assetHandler.createInfo.save(asset, content);
        }

        await outputFile(asset.source, content);
        return true;
    }

    async generateThumbnail(asset: IAsset, size: number | ThumbnailSize = 'large'): Promise<ThumbnailInfo | null> {
        if (!asset) {
            return null;
        }

        // 无效资源需要等待重新导入
        if (asset.invalid) {
            return {
                type: 'icon',
                value: 'file',
            };
        }

        const configMap = await this.queryIconConfigMap();
        if (!configMap[asset.meta.importer]) {
            return null;
        }

        const cacheDest = join(asset.temp, `thumbnail-${size}.png`);
        if (existsSync(cacheDest)) {
            return {
                type: 'image',
                value: cacheDest,
            };
        }
        let data: ThumbnailInfo;
        if (!configMap[asset.meta.importer].thumbnail) {
            data = configMap[asset.meta.importer];
        } else {
            const assetHandler = this.name2handler[asset.meta.importer];
            try {
                data = await assetHandler.iconInfo!.generateThumbnail!(asset);
            } catch (error) {
                console.warn(error);
                console.warn(`generateThumbnail failed for ${asset.url}`);
                return null;
            }
        }
        if (data.type === 'image') {
            const file = isAbsolute(data.value) ? data.value : url2path(data.value);
            // SVG 无需 resize
            if (file.endsWith('.svg')) {
                return data;
            }
            if (!existsSync(file)) {
                return null;
            }
            try {
                data.value = await resizeThumbnail(file, cacheDest, size);
            } catch (error) {
                console.warn(error);
                console.warn(`resizeThumbnail failed for ${asset.url}`);
            }
        }
        return data;
    }

    /**
     * 生成某个资源的导出文件信息
     * @param asset 
     * @param options 
     * @returns 
     */
    async generateExportData(asset: IAsset, options?: IExportOptions): Promise<IExportData | null> {
        const assetHandler = this.name2handler[asset.meta.importer];
        if (!assetHandler || !assetHandler.exporter || !assetHandler.exporter.generateExportData) {
            return null;
        }

        return await assetHandler.exporter.generateExportData(asset, options);
    }

    /**
     * 拷贝生成导入文件到最终目标地址
     * @param handler 
     * @param src 
     * @param dest 
     * @returns 
     */
    async outputExportData(handler: string, src: IExportData, dest: IExportData): Promise<boolean> {
        const assetHandler = this.name2handler[handler];
        if (!assetHandler || !assetHandler.exporter || !assetHandler.exporter.outputExportData) {
            return false;
        }

        return await assetHandler.exporter.outputExportData(src, dest);
    }

    /**
     * 查询各个资源的基本配置 MAP
     */
    async queryAssetConfigMap(): Promise<Record<string, IAssetConfig>> {
        const result: Record<string, IAssetConfig> = {};
        for (const importer of Object.keys(this.name2handler)) {
            const handler = this.name2handler[importer];
            const registerInfo = this.name2registerInfo[importer];
            const config: IAssetConfig = {
                displayName: handler.displayName,
                description: handler.description,
                docURL: handler.docURL,
            };
            if (registerInfo) {
                config.from = {
                    pkgName: registerInfo.pkgName,
                    internal: registerInfo.internal,
                };
            }
            if (handler.iconInfo) {
                config.iconInfo = handler.iconInfo.default;
            }

            if (handler.userDataConfig) {
                config.userDataConfig = handler.userDataConfig.default;
            }
            result[importer] = config;
        }
        return result;
    }

    async queryUserDataConfig(asset: IAsset) {
        if (!asset) {
            return false;
        }
        const assetHandler = this.name2handler[asset.meta.importer];
        if (!assetHandler || !assetHandler.userDataConfig) {
            return;
        }

        if (!assetHandler.userDataConfig.generate) {
            return assetHandler.userDataConfig.default;
        }

        return await assetHandler.userDataConfig.generate(asset);
    }

    async queryUserDataConfigDefault(importer: string) {
        const assetHandler = this.name2handler[importer];
        if (!assetHandler || !assetHandler.userDataConfig) {
            return;
        }
        return assetHandler.userDataConfig.default;
    }
    async runImporterHook(asset: IAsset, hookName: 'before' | 'after') {
        const assetHandler = this.name2handler[asset.meta.importer];
        // 1. 先执行资源处理器内的钩子
        if (assetHandler && assetHandler.importer && typeof (assetHandler.importer as ImporterHook)[hookName] === 'function') {
            try {
                await (assetHandler.importer as ImporterHook)[hookName]!(asset);
            } catch (error) {
                console.error(error);
                console.error(`run ${hookName} hook failed!`);
            }
        }

        // 2. 再执行扩展注册的钩子
        const customHandlers = this.importer2custom[asset.meta.importer];
        if (!customHandlers || !customHandlers.length) {
            return;
        }

        for (const customHandler of customHandlers) {
            const hook = customHandler.importer && customHandler.importer[hookName];
            if (!hook) {
                continue;
            }
            try {
                await hook(asset);
            } catch (error) {
                console.error(error);
                console.error(`run ${hookName} hook failed!`);
            }
        }
    }

    _findOperateHandler(importer: string, operate: keyof AssetHandler): CustomHandler | AssetHandler | null {
        if (this.importer2OperateRecord[importer] && this.importer2OperateRecord[importer][operate]) {
            return this.importer2OperateRecord[importer][operate] as CustomHandler;
        }
        let assetHandler: CustomHandler | AssetHandler | undefined = this.name2handler[importer];
        if (assetHandler && !(operate in assetHandler) && this.importer2custom[importer]) {
            assetHandler = this.importer2custom[importer].find((item) => operate in item);
        }

        if (!assetHandler || !(assetHandler as any)[operate]) {
            console.debug(`Cannot find the asset handler of operate ${operate} for importer ${importer}`);
            return null;
        }
        if (!this.importer2OperateRecord[importer]) {
            this.importer2OperateRecord[importer] = {};
        }
        this.importer2OperateRecord[importer][operate] = assetHandler;

        return assetHandler;
    }

    public queryAllImporter() {
        let importerArr = Object.keys(this.name2handler);
        // 兼容旧版本的资源导入器
        const internalDB = get('internal');
        const name2importer = internalDB.importerManager.name2importer;
        if (Object.keys(name2importer).length) {
            importerArr.push(...Object.keys(internalDB.importerManager.name2importer));
            importerArr = Array.from(new Set(importerArr));
            // 兼容旧版本的升级提示
            console.warn('the importer version need to upgrade.');
        }
        return importerArr.sort();
    }

    public queryAllAssetTypes() {
        const assetTypes = new Set();
        Object.values(this.name2handler).forEach((handler) => {
            const { assetType } = handler;
            assetType && assetTypes.add(assetType);
        });

        // 兼容旧版本的资源导入器
        const internalDB = get('internal');
        const name2importer = internalDB.importerManager.name2importer;
        if (Object.keys(name2importer).length) {
            for (const importer in name2importer) {
                if (importer === '*') {
                    continue;
                }
                const { assetType } = name2importer[importer] as any;
                assetType && assetTypes.add(assetType);
                console.warn(`the importer${importer} version need to upgrade.`);
            }
            // 兼容旧版本的升级提示
        }

        return Array.from(assetTypes).sort();
    }

    /**
     * 更新默认配置数据并保存（偏好设置的用户操作修改入口）
     */
    public updateDefaultUserData(handler: string, key: string, value: any) {
        lodash.set(this._userDataCache, `${handler}.${key}`, value);
        this._updateDefaultUserDataToHandler(handler, key, value);
        const combineUserData = {
            ...(this._defaultUserData[handler] || {}),
            ...this._userDataCache[handler],
        };
        setDefaultUserData(handler, combineUserData);
    }

    /**
     * 更新导入默认值到导入器的渲染配置内部
     * @param handler 
     * @param key 
     * @param value 
     */
    private _updateDefaultUserDataToHandler(handler: string, key: string, value: any) {
        const assetHandler = this.name2handler[handler];
        // 调整已有配置内的默认值
        if (assetHandler && assetHandler.userDataConfig && assetHandler.userDataConfig.default[key]) {
            assetHandler.userDataConfig.default[key].default = value;
        }
    }

}

const assetHandlerManager = new AssetHandlerManager();

export default assetHandlerManager;
function patchHandler(info: ICreateMenuInfo, handler: string, extensions: string[]) {
    // 避免污染原始 info 数据
    const res = {
        handler,
        ...info,
    };
    if (res.submenu) {
        res.submenu = res.submenu.map((subInfo) => patchHandler(subInfo, handler, extensions));
    }
    if (res.template && !res.fullFileName) {
        res.fullFileName = basename(res.template);
        if (!extname(res.fullFileName)) {
            // 支持无后缀的模板文件，主要兼容 3.8.2 版本之前的脚本模板
            res.fullFileName += extensions[0];
        }
    }
    return res;
}

async function queryUserTemplates(templateDir: string) {
    try {
        if (existsSync(templateDir)) {
            return (await fg(['**/*', '!*.meta'], {
                onlyFiles: true,
                cwd: templateDir,
            }));
        }
    } catch (error) {
        console.warn(error);
    }
    return [];
}

function getUserTemplateDir(importer: string) {
    return join(AssetHandlerManager.createTemplateRoot, importer);
}

const SizeMap = {
    large: 512,
    small: 16,
    middle: 128,
};

async function resizeThumbnail(src: string, dest: string, size: number | ThumbnailSize): Promise<string> {
    if (size === 'origin') {
        return src;
    }
    if (typeof size === 'string') {
        size = SizeMap[size] || 16;
    }
    await ensureDir(dirname(dest));
    const img = Sharp(src);
    const width = (await img.metadata()).width;
    // 如果图片尺寸小于缩略图尺寸，则直接拷贝
    if (width && width <= size) {
        await copyFile(src, dest);
        return dest;
    }
    await img.resize(size).toFile(dest);
    return dest;
}

async function afterCreateAsset(paths: string | string[], options: CreateAssetOptions) {
    if (!Array.isArray(paths)) {
        paths = [paths];
    }
    for (const file of paths) {
        // 文件不存在，nodejs 没有成功创建文件
        if (!existsSync(file)) {
            throw new Error(`${i18n.t('asset-db.createAsset.fail.drop', {
                target: file,
            })}`);
        }

        // 根据选项配置 meta 模板文件
        if (options.userData || options.uuid) {
            const meta: any = {
                userData: options.userData || {},
            };
            if (options.uuid) {
                meta.uuid = options.uuid;
            }
            await outputJSON(join(file + '.meta'), meta, {
                spaces: 4,
            });
        }
    }
}
