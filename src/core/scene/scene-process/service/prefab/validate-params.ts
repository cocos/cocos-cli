import type { IApplyPrefabChangesParams, ICreatePrefabFromNodeParams } from '../../../common';

const PREFAB_EXTENSION = '.prefab';
const ASSET_URL_PREFIX = 'db://';

export function validateCreatePrefabParams(params: ICreatePrefabFromNodeParams): void {
    if (!params?.nodePath?.trim()) {
        throw new Error('节点路径不能为空或纯空格');
    }

    if (!params?.dbURL?.trim()) {
        throw new Error('资源URL不能为空或纯空格');
    }

    // URL 格式验证
    if (!params.dbURL.startsWith(ASSET_URL_PREFIX)) {
        throw new Error(`资源 URL 必须以 '${ASSET_URL_PREFIX}' 开头`);
    }

    if (!params.dbURL.endsWith(PREFAB_EXTENSION)) {
        throw new Error(`资源 URL 必须以 '${PREFAB_EXTENSION}' 后缀`);
    }
}

export function validateNodePathParams(params: IApplyPrefabChangesParams): void {
    if (!params?.nodePath?.trim()) {
        throw new Error('节点路径不能为空或纯空格');
    }
}