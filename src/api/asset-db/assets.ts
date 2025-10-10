import { ApiBase } from '../base/api-base';
import { join } from 'path';
import {
    SchemeCreateJsonFile,
    SchemeDbDirResult,
    SchemeDirOrDbPath,
    SchemeJsonStr,
    TCreateJsonFileResult,
    TDbDirResult,
    TDirOrDbPath,
    TJsonStr
} from './importer/scheme';
import { description, param, result, title, tool } from '../decorator/decorator.js';
import { COMMON_STATUS, CommonResultType, HttpStatusCode } from '../base/scheme-base';
import assetOperation from '../../core/assets/manager/operation';

export class AssetsApi extends ApiBase {

    constructor(
        private projectPath: string
    ) {
        super();
    }

    async init(): Promise<void> {
        // 启动以及初始化资源数据库
        const { startupAssetDB } = await import('../../core/assets');
        console.log('startupAssetDB', this.projectPath);
        await startupAssetDB();
    }

    /**
     * 删除资源
     */
    @tool('assets-removeAsset')
    @title('删除项目资源')
    @description('从 Cocos Creator 项目中删除指定的资源文件。支持删除单个文件或整个目录。删除的资源会从资源数据库中移除，同时删除对应的 .meta 文件。删除操作不可逆，请谨慎使用。')
    @result(SchemeDbDirResult)
    async removeAsset(@param(SchemeDirOrDbPath) dbPath: TDirOrDbPath): Promise<CommonResultType<TDbDirResult>> {
        let code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<TDbDirResult> = {
            code: code,
            data: { dbPath },
        };

        try {
            await assetOperation.removeAsset(dbPath);
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error('remove asset fail:', e instanceof Error ? e.message : String(e));
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }

    @tool('assets-createJsonFile')
    @title('创建 JSON 资源文件')
    @description('在 Cocos Creator 项目中创建新的 JSON 资源文件。自动生成 UUID 和 .meta 文件，并将文件注册到资源数据库中。支持覆盖已存在的文件。JSON 内容必须是有效的 JSON 格式字符串。')
    @result(SchemeCreateJsonFile)
    async createJsonFile(@param(SchemeJsonStr) jsonStr: TJsonStr, @param(SchemeDirOrDbPath) filePath: TDirOrDbPath): Promise<CommonResultType<TCreateJsonFileResult>> {
        let code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<TCreateJsonFileResult> = {
            code: code,
            data: {
                filePath: '',
                dbPath: '',
                uuid: '',
            },
        };

        try {
            //先判断下，如果不是 json 字符串就先挂为敬
            JSON.parse(jsonStr);
            let result = await assetOperation.createAsset({
                content: jsonStr,
                target: filePath,
                overwrite: true
            });

            if (!result) {
                throw new Error('create json asset fail');
            }
            if (Array.isArray(result)) {
                result = result[0];
            }
            ret.data.filePath = result!.source;
            ret.data.dbPath = result!.path;
            ret.data.uuid = result!.uuid;
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error('create json asset fail:', e instanceof Error ? e.message : String(e));
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }

    /**
     * 刷新资源目录
     */
    @tool('assets-refreshDir')
    @title('刷新资源目录')
    @description('刷新 Cocos Creator 项目中的指定资源目录，重新扫描目录下的所有资源文件，更新资源数据库索引。当外部修改了资源文件或添加了新文件时，需要调用此方法同步资源状态。')
    @result(SchemeDbDirResult)
    async refresh(@param(SchemeDirOrDbPath) dir: TDirOrDbPath): Promise<CommonResultType<TDbDirResult>> {
        let code: HttpStatusCode = COMMON_STATUS.SUCCESS;
        const ret: CommonResultType<TDbDirResult> = {
            code: code,
            data: { dbPath: dir },
        };

        try {
            await assetOperation.refreshAsset(dir);
        } catch (e) {
            ret.code = COMMON_STATUS.FAIL;
            console.error('refresh dir fail:', e);
            ret.reason = e instanceof Error ? e.message : String(e);
        }

        return ret;
    }
}
