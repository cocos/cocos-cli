import { AssetInfo, AssetDBOptions, ExecuteAssetDBScriptMethodOptions, IAssetInfo } from '../public';
import { message as publicMessage } from '../message';
import { IData } from '@editor/asset-db/libs/data';
import { MissingAssetInfo } from '@editor/asset-db/libs/info';
import { CreateAssetDialogOptions, CreateAssetOptions, IAssetConfig, ICONConfig, ICreateMenuInfo, ThumbnailInfo, ThumbnailSize } from './asset-handler';
import { IMessage } from '../protected';

export interface message extends publicMessage {
    /**
     * 查询已被删除的资源信息
     */
    'query-missing-asset-info': {
        params: [
            urlOrPath: string, // uuid | path
        ],
        result: MissingAssetInfo | null,
    },
    'query-asset-mtime': {
        params: [
            string
        ],
        result: string | null,
    },
    /**
     * 查询资源的 data 信息
     */
    'query-asset-data': {
        params: [
            string
        ],
        result: IData | null,
    },
    /**
     * 检查刷新所有的数据库
     */
    'refresh': {
        params: [],
        result: void,
    },
    /**
     * 检查是否已有资源处理任务
     */
    'is-busy': {
        params: [],
        result: boolean,
    },
    /**
     * 暂停资源处理
     */
    'pause': {
        params: [
            string,
        ],
        result: boolean,
    },
    /**
     * 恢复资源处理
     */
    'resume': {
        params: [],
        result: boolean,
    },
    'open-devtools': {
        params: [],
        result: void,
    },
    /**
     * 查询指定名称的数据库信息
     * @name 数据库名称
     */
    'query-db-info': {
        params: [
            string,
        ],
        result: AssetDBOptions,
    },
    /**
     * 查询当前所有数据库信息
     */
    'query-db-infos': {
        params: [],
        result: AssetDBOptions[],
    },
    /**
     * 查询所有的数据库名称列表
     */
    'query-db-list': {
        params: [],
        result: string[],
    },
    /**
     * 指定类型弹出创建资源的对话框
     * @param option CreateAssetDialogOptions
     */
    'create-asset-dialog': {
        params: [
            option: CreateAssetDialogOptions
        ],
        result: AssetInfo | null,
    },
    /**
     * 将一个虚拟资源实例化成一个实体资源
     * @param source 需要实例化的虚拟资源
     * @param target 生成到到某个路径内
     */
    'init-asset': {
        params: [
            string,
            string,
        ],
        result: AssetInfo | null,
    },
    /**
     * 查询出所有的 importer
     */
    'query-all-importer': {
        params: [],
        result: string[],
    },
    /**
     * 查询出所有的 assetTypes
     */
    'query-all-asset-types': {
        params: [],
        result: string[],
    },
    /**
     * 执行指定的 db 脚本
     */
    'execute-script': {
        params: [ExecuteAssetDBScriptMethodOptions];
        result: any;
    },
    'query-create-menu-list': {
        params: [],
        result: ICreateMenuInfo[];
    },
    'query-asset-thumbnail': {
        params: [uuid: string, size?: number | ThumbnailSize],
        result: ThumbnailInfo;
    },
    'query-icon-config-map': {
        params: [],
        result: Record<string, ICONConfig>;
    },
    'query-asset-config-map': {
        params: [],
        result: Record<string, IAssetConfig>;
    },
    'new-asset': {
        params: [options: CreateAssetOptions],
        result: AssetInfo | null;
    },
    /**
     * 执行资源处理器内定义的自定义消息操作
     */
    'execute-custom-operation': {
        params: [handlerName: string, operate: string, ...args: any[]],
        result: any;
    },
    /**
     * 批量消息
     * @param messageList 需要批量操作的消息，可能是一个消息也可能是多个
     * @param parallelism 是否支持并行操作
     */
    'batch-message-handler': {
        params: [
            messageList: IMessage[],
            parallelism?: boolean,
        ],
        result: any[];
    }
}
