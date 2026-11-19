'use strict';

import { existsSync, readJSONSync, outputJSONSync } from 'fs-extra';
import { join, relative } from 'path';
import { CustomConsole } from './console';
import { Migrate, Migrator } from './migrator';
import {
    assertNoPathIdentityConflicts,
    createPathRecord,
    findPathAwareIndex,
    isSamePath,
    PathCaseConflictError,
    replacePathRecordKey,
} from './path-identity';

interface DependMap {
    path: { [path: string]: string[] };
    uuid: { [uuid: string]: string[] };
    [type: string]: { [path: string]: string[] };
}
interface RecordInfoMap {
    data: DependMap
    version: string;
}

const migrations: Migrate<any>[] = [{
    version: '1.0.0',
    migrate: async (cacheInfo: DependMap, manager) => {
        const recordInfo = {
            data: {
                path: {},
                uuid: {},
            },
            version: DependencyManager.version,
        };
        Object.keys(cacheInfo.path).forEach((path) => {
            recordInfo.data.path[relative(manager.pathRoot, path)] = cacheInfo.path[path].map((subPath => relative(manager.pathRoot, subPath)));
        })
        Object.keys(cacheInfo.uuid).forEach((path) => {
            recordInfo.data.uuid[relative(manager.pathRoot, path)] = cacheInfo.uuid[path];
        })
        return recordInfo;
    }
}];
function getDefaultRecordInfo(): RecordInfoMap {
    return {
        data: {
            path: createPathRecord<string[]>(),
            uuid: createPathRecord<string[]>(),
        },
        version: DependencyManager.version,
    };
}

// 关联性 map，一个资源更改后需要通知依赖这个资源的其他资源
// 这里记录的就是依赖某个资源的其他资源列表
const associatedMap: { [index: string]: string[] } = createPathRecord<string[]>();

/**
 * 资源关联以及依赖关系列表，主要影响导入队列以及是否需要重新导入
 * 部分数据需要固化到硬盘上
 */
export class DependencyManager {

    static version: string = '1.0.0';

    // 固化数据的保存路径
    file?: string;
    pathRoot: string;

    // 依赖列表，一个对象依赖的所有对象的名字数组
    // { uuid: { 'id': [] }, url: { 'db://test/1.json': [] }, path: { '/Users/xxx': [] } }
    dependMap: DependMap = getDefaultRecordInfo().data;

    // 保存使用的 timer
    _saveTimer: any = null;
    private console: CustomConsole;
    cacheConflict: PathCaseConflictError | null = null;
    constructor(customConsole: CustomConsole, pathRoot: string) {
        this.console = customConsole || console;
        this.pathRoot = pathRoot;
    }
    /**
     * 设置用于记录的 json 文件
     * @param json
     */
    async setRecordJSON(path: string) {
        this.file = path;
        this.cacheConflict = null;
        try {
            await this._restoreCache(path);
        } catch (error) {
            if (error instanceof PathCaseConflictError) {
                this.destroy();
                this.dependMap = getDefaultRecordInfo().data;
                this.cacheConflict = error;
            }
            this.console.warn(error);
        }
    }

    private async _restoreCache(path: string) {
        const cacheInfo = await this.readRecordJSON(path);
        if (!cacheInfo) {
            return;
        }
        // 处理缓存数据
        const restoredSourcePaths = [
            ...Object.keys(cacheInfo.data.path),
            ...Object.keys(cacheInfo.data.uuid),
        ].map((relativePath) => join(this.pathRoot, relativePath));
        assertNoPathIdentityConflicts(restoredSourcePaths);
        const restoredDependMap = getDefaultRecordInfo().data;
        const { path: pathRecord, uuid: uuidRecord } = restoredDependMap;
        Object.keys(cacheInfo.data.path).forEach((relativePath) => {
            const restoredDependencies: string[] = [];
            cacheInfo.data.path[relativePath].forEach((subPath) => {
                const dependencyPath = join(this.pathRoot, subPath);
                if (findPathAwareIndex(restoredDependencies, dependencyPath) === -1) {
                    restoredDependencies.push(dependencyPath);
                }
            });
            pathRecord[join(this.pathRoot, relativePath)] = restoredDependencies;
        })
        Object.keys(cacheInfo.data.uuid).forEach((relativePath) => {
            uuidRecord[join(this.pathRoot, relativePath)] = cacheInfo.data.uuid[relativePath];
        })
        this.dependMap = restoredDependMap;
        // 补全关联列表
        for (let type in this.dependMap) {
            const typeMap = this.dependMap[type];
            for (let path in typeMap) {
                const array = typeMap[path];
                array.forEach((urlOrPathOrUUID) => {
                    associatedMap[urlOrPathOrUUID] = associatedMap[urlOrPathOrUUID] || [];
                    if (findPathAwareIndex(associatedMap[urlOrPathOrUUID], path) !== -1) {
                        return;
                    }
                    associatedMap[urlOrPathOrUUID].push(path);
                });
            }
        }
    }

    private async readRecordJSON(path: string): Promise<RecordInfoMap | undefined> {
        if (!existsSync(path)) {
            return;
        }
        try {
            const cacheInfo = readJSONSync(path);
            const version = cacheInfo.version ? cacheInfo.version : '0.0.0';
            const migrator = new Migrator<RecordInfoMap>(migrations, version, {
                onError: (error, stage, data, ...args) => {
                    this.console.warn(`Migrate error in dependencyManager`);
                    this.console.warn(error);
                }
            });
            return await migrator.run(cacheInfo, DependencyManager.version, [this]);
        } catch (error) {
            this.console.error(error);
            return;
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
        if (this.file) {
            const recordInfo = getDefaultRecordInfo();
            // 存储到文件系统里需要记录相对路径
            const { path: pathRecord, uuid: uuidRecord } = this.dependMap;
            Object.keys(pathRecord).forEach((path) => {
                recordInfo.data.path[relative(this.pathRoot, path)] = pathRecord[path].map((file) => relative(this.pathRoot, file));
            })
            Object.keys(uuidRecord).forEach((path) => {
                recordInfo.data.uuid[relative(this.pathRoot, path)] = uuidRecord[path];
            });
            outputJSONSync(this.file, recordInfo, { spaces: 2 });
        }
    }

    /**
     * 记录一个资源依赖的所有资源列表
     * 允许传入 url、uuid、path 三种依赖的格式
     * @param path
     * @param dependNames
     */
    add(type: string, key: string, depends: string | string[]) {
        const typeMap = this.dependMap[type] = this.dependMap[type] || createPathRecord<string[]>();

        const array = typeMap[key] = typeMap[key] || [];

        if (!Array.isArray(depends)) {
            depends = [depends];
        }
        depends.forEach((depend) => {
            if (depend && findPathAwareIndex(array, depend) !== -1) {
                return;
            }

            // 记录到依赖列表
            array.push(depend);

            // 记录到关联列表
            const associated = associatedMap[depend] = associatedMap[depend] || [];
            if (findPathAwareIndex(associated, key) === -1) {
                associated.push(key);
            }
        });
        this.save();
    }

    /**
     * 清空一个资源的依赖记录
     * @param name
     */
    remove(type: string, key: string) {
        if (!this.dependMap[type] || !this.dependMap[type][key]) {
            return;
        }

        // 删除依赖列表
        this.dependMap[type][key].forEach((str) => {
            const array = associatedMap[str];
            if (!array) {
                return;
            }
            const index = findPathAwareIndex(array, key);
            if (index !== -1) {
                array.splice(index, 1);
            }
            if (array.length === 0) {
                delete associatedMap[str];
            }
        });

        delete this.dependMap[type][key];
        this.save();
    }

    updatePathCase(previousPath: string, nextPath: string) {
        for (const type in this.dependMap) {
            const typeMap = this.dependMap[type];
            replacePathRecordKey(typeMap, previousPath, nextPath);
            Object.keys(typeMap).forEach((key) => {
                typeMap[key].forEach((value, index) => {
                    if (isSamePath(value, previousPath)) {
                        typeMap[key][index] = nextPath;
                    }
                });
            });
        }

        replacePathRecordKey(associatedMap, previousPath, nextPath);
        Object.keys(associatedMap).forEach((key) => {
            associatedMap[key].forEach((value, index) => {
                if (isSamePath(value, previousPath)) {
                    associatedMap[key][index] = nextPath;
                }
            });
        });
        this.save();
    }

    /**
     * 销毁一个依赖管理器实例
     * @param manager
     */
    destroy() {
        // 将管理器记录的所有数据从全局缓存内删除
        // 但不清除缓存 json，因为之后还可能需要使用

        for (let type in this.dependMap) {
            const typeMap = this.dependMap[type];
            for (let key in typeMap) {
                const array = typeMap[key];
                array.forEach((str) => {
                    if (!associatedMap[str]) {
                        return;
                    }
                    const index = findPathAwareIndex(associatedMap[str], key);
                    if (index !== -1) {
                        associatedMap[str].splice(index, 1);
                    }
                    if (associatedMap[str].length === 0) {
                        delete associatedMap[str];
                    }
                });
            }
        }
    }
}

/**
 * 获取被影响的资源列表
 * @param urlOrPathOrUUID
 */
export function getAssociatedFiles(urlOrPathOrUUID: string) {
    return associatedMap[urlOrPathOrUUID] || [];
}
