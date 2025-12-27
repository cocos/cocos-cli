import { z } from 'zod';

export const SchemaAssetUrlOrUUID = z.string().describe('Use db:// protocol format or UUID'); // 使用 db:// 协议格式或者 UUID

export const SchemaSceneIdentifier = z.object({
    assetName: z.string().describe('Scene or Prefab asset name'), // 场景/预制体资源名称
    assetUuid: z.string().describe('Scene or Prefab asset unique identifier UUID'), // 场景/预制体资源唯一标识符 UUID
    assetUrl: z.string().describe('Scene or Prefab asset uses db:// protocol format'), // 场景/预制体资源使用 db:// 协议格式
    assetType: z.string().describe('Scene or Prefab asset type'), // 场景/预制体资源类型
}).describe('Scene or Prefab basic information'); // 场景/预制体基础信息

// Current component information 当前组件信息
export const SchemaComponentIdentifier = z.object({
    cid: z.string().describe('Component identifier'), // 组件标识符
    path: z.string().describe('Return component path, including node path'), // 返回组件的路径，包含节点路径
    uuid: z.string().describe('Component UUID'), // 组件的uuid
    name: z.string().describe('Component name'), // 组件名称
    type: z.string().describe('Component type'), // 组件类型
    enabled: z.boolean().describe('Whether the component is enabled'), // 组件是否使能
}).describe('Component basic information'); // 组件的基本信息

export const SchemaNodeIdentifier = z.object({
    nodeId: z.string().describe('Node ID'), // 节点的 id
    path: z.string().describe('Parent node path, full node path is parent path + node name; root node path is "/"'), // 父节点路径，完整节点路径为父路径+节点名；根节点路径为 "/"
    name: z.string().describe('Node name'), // 节点名称
}).describe('Node identifier'); // 节点标识符
