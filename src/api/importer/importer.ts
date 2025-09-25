import 'reflect-metadata';
import { ApiBase } from "../base/api-base";
import { TypeCreateJsonFileResult, dirOrDbPath, dbDirResult, TypeDirOrDbPath, TypeDbDirResult, TypeJsonStr, jsonStr, createJsonFile } from "./scheme";
import { COMMON_STATUS, CommonResultType, HttpStatusCode } from "../base/scheme-base";
import { AssetManager as IAssetManager } from "../../core/assets/@types/private";
import { Description, Param, Result, Title, Tool } from '../decorator/decorator.js';
import assetOperation from '../../core/assets/manager/operation';

export class ImporterApi extends ApiBase {
    private _assetManager!: IAssetManager;

    async init(): Promise<void> {
    }

    /**
     * 删除资源
     */
    @Tool('removeAsset')
    @Title('删除资源')
    @Description('删除指定的资源，返回的 code 如果是 200 就表示操作成功')
    @Result(dbDirResult)
    async removeAsset(@Param(dirOrDbPath) dbPath: TypeDirOrDbPath): Promise<CommonResultType<TypeDbDirResult>> {
        let code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        try {
            await assetOperation.removeAsset(dbPath);
        } catch (e) {
            code = COMMON_STATUS.FAIL;
            console.error('remove asset fail:', e instanceof Error ? e.message : String(e));
        }
        return {
            code: code,
            data: { dbPath }
        };
    }

    @Tool('createJsonFile')
    @Title('创建 json 资源')
    @Description('根据传入的字符串内容，在对应项目路径创建一个 json 文件，文件路径根据 filePath 参数返回')
    @Result(createJsonFile)
    async createJsonFile(@Param(jsonStr) jsonStr: TypeJsonStr, @Param(dirOrDbPath) filePath: TypeDirOrDbPath): Promise<CommonResultType<TypeCreateJsonFileResult>> {
        const retData: TypeCreateJsonFileResult = {
            filePath: '',
            dbPath: '',
            uuid: '',
        };
        let code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        try {
            //先判断下，如果不是 json 字符串就先挂为敬
            JSON.parse(jsonStr);
            let ret = await assetOperation.createAsset({
                content: jsonStr,
                target: filePath,
                overwrite: true
            });

            if (!ret) {
                throw new Error('create json asset fail');
            }
            if (Array.isArray(ret)) {
                ret = ret[0];
            }
            retData.filePath = ret!.source;
            retData.dbPath = ret!.path;
            retData.uuid = ret!.uuid;
        } catch (e) {
            code = COMMON_STATUS.FAIL;
            console.error('create json asset fail:', e instanceof Error ? e.message : String(e));
        }

        return {
            code: code,
            data: retData
        };
    }

    /**
     * 刷新资源目录
     */
    @Tool('refreshDir')
    @Title('刷新资源目录')
    @Description('刷新资源目录，会刷新目录下的所有资源')
    @Result(dbDirResult)
    async refresh(@Param(dirOrDbPath) dir: TypeDirOrDbPath): Promise<CommonResultType<TypeDbDirResult>> {
        let code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        try {
            await assetOperation.refreshAsset(dir);
        } catch (e) {
            code = COMMON_STATUS.FAIL;
            console.error('refresh dir fail:', e);
        }

        return {
            code: code,
            data: { dbPath: dir },
        };
    }
}