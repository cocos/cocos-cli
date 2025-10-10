import { readFileSync, remove, outputFile, rename, readFile } from 'fs-extra';
import { dirname, basename, join, extname, resolve } from 'path';
import { calcMd5, patchMd5ToPath } from '../../utils';
import minimatch from 'minimatch';
import fg from 'fast-glob';
import { IMD5Options } from '../../../../@types/protected';

interface FileDepend {
    path: string;
    matchStr: string;
    fileName: string;
}
interface FileContentInfo {
    depends: FileDepend[];
    code: string;
}

// 暂时缩小自动替换文件路径的处理范围，目前编辑器内置的模板这些格式已足够
// 其他类型过去版本也不支持替换 md5，如果有反馈再处理即可
const textFiles: string[] = ['.js', '.ts', '.html'];

function escapeGlobChars(str: string) {
    return str.replace(/([*?[\]{}()!+@|^$\\])/g, '\\$1');
}

// 把任意 Windows 风格或混合路径安全化为 POSIX 风格并转义
function safePatternFromAbsolute(absPath: string) {
    const posix = absPath.replace(/\\/g, '/');
    // 把每个路径段单独转义，防止转义路径分隔符
    return posix
        .split('/')
        .map(segment => escapeGlobChars(segment))
        .join('/');
}

// 目前由于内部模板有许多使用字符串拼接引用路径的写法，不能限制 import 或者 require 使用相对路径的方式
export class md5CacheHandler {
    // 原始文件地址 -> 已添加 hash 后缀的文件地址
    hashedPathMap: Record<string, string> = {};
    options: IMD5Options;

    _root: string; // 根目录，不使用 ./ 开头的路径引用并不一定相对于引用文件目录，需要在根目录下查找

    private _files: string[] = [];

    private _waitingMd5Files: string[] = [];
    private _waitingReplaceFiles: string[] = [];

    // 等待更新的文件内容
    private waitUpdateFiles: Record<string, FileContentInfo> = {};

    constructor(root: string, options: IMD5Options) {
        this.options = options;
        this._root = root;
    }

    private async initFiles() {
        this.options.excludes.push('**/*.map');
        this.options.excludes.push('**.ico');
        this.options.excludes.push('**.icns');
        this.options.includes = [
            ...this.options.replaceOnly,
            ...this.options.includes,
        ].map((url) => url.replace(/\\/g, '/'));
        // 初始化 md5 的文件处理范围
        const files: string[] = await fg(this.options.includes, {
            onlyFiles: true,
            ignore: this.options.excludes,
            cwd: this._root,
            deep: 0,
            absolute: true,
        });
        const hasMd5Files = Object.values(this.hashedPathMap).map((path) => resolve(path));

        // 在 win 上 fg 获取到的路径为 / 拼接的路径，需要转换成标准的绝对路径
        this._files = files.filter((file) => !hasMd5Files.includes(file)).map((path) => resolve(path));

        if (this.options.replaceOnly.length) {
            this._files.forEach((path) => {
                // 需要绝对路径之间的互相匹配
                if (this.options.replaceOnly.find((exclude) => minimatch(path, join(this._root, exclude)))) {
                    this._waitingReplaceFiles.push(path);
                } else {
                    this._waitingMd5Files.push(path);
                }
            });
        } else {
            this._waitingMd5Files = this._files;
        }
    }

    async run() {
        // 初始化需要处理的文件范围
        await this.initFiles();
        // 先处理所有需要添加 md5 的文件以及其路径引用
        await this.addMD5ToFiles();
        // 如果没有任何添加 md5 后缀的文件，或者没有需要替换内容引用地址的文件，则无需处理
        if (!this._waitingMd5Files.length || !this._waitingReplaceFiles.length) {
            return;
        }
        // 替换其他不需要添加 md5 的文件内路径引用
        await Promise.all(this._waitingReplaceFiles.map((path) => this.replacePath(path)));
    }

    async replacePath(path: string) {
        const info = await this.readFileDepends(path);
        if (!info || !info.depends.length) {
            return;
        } else {
            // 替换路径引用
            await this.replacePathInCode(path, info);
            await outputFile(path, info.code);
        }
    }

    /**
     * 简单添加 md5 后缀，不识别文件内容
     * @param path 
     * @returns 
     */
    async addMd5ToPath(path: string, code?: string) {
        const cryptoHash = calcMd5(code || readFileSync(path, 'utf-8'));
        const newPath = patchMd5ToPath(path, cryptoHash);
        if (code) {
            await remove(path);
            await outputFile(newPath, code);
        } else {
            await rename(path, newPath);
        }
        this.hashedPathMap[path] = newPath;
        return newPath;
    }

    /**
     * 查找在 file 内存在的完整的文件
     * @param path 
     * @returns 
     */
    private findFile(parentDir: string, fileName: string) {
        // 存在文件后缀的文件
        if (extname(fileName)) {
            let path = join(parentDir, fileName);
            if (this.checkPathExist(path)) {
                return path;
            } else if (!fileName.startsWith('.')) {
                // 常规查找失败时，如果不是相对路径尝试找到根目录下的索引位置
                path = join(this._root, fileName);
                if (this.checkPathExist(path)) {
                    return path;
                }

            }
            return '';
        }
        // 没有文件后缀，尝试自动匹配可能的文件
        for (const extName of ['.js', '.json', '/index.js', '/index.json']) {
            let path: string;
            path = this._joinPath(parentDir, fileName, extName);
            if (this.checkPathExist(path)) {
                return path;
            } else if (!fileName.startsWith('.')) {
                path = this._joinPath(this._root, fileName, extName);
                if (this.checkPathExist(path)) {
                    return path;
                }
            }
        }
        return '';
    }

    private checkPathExist(path: string) {
        return this._files.includes(path) || this.hashedPathMap[path];
    }

    private _joinPath(root: string, fileName: string, extName: string) {
        if (extName.startsWith('.')) {
            return join(root, fileName + extName);
        } else {
            return join(root, fileName, extName);
        }
    }

    /**
     * 给文件添加 md5 后缀，将会识别内容替换路径引用
     */
    private async addMD5ToFiles() {
        const files = this._waitingMd5Files;

        await Promise.all(files.map(async (path) => {
            if (this.hashedPathMap[path]) {
                return;
            }
            const info = await this.readFileDepends(path);
            if (!info || !info.depends.length) {
                await this.addMd5ToPath(path, info?.code);
                return;
            }
            // 存在依赖的路径时，尝试替换路径引用
            await this.replacePathInCode(path, info);
            if (info.depends.length) {
                this.waitUpdateFiles[path] = info;
            } else {
                await this.addMd5ToPath(path, info.code);
            }
        }));

        await new Promise<void>(async (resolve, reject) => {
            try {
                const updateFiles: string[] = Object.keys(this.waitUpdateFiles);
                while (updateFiles.length) {
                    const path = updateFiles.shift();
                    if (!path) {
                        return;
                    }
                    const info = this.waitUpdateFiles[path];
                    // 尝试替换路径引用
                    await this.replacePathInCode(path, info);
                    if (info.depends.length === 0) {
                        await this.addMd5ToPath(path, info.code);
                        delete this.waitUpdateFiles[path];
                    } else {
                        updateFiles.push(path);
                    }
                }
            } catch (error) {
                reject(error);
            }
            resolve();
        });

    }

    private replacePathInCode(filePath: string, fileInfo: FileContentInfo) {
        const newDepends: FileDepend[] = [];
        fileInfo.depends.forEach((info, i) => {
            // 替换已经处理 md5 的路径
            if (this.hashedPathMap[info.path]) {
                fileInfo.code = fileInfo.code.replaceAll(info.matchStr, info.matchStr.replace(basename(info.fileName), basename(this.hashedPathMap[info.path])));
            } else {
                // 1. 循环引用
                if (this.waitUpdateFiles[info.path] && this.waitUpdateFiles[info.path].depends.find((item) => item.path === filePath) ||
                    // 2. 不在 md5 处理范围内
                    !this._waitingMd5Files.includes(info.path)
                ) {
                    return;
                } else {
                    newDepends.push(info);
                }
            }
        });
        fileInfo.depends = newDepends;
        return fileInfo;
    }

    private async readFileDepends(path: string): Promise<FileContentInfo | null> {
        // 仅读取和替换文本文件内的依赖信息
        const extName = extname(path);
        if (!textFiles.includes(extName)) {
            return null;
        }
        // TODO 压缩混淆后的文件不做处理

        const code = readFileSync(path, 'utf-8');
        // 匹配代码内的引用地址信息
        const relativePathRegex = /(?:'|\")([^\s'"]+)(?:'|\")/g;
        let matches: RegExpMatchArray[] = [];
        if (extName === '.html') {
            // 匹配 html 里常规的路径链接
            matches = Array.from(code.matchAll(/(?:href|src)="([^"]*)"/g));
            // html 里 script 标签里的内容才能使用 relativePathRegex 进行依赖查找
            const scriptCodes = extractScriptContents(code);
            if (scriptCodes.length) {
                for (const scriptCode of scriptCodes) {
                    matches = matches.concat(Array.from(scriptCode.matchAll(relativePathRegex)));
                }
            }
        } else {
            matches = Array.from(code.matchAll(relativePathRegex));
        }
        const depends: FileDepend[] = [];
        const root = dirname(path);
        for (const match of matches) {
            // 需要补齐文件后缀
            const dependPath = this.findFile(root, match[1]);
            if (!dependPath) {
                continue;
            }
            depends.push({
                path: dependPath,
                matchStr: match[0],
                fileName: match[1],
            });
        }
        return {
            depends,
            code,
        };
    }
}

function extractScriptContents(htmlContent: string): string[] {
    const scriptContents: string[] = [];
    const scriptTagRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gm;

    let match;
    while ((match = scriptTagRegex.exec(htmlContent)) !== null) {
        // match[1] 包含了<script>标签内的脚本内容
        if (match[1]) {
            scriptContents.push(match[1]);
        }
    }
    return scriptContents;
}