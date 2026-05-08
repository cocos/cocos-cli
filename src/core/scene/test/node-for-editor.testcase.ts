/*
 * TODO(qgh):理论上不应该放在这里测试，因为这些接口不是通过proxy调用的
  而是直接通过service调用的。因为目前还未实现service接口的直接测试，因此是简单的实现。
  后续需要迁移
 */
import {
    type ICreateByNodeTypeParams,
    type IQueryNodeParams,
    type INode,
    type INodeForEditor,
    type ISetPropertyOptionsForEditor,
    NodeType,
} from '../common';
import { type ISceneForEditor } from '../common/editor/scene';
import { NodeProxy } from '../main-process/proxy/node-proxy';
import { EditorProxy } from '../main-process/proxy/editor-proxy';
import { Rpc } from '../main-process/rpc';
import { SceneTestEnv } from './scene-test-env';

// 这些接口未在 IPublicNodeService 中暴露，测试中直接通过 RPC 调用
const rpcRequest = (method: string, args?: any[]) =>
    (Rpc.getInstance() as any).request('Node', method, args);

function queryNodeDump(path: string): Promise<INodeForEditor | null> {
    return rpcRequest('query', [path]);
}

function setNodeProperty(options: ISetPropertyOptionsForEditor): Promise<boolean> {
    return rpcRequest('setProperty', [options]);
}

function previewSetNodeProperty(options: ISetPropertyOptionsForEditor): Promise<boolean> {
    return rpcRequest('previewSetProperty', [options]);
}

function cancelPreviewSetNodeProperty(options: ISetPropertyOptionsForEditor): Promise<boolean> {
    return rpcRequest('cancelPreviewSetProperty', [options]);
}

function resetNode(path: string): Promise<boolean> {
    return rpcRequest('reset', [path]);
}

function resetNodeProperty(options: ISetPropertyOptionsForEditor): Promise<boolean> {
    return rpcRequest('resetProperty', [options]);
}

function updateNodePropertyFromNull(options: ISetPropertyOptionsForEditor): Promise<boolean> {
    return rpcRequest('updatePropertyFromNull', [options]);
}

function setNodeAndChildrenLayer(options: ISetPropertyOptionsForEditor): Promise<void> {
    return rpcRequest('setNodeAndChildrenLayer', [options]);
}

describe('Node ForEditor 接口测试', () => {
    let testNode: INode | null = null;
    let testNodeUuid = '';
    const testNodeName = 'DumpTestNode';

    beforeAll(async () => {
        await EditorProxy.open({
            urlOrUUID: SceneTestEnv.sceneURL,
        });
        const params: ICreateByNodeTypeParams = {
            path: '/',
            name: testNodeName,
            nodeType: NodeType.EMPTY,
        };
        testNode = await NodeProxy.createByType(params);
        expect(testNode).toBeDefined();

        // 通过 queryNode 获取节点 UUID
        const queryParams: IQueryNodeParams = {
            path: testNode!.path,
            queryChildren: false,
            queryComponent: false,
        };
        const nodeInfo = await NodeProxy.query(queryParams) as INode | null;
        expect(nodeInfo).not.toBeNull();
        testNodeUuid = nodeInfo!.nodeId;
    });

    afterAll(async () => {
        if (testNode) {
            await NodeProxy.delete({ path: testNode.path, keepWorldTransform: false });
        }
        await EditorProxy.close({
            urlOrUUID: SceneTestEnv.sceneURL,
        });
    });

    describe('1. query - 查询节点 dump 数据', () => {
        it('query - 查询有效节点返回 dump 数据', async () => {
            const dump = await queryNodeDump(testNode!.path);
            expect(dump).not.toBeNull();
            expect(dump).toBeDefined();
        });

        it('query - dump 包含必要字段', async () => {
            const dump = await queryNodeDump(testNode!.path) as INodeForEditor;
            expect(dump).not.toBeNull();

            // 基本属性字段
            expect(dump.name).toBeDefined();
            expect(dump.name.value).toBe(testNodeName);
            expect(dump.active).toBeDefined();
            expect(dump.active.value).toBe(true);
            expect(dump.position).toBeDefined();
            expect(dump.rotation).toBeDefined();
            expect(dump.scale).toBeDefined();
            expect(dump.layer).toBeDefined();
            expect(dump.uuid).toBeDefined();

            // 结构字段
            expect(dump.__comps__).toBeDefined();
            expect(Array.isArray(dump.__comps__)).toBe(true);
            expect(dump.__type__).toBeDefined();
        });

        it('query - 查询不存在的节点返回 null', async () => {
            const dump = await queryNodeDump('non-existent-path');
            expect(dump).toBeNull();
        });

        it('query - 不传参数返回根节点 dump 数据', async () => {
            const dump = await rpcRequest('query', []);
            expect(dump).not.toBeNull();
            const sceneResult = dump as ISceneForEditor;
            expect(sceneResult.__type__).toBeDefined();
            expect(sceneResult.uuid).toBeDefined();
            expect(Array.isArray(sceneResult.children)).toBe(true);
        });
    });

    describe('2. setProperty - 设置节点属性', () => {
        it('setProperty - 修改节点位置', async () => {
            // 先获取当前 dump 作为模板
            const dump = await queryNodeDump(testNode!.path) as INodeForEditor;
            const positionDump = { ...dump.position, value: { x: 100, y: 200, z: 0 } };

            const options: ISetPropertyOptionsForEditor = {
                nodePath: testNode!.path,
                path: 'position',
                dump: positionDump,
            };
            const result = await setNodeProperty(options);
            expect(result).toBe(true);

            // 验证修改生效
            const updatedDump = await queryNodeDump(testNode!.path) as INodeForEditor;
            expect(updatedDump.position.value).toEqual({ x: 100, y: 200, z: 0 });
        });

        it('setProperty - 修改节点名称', async () => {
            const dump = await queryNodeDump(testNode!.path) as INodeForEditor;
            const nameDump = { ...dump.name, value: 'RenamedNode' };

            const result = await setNodeProperty({
                nodePath: testNode!.path,
                path: 'name',
                dump: nameDump,
            });
            expect(result).toBe(true);

            const updatedDump = await queryNodeDump(testNode!.path) as INodeForEditor;
            expect(updatedDump.name.value).toBe('RenamedNode');

            // 还原名称
            const restoreDump = { ...updatedDump.name, value: testNodeName };
            await setNodeProperty({
                nodePath: testNode!.path,
                path: 'name',
                dump: restoreDump,
            });
        });

        it('setProperty - 修改节点 active 状态', async () => {
            const dump = await queryNodeDump(testNode!.path) as INodeForEditor;
            const activeDump = { ...dump.active, value: false };

            const result = await setNodeProperty({
                nodePath: testNode!.path,
                path: 'active',
                dump: activeDump,
            });
            expect(result).toBe(true);

            const updatedDump = await queryNodeDump(testNode!.path) as INodeForEditor;
            expect(updatedDump.active.value).toBe(false);

            // 还原
            await setNodeProperty({
                nodePath: testNode!.path,
                path: 'active',
                dump: { ...updatedDump.active, value: true },
            });
        });

        it('setProperty - 修改节点缩放', async () => {
            const dump = await queryNodeDump(testNode!.path) as INodeForEditor;
            const scaleDump = { ...dump.scale, value: { x: 2, y: 2, z: 2 } };

            const result = await setNodeProperty({
                nodePath: testNode!.path,
                path: 'scale',
                dump: scaleDump,
            });
            expect(result).toBe(true);

            const updatedDump = await queryNodeDump(testNode!.path) as INodeForEditor;
            expect(updatedDump.scale.value).toEqual({ x: 2, y: 2, z: 2 });

            // 还原
            await setNodeProperty({
                nodePath: testNode!.path,
                path: 'scale',
                dump: { ...updatedDump.scale, value: { x: 1, y: 1, z: 1 } },
            });
        });

        it('setProperty - 不存在的节点返回 false', async () => {
            const dump = await queryNodeDump(testNode!.path) as INodeForEditor;
            const result = await setNodeProperty({
                nodePath: 'non-existent-path',
                path: 'position',
                dump: dump.position,
            });
            expect(result).toBe(false);
        });
    });

    describe('3. previewSetProperty / cancelPreviewSetProperty - 预览与取消', () => {
        let labelNodeUuid = '';
        let labelNode: INode | null = null;

        beforeAll(async () => {
            // 创建 Label 节点，自带组件，适合测试多层路径的预览
            labelNode = await NodeProxy.createByType({
                path: '/',
                name: 'PreviewTestLabel',
                nodeType: NodeType.LABEL,
            });
            expect(labelNode).toBeDefined();

            const nodeInfo = await NodeProxy.query({
                path: labelNode!.path,
                queryChildren: false,
                queryComponent: false,
            }) as INode | null;
            labelNodeUuid = nodeInfo!.nodeId;
        });

        afterAll(async () => {
            if (labelNode) {
                await NodeProxy.delete({ path: labelNode.path, keepWorldTransform: false });
            }
        });

        it('预览修改组件属性后取消，值应恢复', async () => {
            // 获取原始 dump，找到 Label 组件的 string 属性
            const originalDump = await queryNodeDump(labelNode!.path) as INodeForEditor;
            expect(originalDump.__comps__.length).toBeGreaterThan(0);

            // 找到 cc.Label 组件的索引（通常在 UITransform 之后）
            let labelCompIndex = -1;
            for (let i = 0; i < originalDump.__comps__.length; i++) {
                const comp = originalDump.__comps__[i];
                if (comp.type === 'cc.Label') {
                    labelCompIndex = i;
                    break;
                }
            }
            expect(labelCompIndex).toBeGreaterThanOrEqual(0);

            const labelComp = originalDump.__comps__[labelCompIndex];
            const compValue = labelComp.value as Record<string, any>;
            const originalString = compValue['string'].value;
            const stringDump = { ...compValue['string'], value: 'preview-test-value' };
            const previewPath = `__comps__.${labelCompIndex}.string`;

            // 预览修改
            const previewResult = await previewSetNodeProperty({
                nodePath: labelNode!.path,
                path: previewPath,
                dump: stringDump,
            });
            expect(previewResult).toBe(true);

            // 验证预览已生效
            const previewedDump = await queryNodeDump(labelNode!.path) as INodeForEditor;
            const previewedComp = previewedDump.__comps__[labelCompIndex].value as Record<string, any>;
            expect(previewedComp['string'].value).toBe('preview-test-value');

            // 取消预览
            const cancelResult = await cancelPreviewSetNodeProperty({
                nodePath: labelNode!.path,
                path: previewPath,
                dump: stringDump,
            });
            expect(cancelResult).toBe(true);

            // 验证已恢复原值
            const restoredDump = await queryNodeDump(labelNode!.path) as INodeForEditor;
            const restoredComp = restoredDump.__comps__[labelCompIndex].value as Record<string, any>;
            expect(restoredComp['string'].value).toBe(originalString);
        });

        it('预览修改后正式提交，值应保留', async () => {
            const originalDump = await queryNodeDump(labelNode!.path) as INodeForEditor;

            let labelCompIndex = -1;
            for (let i = 0; i < originalDump.__comps__.length; i++) {
                if (originalDump.__comps__[i].type === 'cc.Label') {
                    labelCompIndex = i;
                    break;
                }
            }
            expect(labelCompIndex).toBeGreaterThanOrEqual(0);

            const compValue = originalDump.__comps__[labelCompIndex].value as Record<string, any>;
            const stringDump = { ...compValue['string'], value: 'committed-value' };
            const previewPath = `__comps__.${labelCompIndex}.string`;

            // 预览修改
            await previewSetNodeProperty({
                nodePath: labelNode!.path,
                path: previewPath,
                dump: stringDump,
            });

            // 正式提交相同的值
            const commitResult = await setNodeProperty({
                nodePath: labelNode!.path,
                path: previewPath,
                dump: stringDump,
            });
            expect(commitResult).toBe(true);

            // 验证值已保留
            const committedDump = await queryNodeDump(labelNode!.path) as INodeForEditor;
            const committedComp = committedDump.__comps__[labelCompIndex].value as Record<string, any>;
            expect(committedComp['string'].value).toBe('committed-value');
        });
    });

    describe('4. reset - 重置节点变换', () => {
        it('reset - 修改后重置，变换属性恢复默认', async () => {
            // 先修改位置和缩放
            const dump = await queryNodeDump(testNode!.path) as INodeForEditor;
            await setNodeProperty({
                nodePath: testNode!.path,
                path: 'position',
                dump: { ...dump.position, value: { x: 100, y: 200, z: 300 } },
            });
            await setNodeProperty({
                nodePath: testNode!.path,
                path: 'scale',
                dump: { ...dump.scale, value: { x: 5, y: 5, z: 5 } },
            });

            // 重置节点
            const result = await resetNode(testNode!.path);
            expect(result).toBe(true);

            // 验证变换属性恢复默认
            const resetDump = await queryNodeDump(testNode!.path) as INodeForEditor;
            expect(resetDump.position.value).toEqual({ x: 0, y: 0, z: 0 });
            expect(resetDump.scale.value).toEqual({ x: 1, y: 1, z: 1 });
        });
    });

    describe('5. resetProperty - 重置单个属性', () => {
        it('resetProperty - 重置位置属性', async () => {
            // 先修改位置
            const dump = await queryNodeDump(testNode!.path) as INodeForEditor;
            await setNodeProperty({
                nodePath: testNode!.path,
                path: 'position',
                dump: { ...dump.position, value: { x: 42, y: 42, z: 42 } },
            });

            // 重置 position
            const result = await resetNodeProperty({
                nodePath: testNode!.path,
                path: 'position',
                dump: dump.position,
            });
            expect(result).toBe(true);

            const resetDump = await queryNodeDump(testNode!.path) as INodeForEditor;
            expect(resetDump.position.value).toEqual({ x: 0, y: 0, z: 0 });
        });

        it('resetProperty - 重置缩放属性', async () => {
            const dump = await queryNodeDump(testNode!.path) as INodeForEditor;
            await setNodeProperty({
                nodePath: testNode!.path,
                path: 'scale',
                dump: { ...dump.scale, value: { x: 3, y: 3, z: 3 } },
            });

            const result = await resetNodeProperty({
                nodePath: testNode!.path,
                path: 'scale',
                dump: dump.scale,
            });
            expect(result).toBe(true);

            const resetDump = await queryNodeDump(testNode!.path) as INodeForEditor;
            expect(resetDump.scale.value).toEqual({ x: 1, y: 1, z: 1 });
        });
    });

    describe('6. setNodeAndChildrenLayer - 递归设置 layer', () => {
        let parentNode: INode | null = null;
        let childNode: INode | null = null;
        let parentUuid = '';
        let childUuid = '';

        beforeAll(async () => {
            // 创建父节点
            parentNode = await NodeProxy.createByType({
                path: '/',
                name: 'LayerParent',
                nodeType: NodeType.EMPTY,
            });
            expect(parentNode).toBeDefined();

            // 创建子节点
            childNode = await NodeProxy.createByType({
                path: parentNode!.path,
                name: 'LayerChild',
                nodeType: NodeType.EMPTY,
            });
            expect(childNode).toBeDefined();

            // 获取 UUID
            const parentInfo = await NodeProxy.query({
                path: parentNode!.path,
                queryChildren: false,
                queryComponent: false,
            }) as INode | null;
            parentUuid = parentInfo!.nodeId;

            const childInfo = await NodeProxy.query({
                path: childNode!.path,
                queryChildren: false,
                queryComponent: false,
            }) as INode | null;
            childUuid = childInfo!.nodeId;
        });

        afterAll(async () => {
            if (parentNode) {
                await NodeProxy.delete({ path: parentNode.path, keepWorldTransform: false });
            }
        });

        it('setNodeAndChildrenLayer - 父子节点 layer 统一设置', async () => {
            const dump = await queryNodeDump(parentNode!.path) as INodeForEditor;
            const targetLayer = 1 << 25; // UI_2D layer
            const layerDump = { ...dump.layer, value: targetLayer };

            await setNodeAndChildrenLayer({
                nodePath: parentNode!.path,
                path: 'layer',
                dump: layerDump,
            });

            // 验证父节点
            const parentDump = await queryNodeDump(parentNode!.path) as INodeForEditor;
            expect(parentDump.layer.value).toBe(targetLayer);

            // 验证子节点
            const childDump = await queryNodeDump(childNode!.path) as INodeForEditor;
            expect(childDump.layer.value).toBe(targetLayer);
        });
    });

    describe('7. updatePropertyFromNull - 初始化 null 属性', () => {
        it('updatePropertyFromNull - 调用不报错', async () => {
            // 该接口用于将 null 类型属性初始化为可编辑值
            // 对于 Empty 节点的基本属性（position 等），不存在 null 情况
            // 这里验证接口调用不抛异常即可
            const dump = await queryNodeDump(testNode!.path) as INodeForEditor;
            const result = await updateNodePropertyFromNull({
                nodePath: testNode!.path,
                path: 'position',
                dump: dump.position,
            });
            expect(typeof result).toBe('boolean');
        });
    });

    describe('8. IProperty - encodeObject 编码字段验证', () => {
        it('position 属性包含 ForEditor 特有字段', async () => {
            const dump = await queryNodeDump(testNode!.path) as INodeForEditor;
            const position = dump.position;

            // ForEditor 编码特有字段
            expect(position.type).toBeDefined();
            expect(position.visible).toBe(true);
            expect(typeof position.readonly).toBe('boolean');
            expect(typeof position.animatable).toBe('boolean');
            expect(position.default).toBeDefined();
            expect(position.displayName).toBeDefined();
        });

        it('position 的 default 值是 Vec3 结构', async () => {
            const dump = await queryNodeDump(testNode!.path) as INodeForEditor;
            const position = dump.position;

            // default 应该被递归编码为嵌套的 IProperty 结构
            expect(position.default).toBeDefined();
            if (typeof position.default === 'object' && position.default !== null) {
                expect(position.default.type).toBeDefined();
                expect(position.default.value).toBeDefined();
            }
        });

        it('position 的子属性 (x, y, z) 也是 IProperty 结构', async () => {
            const dump = await queryNodeDump(testNode!.path) as INodeForEditor;
            const positionValue = dump.position.value as Record<string, any>;

            expect(positionValue).toBeDefined();
            // Vec3 的子属性应该有 value 字段
            if (positionValue.x && typeof positionValue.x === 'object') {
                expect(positionValue.x.value).toBeDefined();
                expect(typeof positionValue.x.value).toBe('number');
            }
        });

        it('name 属性 animatable 为 false', async () => {
            const dump = await queryNodeDump(testNode!.path) as INodeForEditor;
            expect(dump.name.animatable).toBe(false);
        });

        it('uuid 属性 animatable 为 false', async () => {
            const dump = await queryNodeDump(testNode!.path) as INodeForEditor;
            expect(dump.uuid.animatable).toBe(false);
        });

        it('layer 属性是 Enum 类型，带 enumList', async () => {
            const dump = await queryNodeDump(testNode!.path) as INodeForEditor;
            const layer = dump.layer;

            expect(layer.type).toBe('Enum');
            expect(layer.enumList).toBeDefined();
            expect(Array.isArray(layer.enumList)).toBe(true);
            expect(layer.enumList!.length).toBeGreaterThan(0);
            // enumList 的每项有 name 和 value
            const firstEnum = layer.enumList![0];
            expect(firstEnum.name).toBeDefined();
            expect(firstEnum.value).toBeDefined();
        });

        it('mobility 属性是 Enum 类型，带 enumList', async () => {
            const dump = await queryNodeDump(testNode!.path) as INodeForEditor;
            const mobility = dump.mobility;

            expect(mobility.type).toBe('Enum');
            expect(mobility.enumList).toBeDefined();
            expect(Array.isArray(mobility.enumList)).toBe(true);
            expect(mobility.enumList!.length).toBeGreaterThan(0);
        });

        it('active 属性的 value 是布尔类型', async () => {
            const dump = await queryNodeDump(testNode!.path) as INodeForEditor;
            const active = dump.active;

            expect(typeof active.value).toBe('boolean');
            expect(active.visible).toBe(true);
            expect(active.displayName).toBe('Active');
        });

        it('position/scale/rotation 带有 i18n 格式的 displayName 和 tooltip', async () => {
            const dump = await queryNodeDump(testNode!.path) as INodeForEditor;

            expect(dump.position.displayName).toMatch(/^i18n:/);
            expect(dump.position.tooltip).toMatch(/^i18n:/);
            expect(dump.scale.displayName).toMatch(/^i18n:/);
            expect(dump.scale.tooltip).toMatch(/^i18n:/);
            expect(dump.rotation.displayName).toMatch(/^i18n:/);
            expect(dump.rotation.tooltip).toMatch(/^i18n:/);
        });

        it('children 是 IProperty 数组', async () => {
            const dump = await queryNodeDump(testNode!.path) as INodeForEditor;

            expect(Array.isArray(dump.children)).toBe(true);
            // 空节点可能没有子节点，验证结构不出错即可
        });

        it('__comps__ 中的组件 dump 包含 editor 附加信息', async () => {
            // 创建一个带组件的节点来测试
            const labelNode = await NodeProxy.createByType({
                path: '/',
                name: 'PropertyTestLabel',
                nodeType: NodeType.LABEL,
            });
            expect(labelNode).toBeDefined();

            const dump = await queryNodeDump(labelNode!.path) as INodeForEditor;
            expect(dump.__comps__.length).toBeGreaterThan(0);

            // 找到 cc.Label 组件
            const labelComp = dump.__comps__.find(c => c.type === 'cc.Label');
            expect(labelComp).toBeDefined();

            // 组件 dump 应包含 editor 附加数据
            if (labelComp?.editor) {
                expect(typeof labelComp.editor).toBe('object');
            }

            // 组件 dump 的 value 中的属性也应是 IProperty 结构
            const compValue = labelComp!.value as Record<string, any>;
            expect(compValue['string']).toBeDefined();
            expect(compValue['string'].value).toBeDefined();
            expect(compValue['string'].type).toBeDefined();

            // 组件应有 extends 继承链
            if (labelComp?.extends) {
                expect(Array.isArray(labelComp.extends)).toBe(true);
                expect(labelComp.extends.length).toBeGreaterThan(0);
            }

            await NodeProxy.delete({ path: labelNode!.path, keepWorldTransform: false });
        });
    });
});
