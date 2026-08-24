'use strict';

import { extname } from 'path';
import { VirtualAsset, Asset } from './asset';

import { CustomConsole } from './console';

/**
 * 迁移队列
 */
export interface Migrate {
    version: string;
    migrate?: Function;
}

/**
 * 导入器导入流程的钩子函数
 */
export interface MigrateHook {
    // 迁移之前
    pre(asset: Asset | VirtualAsset);
    // 迁移之后
    post(asset: Asset | VirtualAsset, num: number);
}

/**
 * 导入器管理器
 */
export class ImporterManager {

    // extname 与 importer 的 map
    extname2importer: { [index: string]: [Importer] } = {};

    // name 与 importer 的 map
    name2importer: { [index: string]: Importer } = {};

    private console: CustomConsole;
    constructor(customConsole: CustomConsole) {
        this.console = customConsole || console;
    }

    /**
     * 新增一个导入器
     * @param importer
     * @param extnames
     */
    add(importer: typeof Importer, extnames: string[]) {

        const instance = new importer();

        if (!(instance instanceof Importer)) {
            this.console.warn(`Cannot register the importer [${importer.name}].`);
            return;
        }

        // 如果已经存在同名的导入器则跳过
        if (
            instance.name !== '*' &&
            this.name2importer[instance.name] &&
            this.name2importer[instance.name] !== instance
        ) {
            this.console.warn(`The importer[${importer.name}] is registered.`);
            return;
        }

        // 将注册的扩展名放到导入器的扩展名列表里
        extnames && extnames.forEach((extname) => {
            extname = extname.toLowerCase();
            let array = this.extname2importer[extname] = this.extname2importer[extname] || [];
            if (array.indexOf(instance) === -1) {
                this.extname2importer[extname].push(instance);
                instance.extnames.push(extname);
            }
        });

        // 加入 name map
        this.name2importer[instance.name] = instance;
    }

    /**
     * 删除一个导入器
     * @param importer
     */
    remove(importer: typeof Importer) {
        const instance = this.name2importer[importer.name];

        instance.extnames.forEach((extname) => {
            // 检查 extname map，并删除数据
            let array = this.extname2importer[extname];
            if (!array) {
                return true;
            }
            let index = array.indexOf(instance);
            if (index === -1) {
                return true;
            }
            array.splice(index, 1);
        });

        delete this.name2importer[importer.name];

        return true;
    }

    /**
     * 清空所有的 importer
     */
    clear() {
        this.name2importer = {};
        this.extname2importer = {};
    }

    /**
     * 查找可以导入某个扩展名的所有导入器
     */
    async find(asset: VirtualAsset | Asset) {
        // 如果 importer 不是通用导入器，则尝试使用标记的导入器
        if (asset.meta.importer && asset.meta.importer !== '*') {
            const importer = this.name2importer[asset.meta.importer];
            if (asset instanceof Asset) {
                if (
                    importer
                    && importer.extnames.indexOf(asset.extname) !== -1
                    && await importer.validate(asset)
                ) {
                    return importer;
                }
            } else {
                if (
                    importer
                    && await importer.validate(asset)
                ) {
                    return importer;
                }
            }
        }

        // 如果不能使用记录的导入器，则尝试查找其他导入器
        if (asset instanceof Asset) {
            const importerArray = this.extname2importer[asset.extname] || [];
            for (let i = importerArray.length - 1; i >= 0; i--) {
                try {
                    const validate = await importerArray[i].validate(asset);
                    if (validate) {
                        return importerArray[i];
                    }
                } catch (error) {
                    this.console.error(`Importer validate failed: ${asset.uuid}`);
                    this.console.error(error);
                }
            }
        }

        // 如果还是没有找到匹配的导入器，则尝试使用通用导入器
        const importerArray = this.extname2importer['*'];
        for (let i = importerArray.length - 1; i >= 0; i--) {
            try {
                const validate = await importerArray[i].validate(asset);
                if (validate) {
                    return importerArray[i];
                }
            } catch (error) {
                this.console.error(`Importer validate failed: ${asset.uuid}`);
                this.console.error(error);
            }
        }

        // 如果连通用导入器都无能为力，那就返回 null
        return null;
    }
}

/**
 * 导入器
 * 需要负责检查文件是否使用该导入器导入资源
 * 资源导入的流程：
 *   1. 将 asset 当作 raw asset ，直接改名复制到 library 文件夹
 *   2. importer 作者自定义的
 */
export class Importer {

    // #region --- 兼容旧版本与新版本用法，旧版本使用 get 新版本需要允许在构造器内初始化这些信息
    _name = '*';
    _version = '0.0.1';
    _versionCode = 0;
    _migrationHook: MigrateHook = {
        pre() { },
        post() { },
    };
    _migrations: Migrate[] = [];
    // #endregion ---

    // 版本号，导入前会判断，导入后会更新版本号到 meta 内
    // 如果不一致，则会删除导入的数据，强制重新执行导入
    get version() {
        return this._version;
    }

    // 版本号数值，如果与缓存不一致会重新导入
    get versionCode() {
        return this._versionCode;
    }

    // 存储当前的 import 注册了多少个扩展名
    // 主要用于检索在 asset db 内的索引
    extnames: string[] = [];

    // 附加到 importer 上的标记
    flag: { [name: string]: boolean } = {};

    // 版本迁移队列
    get migrations() {
        return this._migrations;
    }

    // 数据迁移钩子函数
    get migrationHook() {
        return this._migrationHook;
    }

    // importer 的名字
    get name() {
        return this._name;
    }

    /**
     * 检查文件是否适用于这个 importer
     * @param asset
     */
    async validate(asset: VirtualAsset | Asset) {
        return !(await asset.isDirectory());
    }

    /**
     * 是否强制刷新
     * @param asset
     */
    async force(asset: VirtualAsset | Asset) {
        return false;
    }

    /**
     * 开始执行文件的导入操作
     *   1. 将文件复制到 library 内
     *
     * 返回是否导入成功的标记
     * 如果返回 false，则 imported 标记不会变成 true
     * 后续的一系列操作都不会执行
     *
     * @param asset
     */
    async import(asset: VirtualAsset | Asset): Promise<boolean> {
        // 如果是虚拟资源，直接返回 false
        if (!(asset instanceof Asset)) {
            return true;
        }

        // 扩展名，如 .json
        let ext = extname(asset.source).toLowerCase(); // 注意，这里会把所有后缀统一改成小写

        // 复制 raw asset
        await asset.copyToLibrary(ext, asset.source);
        return true;
    }

    afterSubAssetsImport?(asset: VirtualAsset | Asset): Promise<void>;
    checkAwake?(asset: VirtualAsset | Asset): Promise<boolean>;
}

export class DefaultImporter extends Importer {

    /**
     * 检查文件是否适用于这个 importer
     * @param asset
     */
    async validate(asset: VirtualAsset | Asset) {
        return true;
    }

    /**
     * 开始执行文件的导入操作
     *   1. 将文件复制到 library 内
     *
     * 返回是否导入成功的标记
     * 如果返回 false，则 imported 标记不会变成 true
     * 后续的一系列操作都不会执行
     *
     * @param asset
     */
    async import(asset: VirtualAsset | Asset): Promise<boolean> {
        // 如果是虚拟资源，直接返回 false
        if (!(asset instanceof Asset)) {
            return true;
        }

        // 扩展名，如 .json
        let ext = extname(asset.source);

        // 导入对象是文件夹，则直接跳过
        if (await asset.isDirectory()) {
            return true;
        }

        // 复制 raw asset
        await asset.copyToLibrary(ext, asset.source);
        return true;
    }
}
