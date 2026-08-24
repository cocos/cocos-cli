'use strict';

import { existsSync, readFileSync } from 'fs-extra';
import { v1, v4 } from 'node-uuid';
import { CustomConsole } from './console';
import { fsDelete, fsExists, fsWriteFile, IAssetDeleteOptions, IAssetWriteFileOptions } from './filesystem';
import { createPathRecord, isSamePath, replacePathRecordKey } from './path-identity';

// Meta json 文件的格式
export interface Meta {
    ver: string;       // 版本，只要版本号不同，就应该重新导入
    importer: string;  // 解析当前文件的解析器名字
    imported: boolean; // 是否已经成功导入完成
    uuid: string;      // 当前资源的 uuid
    files: string[];   // asset 导入了几个文件到 library
    subMetas: { [index: string]: Meta };  // 当前 asset 的 sub asset
    userData: { [index: string]: any };     // 一些 importer 内定义的数据

    // 实体资源没有这几个属性
    displayName: string; // 用于显示的名字
    id: string;
    name: string;
}

// Meta 在管理器里存放的数据格式
export interface MetaInfo {
    json: Meta;
    backup: string;
    EOL: '\n' | '\r\n';
}

/**
 * 复制一个 json 数据
 * @param json
 */
function generateJSON(json: any) {
    return JSON.parse(JSON.stringify(json));
}

function serializeJSON(json: any, EOL: '\n' | '\r\n') {
    let content = JSON.stringify(json, null, 2);
    if (EOL !== '\n') {
        content = content.replace(/\n/g, EOL);
    }
    return `${content}${EOL}`;
}

/**
 * 复制 meta 数据，将 origin 上的数据复制到 target 上
 * @param target
 * @param origin
 */
export function copyMeta(target: Meta, origin: Meta) {
    target.ver = origin.ver || target.ver || '0.0.0';
    target.importer = origin.importer || '*';
    target.imported = origin.imported || false;
    target.uuid = origin.uuid || v4();
    target.files = origin.files || [];

    target.subMetas = target.subMetas || {};
    origin.subMetas && Object.keys(origin.subMetas).forEach((id: string) => {
        const child = generateJSON(origin.subMetas[id]);
        if (!target.subMetas[id]) {
            target.subMetas[id] = child;
        } else {
            copyMeta(target.subMetas[id], child);
        }
    });
    target.userData = generateJSON(origin.userData || {});

    target.displayName = origin.displayName || '';
    target.id = origin.id || '';
    target.name = origin.name || '';
}


/**
 * 补全 meta 数据
 * @param meta
 */
export function completionMeta(meta: any): Meta {
    if (typeof meta.ver !== 'string') {
        meta.ver = '0.0.0';
    } else {
        meta.ver = meta.ver;
    }

    if (typeof meta.importer !== 'string') {
        meta.importer = '*';
    } else {
        meta.importer = meta.importer;
    }

    if (typeof meta.imported !== 'boolean') {
        meta.imported = false;
    } else {
        meta.imported = meta.imported;
    }

    if (typeof meta.uuid !== 'string' || meta.uuid.length < 36) {
        meta.uuid = v4();
    } else {
        meta.uuid = meta.uuid;
    }

    if (!Array.isArray(meta.files)) {
        meta.files = [];
    }
    if (typeof meta.subMetas !== 'object') {
        meta.subMetas = Object.create(null);
    } else {
        Object.keys(meta.subMetas).forEach((id: string) => {
            completionMeta(meta.subMetas[id]);
        });
    }

    if (typeof meta.userData !== 'object') {
        meta.userData = Object.create(null);
    } else {
        meta.userData = meta.userData;
    }

    if (typeof meta.displayName !== 'string') {
        meta.displayName = '';
    } else {
        meta.displayName = meta.displayName;
    }

    if (typeof meta.id !== 'string') {
        meta.id = '';
    } else {
        meta.id = meta.id;
    }

    if (typeof meta.name !== 'string') {
        meta.name = '';
    } else {
        meta.name = meta.name;
    }
    return meta;
}

export class MetaManager {

    // 资源与 meta 的映射列表
    path2meta: { [index: string]: MetaInfo } = createPathRecord<MetaInfo>();
    private console: CustomConsole;
    constructor(customConsole: CustomConsole) {
        this.console = customConsole || console;
    }

    /**
     * 销毁一个管理器实例
     * @param manager
     */
    destroy() {
        this.path2meta = createPathRecord<MetaInfo>();
    }

    /**
     * 从硬盘读取更新一个 meta 文件数据到内存里
     * @param path
     */
    read(path: string) {
        let metaInfo: MetaInfo;
        let string: string;
        try {
            string = readFileSync(path, 'utf8');
        } catch (error) {
            this.console.debug(`read meta file failed: ${path}`);
            return false;
        }
        try {

            if (this.path2meta[path]) {
                metaInfo = this.path2meta[path];
            } else {
                // 这里的 json 后续会填充
                metaInfo = this.path2meta[path] = { json: {} as Meta, backup: '', EOL: '\n' };
            }

            const json = JSON.parse(string);
            // 备份原始数据，需要重新序列化，去掉部分换行
            metaInfo.backup = JSON.stringify(json);

            // 如果更新的 meta 上的 uuid 变化，则需要发送资源变化的消息
            // 不需要处理
            // if (metaInfo.json.uuid && metaInfo.json.uuid !== json.uuid) {
            // }

            copyMeta(metaInfo.json, json);
            metaInfo.EOL = string ? (/\r\n/.test(string) ? '\r\n' : '\n') : '\n';

            // 如果备份存在，读取后就需要删除了
            // if (this.path2backup[path]) {
            //     delete this.path2backup[path];
            //     this.save();
            // }
            return true;
        } catch (error) {
            this.console.warn(`Read meta in ${path} failed!`);
            this.console.warn(error);
        }

        if (this.path2meta[path]) {
            completionMeta(this.path2meta[path].json);
        }
    }

    async write(path: string, options?: IAssetWriteFileOptions) {
        const item = this.path2meta[path];
        if (!item) {
            return false;
        }

        // @ts-ignore
        delete item.json.displayName;
        // @ts-ignore
        delete item.json.id;
        // @ts-ignore
        delete item.json.name;

        const str = JSON.stringify(item.json);
        if (str === item.backup && await fsExists(path)) {
            return;
        }

        await fsWriteFile(path, serializeJSON(this.path2meta[path].json, this.path2meta[path].EOL), options);

        item.backup = str;
    }

    /**
     * 删除内存中的一个 MetaInfo 数据
     * 并放入 backup 文件夹
     * @param path
     */
    async remove(path: string, options?: IAssetDeleteOptions) {
        delete this.path2meta[path];
        try {
            await fsDelete(path, options);
        } catch (error) {
            console.debug(path);
        }
    }

    /**
     * 从缓存里取一个 MetaInfo
     * 如果不存在，则取备份数据
     * 如果还不存在，则生成新的空 MetaInfo 和 meta 文件
     * @param path
     */
    async get(path: string): Promise<MetaInfo> {
        // 如果数据在内存， 直接返回
        if (this.path2meta[path]) {
            return this.path2meta[path];
        }

        // 如果文件存在，则更新到内存里
        if (existsSync(path)) {
            this.read(path);
            if (this.path2meta[path]) {
                return this.path2meta[path];
            }
        }

        // 如果都不存在，查询备份路径是否存在文件
        // if (this.path2backup[path]) {
        //     const backupFile = this.path2backup[path];
        //     delete this.path2backup[path];
        //     this.save();
        //     try {
        //         moveSync(backupFile, path);
        //         this.read(path);
        //         if (this.path2meta[path]) {
        //             return this.path2meta[path];
        //         }
        //     } catch (error) {
        //         console.warn(error);
        //     }
        // }

        const json = completionMeta({});
        this.path2meta[path] = {
            json,
            backup: JSON.stringify(json),
            EOL: '\n',
        };

        await this.write(path);

        return this.path2meta[path];
    }

    move(pathA: string, pathB: string) {
        if (isSamePath(pathA, pathB)) {
            replacePathRecordKey(this.path2meta, pathA, pathB);
            return;
        }
        if (this.path2meta[pathB]) {
            const json = this.path2meta[pathB].json;
            this.path2meta[pathB].json = this.path2meta[pathA].json;
            copyMeta(this.path2meta[pathA].json, json);
        } else {
            this.path2meta[pathB] = this.path2meta[pathA];
        }
        delete this.path2meta[pathA];
    }

    updatePathCase(previousPath: string, nextPath: string) {
        replacePathRecordKey(this.path2meta, previousPath, nextPath);
    }
}
