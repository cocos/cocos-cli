import { z } from 'zod';

export const SchemaAssetUrlOrUUID = z.string().describe('使用 db:// 协议格式或者 UUID');

export const SchemaSceneIdentifier = z.object({
    assetName: z.string().describe('场景/预制体资源名称'),
    assetUuid: z.string().describe('场景/预制体资源唯一标识符 UUID'),
    assetUrl: z.string().describe('场景/预制体资源使用 db:// 协议格式'),
    assetType: z.string().describe('场景/预制体资源类型'),
}).describe('场景/预制体基础信息');

// 当前组件信息
export const SchemaComponentIdentifier = z.object({
    cid: z.string().describe('组件标识符'),
    path: z.string().describe('返回组件的路径，包含节点路径'),
    uuid: z.string().describe('组件的uuid'),
    name: z.string().describe('组件名称'),
    type: z.string().describe('组件类型'),
    enabled: z.boolean().describe('组件是否使能'),
}).describe('组件的基本信息');

export const SchemaNodeIdentifier = z.object({
    nodeId: z.string().describe('节点的 id'),
    path: z.string().describe('父节点路径，完整节点路径为父路径+节点名；根节点路径为 "/"'),
    name: z.string().describe('节点名称'),
}).describe('节点标识符');
