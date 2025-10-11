
/**
 * SceneUndoManager test case
 */
import { SceneUndoCommand, SceneUndoManager } from './scene';
import { Node, Prefab, Component, _decorator, EditBox } from 'cc';
import { prefabUtils } from '../../3d/manager/prefab/utils';
import { componentOperation, IRemovedComponentInfo } from '../../3d/manager/prefab/component';
import { nodeOperation, IApplyPrefabInfo } from '../../3d/manager/prefab/node';
const PrefabInfo = Prefab._utils.PrefabInfo;
let SceneTest: SceneUndoManager;

const { ccclass, property } = _decorator;
@ccclass('TestComponent')
export class TestComponent extends Component {
    @property({ type: Node })
        test: Node | null = null;

    update(deltaTime: number) {

    }
}

/**
 * 测试用例要包括
 * 1. 普通属性修改
 * 2. 嵌套属性修改
 * 3. 新建删除节点
 * 4. 新建删除组件
 * 5. 修改parent
 * 6. 修改children order
 * 7. 预制体修改
 *
*/
async function delay(func: Function, time = 20) {
    return new Promise((resolve) => {
        setTimeout(async () => {
            await func();
            resolve(true);
        }, time);
    });
}

function equal(msg: string, a: any, b: any) {
    if (a === b) {
        console.log(`test:${msg} success`);
    } else {
        console.error(`test:${msg} fail,value:`, a, b);
    }

}

async function createPrefabTestAsset(name: string): Promise<{ assetID: string; node: Node; }> {

    const sceneRoot = cc.director.getScene();
    // create Prefab then use it;
    let prefabNode = new Node(name);
    sceneRoot.addChild(prefabNode);
    prefabNode.addComponent(TestComponent);
    const prefabChild = new Node('child');
    prefabNode.addChild(prefabChild);
    const prefabUUID = await cce.SceneFacadeManager.createPrefab(prefabNode.uuid, `db://assets/${name}.prefab`);
    prefabNode = cc.find(name);
    return {
        assetID: prefabUUID,
        node: prefabNode,
    };
}

async function testPrefab() {
    // 预制体编辑:propertiesOverride 和 targetOverride
    const sceneRoot = cc.director.getScene();
    const { assetID: prefabAssetID, node: prefabNode } = await createPrefabTestAsset('prefab');
    const { assetID: prefabAssetID2, node: prefabNode2 } = await createPrefabTestAsset('prefab2');
    
    SceneTest.beginRecording([prefabNode.uuid, sceneRoot.uuid]);

    // 修改名称
    await cce.Node.setProperty(prefabNode.uuid, '_name', {
        type: 'string',
        value: 'test',
    });

    // 修改test，增加targetOverrides
    const dump = {
        type: 'cc.Node',
        value: {
            uuid: prefabNode2.children[0].uuid,
        },
    };
    await cce.Node.setProperty(prefabNode.uuid, '__comps__.0.test', dump);

    // const widget = nodePrefab.getComponent('cc.Widget') as Widget;
    // widget.target = nodePrefab.parent;
    await delay(async () => {
        // @ts-ignore
        const instance = prefabNode._prefab?.instance;
        // @ts-ignore
        const pOverrides = instance.propertyOverrides ?? [];
        const targetOverrides = sceneRoot._prefab.targetOverrides;
        console.log('propertyOverrides', pOverrides);
        // @ts-ignore
        console.log('targetOverrides', targetOverrides);

        await SceneTest.undo();
        for (const props of pOverrides) {
            if (props.propertyPath.join().includes('name')) {
                equal('propertyOverrides undo', props.value, 'prefab');
            }
        }
        equal('targetOverrides undo', sceneRoot._prefab?.targetOverrides, undefined);

        // console.log('undo后po', instance?.propertyOverrides);
        // console.log('undo后to', sceneRoot._prefab?.targetOverrides);

        // 注意redo的时候，要触发prefab的数据更新逻辑
        await SceneTest.redo();
        // @ts-ignore
        const newPropertiesOverrides = prefabNode._prefab?.instance?.propertyOverrides!;
        for (const props of newPropertiesOverrides) {
            if (props.propertyPath.join().includes('name')) {
                equal('propertyOverrides redo', props.value, 'test');
            }
        }
        const targetORS = sceneRoot._prefab?.targetOverrides;
        equal('targetOverrides redo', targetORS.length, 1);
        equal('targetOverrides redo', targetORS[0].propertyPath[0], 'test');
        equal('targetOverrides redo', targetORS[0].source, prefabNode);
        equal('targetOverrides redo', targetORS[0].target, prefabNode2);

    });

    // 预制体相关的自定义命令
    // applyRemovedComponent
    const option = {
        uuid: prefabNode.uuid,
        path: '__comps__',
        index: 0,
    };
    const fileID = prefabNode.components[0].__prefab?.fileId || '';
    await cce.SceneFacadeManager.removeNodeArrayElement(option);
    class ApplyRemoveComponentCommand extends SceneUndoCommand {
        public data!: IRemovedComponentInfo;
        public uuid = '';
        public fileID = '';
        public async undo() {
            console.log('custom undo applyRemovedComponent');
            await componentOperation.undoApplyRemovedComponent(this.data);
        }
        public async redo() {
            console.log('custom redo applyRemovedComponent');
            await componentOperation.doApplyRemovedComponent(this.uuid, this.fileID);
        }
    }

    const uuid = prefabNode.uuid;

    const removedCompInfo = await componentOperation.doApplyRemovedComponent(uuid, fileID);
    if (removedCompInfo) {
        const command = new ApplyRemoveComponentCommand();
        command.uuid = uuid;
        command.fileID = fileID;
        command.data = removedCompInfo;
        SceneTest.beginRecording(prefabNode.uuid, { customCommand: command });
        await delay(async () => {
            // 看看预制体资源中的组件是否被正常remove了
            const option = {
                parent: sceneRoot.uuid,
                assetUuid: prefabAssetID,
                name: 'prefabAfterApplyRemoveComponent.prefab',
                type: 'cc.Prefab',
            };
            let id = await cce.SceneFacadeManager.createNode(option);
            let newPrefab = cce.Node.query(id);
            equal('applyRemoveComponent before undo', !newPrefab, false);
            equal('applyRemoveComponent before undo', newPrefab?.components?.length, 0);

            // undo后，看看资源是否恢复
            await SceneTest.undo();
            option.name = 'prefabAfterUndo.prefab';
            id = await cce.SceneFacadeManager.createNode(option);
            newPrefab = cce.Node.query(id);
            equal('applyRemoveComponent after undo1', !newPrefab, false);
            equal('applyRemoveComponent after undo2', newPrefab?.components?.length, 1);
            equal('applyRemoveComponent after undo3', newPrefab?.components[0].name, 'prefabAfterUndo<TestComponent>');
            await SceneTest.redo();
            option.name = 'prefabAfterRedo.prefab';
            id = await cce.SceneFacadeManager.createNode(option);
            newPrefab = cce.Node.query(id);
            equal('applyRemoveComponent after redo1', !newPrefab, false);
            equal('applyRemoveComponent after redo2', newPrefab?.components?.length, 0);

            // 注意这里修改prefab资源会有softReload,所以最后场景里的预制体节点都是redo后的最终状态，没有组件
        });
    }

    // applyPrefab 测试用例
    class ApplyPrefabCommand extends SceneUndoCommand {
        public applyInfo!: IApplyPrefabInfo;
        public uuid = '';
        public async undo() {
            console.log('custom undo applyPrefab');
            await nodeOperation.undoApplyPrefab(this.applyInfo);
        }
        public async redo() {
            console.log('custom redo applyPrefab');
            await nodeOperation.doApplyPrefab(this.uuid);
        }
    }

    // 修改预制体实例的部分属性
    await cce.Node.setProperty(prefabNode2.children[0].uuid, '_name', {
        type: 'string',
        value: 'test2',
    });
    await cce.Node.setProperty(prefabNode2.uuid, '__comps__.0.test', {
        type: 'cc.Node',
        value: {
            uuid: prefabNode.children[0].uuid,
        },
    });
    equal('applyPrefab修改属性', prefabNode2.children[0].name, 'test2');
    // @ts-ignore
    equal('applyPrefab修改属性', !prefabNode2.components[0].test, false);

    // 应用修改到预制体资源
    const info = await nodeOperation.doApplyPrefab(prefabNode2.uuid);
    equal('applyPrefab', !info, false);
    if (info) {
        const command = new ApplyPrefabCommand();
        command.applyInfo = info;
        command.uuid = prefabNode2.uuid;
        SceneTest.beginRecording(prefabNode2.uuid, { customCommand: command });
        await delay(async () => {
            // 创建新的预制体资源
            const option = {
                parent: sceneRoot.uuid,
                assetUuid: prefabAssetID2,
                type: 'cc.Prefab',
            };
            const id = await cce.SceneFacadeManager.createNode(option);
            const newPrefab = cce.Node.query(id);
            const child = newPrefab?.children[0];
            const component = newPrefab?.components[0];
            equal('applyPrefab before undo', !newPrefab, false);
            equal('applyPrefab before undo', child?.name, 'test2');
            equal('applyPrefab before undo', newPrefab?.components?.length, 1);
            equal('applyPrefab before undo', newPrefab?.children?.length, 1);
            equal('applyPrefab before undo', component?.name, 'prefab2<TestComponent>');
            // @ts-ignore
            equal('applyPrefab before undo', component?.test, null);
            await SceneTest.undo();
            // 创建新的预制体
            const id2 = await cce.SceneFacadeManager.createNode(option);
            const newPrefab2 = cce.Node.query(id2);
            const child2 = newPrefab2?.children[0];
            // const component2 = newPrefab2?.components[0];
            equal('applyPrefab after undo', !newPrefab2, false);
            equal('applyPrefab after undo', child2?.name, 'child');
            equal('applyPrefab after undo', newPrefab2?.components?.length, 1);
            equal('applyPrefab after undo', newPrefab2?.children?.length, 1);

            await SceneTest.redo();
            // 创建新的预制体
            const id3 = await cce.SceneFacadeManager.createNode(option);
            const newPrefab3 = cce.Node.query(id3);
            const child3 = newPrefab3?.children[0];
            const component3 = newPrefab3?.components[0];
            equal('applyPrefab after redo', !newPrefab3, false);
            equal('applyPrefab after redo', child3?.name, 'test2');
            equal('applyPrefab after redo', newPrefab3?.components?.length, 1);
            equal('applyPrefab after redo', newPrefab3?.children?.length, 1);

        }, 200);
    }
}

async function testNode() {
    const node = new Node('node');
    const node2 = new Node('node2');
    const parent = new Node('parent');
    cc.director.getScene().addChild(parent);

    // 添加节点
    SceneTest.beginRecording(parent.uuid);
    parent.addChild(node);
    await delay(async () => {
        await SceneTest.undo();
        equal('undo add node', node.parent, null);
        await SceneTest.redo();
        equal('redo add node', node.parent, parent);
    });

    // 修改单个目标,自动结束
    SceneTest.beginRecording(node.uuid, { tag: '修改单个' });// 默认自动结束
    node.name = 'xx';
    node.setPosition(new cc.Vec3(3, 3, 3));
    await delay(async () => {
        await SceneTest.undo();
        equal('undo set property', node.name, 'node');
        equal('undo set property', node.position.x, 0);
        equal('undo set property', node.position.y, 0);
        equal('undo set property', node.position.z, 0);

        await SceneTest.redo();
        equal('redo set property', node.name, 'xx');
        equal('redo set property', node.position.x, 3);
        equal('redo set property', node.position.y, 3);
        equal('redo set property', node.position.z, 3);
    });

    // 移除节点
    SceneTest.beginRecording(parent.uuid);
    parent.removeChild(node);
    await delay(async () => {
        await SceneTest.undo();
        equal('undo remove node', node.parent, parent);
        await SceneTest.redo();
        equal('redo remove node', node.parent, null);
    });

    // 添加组件
    SceneTest.beginRecording(node.uuid);
    const box = node.addComponent('cc.EditBox') as EditBox; 
    await delay(async () => {
        await SceneTest.undo();
        equal('undo add EditBox', node.components.length, 0);
        await SceneTest.redo();
        equal('redo add EditBox', node.components.length, 2);
    });

    // 修改组件
    SceneTest.beginRecording(box.uuid);
    box.string = 'test';
    await delay(async () => {
        equal('modify EditBox before undo', box.string, 'test');
        await SceneTest.undo();
        equal('modify EditBox after undo', box.string, '');
        await SceneTest.redo();
        equal('modify EditBox after redo', box.string, 'test');
    });

    // 修改父节点
    parent.addChild(node);
    parent.addChild(node2);
    SceneTest.beginRecording([parent.uuid, node.uuid]);
    node2.setParent(node);
    await delay(async () => {
        await SceneTest.undo();
        equal('change parent undo', node2.parent, parent);
        await SceneTest.redo();
        equal('change parent redo', node2.parent, node);
    });

    // 修改children order
    parent.addChild(node2);
    SceneTest.beginRecording(parent.uuid);
    node2.setSiblingIndex(0);
    await delay(async () => {
        await SceneTest.undo();
        equal('setSiblingIndex undo', parent.children[0], node);
        equal('setSiblingIndex undo', parent.children[1], node2);

        await SceneTest.redo();
        equal('setSiblingIndex redo', parent.children[0], node2);
        equal('setSiblingIndex redo', parent.children[1], node);
    });
}

async function example() {
    SceneTest = new SceneUndoManager();
    // @ts-ignore
    window.SceneTest = SceneTest;

    SceneTest.init();

    await testNode();
    await testPrefab();
}

export function test() {
    try {
        example();
    } catch (error) {
        console.log('undo test error: ' + error);
    }
}