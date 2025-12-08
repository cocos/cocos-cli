import {
    ICreateByNodeTypeParams,
    IDeleteNodeParams,
    IQueryNodeParams,
    IAddComponentOptions,
    IRemoveComponentOptions,
    IQueryComponentOptions,
    ISetPropertyOptions,
    IComponentIdentifier,
    IComponent,
    NodeType,
    INode
} from '../common';
import { ComponentProxy } from '../main-process/proxy/component-proxy';
import { NodeProxy } from '../main-process/proxy/node-proxy';
import { EditorProxy } from '../main-process/proxy/editor-proxy';
import { SceneTestEnv } from './scene-test-env';

describe('Component Proxy 测试', () => {
    let nodePath = '';
    let nodeId = '';
    beforeAll(async () => {
        await EditorProxy.open({
            urlOrUUID: SceneTestEnv.sceneURL
        });
        // const params: ICreateByAssetParams = {
        //     dbURL: 'db://internal/default_prefab/ui/Sprite.prefab',
        //     path: '/PrefabNode',
        //     name: 'PrefabNode',
        // };

        // const prefabNode = await NodeProxy.createNodeByAsset(params);
        const params: ICreateByNodeTypeParams = {
            path: 'TestNode',
            nodeType: NodeType.EMPTY,
            position: { x: 1, y: 2, z: 0 },
        };
        const testNode = await NodeProxy.createNodeByType(params);
        expect(testNode).toBeDefined();
        expect(testNode?.name).toBe('New Node');
        if (!testNode) {
            return;
        }
        nodePath = testNode.path;
        nodeId = testNode?.nodeId;
    });
    afterAll(async () => {
        try {
            const params: IDeleteNodeParams = {
                path: nodePath,
                keepWorldTransform: false
            };
            await NodeProxy.deleteNode(params);
            expect(params).toBeDefined();
            expect(params?.path).toBe(nodePath);
        } catch (e) {
            console.log(`删除节点失败 ${e}`);
            throw e;
        }
        await EditorProxy.close({});
    });

    describe('1. 基础组件操作- 添加，查询，设置属性，移除', () => {
        let componentPath = '';
        let componentInfo: IComponent | null;
        it('addComponent - 添加节点', async () => {
            //console.log("Created prefab node path=", prefabNode?.path);
            const addComponentInfo: IAddComponentOptions = {
                nodePath: nodePath,
                component: 'cc.Label'
            };
            try {
                const component = await ComponentProxy.addComponent(addComponentInfo);
                componentPath = component.path;
                expect(component.path).toBe(`${nodePath}/cc.Label_1`);
            } catch (e) {
                console.log(`addComponent test error: ${e}`);
                throw e;
            }
        });
        it('queryComponent - 查询组件', async () => {
            const queryComponent: IQueryComponentOptions = {
                path: componentPath
            };
            try {
                componentInfo = await ComponentProxy.queryComponent(queryComponent);
                expect(componentInfo).toBeDefined();
                if (componentInfo!.cid) {
                    expect(componentInfo!.cid).toBe('cc.Label');
                }
                if (componentInfo!.name) {
                    expect(componentInfo!.name).toBe('New Node<Label>');
                }
                if (componentInfo!.type) {
                    expect(componentInfo!.type).toBe('cc.Label');
                }
            } catch (e) {
                console.log(`queryComponent test error:  ${e}`);
                throw e;
            }
        });
        it('setComponentProperty - 查询组件 - string类型', async () => {
            const queryComponent: IQueryComponentOptions = {
                path: componentPath
            };
            try {
                const setComponentProperty: ISetPropertyOptions = {
                    componentPath: componentPath,
                    properties: {
                        string: 'abc',
                    }
                };
                expect(componentInfo?.properties['string'].value).toBe('label');
                const result = await ComponentProxy.setProperty(setComponentProperty);
                expect(result).toBe(true);
                componentInfo = await ComponentProxy.queryComponent(queryComponent);
                expect(componentInfo?.properties['string'].value).toBe('abc');
            } catch (e) {
                console.log(`setComponentProperty test error:  ${e}`);
                throw e;
            }
        });

        it('removeComponent - 删除组件', async () => {
            const removeComponentInfo: IRemoveComponentOptions = {
                path: componentPath
            };
            try {
                const result = await ComponentProxy.removeComponent(removeComponentInfo);
                expect(result).toBe(true);
            } catch (e) {
                console.log(`removeComponent test error:  ${e}`);
                throw e;
            }
        });
    });

    describe('2. 组合测试 - 添加多个不同节点', () => {
        const testComponents: string[] = ['cc.Label', 'cc.Layout', 'cc.AudioSource'];
        const components: IComponentIdentifier[] = [];
        // 确保测试了中，没有其他的组件
        beforeAll(async () => {
            try {
                for (const componentName of testComponents) {
                    const queryComponent = await ComponentProxy.queryComponent({ path: `${nodePath}/${componentName}_1` });
                    expect(queryComponent).toBeNull();
                };
                console.log('组合测试 - 添加多个不同节点 - 开始');
            } catch (e) {
                console.log(`组合测试 - 添加多个不同节点 - 异常 : ${e}`);
                throw e;
            }
        });
        afterAll(async () => {
            try {
                for (const component of components) {
                    const result = await ComponentProxy.removeComponent({ path: component.path });
                    expect(result).toBe(true);
                };
            } catch (e) {
                console.log(`组合测试 - 添加多个相同节点 - 错误 ${e}`);
                throw e;
            }
            console.log('组合测试 - 添加多个不同节点 - 结束');
        });
        it('addComponent - 添加多个不同节点', async () => {
            try {
                for (const componentName of testComponents) {
                    const componentInfo: IAddComponentOptions = {
                        nodePath: nodePath,
                        component: componentName
                    };
                    const component = await ComponentProxy.addComponent(componentInfo);
                    expect(component.path).toBe(`${nodePath}/${componentName}_1`);
                    components.push(component);
                    const queryComponentInfo = await ComponentProxy.queryComponent(component);
                    if (queryComponentInfo!.cid) {
                        expect(queryComponentInfo!.cid).toBe(componentName);
                    }
                    if (queryComponentInfo!.type) {
                        expect(queryComponentInfo!.type).toBe(componentName);
                    }
                }
                expect(components.length).toBe(testComponents.length);
            } catch (e) {
                console.log(`添加多个不同的节点失败，原因：${e}`);
                throw e;
            }
        });
    });
    describe('3. 组合测试 - 添加多个相同节点', () => {
        const testCount = 10;
        const testComponent: string = 'cc.Layout';
        const components: IComponentIdentifier[] = [];
        // 确保测试了中，没有其他的组件
        beforeAll(async () => {
            try {
                for (let i = 0; i < testCount; i++) {
                    const queryComponent = await ComponentProxy.queryComponent({ path: `${nodePath}/${testComponent}_${i + 1}` });
                    expect(queryComponent).toBeNull();
                }
                console.log('组合测试 - 添加多个相同节点 - 开始');
            } catch (e) {
                console.log(`组合测试 - 添加多个相同节点 - 异常 : ${e}`);
                throw e;
            }
        });
        afterAll(async () => {
            try {

                for (const component of components) {
                    const result = await ComponentProxy.removeComponent({ path: component.path });
                    expect(result).toBe(true);
                };
            } catch (e) {
                console.log(`组合测试 - 添加多个相同节点 - 错误 ${e}`);
                throw e;
            }
            console.log('组合测试 - 添加多个相同节点 - 结束');
        });
        it('addComponent - 添加多个相同节点', async () => {
            try {
                for (let i = 0; i < testCount; i++) {
                    const componentInfo1: IAddComponentOptions = {
                        nodePath: nodePath,
                        component: testComponent
                    };
                    const component = await ComponentProxy.addComponent(componentInfo1);
                    expect(component.path).toBe(`${nodePath}/${testComponent}_${i + 1}`);
                    components.push(component);
                    const queryComponentInfo = await ComponentProxy.queryComponent(component);
                    if (queryComponentInfo!.cid) {
                        expect(queryComponentInfo!.cid).toBe(testComponent);
                    }
                    if (queryComponentInfo!.type) {
                        expect(queryComponentInfo!.type).toBe(testComponent);
                    }
                }
                expect(components.length).toBe(testCount);
            } catch (e) {
                console.log(`添加多个不同的节点失败，原因：${e}`);
                throw e;
            }
        });
    });
    describe('4. 设置组件属性测试 - 设置不同类型的属性', () => {
        const testComponent: string = 'cc.Label';
        let componentInfo: IComponent | null;
        let componentPath: string = '';
        const queryComponent: IQueryComponentOptions = { path: '' };
        // 确保测试了中，没有其他的组件
        beforeAll(async () => {
            const addComponentInfo: IAddComponentOptions = {
                nodePath: nodePath,
                component: testComponent
            };
            try {
                componentInfo = await ComponentProxy.queryComponent(queryComponent);
                expect(componentInfo).toBeNull();
                const component = await ComponentProxy.addComponent(addComponentInfo);
                componentPath = component.path;
                expect(component.path).toBe(`${nodePath}/cc.Label_1`);
                componentInfo = await ComponentProxy.queryComponent({ path: componentPath });
                expect(componentInfo).toBeDefined();
                queryComponent.path = componentPath;
            } catch (e) {
                console.log(`设置组件属性测试 - 设置不同类型的属性 - 异常 : ${e}`);
            }
        });
        afterAll(async () => {
            try {
                const result = await ComponentProxy.removeComponent({ path: componentPath });
                expect(result).toBe(true);
            } catch (e) {
                console.log(`组合测试 - 添加多个相同节点 - 错误 ${e}`);
                throw e;
            }
            console.log('组合测试 - 添加多个相同节点 - 结束');
        });
        it('setComponentProperty - 设置组件属性 - number类型', async () => {
            try {
                expect(componentInfo?.properties['fontSize'].value).toBe(40);

                const setComponentProperty: ISetPropertyOptions = {
                    componentPath: componentPath,
                    properties: {
                        fontSize: 80,
                    }
                };
                const result = await ComponentProxy.setProperty(setComponentProperty);
                expect(result).toBe(true);
                componentInfo = await ComponentProxy.queryComponent(queryComponent);
                expect(componentInfo?.properties['fontSize'].value).toBe(80);
            } catch (e) {
                console.log(`setComponentProperty test error:  ${e}`);
                throw e;
            }
        });
        it('setComponentProperty - 设置组件属性 - enum类型', async () => {
            try {
                const setComponentProperty: ISetPropertyOptions = {
                    componentPath: componentPath,
                    properties: { overflow: 1 },
                };
                expect(componentInfo?.properties['overflow'].value).toBe(0);
                const result = await ComponentProxy.setProperty(setComponentProperty);
                expect(result).toBe(true);
                componentInfo = await ComponentProxy.queryComponent(queryComponent);
                expect(componentInfo?.properties['overflow'].value).toBe(1);
            } catch (e) {
                console.log(`setComponentProperty test error:  ${e}`);
                throw e;
            }
        });
        it('setComponentProperty - 设置组件属性 - boolean类型', async () => {
            try {
                const setComponentProperty: ISetPropertyOptions = {
                    componentPath: componentPath,
                    properties: { enableOutline: true },
                };
                expect(componentInfo?.properties['enableOutline'].value).toBe(false);
                setComponentProperty.properties.value = true;
                const result = await ComponentProxy.setProperty(setComponentProperty);
                expect(result).toBe(true);
                componentInfo = await ComponentProxy.queryComponent(queryComponent);
                expect(componentInfo?.properties['enableOutline'].value).toBe(true);
            } catch (e) {
                console.log(`setComponentProperty test error:  ${e}`);
                throw e;
            }
        });
        it('setComponentProperty - 设置组件属性 - color类型', async () => {
            try {
                const setComponentProperty: ISetPropertyOptions = {
                    componentPath: componentPath,
                    properties: {
                        outlineColor: {
                            r: 50,
                            g: 100,
                            b: 150,
                            a: 200,
                        }
                    },
                };
                expect(componentInfo?.properties['outlineColor'].value.r).toBe(0);
                expect(componentInfo?.properties['outlineColor'].value.g).toBe(0);
                expect(componentInfo?.properties['outlineColor'].value.b).toBe(0);
                expect(componentInfo?.properties['outlineColor'].value.a).toBe(255);
                const result = await ComponentProxy.setProperty(setComponentProperty);
                expect(result).toBe(true);
                componentInfo = await ComponentProxy.queryComponent(queryComponent);
                expect(componentInfo?.properties['outlineColor'].value.r).toBe(50);
                expect(componentInfo?.properties['outlineColor'].value.g).toBe(100);
                expect(componentInfo?.properties['outlineColor'].value.b).toBe(150);
                expect(componentInfo?.properties['outlineColor'].value.a).toBe(200);
            } catch (e) {
                console.log(`setComponentProperty test error:  ${e}`);
                throw e;
            }
        });
        it('setComponentProperty - 设置组件属性 - 设置枚举类型之外的值', async () => {
            try {
                const setComponentProperty: ISetPropertyOptions = {
                    componentPath: componentPath,
                    properties: {
                        overflow: 100000
                    }
                };
                expect(componentInfo?.properties['overflow'].value).toBe(1);
                const result = await ComponentProxy.setProperty(setComponentProperty);
                expect(result).toBe(true);
                componentInfo = await ComponentProxy.queryComponent(queryComponent);
                expect(componentInfo?.properties['overflow'].value).toBe(100000);
            } catch (e) {
                console.log(`setComponentProperty test error:  ${e}`);
                throw e;
            }
        });
    });
    describe('4.1 设置Sprite属性测试', () => {
        const testComponent: string = 'cc.Sprite';
        let componentInfo: IComponent | null;
        let componentPath: string = '';
        const queryComponent: IQueryComponentOptions = { path: '' };
        // 确保测试了中，没有其他的组件
        beforeAll(async () => {
            const addComponentInfo: IAddComponentOptions = {
                nodePath: nodePath,
                component: testComponent
            };
            try {
                componentInfo = await ComponentProxy.queryComponent(queryComponent);
                expect(componentInfo).toBeNull();
                const component = await ComponentProxy.addComponent(addComponentInfo);
                componentPath = component.path;
                expect(component.path).toBe(`${nodePath}/cc.Sprite_1`);
                componentInfo = await ComponentProxy.queryComponent({ path: componentPath });
                expect(componentInfo).toBeDefined();
                queryComponent.path = componentPath;
            } catch (e) {
                console.log(`设置组件属性测试 - 设置不同类型的属性 - 异常 : ${e}`);
                throw e;
            }
        });
        afterAll(async () => {
            try {
                const result = await ComponentProxy.removeComponent({ path: componentPath });
                expect(result).toBe(true);
            } catch (e) {
                console.log(`组合测试 - 添加多个相同节点 - 错误 ${e}`);
                throw e;
            }
        });
        it('setComponentProperty - 设置组件属性 - 设置SpriteFrame', async () => {
            try {
                // 对错误的值 类型 会修改失败，但是返回还是true
                const setComponentProperty: ISetPropertyOptions = {
                    componentPath: componentPath,
                    properties: {
                        spriteFrame: {
                            uuid: '20835ba4-6145-4fbc-a58a-051ce700aa3e@f9941'
                        }
                    },
                };
                expect(componentInfo?.properties['spriteFrame'].value.uuid).toBe('');
                const result = await ComponentProxy.setProperty(setComponentProperty);
                expect(result).toBe(true);
                componentInfo = await ComponentProxy.queryComponent(queryComponent);
                expect(componentInfo?.properties['spriteFrame'].value.uuid).toBe('20835ba4-6145-4fbc-a58a-051ce700aa3e@f9941');
            } catch (e) {
                console.log(`setComponentProperty test error:  ${e}`);
                throw e;
            }
        });
    });

    describe('5. 创建内置的组件', () => {
        let buildinComponentTypes: string[] = [];
        const createdComponents: IComponentIdentifier[] = [];
        const exceptionalComponentTypes: string[] = [];
        const actuallyExcludedTypes: string[] = [];

        beforeAll(async () => {
            const params: IQueryNodeParams = {
                path: nodePath,
                queryChildren: false
            };
            buildinComponentTypes = await ComponentProxy.queryAllComponent();
            const result = await NodeProxy.queryNode(params);
            expect(result).toBeDefined();
            expect(result?.components?.length == 0);
        });

        it('addComponent - 添加内置组件测试 - 这个测试例设计有问题，可以忽略。', async () => {
            /**
             * 这个测试例设计有问题，因为内置组件太多，有冲突，有重复（依赖创建组件 会有重复），有无法删除组件（UITransform）
             * 这样导致很难排除哪些有依赖，哪些有冲突等，因此，只能通过日志的方式输出，查看哪些组件是冲突的。
             * 这个测试目的是，能够测试能够单独构建成功的组件，预估了下，也有100多个（components.length），因此保留了这个测试例。
             */
            const presetExcludedComponents = [
                //'cc.Component',
                'cc.Collider',
                'cc.Constraint',
                'cc.PostProcess',
                'cc.MissingScript',
                'cc.CharacterController',
                'cc.ColliderComponent',
                'cc.Collider2D',
                'cc.Joint2D'
            ];
            for (const componentType of buildinComponentTypes) {
                if (presetExcludedComponents.includes(componentType)) {
                    actuallyExcludedTypes.push(componentType);
                    continue;
                }

                const componentInfo1: IAddComponentOptions = {
                    nodePath: nodePath,
                    component: componentType
                };
                try {
                    const component = await ComponentProxy.addComponent(componentInfo1);
                    createdComponents.push(component);
                } catch (e) {
                    // 这里会产生冲突、重复组件(因为依赖会创建一些重复组件，导致测试会异常), 这是正常的异常
                    console.log(`添加组件异常：${componentType} , 异常原因 ${e}`);
                    exceptionalComponentTypes.push(componentType);
                }

                try {
                    const params: IQueryNodeParams = {
                        path: nodePath,
                        queryChildren: false
                    };
                    const node = await NodeProxy.queryNode(params);
                    for (let i = 0; i < node!.components!.length; ++i) {
                        await ComponentProxy.removeComponent({ path: node!.components!.at(i)!.path });
                    }
                } catch (e) {
                    // 有些移除会失败，因为有依赖，例如 UITransform 、 Label组件，也属于正常的异常，这也属于正常的异常
                    console.log(e);
                }
            }
            console.log(`内置组件总数：${buildinComponentTypes.length}  
                         固定排除组件总数（这个是固定的，有些引擎可能没有）：${presetExcludedComponents.length} 
                         实际排除组件总数：${actuallyExcludedTypes.length} 
                         添加异常组件总数 ${exceptionalComponentTypes.length} 
                         成功添加的组件：${createdComponents.length}`);
            expect(createdComponents.length).toBe(buildinComponentTypes.length - actuallyExcludedTypes.length - exceptionalComponentTypes.length);
        });
    });
    describe('6. 多节点添加同组件-组件不冲突', () => {
        const testCount = 10;
        const nodes: INode[] = [];
        beforeAll(async () => {
            for (let i = 0; i < testCount; ++i) {
                const params: ICreateByNodeTypeParams = {
                    path: 'TestNode',
                    nodeType: NodeType.EMPTY,
                    position: { x: 1, y: 2, z: 0 },
                };
                const testNode = await NodeProxy.createNodeByType(params);
                expect(testNode).toBeDefined();
                if (!testNode) {
                    return;
                }
                nodes.push(testNode);
            }
        });
        afterAll(async () => {
            for (let i = 0; i < nodes.length; ++i) {
                const params: IDeleteNodeParams = {
                    path: nodes[i].path,
                    keepWorldTransform: false
                };
                await NodeProxy.deleteNode(params);
                expect(params).toBeDefined();
            }
        });

        it('addComponent - 每个组件添加同一个组件，但是最后的组件名是一样的，只是节点名称不一样', async () => {
            try {
                const testComponent = 'cc.Layout';
                for (let i = 0; i < nodes.length; ++i) {
                    const componentInfo1: IAddComponentOptions = {
                        nodePath: nodes[i].path,
                        component: testComponent,
                    };
                    const component = await ComponentProxy.addComponent(componentInfo1);
                    expect(component).toBeDefined();
                    expect(component.path).toBe(`${nodes[i].path}/cc.Layout_1`);
                }
                for (let i = 0; i < nodes.length; ++i) {
                    const componentInfo1: IAddComponentOptions = {
                        nodePath: nodes[i].path,
                        component: testComponent,
                    };
                    const component = await ComponentProxy.addComponent(componentInfo1);
                    expect(component).toBeDefined();
                    expect(component.path).toBe(`${nodes[i].path}/cc.Layout_2`);
                }
            } catch (e) {
                console.log(`添加多个不同的节点失败，原因：${e}`);
                throw e;
            }
        });
    });

    describe('7. 测试-冲突组件，测试-相同组件', () => {
        let nodeName: string = '';
        let nodePath: string = '';
        beforeAll(async () => {
            const params: ICreateByNodeTypeParams = {
                path: 'TestNode',
                nodeType: NodeType.EMPTY,
                position: { x: 1, y: 2, z: 0 },
            };
            const testNode = await NodeProxy.createNodeByType(params);
            expect(testNode).toBeDefined();
            if (!testNode) {
                return;
            }
            nodeName = testNode?.name;
            nodePath = testNode.path;
        });
        afterAll(async () => {
            const params: IDeleteNodeParams = {
                path: nodePath,
                keepWorldTransform: false
            };
            await NodeProxy.deleteNode(params);
            expect(params).toBeDefined();
        });

        it('addComponent - 添加多个不允许并存的组件', async () => {
            const testComponent = 'cc.Label';
            const componentInfo: IAddComponentOptions = {
                nodePath: nodePath,
                component: testComponent,
            };
            let component = await ComponentProxy.addComponent(componentInfo);
            expect(component).toBeDefined();
            expect(component.path).toBe(`${nodePath}/${testComponent}_1`);
            try {
                component = await ComponentProxy.addComponent(componentInfo);
            } catch (e) {
                // 添加接受相同组件添加的错误
                expect(e instanceof Error ? e.message : String(e)).toBe(`Can't add component '${testComponent}' because ${nodeName} already contains the same component.`);
                expect(component.path).toBe(`${nodePath}/${testComponent}_1`);
            }
            const result = await ComponentProxy.removeComponent({ path: component.path });
            expect(result).toBe(true);
        });
        it('addComponent - 添加多个冲突的组件', async () => {
            const testComponent = 'cc.Sprite';
            const testConfictsComponent = 'cc.Line';
            const componentInfo: IAddComponentOptions = {
                nodePath: nodePath,
                component: testComponent,
            };
            let component = await ComponentProxy.addComponent(componentInfo);
            expect(component).toBeDefined();
            expect(component.path).toBe(`${nodePath}/${testComponent}_1`);
            try {
                const componentConficts: IAddComponentOptions = {
                    nodePath: nodePath,
                    component: testConfictsComponent,
                };
                component = await ComponentProxy.addComponent(componentConficts);
            } catch (e) {
                // 添加异常冲突
                expect(e instanceof Error ? e.message : String(e)).toBe(`Can't add component '${testConfictsComponent}' to ${nodeName} because it conflicts with the existing '${testComponent}' derived component.`);
                expect(component.path).toBe(`${nodePath}/${testComponent}_1`);
            }
        });
    });
});