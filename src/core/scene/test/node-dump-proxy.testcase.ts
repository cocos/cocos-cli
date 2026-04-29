import {
    type ICreateByNodeTypeParams,
    type IDeleteNodeParams,
    type IQueryNodeParams,
    type INode,
    type INodeForEditor,
    type ISetPropertyOptionsForEditor,
    NodeType,
} from '../common';
import { NodeProxy } from '../main-process/proxy/node-proxy';
import { EditorProxy } from '../main-process/proxy/editor-proxy';
import { SceneTestEnv } from './scene-test-env';

describe('Node Dump Proxy 测试', () => {
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
        testNode = await NodeProxy.createNodeByType(params);
        expect(testNode).toBeDefined();

        // 通过 queryNode 获取节点 UUID
        const queryParams: IQueryNodeParams = {
            path: testNode!.path,
            queryChildren: false,
            queryComponent: false,
        };
        const nodeInfo = await NodeProxy.queryNode(queryParams);
        expect(nodeInfo).not.toBeNull();
        testNodeUuid = nodeInfo!.nodeId;
    });

    afterAll(async () => {
        if (testNode) {
            await NodeProxy.deleteNode({ path: testNode.path, keepWorldTransform: false });
        }
        await EditorProxy.close({
            urlOrUUID: SceneTestEnv.sceneURL,
        });
    });

    describe('8. queryNodeDump - 查询节点 dump 数据', () => {
        it('queryNodeDump - 查询有效节点返回 dump 数据', async () => {
            const dump = await NodeProxy.queryNodeDump(testNode!.path);
            expect(dump).not.toBeNull();
            expect(dump).toBeDefined();
        });

        it('queryNodeDump - dump 包含必要字段', async () => {
            const dump: INodeForEditor = await NodeProxy.queryNodeDump(testNode!.path);
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

        it('queryNodeDump - 查询不存在的节点返回 null', async () => {
            const dump = await NodeProxy.queryNodeDump('non-existent-path');
            expect(dump).toBeNull();
        });
    });

    describe('9. setNodeProperty - 设置节点属性', () => {
        it('setNodeProperty - 修改节点位置', async () => {
            // 先获取当前 dump 作为模板
            const dump: INodeForEditor = await NodeProxy.queryNodeDump(testNode!.path);
            const positionDump = { ...dump.position, value: { x: 100, y: 200, z: 0 } };

            const options: ISetPropertyOptionsForEditor = {
                nodePath: testNode!.path,
                path: 'position',
                dump: positionDump,
            };
            const result = await NodeProxy.setNodeProperty(options);
            expect(result).toBe(true);

            // 验证修改生效
            const updatedDump: INodeForEditor = await NodeProxy.queryNodeDump(testNode!.path);
            expect(updatedDump.position.value).toEqual({ x: 100, y: 200, z: 0 });
        });

        it('setNodeProperty - 修改节点名称', async () => {
            const dump: INodeForEditor = await NodeProxy.queryNodeDump(testNode!.path);
            const nameDump = { ...dump.name, value: 'RenamedNode' };

            const result = await NodeProxy.setNodeProperty({
                nodePath: testNode!.path,
                path: 'name',
                dump: nameDump,
            });
            expect(result).toBe(true);

            const updatedDump: INodeForEditor = await NodeProxy.queryNodeDump(testNode!.path);
            expect(updatedDump.name.value).toBe('RenamedNode');

            // 还原名称
            const restoreDump = { ...updatedDump.name, value: testNodeName };
            await NodeProxy.setNodeProperty({
                nodePath: testNode!.path,
                path: 'name',
                dump: restoreDump,
            });
        });

        it('setNodeProperty - 修改节点 active 状态', async () => {
            const dump: INodeForEditor = await NodeProxy.queryNodeDump(testNode!.path);
            const activeDump = { ...dump.active, value: false };

            const result = await NodeProxy.setNodeProperty({
                nodePath: testNode!.path,
                path: 'active',
                dump: activeDump,
            });
            expect(result).toBe(true);

            const updatedDump: INodeForEditor = await NodeProxy.queryNodeDump(testNode!.path);
            expect(updatedDump.active.value).toBe(false);

            // 还原
            await NodeProxy.setNodeProperty({
                nodePath: testNode!.path,
                path: 'active',
                dump: { ...updatedDump.active, value: true },
            });
        });

        it('setNodeProperty - 修改节点缩放', async () => {
            const dump: INodeForEditor = await NodeProxy.queryNodeDump(testNode!.path);
            const scaleDump = { ...dump.scale, value: { x: 2, y: 2, z: 2 } };

            const result = await NodeProxy.setNodeProperty({
                nodePath: testNode!.path,
                path: 'scale',
                dump: scaleDump,
            });
            expect(result).toBe(true);

            const updatedDump: INodeForEditor = await NodeProxy.queryNodeDump(testNode!.path);
            expect(updatedDump.scale.value).toEqual({ x: 2, y: 2, z: 2 });

            // 还原
            await NodeProxy.setNodeProperty({
                nodePath: testNode!.path,
                path: 'scale',
                dump: { ...updatedDump.scale, value: { x: 1, y: 1, z: 1 } },
            });
        });

        it('setNodeProperty - 不存在的节点返回 false', async () => {
            const dump: INodeForEditor = await NodeProxy.queryNodeDump(testNode!.path);
            const result = await NodeProxy.setNodeProperty({
                nodePath: 'non-existent-path',
                path: 'position',
                dump: dump.position,
            });
            expect(result).toBe(false);
        });
    });

    describe('10. previewSetNodeProperty / cancelPreviewSetNodeProperty - 预览与取消', () => {
        let labelNodeUuid = '';
        let labelNode: INode | null = null;

        beforeAll(async () => {
            // 创建 Label 节点，自带组件，适合测试多层路径的预览
            labelNode = await NodeProxy.createNodeByType({
                path: '/',
                name: 'PreviewTestLabel',
                nodeType: NodeType.LABEL,
            });
            expect(labelNode).toBeDefined();

            const nodeInfo = await NodeProxy.queryNode({
                path: labelNode!.path,
                queryChildren: false,
                queryComponent: false,
            });
            labelNodeUuid = nodeInfo!.nodeId;
        });

        afterAll(async () => {
            if (labelNode) {
                await NodeProxy.deleteNode({ path: labelNode.path, keepWorldTransform: false });
            }
        });

        it('预览修改组件属性后取消，值应恢复', async () => {
            // 获取原始 dump，找到 Label 组件的 string 属性
            const originalDump: INodeForEditor = await NodeProxy.queryNodeDump(labelNode!.path);
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
            const previewResult = await NodeProxy.previewSetNodeProperty({
                nodePath: labelNode!.path,
                path: previewPath,
                dump: stringDump,
            });
            expect(previewResult).toBe(true);

            // 验证预览已生效
            const previewedDump: INodeForEditor = await NodeProxy.queryNodeDump(labelNode!.path);
            const previewedComp = previewedDump.__comps__[labelCompIndex].value as Record<string, any>;
            expect(previewedComp['string'].value).toBe('preview-test-value');

            // 取消预览
            const cancelResult = await NodeProxy.cancelPreviewSetNodeProperty({
                nodePath: labelNode!.path,
                path: previewPath,
                dump: stringDump,
            });
            expect(cancelResult).toBe(true);

            // 验证已恢复原值
            const restoredDump: INodeForEditor = await NodeProxy.queryNodeDump(labelNode!.path);
            const restoredComp = restoredDump.__comps__[labelCompIndex].value as Record<string, any>;
            expect(restoredComp['string'].value).toBe(originalString);
        });

        it('预览修改后正式提交，值应保留', async () => {
            const originalDump: INodeForEditor = await NodeProxy.queryNodeDump(labelNode!.path);

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
            await NodeProxy.previewSetNodeProperty({
                nodePath: labelNode!.path,
                path: previewPath,
                dump: stringDump,
            });

            // 正式提交相同的值
            const commitResult = await NodeProxy.setNodeProperty({
                nodePath: labelNode!.path,
                path: previewPath,
                dump: stringDump,
            });
            expect(commitResult).toBe(true);

            // 验证值已保留
            const committedDump: INodeForEditor = await NodeProxy.queryNodeDump(labelNode!.path);
            const committedComp = committedDump.__comps__[labelCompIndex].value as Record<string, any>;
            expect(committedComp['string'].value).toBe('committed-value');
        });
    });

    describe('11. resetNode - 重置节点变换', () => {
        it('resetNode - 修改后重置，变换属性恢复默认', async () => {
            // 先修改位置和缩放
            const dump: INodeForEditor = await NodeProxy.queryNodeDump(testNode!.path);
            await NodeProxy.setNodeProperty({
                nodePath: testNode!.path,
                path: 'position',
                dump: { ...dump.position, value: { x: 100, y: 200, z: 300 } },
            });
            await NodeProxy.setNodeProperty({
                nodePath: testNode!.path,
                path: 'scale',
                dump: { ...dump.scale, value: { x: 5, y: 5, z: 5 } },
            });

            // 重置节点
            const result = await NodeProxy.resetNode(testNode!.path);
            expect(result).toBe(true);

            // 验证变换属性恢复默认
            const resetDump: INodeForEditor = await NodeProxy.queryNodeDump(testNode!.path);
            expect(resetDump.position.value).toEqual({ x: 0, y: 0, z: 0 });
            expect(resetDump.scale.value).toEqual({ x: 1, y: 1, z: 1 });
        });
    });

    describe('12. resetNodeProperty - 重置单个属性', () => {
        it('resetNodeProperty - 重置位置属性', async () => {
            // 先修改位置
            const dump: INodeForEditor = await NodeProxy.queryNodeDump(testNode!.path);
            await NodeProxy.setNodeProperty({
                nodePath: testNode!.path,
                path: 'position',
                dump: { ...dump.position, value: { x: 42, y: 42, z: 42 } },
            });

            // 重置 position
            const result = await NodeProxy.resetNodeProperty({
                nodePath: testNode!.path,
                path: 'position',
                dump: dump.position,
            });
            expect(result).toBe(true);

            const resetDump: INodeForEditor = await NodeProxy.queryNodeDump(testNode!.path);
            expect(resetDump.position.value).toEqual({ x: 0, y: 0, z: 0 });
        });

        it('resetNodeProperty - 重置缩放属性', async () => {
            const dump: INodeForEditor = await NodeProxy.queryNodeDump(testNode!.path);
            await NodeProxy.setNodeProperty({
                nodePath: testNode!.path,
                path: 'scale',
                dump: { ...dump.scale, value: { x: 3, y: 3, z: 3 } },
            });

            const result = await NodeProxy.resetNodeProperty({
                nodePath: testNode!.path,
                path: 'scale',
                dump: dump.scale,
            });
            expect(result).toBe(true);

            const resetDump: INodeForEditor = await NodeProxy.queryNodeDump(testNode!.path);
            expect(resetDump.scale.value).toEqual({ x: 1, y: 1, z: 1 });
        });
    });

    describe('13. setNodeAndChildrenLayer - 递归设置 layer', () => {
        let parentNode: INode | null = null;
        let childNode: INode | null = null;
        let parentUuid = '';
        let childUuid = '';

        beforeAll(async () => {
            // 创建父节点
            parentNode = await NodeProxy.createNodeByType({
                path: '/',
                name: 'LayerParent',
                nodeType: NodeType.EMPTY,
            });
            expect(parentNode).toBeDefined();

            // 创建子节点
            childNode = await NodeProxy.createNodeByType({
                path: parentNode!.path,
                name: 'LayerChild',
                nodeType: NodeType.EMPTY,
            });
            expect(childNode).toBeDefined();

            // 获取 UUID
            const parentInfo = await NodeProxy.queryNode({
                path: parentNode!.path,
                queryChildren: false,
                queryComponent: false,
            });
            parentUuid = parentInfo!.nodeId;

            const childInfo = await NodeProxy.queryNode({
                path: childNode!.path,
                queryChildren: false,
                queryComponent: false,
            });
            childUuid = childInfo!.nodeId;
        });

        afterAll(async () => {
            if (parentNode) {
                await NodeProxy.deleteNode({ path: parentNode.path, keepWorldTransform: false });
            }
        });

        it('setNodeAndChildrenLayer - 父子节点 layer 统一设置', async () => {
            const dump: INodeForEditor = await NodeProxy.queryNodeDump(parentNode!.path);
            const targetLayer = 1 << 25; // UI_2D layer
            const layerDump = { ...dump.layer, value: targetLayer };

            await NodeProxy.setNodeAndChildrenLayer({
                nodePath: parentNode!.path,
                path: 'layer',
                dump: layerDump,
            });

            // 验证父节点
            const parentDump: INodeForEditor = await NodeProxy.queryNodeDump(parentNode!.path);
            expect(parentDump.layer.value).toBe(targetLayer);

            // 验证子节点
            const childDump: INodeForEditor = await NodeProxy.queryNodeDump(childNode!.path);
            expect(childDump.layer.value).toBe(targetLayer);
        });
    });

    describe('14. updateNodePropertyFromNull - 初始化 null 属性', () => {
        it('updateNodePropertyFromNull - 调用不报错', async () => {
            // 该接口用于将 null 类型属性初始化为可编辑值
            // 对于 Empty 节点的基本属性（position 等），不存在 null 情况
            // 这里验证接口调用不抛异常即可
            const dump: INodeForEditor = await NodeProxy.queryNodeDump(testNode!.path);
            const result = await NodeProxy.updateNodePropertyFromNull({
                nodePath: testNode!.path,
                path: 'position',
                dump: dump.position,
            });
            expect(typeof result).toBe('boolean');
        });
    });
});
