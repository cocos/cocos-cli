import { SCENE_TEMPLATE_TYPE } from '../../core/scene';
import { z } from 'zod';
import { SchemaNode, SchemaNodeQueryResult } from './node-schema';
import { SchemaSceneIdentifier, SchemaComponentIdentifier } from '../base/schema-identifier';
import { SchemaSaveAssetResult } from '../assets/schema';
import { SchemaPrefabInfo } from './prefab-info-schema';
import { SchemaUrlOrUUID } from '../base/schema-identifier';

const SchemaScene = SchemaSceneIdentifier.extend({
    name: z.string().describe('Scene/Prefab Name'), // 场景/预制体名称
    prefab: z.union([SchemaPrefabInfo, z.null()]).describe('Prefab Info'), // 预制体信息
    children: z.array(z.lazy(() => SchemaNodeQueryResult)).optional().default([]).describe('Children List'), // 子节点列表
    components: z.array(SchemaComponentIdentifier).default([]).describe('Component List'), // 节点上的组件列表
}).describe('Scene/Prefab Info'); // 场景/预制体信息

export const SchemaCurrentResult = z.union([SchemaScene, SchemaNode]).nullable().describe('Get Scene/Prefab Return Data'); // 获取场景/预制体返回数据

export const SchemaOpenResult = z.union([SchemaScene, SchemaNode]).describe('Open Scene/Prefab Result Info'); // 打开场景/预制体操作的结果信息

export const SchemaCloseResult = z.boolean().describe('Close Scene/Prefab Result'); // 关闭场景/预制体结果

export const SchemaSaveResult = SchemaSaveAssetResult.describe('Save Scene/Prefab Result'); // 保存场景/预制体结果

import { ReloadResult } from '../../core/scene/common/editor/type';

export const SchemaReload = z.nativeEnum(ReloadResult).describe('Reload Scene/Prefab Result'); // 重载场景/预制体结果

export const SchemaCreateOptions = z.object({
    baseName: z.string().describe('Asset Name'), // 资源名称
    templateType: z.enum(SCENE_TEMPLATE_TYPE).optional().describe('Scene Template Type (Optional, only effective for scene asset type)'), // 场景模板类型（可选，资源类型为场景才生效）
    dbURL: z.string().describe('Target directory for storing asset files, e.g., db://assets'), // 目标目录用于存放资源文件，例如 db://assets
}).describe('Create Scene/Prefab Parameters'); // 创建场景/预制体参数

export const SchemaCreateResult = SchemaSceneIdentifier.describe('Create Scene/Prefab Result Info'); // 创建场景/预制体操作的结果信息

export type TAssetUrlOrUUID = z.infer<typeof SchemaUrlOrUUID>;
export type TCurrentResult = z.infer<typeof SchemaCurrentResult>;
export type TOpenResult = z.infer<typeof SchemaOpenResult>;
export type TCloseResult = z.infer<typeof SchemaCloseResult>;
export type TSaveResult = z.infer<typeof SchemaSaveResult>;
export type TReload = z.infer<typeof SchemaReload>;
export type TCreateOptions = z.infer<typeof SchemaCreateOptions>;
export type TCreateResult = z.infer<typeof SchemaCreateResult>;
