import { SCENE_TEMPLATE_TYPE } from '../../core/scene';
import { z } from 'zod';
import { SchemaNode, SchemaNodeQueryResult } from './node-schema';
import { SchemaSceneIdentifier, SchemaComponentIdentifier } from '../base/schema-identifier';
import { SchemaSaveAssetResult } from '../assets/schema';
import { SchemaPrefabInfo } from './prefab-info-schema';
import { SchemaAssetUrlOrUUID } from '../base/schema-identifier';

const SchemaScene = SchemaSceneIdentifier.extend({
    name: z.string().describe('场景/预制体名称'),
    prefab: z.union([SchemaPrefabInfo, z.null()]).describe('预制体信息'),
    children: z.array(z.lazy(() => SchemaNodeQueryResult)).optional().default([]).describe('子节点列表'),
    components: z.array(SchemaComponentIdentifier).default([]).describe('节点上的组件列表'),
}).describe('场景/预制体信息');

export const SchemaCurrentResult = z.union([SchemaScene, SchemaNode]).nullable().describe('获取场景/预制体返回数据');

export const SchemaOpenResult = z.union([SchemaScene, SchemaNode]).describe('打开场景/预制体操作的结果信息');

export const SchemaCloseResult = z.boolean().describe('关闭场景/预制体结果');

export const SchemaSaveResult = SchemaSaveAssetResult.describe('保存场景/预制体结果');

export const SchemaReload = z.boolean().describe('重载场景/预制体是否成功');

export const SchemaCreateOptions = z.object({
    baseName: z.string().describe('资源名称'),
    templateType: z.enum(SCENE_TEMPLATE_TYPE).optional().describe('场景模板类型（可选，资源类型为场景才生效）'),
    dbURL: z.string().describe('目标目录用于存放资源文件，例如 db://assets'),
}).describe('创建场景/预制体参数');

export const SchemaCreateResult = SchemaSceneIdentifier.describe('创建场景/预制体操作的结果信息');

export type TAssetUrlOrUUID = z.infer<typeof SchemaAssetUrlOrUUID>;
export type TCurrentResult = z.infer<typeof SchemaCurrentResult>;
export type TOpenResult = z.infer<typeof SchemaOpenResult>;
export type TCloseResult = z.infer<typeof SchemaCloseResult>;
export type TSaveResult = z.infer<typeof SchemaSaveResult>;
export type TReload = z.infer<typeof SchemaReload>;
export type TCreateOptions = z.infer<typeof SchemaCreateOptions>;
export type TCreateResult = z.infer<typeof SchemaCreateResult>;
