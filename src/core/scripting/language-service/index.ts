import { exists, existsSync, readFileSync, statSync, writeFile } from 'fs-extra';
import { extname } from 'path';
import ts, { CompilerOptions, IScriptSnapshot, LanguageServiceHost, ParseConfigFileHost } from 'typescript';
import { DbURLInfo } from '../intelligence';
import { ModifiedAssetChange } from '../packer-driver/asset-db-interop';
import { assetInfoCache, FileInfo } from '../shared/cache';
import { AsyncDelegate } from '../utils/delegate';
import { AwaitCommand, Command, RenameCommand } from './command';
import { asserts } from '../utils/asserts';
import { configurationManager } from '../../configuration';
import { scriptConfig } from '../shared/query-shared-settings';

/**
 * 这个类用来处理内存中的文件
 */
export class VirtualIOAdapter {
    protected readonly _fileCache: Map<string, FileInfo> = assetInfoCache;
    constructor(

    ) {

    }
    /** 如果内存中有这部分内容则优先使用内存的 */
    readFile(filePath: FilePath): string | undefined {
        if (filePath === LanguageServiceHostAdapter.defaultLibFileName) {
            return undefined;
        }
        const cache = this.readCache(filePath);
        let content: string | undefined;
        if (cache?.content) {
            content = cache.content;
        } else {
            try {
                content = readFileSync(filePath, 'utf8');
                const info = this._fileCache.get(filePath);
                asserts(info);
                const nowMtimeMs = statSync(filePath).mtimeMs;
                this.writeCache({ filePath, uuid: info.uuid, content, version: nowMtimeMs.toString() });
            } catch (error) {
                console.debug(error);
            }
        }

        return content;
    }

    /**从内存加载脚本信息 */
    readCache(filePath: FilePath): Readonly<FileInfo> | undefined {
        return this._fileCache.get(filePath);
    }
    removeCache(filePath: FilePath): boolean {
        return this._fileCache.delete(filePath);
    }
    /** 将文件写入至内存 */
    writeCache({ uuid, content, version, filePath }: Readonly<FileInfo>): void {
        this._fileCache.set(filePath, { filePath, uuid, content, version });
    }
    fileExists(path: string): boolean {
        return existsSync(path);
    }
    getFileNames() {
        return Array.from(assetInfoCache.keys());
    }
}
export class ParseConfigFileHostAdapter extends VirtualIOAdapter implements ParseConfigFileHost {
    constructor(
        protected readonly _currentDirectory: FilePath,

    ) {
        super();
    }

    getCurrentDirectory(): string {
        return this._currentDirectory;
    }
    useCaseSensitiveFileNames = true;
    readDirectory(rootDir: string, extensions: readonly string[], excludes: readonly string[] | undefined, includes: readonly string[], depth?: number | undefined): readonly string[] {
        return this.getFileNames();
    }

    onUnRecoverableConfigFileDiagnostic(...args: Parameters<ParseConfigFileHost['onUnRecoverableConfigFileDiagnostic']>) {
        console.error(...args);
    }

}
export class LanguageServiceHostAdapter extends VirtualIOAdapter implements LanguageServiceHost {
    public static readonly defaultLibFileName = '__DEFAULT_LIB_FILE_NAME_IS_NEVER_EXIST.d.ts';
    constructor(
        protected readonly _parseConfigFileHost: Readonly<ParseConfigFileHostAdapter>,
        protected readonly _tsconfigPath: FilePath,
        protected readonly _currentDirectory: FilePath,
        protected readonly _compilerOptions: CompilerOptions

    ) {
        super();
    }
    getCompilationSettings(): CompilerOptions {
        return this._compilerOptions;
    }

    getScriptFileNames(): string[] {
        return this.getFileNames().slice();
    }

    getScriptVersion(fileName: string): string {
        return this.readCache(fileName)?.version ?? '';
    }
    getScriptSnapshot(fileName: string): IScriptSnapshot | undefined {
        const file = this.readFile(fileName);
        return file && ts.ScriptSnapshot.fromString(file) || undefined;
    }
    getCurrentDirectory(): string {
        return this._currentDirectory;
    }
    getDefaultLibFileName(options: CompilerOptions): string {
        return LanguageServiceHostAdapter.defaultLibFileName;
    }
    useCaseSensitiveFileNames(): boolean {
        return this._parseConfigFileHost.useCaseSensitiveFileNames;
    }

}

export interface LanguageServiceAdapterEditOptions {
    renameOptions?: {
        oldFilePath: FilePath,
        newFilePath: FilePath,
    },
    /** 是否输出修改后的脚本到硬盘 */
    outputFiles?: boolean
}
export class LanguageServiceAdapter {
    public readonly languageService: ts.LanguageService;
    public readonly host: LanguageServiceHostAdapter;
    public autoUpdateFileImport: boolean | undefined;
    protected readonly _parseConfigFileHost: ParseConfigFileHostAdapter;
    /** 命令队列 */
    protected readonly _awaitCommandQueue: AwaitCommand[] = [];
    /** 正在执行的命令 */
    protected _executingCommandID: Command['id'] = '';
    protected readonly _changedFileSet: Set<string> = new Set();
    protected readonly _afterOutputTasks: (() => void)[] = [];
    constructor(
        protected readonly _tsconfigPath: FilePath,
        protected readonly _currentDirectory: FilePath,
        /** 外部提供一个委托，这里注入委托，主要防止重复编译 */
        protected readonly _beforeBuildDelegate: AsyncDelegate<(changes: ModifiedAssetChange[]) => Promise<void>>,
        protected readonly _compilerOptions: Readonly<CompilerOptions>,
        public readonly dbURLInfos: readonly DbURLInfo[],

    ) {
        this._parseConfigFileHost = new ParseConfigFileHostAdapter(_currentDirectory);
        this.host = new LanguageServiceHostAdapter(this._parseConfigFileHost, this._tsconfigPath, this._currentDirectory, this._compilerOptions);
        this.languageService = ts.createLanguageService(this.host, undefined, ts.LanguageServiceMode.Semantic);
        this._beforeBuildDelegate.add(async (assetChanges) => {
            assetChanges.forEach(item => item.oldFilePath && item.newFilePath && this.requestRenameFile(item.oldFilePath, item.newFilePath));
            await this.finishCommand(assetChanges);
        });

    }

    public isExecuting(commandID: string): boolean {
        if (this._executingCommandID === commandID || this._awaitCommandQueue.some(item => item.command.id === commandID)) {
            return true;
        }
        return false;
    }
    public get isBusy(): boolean {
        return Boolean(this._executingCommandID);
    }
    public async executeCommand(command: Command): Promise<void> {
        if (this.isExecuting(command.id)) {
            return;
        }
        if (this._executingCommandID) {
            await new Promise((resolve, reject) => {
                this._awaitCommandQueue.push({
                    command,
                    resolveAwait: resolve,
                });
            });
        }
        this._executingCommandID = command.id;
        const result = await command.execute(this);
        for (const iterator of result.values()) {
            this._changedFileSet.add(iterator);
        }
        const nextCommand = this._awaitCommandQueue.shift();
        if (nextCommand) {
            nextCommand.resolveAwait(void 0);
        } else {
            await this.outPutFiles(this._changedFileSet);
            this._executingCommandID = '';
            this._changedFileSet.clear();
            // 从生成文件的过程中会注入命令，
            const nextCommand = this._awaitCommandQueue.shift();
            if (nextCommand) {
                nextCommand.resolveAwait(void 0);
            }
        }
    }

    /** 请求更新路径 */
    public async requestRenameFile(oldFilePath: FilePath, newFilePath: FilePath): Promise<void> {
        if (oldFilePath && newFilePath && oldFilePath.endsWith('.ts') && newFilePath.endsWith('.ts') || !extname(oldFilePath)) {
            if (oldFilePath === newFilePath) {
                return;
            }
            if (this.autoUpdateFileImport === undefined) {
                this.autoUpdateFileImport = await scriptConfig.getProject<boolean>('updateAutoUpdateImportConfig.global');
            }
            if (this.autoUpdateFileImport) {
                console.debug('Starting rename...');
                await this.executeCommand(new RenameCommand(oldFilePath, newFilePath));
                console.debug('Finish rename.');
            }
        }

    }

    public applyChanges(text: string, changes: readonly ts.TextChange[]): string {
        for (let i = changes.length - 1; i >= 0; i--) {
            const { span, newText } = changes[i];
            text = `${text.substring(0, span.start)}${newText}${text.substring(this.textSpanEnd(span))}`;
        }
        return text;
    }

    /** 将缓存中的数据生成到位置 */
    public async outPutFiles(fileNameSet: Set<string>) {
        const arr = Array.from(fileNameSet.values());
        await Promise.all(arr.map(async file => {
            try {
                const cache = this.host.readCache(file);
                if (!cache?.content) {
                    console.debug('There\'s nothing in the cache');
                    return;
                }
                await writeFile(file, cache?.content, { encoding: 'utf8' });
            } catch (error) {
                console.debug(`Failed to update script ${file}`, error);
            }
        }));
        while (this._afterOutputTasks.length) {
            const task = this._afterOutputTasks.shift();
            if (task) {
                task();
            }
        }
        this.clearCache();

    }

    protected clearCache() {
        assetInfoCache.forEach(item => item.content = undefined);
    }
    protected textSpanEnd(span: ts.TextSpan) {
        return span.start + span.length;
    }
    protected async finishCommand(assetChanges: ModifiedAssetChange[]) {
        return new Promise<void>((resolve, reject) => {
            if (this.isBusy) {
                this._afterOutputTasks.push(resolve);
            } else {
                resolve();
            }
        });
    }
}
