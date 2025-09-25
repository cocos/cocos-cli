import { join } from 'path';
import ts, { TextChange } from 'typescript';
import { LanguageServiceAdapter } from '.';
import { DbURLInfo } from '../intelligence';
import { asserts } from '../utils/asserts';
import { dbURLRoot, removeTSExt, resolveFileName } from '../utils/path';
import utils from '../../base/utils';

export enum CommandType{
    rename = 0,
}

export abstract class Command {
    abstract id: string
    abstract description: string
    abstract commandType: CommandType
    abstract execute(languageServiceAdapter: LanguageServiceAdapter): Promise<Set<FilePath>>;
}

export interface AwaitCommand {
    /** 调用这个方法将解除命令的等待 */
    resolveAwait: (any: any) => void;
    command: Command,
}

export class RenameCommand extends Command {
    private _newFileDBInfo: DbURLInfo|undefined;
    private _oldFileDBInfo: DbURLInfo|undefined;
    /** 新的文件/文件夹在 db的 url */
    private _newFileDBURL: string |undefined;
    /** 旧的文件/文件夹在 db的 url */
    private _oldFileDBURL: string | undefined;
    /** 仅在移动的内容为文件的时候有效 */
    readonly oldFilePathWithOutExt: string;
    /** 仅在移动的内容为文件的时候有效 */
    readonly newFilePathWithOutExt: string;
    private static _createDescription(oldFilePath: FilePath, newFilePath: FilePath){ return `Rename ${resolveFileName(oldFilePath)} to ${resolveFileName(newFilePath)}.`;}
    private static _createID(oldFilePath: FilePath, newFilePath: FilePath){ return this._createDescription(oldFilePath, newFilePath);}
    private _executed = false;
    readonly id: string;
    readonly description: string;
    readonly commandType: CommandType;

    static create(oldFilePath: FilePath, newFilePath: FilePath): Command{
        return new RenameCommand(oldFilePath, newFilePath);
    }
    constructor(protected readonly oldFilePath: FilePath, protected readonly newFilePath: FilePath){
        super();
        this.oldFilePath = resolveFileName(oldFilePath);
        this.oldFilePathWithOutExt = removeTSExt(this.oldFilePath);
        this.newFilePath = resolveFileName(newFilePath);
        this.newFilePathWithOutExt = removeTSExt(this.newFilePath);
        this.id = RenameCommand._createID(oldFilePath, newFilePath);
        this.description = RenameCommand._createDescription(oldFilePath, newFilePath);
        this.commandType = CommandType.rename;
         
    }
    /**
      * 
      * @param dbUrlInfos 
      * @param filePath 修改文件后的资源的路径
      * @param text 修改文件的原始内容
      * @param changes 文件需要做得变动
      * @returns 
      */
    protected applyImportChanges(dbUrlInfos: readonly DbURLInfo[], filePath: string, text: string, changes: readonly TextChange[]): string{
        asserts(this._newFileDBInfo);
        asserts(this._newFileDBURL);
        asserts(this._oldFileDBInfo);
        asserts(this._newFileDBInfo);
        const filePathWithOutExt = removeTSExt(filePath);
        /** 当前修改的脚本是否为命令里的目标脚本 */
        const isTargetFile = filePath === this.newFilePath;
        /** 脚本的目标位置是否与目标目录 */
        const isFileSameDB = utils.Path.contains(this._newFileDBInfo.target, filePath);  
        /** 是否需要额外地处理导入路径 */
        const needToUpdateImportPath = isTargetFile || !isFileSameDB;
        for (let i = changes.length - 1; i >= 0; i--) {
            const { span, newText } = changes[i];
            let _nextText = newText;
            // 原本写了 db://
            const newImportPath = join(filePath, '../', _nextText);
            if (needToUpdateImportPath) {
                if (text.substring(span.start, span.start + 5) === dbURLRoot && !isFileSameDB){
                    if (!newText.startsWith(dbURLRoot)){
                        if (dbUrlInfos){
                            for (let index = 0; index < dbUrlInfos.length; index++) {
                                const info = dbUrlInfos[index];
                                if (utils.Path.contains(info.target, newImportPath)){
                                    const relativePath = utils.Path.relative(info.target, newImportPath);
                                    _nextText = info.dbURL + resolveFileName(relativePath);
                                    break;
                                }
                            }
                        }
                   
                    }
                } else {
                    // 文件放别的 db 了，将引用脚本的 import 更新为 db 协议的写法
                    let oldFilePath: string;
                    if (filePath === this.newFilePath){
                        oldFilePath = this.oldFilePathWithOutExt;
                    } else {
                        oldFilePath = filePathWithOutExt;
                    }
                    const oldImportPath = resolveFileName(join(oldFilePath, '../', text.substring(span.start, this.textSpanEnd(span))));
                    if (oldImportPath === this.oldFilePathWithOutExt ){
                        // 这个脚本引用了旧的文件
                        _nextText = this._newFileDBURL;
                    } else if (utils.Path.contains(this.oldFilePath + '/', oldImportPath) ){
                        // 这个脚本引用了旧的目录里的文件
                        _nextText = oldImportPath.replace(this.oldFilePath, this._newFileDBURL);
                    } else if (oldFilePath === this.oldFilePathWithOutExt){
                        // 旧的脚本要更新引用路径了，这个时候所有相对路径全部要换成 db 协议
                        const relativePath = utils.Path.relative(this._oldFileDBInfo.target, oldImportPath);
                        _nextText = this._oldFileDBInfo.dbURL + resolveFileName( relativePath);
                    }
                }

            }
            text = `${text.substring(0, span.start)}${_nextText}${text.substring(this.textSpanEnd(span))}`;
        }
        return text; 
    }
    protected textSpanEnd(span: ts.TextSpan): number{
        return span.start + span.length;
    }
    async execute(languageServiceAdapter: LanguageServiceAdapter): Promise<Set<string>>{
        for (let index = 0; index < languageServiceAdapter.dbURLInfos.length; index++) {
            const info = languageServiceAdapter.dbURLInfos[index];
            if (utils.Path.contains(info.target, this.newFilePath)){
                this._newFileDBInfo = info;
                const relativePath = utils.Path.relative(info.target, this.newFilePath);
                this._newFileDBURL = info.dbURL + removeTSExt(resolveFileName( relativePath));
            }
            if (utils.Path.contains(info.target, this.oldFilePath) ){
                this._oldFileDBInfo = info;
                const relativePath = utils.Path.relative(info.target, this.oldFilePath);
                this._oldFileDBURL = info.dbURL + removeTSExt(resolveFileName(relativePath));

            }  
        } 

        const filePathSet = new Set<string>();

        if (!this._executed){
            const changes = languageServiceAdapter.languageService.getEditsForFileRename(this.oldFilePath, this.newFilePath, {}, undefined);
            
            for (let index = 0; index < changes.length; index++) {
                const change = changes[index];
                 
                const content = languageServiceAdapter.host.readFile(change.fileName);
                if (!content){
                    continue;
                }
                const newContent = this.applyImportChanges(languageServiceAdapter.dbURLInfos, change.fileName, content, change.textChanges);
               
                filePathSet.add(change.fileName);
                const info = languageServiceAdapter.host.readCache(change.fileName);
                asserts(info);
                languageServiceAdapter.host.writeCache({uuid: info.uuid, filePath: change.fileName, content: newContent});
            }
            
            this._executed = true;
        }
        return filePathSet;
    }

}

