
// 创建预制体参数
export interface ICreatePrefabFromNodeParams {
    /** 要转换为预制体的源节点路径 */
    nodePath: string;
    /** 预制体资源保存 URL */
    dbURL: string;
    /** 是否强制覆盖现有资源 */
    overwrite?: boolean;
}

// 应用修改参数
export interface IApplyPrefabChangesParams {
    nodePath: string;
}

// 重置参数
export interface IRevertToPrefabParams {
    nodePath: string;
}

// 解耦参数
export interface IUnpackPrefabInstanceParams {
    /** 要解耦的预制体实例节点 */
    nodePath: string;
    /** 递归解耦所有子预制体 */
    recursive?: boolean;
}

// 查询参数接口
export interface IIsPrefabInstanceParams {
    nodePath: string;
}

// 获取节点的预制体信息参数接口
export interface IGetPrefabInfoParams {
    nodePath: string;
}
