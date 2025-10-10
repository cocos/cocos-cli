'use strict';

import { remove, existsSync, readJSON, readdirSync, statSync, writeFileSync, ensureDir } from 'fs-extra';
import { join, dirname } from 'path';
import { CocosParams, NativePackTool } from '../pack-tool/default';
import { NativePackToolManager } from '../pack-tool/manager';
import { GlobalPaths } from '../../../../../global';
import { IBuildTaskOption } from '../../../@types';

const babelify = require('babelify');
const browserify = require('browserify');

/**
 * 清空项目相关的资源和脚本
 * @param projectPath
 */
export async function clearDest(projectPath: string) {
    try {
        await remove(join(projectPath, 'data'));
    } catch (err: any) {
        console.error(err);
    }
}

// 用于场景原生化的引擎生成jsb-adapter
export async function generateJsbAdapter(jsEnginePath: string, dist: string) {
    const root = join(jsEnginePath, 'platforms/native');
    const builtin = join(root, 'builtin/index.js');
    const engine = join(root, 'engine/index.js');

    // 这里调用不了Build.Utils.createBundle，所以需要自己写这个createBundle方法
    // TODO 此方法需要移除
    // TODO: targets 暂时传 chrome 80
    await _createBundle(builtin, join(dist, 'web-adapter.js'), { targets: 'chrome 80' });
    await _createBundle(engine, join(dist, 'engine-adapter.js'), { targets: 'chrome 80' });
}

export async function getCmakePath(): Promise<string> {
    const internalCmakeRoot = join(GlobalPaths.staticDir, 'tools/cmake');
    if (process.platform === 'win32') {
        return join(internalCmakeRoot, 'bin/cmake.exe');
    } else {
        return join(internalCmakeRoot, 'bin/cmake');
    }
}

/**
 * 检查 lite 版本与当前的项目是否匹配
 * @param projectPath
 */
export async function checkLiteVersion(projectPath: string) {
    const projectJsonPath = join(projectPath, '.cocos-project.json');
    if (!existsSync(projectJsonPath)) {
        console.error(`Can't find project json [{link(${projectJsonPath})}]`);
        return;
    }

    const projectJson = await readJSON(projectJsonPath);
    const projectVersion = projectJson.engine_version;

    // if (projectVersion !== cocosEngineVersion) {
    //     console.error(`Project version [${projectVersion}] not match engine version [${cocosEngineVersion}]. Please delete your build path, then rebuild project.`);
    // }
}

/**
 * 遍历对比源码与目标文件的修改时间
 * @param {string} dir
 * @param {string} targetFileMtime
 */
function checkFileStat(dir: string, targetFileMtime: number): boolean {
    const files = readdirSync(dir);
    return files.some(file => {
        const filePath = join(dir, file);
        const stat = statSync(filePath);
        if (stat.isDirectory()) {
            return checkFileStat(filePath, targetFileMtime);
        } else if (stat.mtime.getTime() > targetFileMtime) {
            return true;
        }
    });
}

/**
 * 检测源码是否更新
 * @param src
 * @param dst
 */
function hasChanged(src: string, dst: string) {
    if (!existsSync(dst)) {
        return true;
    }
    const builtin = join(dst, 'web-adapter.js');
    const engine = join(dst, 'engine-adapter.js');
    if (!existsSync(builtin) || !existsSync(engine)) {
        return true;
    }
    const stat = statSync(dst);
    const dir = dirname(src);
    return checkFileStat(dir, stat.mtime.getTime());
}

export async function _createBundle(src: string, dest: string, options?: string[] | {
    excludes?: string[];
    targets?: string;
}) {
    let excludes: string[] | undefined;
    let targets: string | undefined;

    if (Array.isArray(options)) {
        excludes = options;
    } else if (options) {
        excludes = options.excludes;
        targets = options.targets;
    }

    const bundler = browserify(src);
    if (excludes) {
        excludes.forEach(function (path) {
            bundler.exclude(path);
        });
    }
    await ensureDir(dirname(dest));
    return new Promise<void>((resolve, reject) => {
        bundler.transform(babelify, { presets: [[require('@babel/preset-env'), { targets }]] })
            .bundle((err: Error, buffer: Uint8Array) => {
                if (err) {
                    console.error(err);
                    reject(err);
                    return;
                }
                writeFileSync(dest, buffer, 'utf8');
                resolve();
            });
    });
}
class PackToolHandler {
    _init = false;
    packRoot!: string;
    manager!: NativePackToolManager;

    get ready() {
        return this._init;
    }

    async init(engineRoot: string, force?: boolean) {
        if (this._init && !force) {
            return;
        }
        this.packRoot = join(engineRoot, 'scripts', 'native-pack-tool');
        this.manager = require(join(this.packRoot, 'dist/index')).nativePackToolMg;
        this._init = true;
    }

    async getProjectBuildPath(tool: NativePackTool): Promise<string> {
        if (!this._init) {
            return '';
        }
        return tool?.projectDistPath;
    }

    async initPackTool(params: CocosParams<Object>): Promise<NativePackTool> {
        await this.init(params.enginePath);
        // 同一平台不同的构建任务会复用同一个 native pack tool ，因而每次使用都需要重新 init
        return await this.manager.init(params);
    }

    async runTask(task: 'create' | 'generate' | 'make' | 'run', params: CocosParams<Object>) {
        await this.initPackTool(params);
        return await this.manager[task](params.platform);
    }
}

export const packToolHandler = new PackToolHandler();

// 支持中文的平台如果有修改，需要同步到 configs
export function acceptChineseName(options: IBuildTaskOption) {
    return ['mac', 'ios', 'windows', 'android'].includes(options.platform);
}

export function checkName(value: string, options: IBuildTaskOption) {
    if (acceptChineseName(options)) {
        return /^[\u4e00-\u9fa5A-Za-z0-9-_]+$/.test(value);
    } else {
        return /^[A-Za-z0-9-_]+$/.test(value);
    }
}