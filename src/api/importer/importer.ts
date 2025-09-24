import 'reflect-metadata';
import { ApiBase } from "../base/api-base";
import { TypeUriPath, uriPath, queryResult, TypeQueryResult, TypeCreateJsonFileResult   , dirOrDbPath, refreshDirResult, TypeDirOrDbPath, TypeRefreshDirResult, TypeJsonStr, jsonStr, createJsonFile } from "./importer-scheme";
import { COMMON_STATUS, CommonResultType, HttpStatusCode } from "../base/scheme-base";
import { IAssetInfo, AssetManager as IAssetManager } from "../../core/assets/@types/private";
import { Description, Param, Result, Title, Tool } from '../decorator/decorator.js';
import assetOperation from '../../core/assets/manager/operation';

export class ImporterApi extends ApiBase {
    private _assetManager!: IAssetManager;

    async init(): Promise<void> {
    }

    /**
     * 刷新资源
     * @title sss
     * @tool xxx
     * @result {}
     */
    @Tool('queryUrl')
    @Title('获取文件路径的 url')
    @Description('根据某个路径转化为 url，返回的是文件的 db 路径，类似db://assets/abc.png')
    @Result(queryResult)
    async queryUrl(@Param(uriPath) path: TypeUriPath): Promise<CommonResultType<TypeQueryResult>> {
        try {
            // await startupAssetDB();
            const url = `db://just/a/test/${path}.png`
            return {
                code: COMMON_STATUS.SUCCESS,
                data: { url },
            };
        } catch (error) {
            console.error('刷新资源失败:', error);
            return {
                code: COMMON_STATUS.FAIL,
                data: { url: '' },
            };
        }
    }
    /**
     * 刷新资源
     */
    @Tool('queryUrl2')
    @Title('获取文件路径的 url2')
    @Description('2根据某个路径转化为 url，返回的是文件的 db 路径，类似db://assets/abc.png')
    @Result(queryResult)
    async queryUrl2(@Param(uriPath) path: TypeUriPath): Promise<CommonResultType<TypeQueryResult>> {
        try {
            // await startupAssetDB();
            const url = `db://just/b/test/${path}.png`
            return {
                code: COMMON_STATUS.SUCCESS,
                data: { url },
            };
        } catch (error) {
            console.error('刷新资源失败:', error);
            return {
                code: COMMON_STATUS.FAIL,
                data: { url: '' },
            };
        }
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
    @Result(refreshDirResult)
    async refresh(@Param(dirOrDbPath) dir: TypeDirOrDbPath): Promise<CommonResultType<TypeRefreshDirResult>> {
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