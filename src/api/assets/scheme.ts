import { z } from 'zod';

export const SchemeDirOrDbPath = z.string().min(1).describe('目录或资源的路径，可以是文件系统路径或 db:// 协议路径');
export const SchemeDbDirResult = z.object({
    dbPath: z.string().describe('操作后的资源路径，使用 db:// 协议格式'),
}).describe('资源数据库目录操作的结果');

// 资源查询相关
export const SchemeUrlOrUUIDOrPath = z.string().min(1).describe('资源的 URL、UUID 或文件路径');
export const SchemeDataKeys = z.array(z.string()).optional().describe('需要查询的资源信息字段列表');
export const SchemeQueryAssetsOption = z.object({
    ccType: z.union([z.string(), z.array(z.string())]).optional().describe('资源类型，如 "cc.ImageAsset"，可以是单个或数组'),
    isBundle: z.boolean().optional().describe('是否筛选 asset bundle 信息'),
    importer: z.union([z.string(), z.array(z.string())]).optional().describe('导入器名称，可以是单个或数组'),
    pattern: z.string().optional().describe('路径匹配模式，支持 globs 格式'),
    extname: z.union([z.string(), z.array(z.string())]).optional().describe('扩展名匹配，可以是单个或数组'),
    userData: z.record(z.string(), z.union([z.boolean(), z.string(), z.number()])).optional().describe('筛选符合指定 userData 配置的资源'),
}).optional().describe('资源查询选项');

// 资源创建相关
export const SchemeSupportCreateType = z.enum([
    'animation-clip', 'typescript', 'auto-atlas', 'effect', 'scene', 'prefab', 
    'material', 'texture-cube', 'terrain', 'physics-material', 'label-atlas', 
    'render-texture', 'animation-graph', 'animation-mask', 'animation-graph-variant', 
    'directory', 'effect-header'
]).describe('支持创建的资源处理器类型');
export const SchemeTargetPath = z.string().min(1).describe('目标路径，资源将被创建或导入到此路径');
export const SchemeAssetOperationOption = z.object({
    overwrite: z.boolean().optional().describe('是否强制覆盖已存在的文件，默认 false'),
    rename: z.boolean().optional().describe('是否自动重命名冲突文件，默认 false'),
}).optional().describe('资源操作选项');

// 资源导入相关
export const SchemeSourcePath = z.string().min(1).describe('源文件路径，要导入的资源文件位置');

// 资源保存相关
export const SchemeAssetData = z.union([z.string(), z.instanceof(Buffer)]).describe('要保存的资源数据，可以是字符串或 Buffer');

// 返回值 Schema
export const SchemeAssetInfoResult = z.any().describe('资源详细信息对象，包含名称、类型、路径、UUID 等字段');
export const SchemeAssetMetaResult = z.any().describe('资源元数据对象，包含导入配置、用户数据等');
export const SchemeCreateMapResult = z.record(z.string(), z.any()).describe('可创建资源映射表，key 为资源处理器名称');
export const SchemeAssetInfosResult = z.array(z.any()).describe('资源信息列表');
export const SchemeAssetDBInfosResult = z.array(z.any()).describe('资源数据库信息列表');
export const SchemeCreatedAssetResult = z.any().describe('创建的资源信息对象');
export const SchemeImportedAssetResult = z.any().describe('导入的资源信息对象');
export const SchemeReimportResult = z.any().nullable().describe('重新导入操作结果');
export const SchemeSaveAssetResult = z.any().describe('保存资源后的资源信息对象');

export type TDirOrDbPath = z.infer<typeof SchemeDirOrDbPath>;
export type TDbDirResult = z.infer<typeof SchemeDbDirResult>;
export type TUrlOrUUIDOrPath = z.infer<typeof SchemeUrlOrUUIDOrPath>;
export type TDataKeys = z.infer<typeof SchemeDataKeys>;
export type TQueryAssetsOption = z.infer<typeof SchemeQueryAssetsOption>;
export type TSupportCreateType = z.infer<typeof SchemeSupportCreateType>;
export type TTargetPath = z.infer<typeof SchemeTargetPath>;
export type TAssetOperationOption = z.infer<typeof SchemeAssetOperationOption>;
export type TSourcePath = z.infer<typeof SchemeSourcePath>;
export type TAssetData = z.infer<typeof SchemeAssetData>;
export type TAssetInfoResult = z.infer<typeof SchemeAssetInfoResult>;
export type TAssetMetaResult = z.infer<typeof SchemeAssetMetaResult>;
export type TCreateMapResult = z.infer<typeof SchemeCreateMapResult>;
export type TAssetInfosResult = z.infer<typeof SchemeAssetInfosResult>;
export type TAssetDBInfosResult = z.infer<typeof SchemeAssetDBInfosResult>;
export type TCreatedAssetResult = z.infer<typeof SchemeCreatedAssetResult>;
export type TImportedAssetResult = z.infer<typeof SchemeImportedAssetResult>;
export type TReimportResult = z.infer<typeof SchemeReimportResult>;
export type TSaveAssetResult = z.infer<typeof SchemeSaveAssetResult>;