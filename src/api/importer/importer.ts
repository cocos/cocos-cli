import 'reflect-metadata';
import { startupAssetDB } from "../../core/assets";
import { ApiBase } from "../base/api-base";
import { TypeUriPath, uriPath, queryResult, TypeQueryResult } from "./importer-scheme";
import { COMMON_STATUS, CommonResultType } from "../base/scheme-base";
import { join } from "path";
import { AssetManager as IAssetManager } from "../../core/assets/@types/private";
import { Description, Param, Result, Title, Tool } from '../decorator/decorator.js';

export class ImporterApi extends ApiBase {
    private _assetManager!: IAssetManager;

    async init(): Promise<void> {
        // this._assetManager = (await import('../../core/assets/manager')).assetManager;
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
                data: {url},
            };
        } catch (error) {
            console.error('刷新资源失败:', error);
            return {
                code: COMMON_STATUS.FAIL,
                data: {url: ''},
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
                data: {url},
            };
        } catch (error) {
            console.error('刷新资源失败:', error);
            return {
                code: COMMON_STATUS.FAIL,
                data: {url: ''},
            };
        }
    }
}