import { copySync, ensureDirSync, outputFile, readFileSync, readJsonSync, remove, stat, existsSync, outputJSONSync, copy, ensureDir, exists, outputJSON } from 'fs-extra';
import { basename, dirname, extname, join } from 'path';
import { checkHasMipMaps, compressMipmapFiles, genMipmapFiles } from './minimaps';
import { compressCustomFormat, getCompressFunc } from './compress-tool';
import { ImageAsset } from 'cc';
import { buildAssetLibrary } from '../../manager/asset-library';
import { changeInfoToLabel, getSuffix } from './utils';
import { EventEmitter } from 'stream';

import { Asset, VirtualAsset } from '@editor/asset-db/libs/asset';
import { cpus } from 'os';
const numCPUs = cpus().length;
import Sharp from 'sharp';
import Lodash from 'lodash';
import { formatMSTime } from '../../../../share/utils';
import { newConsole } from '../../../../../base/console';
import { ICustomConfig, ITextureCompressFormatType, AllTextureCompressConfig, UserCompressConfig, ICompressConfig } from '../../../../@types';
import { IBuildAssetHandlerInfo } from '../../../../@types/private';
import { IImageTaskInfo, ITextureFormatInfo } from '../../../../@types/protected';
import { pluginManager } from '../../../../manager/plugin';
import { configGroups, defaultSupport, formatsInfo, textureFormatConfigs } from '../../../../share/texture-compress';
import builderConfig, { BuildGlobalInfo } from '../../../../share/builder-config';
interface CompressCacheInfo {
    option: {
        mtime: number | string;
        src: string;
        compressOptions: Record<string, Record<string, string | number>>;
    };
    mipmapFiles: string[] | undefined;
    customConfigs: Record<string, ICustomConfig>;
    dest?: string[];
}

interface CompressExecuteInfo {
    // 存储当前有在执行压缩任务格式的具体任务数量 ，方便加锁
    busyFormatType: Partial<Record<ITextureCompressFormatType | string, number>>;
    // 存储当前有在执行压缩任务的资源 uuid ，方便加锁
    busyAsset: Set<string>;
    resolve: Function;
    reject: Function;
    state: 'progress' | 'success' | 'failed';
    complete: number;
    total: number;
    childProcess: number;
}

export class TextureCompress extends EventEmitter {
    _taskMap: Record<string, IImageTaskInfo> = {};
    platform: string;

    static overwriteFormats: Record<string, string> = {};
    static _presetIdToCompressOption: Record<string, Record<string, Record<string, number | string>>> = {};
    static allTextureCompressConfig: AllTextureCompressConfig;
    static userCompressConfig: UserCompressConfig;
    static compressCacheDir = join(BuildGlobalInfo.projectRoot, 'temp', 'builder', 'CompressTexture');
    static storedCompressInfo: Record<string, CompressCacheInfo> = {};
    static storedCompressInfoPath = join(TextureCompress.compressCacheDir, 'compress-info.json');
    static enableMipMaps = false;

    _waitingCompressQueue: Set<ICompressConfig> = new Set();
    _compressAssetLen = 0;
    _compressExecuteInfo: CompressExecuteInfo | null = null;
    textureCompress: boolean;

    constructor(platform: string, textureCompress?: boolean) {
        super();
        this.platform = platform;
        this.textureCompress = textureCompress ?? true;
    }

    static async initCommonOptions() {
        TextureCompress.allTextureCompressConfig = await queryAllCompressConfig();
        if (existsSync(TextureCompress.storedCompressInfoPath)) {
            TextureCompress.storedCompressInfo = readJsonSync(TextureCompress.storedCompressInfoPath);
        } else {
            TextureCompress.storedCompressInfo = {};
        }
        TextureCompress.enableMipMaps = !!(await builderConfig.getProject<boolean>('textureCompressConfig.genMipmaps'));
    }

    async init() {
        await this.updateUserConfig();
    }

    /**
     * 更新缓存的纹理压缩项目配置
     */
    async updateUserConfig() {
        await TextureCompress.initCommonOptions();
        // 查询纹理压缩配置等
        TextureCompress.userCompressConfig = await builderConfig.getProject<UserCompressConfig>('textureCompressConfig') as UserCompressConfig;
        const { customConfigs } = TextureCompress.userCompressConfig;
        // 收集目前已有配置内会覆盖现有格式的配置集合
        const overwriteFormats: Record<string, string> = {};
        if (customConfigs && Object.values(customConfigs).length) {
            Object.values(customConfigs as Record<string, ICustomConfig>).forEach((formatConfig) => {
                if (formatConfig.overwrite) {
                    overwriteFormats[formatConfig.format] = formatConfig.id;
                    console.debug(`compress format (${formatConfig.format}) will be overwritten by custom compress ${formatConfig.id}(${formatConfig.name})`);
                }
            });
        }
        TextureCompress.overwriteFormats = overwriteFormats;
        TextureCompress._presetIdToCompressOption = {};
    }

    static queryTextureCompressCache(uuid: string) {
        return TextureCompress.storedCompressInfo[uuid];
    }

    /**
     * 根据资源信息返回资源的纹理压缩任务，无压缩任务的返回 null
     * @param assetInfo 
     * @returns IImageTaskInfo | null
     */
    addTask(uuid: string, task: IImageTaskInfo) {
        if (this._taskMap[uuid]) {
            Object.assign(this._taskMap[uuid], task);
        } else {
            this._taskMap[uuid] = task;
        }
        return this._taskMap[uuid];
    }
    /**
     * 根据 Image 信息添加资源的压缩任务
     * @param assetInfo （不支持自动图集）
     * @returns 
     */
    addTaskWithAssetInfo(assetInfo: Asset | VirtualAsset) {
        if (this._taskMap[assetInfo.uuid]) {
            return this._taskMap[assetInfo.uuid];
        }
        // 自动图集无法直接通过 assetInfo 获取到正确的压缩任务
        if (assetInfo.meta.importer === 'auto-atlas') {
            return;
        }
        const task = this.genTaskInfoFromAssetInfo(assetInfo);
        if (!task) {
            return;
        }
        this._taskMap[assetInfo.uuid] = task;
        return task;
    }

    /**
     * 根据图集或者 Image 资源信息返回资源的纹理压缩任务，无压缩任务的返回 null
     */
    genTaskInfoFromAssetInfo(assetInfo: Asset | VirtualAsset) {
        if (this._taskMap[assetInfo.uuid]) {
            return this._taskMap[assetInfo.uuid];
        }
        const compressSettings = assetInfo.meta.userData.compressSettings;
        if (!compressSettings || !compressSettings.useCompressTexture) {
            return null;
        }

        // 判断资源是否存在
        let extName = (assetInfo as Asset).extname;
        if (!assetInfo.meta.files.includes(extName)) {
            // HACK 此处假定了每张图导入后如果改了后缀一定是转成 png / jpg 等，但目前没有好的方式得知这个信息
            extName = assetInfo.meta.files.find((fileExtName) => ['.png', '.jpg'].includes(fileExtName)) || '.png';
        }
        const src = assetInfo.library + extName;
        if (assetInfo.meta.importer !== 'auto-atlas' && !src) {
            console.warn(`genTaskInfoFromAssetInfo failed ! Image asset does not exist: ${assetInfo.source}`);
            return;
        }

        const compressOptions = this.getCompressOptions(compressSettings.presetId);
        if (!compressOptions) {
            return;
        }
        return {
            src,
            presetId: compressSettings.presetId,
            compressOptions,
            hasAlpha: assetInfo.meta.userData.hasAlpha,
            mtime: buildAssetLibrary.getAssetProperty(assetInfo, 'mtime'),
            hasMipmaps: TextureCompress.enableMipMaps ? checkHasMipMaps(assetInfo.meta) : false,
            dest: [],
            suffix: [],
        };
    }

    /**
     * 根据纹理压缩配置 id 获取对应的纹理压缩选项
     * @param presetId 
     * @returns Record<string, number | string> | null
     */
    getCompressOptions(presetId: string): (Record<string, Record<string, number | string>>) | null {
        if (TextureCompress._presetIdToCompressOption[presetId]) {
            return TextureCompress._presetIdToCompressOption[presetId];
        }
        const { userPreset, defaultConfig, customConfigs } = TextureCompress.userCompressConfig;
        const { platformConfig, customFormats } = TextureCompress.allTextureCompressConfig;

        if (!platformConfig[this.platform]) {
            return null;
        }
        const textureCompressConfig = platformConfig[this.platform].textureCompressConfig;
        if (!textureCompressConfig) {
            return null;
        }
        const platformType = textureCompressConfig.platformType;
        const config = userPreset[presetId] || defaultConfig[presetId] || defaultConfig.default;
        if (!config || (!config.options[platformType] && (!config.overwrite || !config.overwrite[this.platform]))) {
            console.debug(`Invalid compress task: ${JSON.stringify(config)}`);
            return null;
        }
        let compressOptions: Record<string, Record<string, number | string>> = {};
        if (config.overwrite && config.overwrite[this.platform]) {
            compressOptions = config.overwrite[this.platform];
        } else {
            const support = textureCompressConfig.support;
            // const suffixMap: Record<string, string> = {};
            Object.keys(config.options[platformType]).forEach((format) => {
                const formats: string[] = [...support.rgba, ...support.rgb];
                if (formats.includes(format) || Object.keys(customFormats).includes(format)) {
                    compressOptions[format] = JSON.parse(JSON.stringify(config.options[platformType][format]));
                    // suffixMap[format] = textureFormatConfigs[formatsInfo[format].formatType].suffix;
                }
            });
        }
        // 收集目前已有配置内会覆盖现有格式的配置集合
        const overwriteFormats: Record<string, string> = {};
        if (customConfigs && Object.values(customConfigs).length) {
            Object.values(customConfigs as Record<string, ICustomConfig>).forEach((formatConfig) => {
                if (formatConfig.overwrite) {
                    overwriteFormats[formatConfig.format] = formatConfig.id;
                    console.debug(`compress format (${formatConfig.format}) will be overwritten by custom compress ${formatConfig.id}(${formatConfig.name})`);
                }
            });
        }
        Object.keys(overwriteFormats).forEach((format) => {
            if (compressOptions[format]) {
                compressOptions[overwriteFormats[format]] = compressOptions[format];
                delete compressOptions[format];
            }
        });

        if (!Object.keys(compressOptions).length) {
            return null;
        }
        TextureCompress._presetIdToCompressOption[presetId] = compressOptions;
        return compressOptions;
    }

    /**
     * 查询某个指定 uuid 资源的纹理压缩任务
     * @param uuid 
     * @returns 
     */
    queryTask(uuid: string) {
        return this._taskMap[uuid];
    }

    removeTask(uuid: string) {
        delete this._taskMap[uuid];
    }

    /**
     * 执行所有纹理压缩任务，支持限定任务，否则将执行收集的所有纹理压缩任务
     */
    async run(taskMap = this._taskMap) {

        const { customConfigs } = TextureCompress.userCompressConfig;
        // 1. 整理纹理压缩任务
        const compressQueue = await this.sortImageTask(taskMap);
        console.debug(`Num of all image compress task ${Object.keys(taskMap).length}, really: ${this._compressAssetLen}, configTasks: ${compressQueue.length}`);

        if (!compressQueue.length) {
            console.debug('No image need to compress');
            return;
        }
        const compressQueueCopy = JSON.parse(JSON.stringify(compressQueue));
        // 2. 优先执行构建自定义纹理压缩钩子函数，此流程会修改 compressQueueCopy 内的任务数量，需要深拷贝
        const customHandlerInfos: IBuildAssetHandlerInfo = pluginManager.getAssetHandlers('compressTextures');
        if (customHandlerInfos.pkgNameOrder.length) {
            this.emit('update-progress', 'start compress custom compress hooks...');
            newConsole.trackTimeStart('builder:custom-compress-texture');
            await this.customCompressImage(compressQueueCopy, customHandlerInfos);
            await newConsole.trackTimeEnd('builder:custom-compress-texture', { output: true });
            console.debug(`custom compress ${compressQueue.length - compressQueueCopy.length} / ${compressQueue.length}`);
        }

        if (compressQueueCopy.length) {
            this._waitingCompressQueue = new Set(compressQueueCopy);

            newConsole.trackTimeStart('builder:compress-texture');
            // 5. 处理实际需要压缩的纹理任务
            await this.executeCompressQueue();
            const time = await newConsole.trackTimeEnd('builder:compress-texture', { output: true });

            console.debug(`builder:compress-texture: ${formatMSTime(time)}`);
        }

        // 6. 填充压缩后的路径到 info 内
        await Promise.all(compressQueue.map(async (config) => {
            if (existsSync(config.dest)) {
                taskMap[config.uuid].dest.push(config.dest);
                taskMap[config.uuid].suffix.push(config.suffix);
            } else {
                console.error(`texture compress task width asset ${config.uuid}, format: ${config.format} failed!`);
            }
        }));

        // 存储纹理压缩缓存信息
        await outputJSON(TextureCompress.storedCompressInfoPath, TextureCompress.storedCompressInfo);
        console.debug(`Num of sorted image asset: ${Object.keys(taskMap).length}`);
        return taskMap;
    }

    /**
     * 筛选整理压缩任务中缓存失效的实际需要压缩的任务队列
     * @param taskMap 
     * @returns 
     */
    private async sortImageTask(taskMap: Record<string, IImageTaskInfo>) {
        const compressQueue: ICompressConfig[] = [];
        const { textureFormatConfigs, formatsInfo } = TextureCompress.allTextureCompressConfig;
        const { customConfigs } = TextureCompress.userCompressConfig;
        // 记录格式的压缩数量
        const collectFormatNum: Record<string, number> = {};

        for (const uuid of Object.keys(taskMap)) {
            const info = taskMap[uuid];
            const compressOptions = info.compressOptions;
            let mipmapFiles: string[] = [];
            if (info.hasMipmaps && TextureCompress.enableMipMaps) {
                try {
                    // TODO mipmap file 需要缓存机制管理
                    const files = await genMipmapFiles(info.src, buildAssetLibrary.getAssetTempDirByUuid(uuid));
                    if (!files.length) {
                        continue;
                    }
                    mipmapFiles = files;
                } catch (error) {
                    if (error instanceof Error) {
                        error.message = `{asset(${uuid})}` + error.message;
                    }
                    console.warn(error);
                    continue;
                }
            }
            const formats = Object.keys(compressOptions);
            const assetCustomConfigs: Record<string, ICustomConfig> = {};
            formats.forEach((format) => customConfigs[format] && (assetCustomConfigs[format] = customConfigs[format]));
            const newCompressInfo: CompressCacheInfo = { option: { mtime: info.mtime, src: info.src, compressOptions }, mipmapFiles, customConfigs: assetCustomConfigs };
            const dirty = !Lodash.isEqual(TextureCompress.storedCompressInfo[uuid] && TextureCompress.storedCompressInfo[uuid].option, newCompressInfo.option);
            info.dest = [];
            info.dirty = dirty;
            info.suffix = [];
            let hasCompressConfig = false;
            Object.keys(compressOptions).forEach((format) => {
                let realFormat = format;
                if (TextureCompress.userCompressConfig.customConfigs[format]) {
                    realFormat = TextureCompress.userCompressConfig.customConfigs[format].format;
                }
                const formatType = formatsInfo[realFormat]?.formatType!;
                if (!formatType) {
                    console.error(`Invalid format ${format}`);
                    return;
                }
                const cacheDest = join(TextureCompress.compressCacheDir, uuid.substr(0, 2), uuid + textureFormatConfigs[formatType].suffix);
                if (this.textureCompress && !dirty && existsSync(cacheDest)) {
                    info.dest!.push(cacheDest);
                    info.suffix.push(getSuffix(formatsInfo[realFormat], textureFormatConfigs[formatType].suffix));
                    console.debug(`Use cache compress image of {Asset(${uuid})} ({link(${cacheDest})})`);
                    return;
                }
                info.dirty = true;
                if (TextureCompress.userCompressConfig.customConfigs[format]) {
                    // [自定义纹理压缩统计] 1.收集统计所需数据（自定义配置被使用次数）
                    increaseCustomCompressNum(TextureCompress.userCompressConfig.customConfigs[format]);
                }
                hasCompressConfig = true;
                compressQueue.push({
                    format,
                    src: info.src,
                    dest: cacheDest,
                    compressOptions: compressOptions[format],
                    customConfig: customConfigs[format],
                    uuid,
                    mipmapFiles,
                    suffix: getSuffix(formatsInfo[realFormat], textureFormatConfigs[formatType].suffix),
                    formatType,
                });
                collectFormatNum[formatType] = (collectFormatNum[formatType] || 0) + 1;
            });
            if (hasCompressConfig) {
                this._compressAssetLen++;
            }
            newCompressInfo.dest = info.dest;
            TextureCompress.storedCompressInfo[uuid] = newCompressInfo;
        }
        console.debug(`sort compress task ${JSON.stringify(collectFormatNum)}`);
        return compressQueue;
    }

    executeCompressQueue() {
        if (!this._waitingCompressQueue.size) {
            return;
        }
        return new Promise((resolve, reject) => {
            try {
                this._compressExecuteInfo = {
                    reject,
                    resolve,
                    state: 'progress',
                    busyFormatType: {},
                    busyAsset: new Set(),
                    complete: 0,
                    total: this._waitingCompressQueue.size,
                    childProcess: 0,
                };
                this.emit('update-progress', `start compress task 0 / ${this._waitingCompressQueue.size}`);
                // 由于资源文件并发会有权限问题，压缩任务至多并发数 <= 压缩任务里的总资源数量
                for (let i = 0; i < this._compressAssetLen; i++) {
                    const nextTask = this._getNextTask();
                    nextTask && (this._compressImage(nextTask).catch((error) => {
                        reject(error);
                    }));
                }
            } catch (error) {
                reject(error);
            }
        });
    }

    _getNextTask() {
        for (const task of this._waitingCompressQueue.values()) {
            // TODO 小优化，其实加了核心数限制后，有可能遇到下一次获取任务时拿到了因为 busyAsset 导致延后的 sharp 任务，此时其实可以连续启动两个任务
            if (this._checkTaskCanExecute(task)) {
                return task;
            }
        }
        return null;
    }

    _checkTaskCanExecute(taskConfig: ICompressConfig) {
        const { busyAsset, busyFormatType } = this._compressExecuteInfo!;
        if (busyAsset.has(taskConfig.uuid)) {
            return false;
        }
        if (busyFormatType[taskConfig.formatType] && !TextureCompress.allTextureCompressConfig.textureFormatConfigs[taskConfig.formatType].parallelism) {
            // 检查当前格式是否支持并行
            return false;
        }
        return true;
    }

    async _compressImage(config: ICompressConfig) {
        const { busyAsset, busyFormatType, total, childProcess } = this._compressExecuteInfo!;
        const useChildProcess = TextureCompress.allTextureCompressConfig.textureFormatConfigs[config.formatType].childProcess;
        if (useChildProcess) {
            if (childProcess > numCPUs) {
                console.debug(`${config.formatType} wait for child process ${childProcess}`);
                // 超过最大进程数，需要等待
                return;
            }
            this._compressExecuteInfo!.childProcess++;
        }
        let oldValue = busyFormatType[config.formatType];
        if (oldValue && oldValue > 0) {
            if (!TextureCompress.allTextureCompressConfig.textureFormatConfigs[config.formatType].parallelism) {
                return;
            }
            busyFormatType[config.formatType] = ++oldValue;
        } else {
            busyFormatType[config.formatType] = 1;
        }
        busyAsset.add(config.uuid);
        this.emit('update-progress', `execute compress task ${this._compressExecuteInfo!.complete}/${total}, ${busyAsset.size} in progress`);
        this._waitingCompressQueue.delete(config);
        try {
            await this.compressImageByConfig(config);
        } catch (error) {
            console.error(error);
        }
        useChildProcess && (this._compressExecuteInfo!.childProcess--);
        busyAsset.delete(config.uuid);
        busyFormatType[config.formatType] = --busyFormatType[config.formatType]!;
        this._compressExecuteInfo!.complete++;
        await this._step();
    }

    /**
     * 检查压缩任务是否已经完成，如未完成，则继续执行剩下的任务
     * @returns 
     */
    async _step() {
        if (this._waitingCompressQueue.size) {
            const nextTask = this._getNextTask();
            nextTask && this._compressImage(nextTask);
            return;
        }

        // 进入检查任务是否全部完成
        const { busyAsset, resolve } = this._compressExecuteInfo!;
        if (!busyAsset.size) {
            return resolve();
        }
    }

    private async customCompressImage(compressQueue: ICompressConfig[], infos: IBuildAssetHandlerInfo) {
        for (let i = 0; i < infos.pkgNameOrder.length; i++) {
            const pkgName = infos.pkgNameOrder[i];
            const handler = infos.handles[pkgName];
            if (!handler) {
                continue;
            }
            try {
                console.debug(`Start custom compress(${pkgName})`);
                // 实际需要压缩的纹理任务
                await handler(compressQueue);
            } catch (error) {
                console.error(error);
                console.error(`Custom Compress (${pkgName}) failed!`);
            }
        }
    }

    async compressImageByConfig(optionItem: ICompressConfig) {
        const { dest } = optionItem;
        let src = optionItem.src;
        await ensureDir(dirname(dest));

        try {
            if (optionItem.compressOptions.quality === 100 && extname(optionItem.src).endsWith(optionItem.format)) {
                console.log(`${optionItem.format} with quality is 100, will copy the image from ${optionItem.src} to ${optionItem.dest}`);
                await copy(optionItem.src, optionItem.dest, { overwrite: true });
                return;
            }
        } catch (error) {
            console.warn(error);
        }
        if (extname(src) === '.webp') {
            const image = Sharp(src);
            src = src.replace('webp', 'png');
            await image.toFile(src);
        }
        let compressFunc: ((option: ICompressConfig) => Promise<void>) | undefined;
        // 自定义压缩流程
        if (optionItem.customConfig) {
            try {
                console.debug(`start custom compress config ${optionItem.format}(${optionItem.customConfig!.name})`);
                await compressCustomFormat({
                    ...optionItem,
                    src,
                });
                console.debug('Custom compress config', `${optionItem.format}(${optionItem.customConfig!.name})`, 'sucess');
                return;
            } catch (error) {
                console.warn(`Compress {asset(${optionItem.uuid})} with custom config failed!`);
                console.warn(error);
                // 自定义纹理压缩失败后，回退成默认的压缩格式
                compressFunc = getCompressFunc(optionItem.customConfig!.format);
                if (!compressFunc) {
                    console.warn(`Invalid format ${optionItem.customConfig!.format}`);
                    return;
                }
            }
        }
        compressFunc = compressFunc || getCompressFunc(optionItem.format);
        if (!compressFunc) {
            console.warn(`Invalid format ${optionItem.format}`);
            return;
        }
        // 正常压缩流程
        await compressFunc({
            ...optionItem,
            src,
        });

        // 依赖第三方工具的纹理压缩格式才需要依赖构建生成
        if (TextureCompress.enableMipMaps) {
            try {
                const files = await compressMipmapFiles({
                    ...optionItem,
                    src,
                }, compressFunc);
                if (files.length) {
                    files.splice(0, 0, readFileSync(optionItem.dest));
                    const data = ImageAsset.mergeCompressedTextureMips(files);
                    await outputFile(optionItem.dest, data);
                }

            } catch (error) {
                console.error(error);
                await remove(optionItem.dest);
                console.error(`Generate {asset(${optionItem.uuid})} compress texture mipmap files failed!`);
            }
        }

        try {
            // 注意： 需要使用 optionItem.src 判断，src 变量可能被修改
            if (extname(optionItem.src).endsWith(optionItem.format)) {
                const srcState = await stat(optionItem.src);
                const destState = await stat(optionItem.dest);
                if (destState.size > srcState.size) {
                    console.log(`The compressed image(${optionItem.dest}) size(${destState.size}) is larger than the original image(${optionItem.src}) size(${srcState.size}), and the original image will be used. To ignore this protection mechanism, please configure it in Project Settings -> Texture Compression Configuration.`);
                    await copy(optionItem.src, optionItem.dest, { overwrite: true });
                }
            }
        } catch (error) {
            console.warn(error);
        }
    }

}

export async function previewCompressImage(assetUuid: string, platform = 'web-mobile') {
    const defaultCompressManager = new TextureCompress(platform, true);
    await defaultCompressManager.init();
    const assetInfo = buildAssetLibrary.getAsset(assetUuid);
    const task = defaultCompressManager.addTaskWithAssetInfo(assetInfo);
    if (!task) {
        return;
    }
    await defaultCompressManager.run();
    return task;
}

export async function queryCompressCache(uuid: string) {
    await TextureCompress.initCommonOptions();
    return TextureCompress.queryTextureCompressCache(uuid);
}

function increaseCustomCompressNum(config: ICustomConfig) {
    if (!config) {
        return;
    }
    if (!config.num) {
        config.num = 0;
    }
    config.num++;
}


export async function queryAllCompressConfig(): Promise<AllTextureCompressConfig> {
    const customConfig: Record<string, ICustomConfig> = await builderConfig.getProject('textureCompressConfig.customConfigs');
    const customFormats: Record<string, ITextureFormatInfo> = {};
    if (customConfig && Object.keys(customConfig).length) {
        for (const config of Object.values(customConfig)) {
            customFormats[config.id] = {
                ...formatsInfo[config.format],
                displayName: config.name,
                value: config.id,
                custom: true,
            };
        }
    }

    return {
        defaultSupport,
        configGroups,
        textureFormatConfigs,
        formatsInfo: {
            ...formatsInfo,
            ...customFormats,
        },
        customFormats,
        platformConfig: pluginManager.getTexturePlatformConfigs(),
    };
}