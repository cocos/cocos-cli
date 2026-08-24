'use strict';

import type { VirtualAsset } from './asset';
import { existsSync, readJSONSync, outputJSONSync } from 'fs-extra';
import { CustomConsole } from './console';

export interface IData {
    url: string; // 文件的路径
    value: { [key: string]: any };
    versionCode: number; // 缓存的资源版本号
}

/**
 * 资源关联以及依赖关系列表
 * 部分数据需要固化到硬盘上
 */
export class DataManager {

    // 固化数据的保存路径
    file: string | undefined;

    // 依赖列表，一个对象依赖的所有对象的名字数组
    dataMap: { [uuid: string]: IData } = {};

    // 保存使用的 timer
    _saveTimer: any = null;
    private console: CustomConsole;
    constructor(customConsole: CustomConsole) {
        this.console = customConsole || console;
    }
    /**
     * 设置用于记录的 json 文件
     * @param json
     */
    async setRecordJSON(json: string) {
        this.file = json;
        if (existsSync(json)) {
            try {
                this.dataMap = readJSONSync(this.file);
            } catch (error) {
                this.console.error(error);
                this.dataMap = {};
            }
        } else {
            this.dataMap = {};
        }
    }

    /*
     * 延迟保存依赖文件
     */
    save() {
        clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(() => {
            this.saveImmediate();
        }, 400);
    }

    /*
     * 立即保存依赖文件
     */
    saveImmediate() {
        clearTimeout(this._saveTimer);
        this.file && outputJSONSync(this.file, this.dataMap, { spaces: 2 });
    }

    /**
     * 检查资源是否有初始化过 data 数据
     * @param asset
     * @returns
     */
    has(asset: VirtualAsset) {
        return !!this.dataMap[asset.uuid];
    }

    /**
     *
     * @param asset
     */
    empty(asset: VirtualAsset) {
        this.dataMap[asset.uuid] = {
            url: asset.url,
            value: {},
            versionCode: asset.versionCode,
        };

        this.save();
    }

    /**
     * 根据 asset 信息更新数据
     * @param asset
     */
    update(asset: VirtualAsset) {
        if (!this.dataMap[asset.uuid]) {
            this.dataMap[asset.uuid] = {
                url: asset.url,
                value: {},
                versionCode: asset.versionCode,
            };
        }
        this.dataMap[asset.uuid].url = asset.url;
        this.dataMap[asset.uuid].versionCode = asset.versionCode;
    }

    /**
     * 设置 value 内存储数据
     * @param asset
     */
    setValue(asset: VirtualAsset, key: string, value: any) {
        this.update(asset);
        this.dataMap[asset.uuid].value[key] = value;
        this.save();
    }

    /**
     * 获取 value 内存储的某个数据
     * @param asset
     */
    getValue(asset: VirtualAsset, key: string) {
        return this.dataMap[asset.uuid].value[key];
    }

    /**
     * 获取一个 data 信息
     * @param uuid
     * @param source
     * @returns
     */
    get(asset: VirtualAsset, key: keyof IData = 'value'): null | any {
        if (!this.dataMap[asset.uuid]) {
            return null;
        }
        return this.dataMap[asset.uuid][key];
    }
}
