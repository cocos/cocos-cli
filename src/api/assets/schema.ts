import { z } from 'zod';
import { ASSET_HANDLER_TYPES, SUPPORT_CREATE_TYPES } from '../../core/assets/@types/interface';

// 基础类型定义
export const SchemaDirOrDbPath = z.string().min(1).describe('资源地址，可以是文件系统路径或 db:// 协议路径');
export const SchemaDbDirResult = z.object({
    dbPath: z.string().describe('操作后的资源路径，使用 db:// 协议格式'),
}).describe('资源数据库目录操作的结果');

// JSON 值类型（递归定义）
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
const SchemaJsonValue: z.ZodType<JsonValue> = z.lazy(() =>
    z.union([
        z.string(),
        z.number(),
        z.boolean(),
        z.null(),
        z.array(SchemaJsonValue),
        z.record(z.string(), SchemaJsonValue),
    ])
);

// 资源元数据 Schema
const SchemaAssetMeta: z.ZodType<any> = z.lazy(() => z.object({
    ver: z.string().describe('版本号'),
    importer: z.enum(ASSET_HANDLER_TYPES as any).describe('导入器名称，对应资源处理器类型'),
    imported: z.boolean().describe('是否已导入'),
    uuid: z.string().describe('资源唯一标识'),
    files: z.array(z.string()).describe('关联的文件列表'),
    subMetas: z.record(z.string(), SchemaAssetMeta).describe('子资源元数据映射'),
    userData: z.record(z.string(), SchemaJsonValue).describe('用户自定义数据'),
    displayName: z.string().describe('显示名称').optional(),
    id: z.string().describe('资源 ID'),
    name: z.string().describe('资源名称'),
}));

// 重定向信息 Schema
const SchemaRedirectInfo = z.object({
    type: z.string().describe('跳转资源的类型'),
    uuid: z.string().describe('跳转资源的 UUID'),
}).describe('资源重定向信息');

// 父级资源信息 Schema
const SchemaFatherInfo = z.object({
    source: z.string().describe('父级资源的 URL 地址'),
    library: z.record(z.string(), z.string()).describe('父级资源的导入资源映射表'),
    uuid: z.string().describe('父级资源的 UUID'),
}).describe('父级资源信息');

// 文件名检查配置 Schema
const SchemaFileNameCheckConfig = z.object({
    type: z.string().describe('检查类型'),
    value: z.union([z.string(), z.array(z.string())]).optional().describe('检查值'),
}).describe('文件名检查配置');

// 创建菜单信息 Schema
const SchemaCreateMenuInfo: z.ZodType<any> = z.lazy(() => z.object({
    label: z.string().describe('新建菜单名称，支持 i18n:xxx'),
    fullFileName: z.string().optional().describe('创建的默认文件名称带后缀'),
    template: z.string().optional().describe('资源文件模板地址，例如 db://xxx/ani，支持 url 与绝对路径'),
    handler: z.string().optional().describe('创建类型的 handler 名称，默认为当前处理器名称'),
    name: z.string().optional().describe('创建资源模板名称，作为创建的模板选择的唯一标识符'),
}));

// 资源数据库信息 Schema
const SchemaAssetDBInfo = z.object({
    name: z.string().describe('数据库名称'),
    target: z.string().describe('资源目录路径'),
    library: z.string().describe('库文件路径'),
    temp: z.string().describe('临时文件路径'),
    state: z.enum(['none', 'start', 'startup', 'refresh']).describe('当前数据库的启动状态'),
    visible: z.boolean().describe('数据库是否可见'),
    preImportExtList: z.array(z.string()).describe('提前预导入的资源后缀'),
    readonly: z.boolean().optional().describe('是否只读'),
}).describe('资源数据库信息');

// 完整的资源信息 Schema
const SchemaAssetInfo: z.ZodType<any> = z.lazy(() => z.object({
    // 必需字段
    name: z.string().describe('资源名字'),
    source: z.string().describe('URL 地址'),
    loadUrl: z.string().describe('loader 加载的层级地址'),
    url: z.string().describe('loader 加载地址（包含扩展名）'),
    file: z.string().describe('绝对路径'),
    uuid: z.string().describe('资源的唯一 ID'),
    importer: z.enum(ASSET_HANDLER_TYPES as any).describe('使用的导入器名字，对应资源处理器类型'),
    imported: z.boolean().describe('是否结束导入过程'),
    invalid: z.boolean().describe('是否导入成功'),
    type: z.string().describe('资源类型，如 cc.ImageAsset'),
    isDirectory: z.boolean().describe('是否是文件夹'),
    library: z.record(z.string(), z.string()).describe('导入资源的映射表'),

    // 可选字段（dataKeys 作用范围）
    isBundle: z.boolean().optional().describe('是否是 asset bundle'),
    displayName: z.string().optional().describe('资源用于显示的名字'),
    readonly: z.boolean().optional().describe('是否只读'),
    visible: z.boolean().optional().describe('是否显示'),
    subAssets: z.record(z.string(), SchemaAssetInfo).optional().describe('子资源映射表'),
    instantiation: z.string().optional().describe('虚拟资源可实例化成实体的扩展名'),
    redirect: SchemaRedirectInfo.optional().describe('跳转指向资源'),
    meta: SchemaAssetMeta.optional().describe('资源元数据'),
    fatherInfo: SchemaFatherInfo.optional().describe('父级资源信息'),
    extends: z.array(z.string()).optional().describe('资源的继承链信息'),
    mtime: z.number().optional().describe('资源文件的修改时间'),
    depends: z.array(z.string()).optional().describe('依赖的资源 UUID 列表'),
    dependeds: z.array(z.string()).optional().describe('被依赖的资源 UUID 列表'),
}));

// 资源查询相关
export const SchemaUrlOrUUIDOrPath = z.string().min(1).describe('资源的 URL、UUID 或文件路径');
export const SchemaDataKeys = z.array(z.string()).optional().describe('需要查询的资源信息字段列表');
export const SchemaQueryAssetsOption = z.object({
    ccType: z.union([z.string(), z.array(z.string())]).optional().describe('资源类型，如 "cc.ImageAsset"，可以是单个或数组'),
    isBundle: z.boolean().optional().describe('是否筛选 asset bundle 信息'),
    importer: z.union([z.string(), z.array(z.string())]).optional().describe('导入器名称，可以是单个或数组'),
    pattern: z.string().optional().describe('路径匹配模式，支持 globs 格式'),
    extname: z.union([z.string(), z.array(z.string())]).optional().describe('扩展名匹配，可以是单个或数组'),
}).optional().describe('资源查询选项');

// 资源创建相关
export const SchemaSupportCreateType = z.enum(SUPPORT_CREATE_TYPES as any).describe('支持创建的资源处理器类型');
export const SchemaTargetPath = z.string().min(1).describe('目标路径，资源将被创建或导入到此路径');
export const SchemaBaseName = z.string().min(1).describe('基础名称，资源将被创建或导入到此名称');
export const SchemaAssetOperationOption = z.object({
    overwrite: z.boolean().optional().describe('是否强制覆盖已存在的文件，默认 false'),
    rename: z.boolean().optional().describe('是否自动重命名冲突文件，默认 false'),
}).optional().describe('资源操作选项');

export const SchemaCreateAssetByTypeOptions = z.object({
    overwrite: z.boolean().optional().describe('是否强制覆盖已存在的文件，默认 false'),
    rename: z.boolean().optional().describe('是否自动重命名冲突文件，默认 false'),
    templateName: z.string().optional().describe('指定的模板名称，默认为 default'),
    content: z.union([z.string(), z.instanceof(Buffer)]).optional().describe('资源内容，当 content 与 template 都传递时，优先使用 content 创建文件'),
}).optional().describe('按类型创建资源选项');

export const SchemaCreateAssetOptions = z.object({
    overwrite: z.boolean().optional().describe('是否强制覆盖已存在的文件，默认 false'),
    rename: z.boolean().optional().describe('是否自动重命名冲突文件，默认 false'),
    content: z.union([z.string(), z.instanceof(Buffer)]).optional().describe('资源内容，当 content 与 template 都传递时，优先使用 content 创建文件'),
    target: z.string().describe('资源创建的输出地址，支持绝对路径和 url'),
    template: z.string().optional().describe('资源文件模板地址，例如 db://xxx/ani，支持 url 与绝对路径'),
    uuid: z.string().optional().describe('指定 uuid ，由于 uuid 也有概率冲突，uuid 冲突时会自动重新分配 uuid'),
    userData: z.record(z.string(), SchemaJsonValue).optional().describe('新建资源时指定的一些 userData 默认配置值'),
    customOptions: z.record(z.string(), SchemaJsonValue).optional().describe('传递一些自定义配置信息，可以在自定义资源处理器内使用'),
}).describe('创建资源选项');

// 资源导入相关
export const SchemaSourcePath = z.string().min(1).describe('源文件路径，要导入的资源文件位置');

// 资源保存相关
export const SchemaAssetData = z.string().describe('要保存的资源数据，可以是字符串或 Buffer');

// 返回值 Schema
export const SchemaAssetInfoResult = SchemaAssetInfo.nullable().describe('资源详细信息对象，包含名称、类型、路径、UUID 等字段');
export const SchemaAssetMetaResult = SchemaAssetMeta.nullable().describe('资源元数据对象，包含导入配置、用户数据等');
export const SchemaCreateMapResult = z.array(SchemaCreateMenuInfo).describe('可创建资源菜单列表');
export const SchemaAssetInfosResult = z.array(SchemaAssetInfo).describe('资源信息列表');
export const SchemaAssetDBInfosResult = z.array(SchemaAssetDBInfo).describe('资源数据库信息列表');
export const SchemaCreatedAssetResult = SchemaAssetInfo.nullable().describe('创建的资源信息对象');
export const SchemaImportedAssetResult = z.array(SchemaAssetInfo).describe('导入的资源信息数组，当导入文件夹时会包含文件夹及其所有子资源的信息');
export const SchemaReimportResult = z.null().describe('重新导入操作结果（无返回值）');
export const SchemaSaveAssetResult = SchemaAssetInfo.nullable().describe('保存资源后的资源信息对象');
export const SchemaRefreshDirResult = z.null().describe('刷新资源目录结果');

export type TDirOrDbPath = z.infer<typeof SchemaDirOrDbPath>;
export type TBaseName = z.infer<typeof SchemaBaseName>;
export type TDbDirResult = z.infer<typeof SchemaDbDirResult>;
export type TUrlOrUUIDOrPath = z.infer<typeof SchemaUrlOrUUIDOrPath>;
export type TDataKeys = z.infer<typeof SchemaDataKeys>;
export type TQueryAssetsOption = z.infer<typeof SchemaQueryAssetsOption> | undefined;
export type TSupportCreateType = z.infer<typeof SchemaSupportCreateType>;
export type TTargetPath = z.infer<typeof SchemaTargetPath>;
export type TAssetOperationOption = z.infer<typeof SchemaAssetOperationOption> | undefined;
export type TSourcePath = z.infer<typeof SchemaSourcePath>;
export type TAssetData = z.infer<typeof SchemaAssetData>;
export type TAssetInfoResult = z.infer<typeof SchemaAssetInfoResult>;
export type TAssetMetaResult = z.infer<typeof SchemaAssetMetaResult>;
export type TCreateMapResult = z.infer<typeof SchemaCreateMapResult>;
export type TAssetInfosResult = z.infer<typeof SchemaAssetInfosResult>;
export type TAssetDBInfosResult = z.infer<typeof SchemaAssetDBInfosResult>;
export type TCreatedAssetResult = z.infer<typeof SchemaCreatedAssetResult>;
export type TCreateAssetByTypeOptions = z.infer<typeof SchemaCreateAssetByTypeOptions>;
export type TCreateAssetOptions = z.infer<typeof SchemaCreateAssetOptions>;
export type TImportedAssetResult = z.infer<typeof SchemaImportedAssetResult>;
export type TReimportResult = z.infer<typeof SchemaReimportResult>;
export type TSaveAssetResult = z.infer<typeof SchemaSaveAssetResult>;
export type TRefreshDirResult = z.infer<typeof SchemaRefreshDirResult>;