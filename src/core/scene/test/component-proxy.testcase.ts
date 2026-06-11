import {
    ICreateByNodeTypeParams,
    IDeleteNodeParams,
    IQueryNodeParams,
    IAddComponentOptions,
    IRemoveComponentOptions,
    IQueryComponentOptions,
    IComponentIdentifier,
    IComponentInfo,
    NodeType,
    INodeInfo
} from '../common';
import { ISetPropertyOptionsInfo } from '../common/cli/component';
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
        const testNode = await NodeProxy.createByType(params);
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
            await NodeProxy.delete(params);
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
        let componentInfo: IComponentInfo | null;
        it('add - 添加节点 - 完整节点名称：cc.Label', async () => {
            //console.log("Created prefab node path=", prefabNode?.path);
            const addComponentInfo: IAddComponentOptions = {
                nodePath: nodePath,
                component: 'cc.Label'
            };
            try {
                componentInfo = await ComponentProxy.add(addComponentInfo);
                componentPath = componentInfo.path;
                expect(componentInfo.path).toBe(`${nodePath}/cc.Label`);
                // 删除当前添加的节点，方便后续测试
                const removeComponentInfo: IRemoveComponentOptions = {
                    path: componentPath
                };
                const result = await ComponentProxy.remove(removeComponentInfo);
                expect(result).toBe(true);
            } catch (e) {
                console.log(`addComponent test error: ${e}`);
                throw e;
            }
        });
        it('add -添加节点 - 模糊节点名称：cc.label', async () => {
            //console.log("Created prefab node path=", prefabNode?.path);
            const addComponentInfo: IAddComponentOptions = {
                nodePath: nodePath,
                component: 'cc.label'
            };
            try {
                componentInfo = await ComponentProxy.add(addComponentInfo);
                componentPath = componentInfo.path;
                expect(componentInfo.path).toBe(`${nodePath}/cc.Label`);
                // 删除当前添加的节点，方便后续测试
                const removeComponentInfo: IRemoveComponentOptions = {
                    path: componentPath
                };
                const result = await ComponentProxy.remove(removeComponentInfo);
                expect(result).toBe(true);
            } catch (e) {
                console.log(`addComponent test error: ${e}`);
                throw e;
            }
        });
        it('add -添加节点 - 模糊节点名称：Label', async () => {
            //console.log("Created prefab node path=", prefabNode?.path);
            const addComponentInfo: IAddComponentOptions = {
                nodePath: nodePath,
                component: 'Label'
            };
            try {
                componentInfo = await ComponentProxy.add(addComponentInfo);
                componentPath = componentInfo.path;
                expect(componentInfo.path).toBe(`${nodePath}/cc.Label`);

                // 删除当前添加的节点，方便后续测试
                const removeComponentInfo: IRemoveComponentOptions = {
                    path: componentPath
                };
                const result = await ComponentProxy.remove(removeComponentInfo);
                expect(result).toBe(true);
            } catch (e) {
                console.log(`addComponent test error: ${e}`);
                throw e;
            }
        });
        it('add -添加节点 - 模糊节点名称：label', async () => {
            //console.log("Created prefab node path=", prefabNode?.path);
            const addComponentInfo: IAddComponentOptions = {
                nodePath: nodePath,
                component: 'label'
            };
            try {
                componentInfo = await ComponentProxy.add(addComponentInfo);
                componentPath = componentInfo.path;
                expect(componentInfo.path).toBe(`${nodePath}/cc.Label`);

                // 这里不需要删除，配合后续测试
            } catch (e) {
                console.log(`addComponent test error: ${e}`);
                throw e;
            }
        });

        it('query - 查询组件- 根据 uuid 查询', async () => {
            const queryComponent: IQueryComponentOptions = {
                path: componentInfo!.uuid
            };
            try {
                componentInfo = await ComponentProxy.query(queryComponent) as IComponentInfo;
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
                // component_path 经 encodeComponent 写入后由 DumpConverter 转换为 path
                expect(componentInfo!.path).toBe(componentPath);
                // 非预制体组件 prefab 应为 null，而非 undefined
                expect(componentInfo!.prefab).toBeNull();
            } catch (e) {
                console.log(`queryComponent test error:  ${e}`);
                throw e;
            }
        });
        it('query - 查询组件-根据完整组件名查询', async () => {
            const queryComponent: IQueryComponentOptions = {
                path: componentPath
            };
            try {
                componentInfo = await ComponentProxy.query(queryComponent) as IComponentInfo;
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
        it('query - 查询组件-根据模糊的匹配-Label', async () => {
            const queryComponent: IQueryComponentOptions = {
                path: nodePath + '/Label'
            };
            try {
                componentInfo = await ComponentProxy.query(queryComponent) as IComponentInfo;
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
        it('query - 查询组件-根据模糊的匹配-cc.label', async () => {
            const queryComponent: IQueryComponentOptions = {
                path: nodePath + '/cc.label'
            };
            try {
                componentInfo = await ComponentProxy.query(queryComponent) as IComponentInfo;
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
        it('query - 查询组件-根据模糊的匹配-Label', async () => {
            const queryComponent: IQueryComponentOptions = {
                path: nodePath + '/Label'
            };
            try {
                componentInfo = await ComponentProxy.query(queryComponent) as IComponentInfo;
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
        it('query - 查询组件-根据模糊的匹配-label', async () => {
            const queryComponent: IQueryComponentOptions = {
                path: nodePath + '/label'
            };
            try {
                componentInfo = await ComponentProxy.query(queryComponent) as IComponentInfo;
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

        it('query - 查询组件-根据模糊的匹配-label不带下标', async () => {
            const queryComponent: IQueryComponentOptions = {
                path: nodePath + '/label'
            };
            try {
                componentInfo = await ComponentProxy.query(queryComponent) as IComponentInfo;
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
        it('query - 查询组件-根据模糊的匹配-cc.label不带下标', async () => {
            const queryComponent: IQueryComponentOptions = {
                path: nodePath + '/cc.label'
            };
            try {
                componentInfo = await ComponentProxy.query(queryComponent) as IComponentInfo;
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
        it('query - 查询不存在组件', async () => {
            const queryComponent: IQueryComponentOptions = {
                path: nodePath + '/cc.Button'
            };
            try {
                await ComponentProxy.query(queryComponent) as IComponentInfo;
            } catch (e) {
                expect(e instanceof Error ? e.message : String(e)).toBe(`No component found for this path(${queryComponent.path}).`);
            }
        });

        it('query - 根据不存在的 URL 查询组件', async () => {
            const queryComponent: IQueryComponentOptions = {
                path: 'db://assets/non-existent-script.ts'
            };
            try {
                const result = await ComponentProxy.query(queryComponent) as IComponentInfo;
                // 如果没有抛出异常，则结果应该为 null
                expect(result).toBeNull();
            } catch (e) {
                // URL 对应的组件不存在，应该抛出异常或返回 null
                expect(e).toBeDefined();
            }
        });

        it('query - 查询存在相同组件', async () => {
            const newNodePath = 'TestNode/new node';
            const addComponentInfo: IAddComponentOptions = {
                nodePath: newNodePath,
                component: 'label'
            };
            try {
                const params: ICreateByNodeTypeParams = {
                    path: 'TestNode',
                    name: 'new node',
                    nodeType: NodeType.EMPTY,
                    position: { x: 1, y: 2, z: 0 },
                };
                const testNode = await NodeProxy.createByType(params);
                expect(testNode).toBeDefined();
                expect(testNode?.name).toBe('new node');
                if (!testNode) {
                    return;
                }

                const cameraComponentInfo = await ComponentProxy.add(addComponentInfo);
                expect(cameraComponentInfo.path).toBe(`${addComponentInfo.nodePath}/cc.Label`);

                const queryComponent: IQueryComponentOptions = {
                    path: nodePath + '/cc.label'
                };
                await ComponentProxy.query(queryComponent) as IComponentInfo;

            } catch (e) {
                expect(e instanceof Error ? e.message : String(e)).toBe(`This path contains multiple component paths(TestNode/New Node/cc.Label,TestNode/new node/cc.Label). Please specify which one to use.`);
                console.log((e as Error).message);
                // 删除当前添加的节点，方便后续测试
                const removeComponentInfo: IRemoveComponentOptions = {
                    path: `${newNodePath}/cc.Label`
                };
                const result = await ComponentProxy.remove(removeComponentInfo);
                expect(result).toBe(true);
            }
        });

        it('setProperty - 设置组件属性 - string类型', async () => {
            const queryComponent: IQueryComponentOptions = {
                path: componentPath
            };
            try {
                const setComponentProperty: ISetPropertyOptionsInfo = {
                    componentPath: componentPath,
                    properties: {
                        string: 'abc',
                    }
                };
                expect(componentInfo?.properties['string'].value).toBe('label');
                const result = await ComponentProxy.setProperty(setComponentProperty);
                expect(result).toBe(true);
                componentInfo = await ComponentProxy.query(queryComponent) as IComponentInfo;
                expect(componentInfo?.properties['string'].value).toBe('abc');
            } catch (e) {
                console.log(`setComponentProperty test error:  ${e}`);
                throw e;
            }
        });

        it('remove - 删除组件', async () => {
            const removeComponentInfo: IRemoveComponentOptions = {
                path: componentPath
            };
            try {
                const result = await ComponentProxy.remove(removeComponentInfo);
                expect(result).toBe(true);
            } catch (e) {
                console.log(`removeComponent test error:  ${e}`);
                throw e;
            }
            // 删除成功后理论上是查询不到的
            const queryComponent: IQueryComponentOptions = {
                path: componentPath
            };
            try {
                await ComponentProxy.query(queryComponent) as IComponentInfo;
            } catch (e) {
                expect(e instanceof Error ? e.message : String(e)).toBe(`No component found for this path(${queryComponent.path}).`);
            }
        });
    });

    describe('2. 组合测试 - 添加多个不同节点', () => {
        const testComponents: string[] = ['cc.Label', 'cc.Layout', 'cc.AudioSource'];
        const components: IComponentIdentifier[] = [];
        // 确保测试了中，没有其他的组件
        afterAll(async () => {
            try {
                for (const component of components) {
                    const result = await ComponentProxy.remove({ path: component.path });
                    expect(result).toBe(true);
                };
            } catch (e) {
                console.log(`组合测试 - 添加多个相同节点 - 错误 ${e}`);
                throw e;
            }
            console.log('组合测试 - 添加多个不同节点 - 结束');
        });
        it('add -添加多个不同节点', async () => {
            try {
                for (const componentName of testComponents) {
                    const componentInfo: IAddComponentOptions = {
                        nodePath: nodePath,
                        component: componentName
                    };

                    const component = await ComponentProxy.add(componentInfo);
                    expect(component.path).toBe(`${nodePath}/${componentName}`);
                    components.push(component);
                    const queryComponentInfo = await ComponentProxy.query({ path: component.path }) as IComponentInfo;
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
        afterAll(async () => {
            try {
                for (const component of components) {
                    const result = await ComponentProxy.remove({ path: component.path });
                    expect(result).toBe(true);
                };
            } catch (e) {
                console.log(`组合测试 - 添加多个相同节点 - 错误 ${e}`);
                throw e;
            }
            console.log('组合测试 - 添加多个相同节点 - 结束');
        });
        it('add -添加多个相同节点', async () => {
            try {
                for (let i = 0; i < testCount; i++) {
                    const componentInfo1: IAddComponentOptions = {
                        nodePath: nodePath,
                        component: testComponent
                    };
                    const component = await ComponentProxy.add(componentInfo1);
                    expect(component.path).toBe(`${nodePath}/${testComponent}${i === 0 ? '' : '_' + String(i).padStart(3, '0')}`);
                    components.push(component);
                    const queryComponentInfo = await ComponentProxy.query({ path: component.path }) as IComponentInfo;
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
        let componentInfo: IComponentInfo | null;
        let componentPath: string = '';
        const queryComponent: IQueryComponentOptions = { path: '' };
        // 确保测试了中，没有其他的组件
        beforeAll(async () => {
            const addComponentInfo: IAddComponentOptions = {
                nodePath: nodePath,
                component: testComponent
            };
            try {
                const component = await ComponentProxy.add(addComponentInfo);
                componentPath = component.path;
                expect(component.path).toBe(`${nodePath}/cc.Label`);
                componentInfo = await ComponentProxy.query({ path: componentPath }) as IComponentInfo;
                expect(componentInfo).toBeDefined();
                queryComponent.path = componentPath;
            } catch (e) {
                console.log(`设置组件属性测试 - 设置不同类型的属性 - 异常 : ${e}`);
            }
        });
        afterAll(async () => {
            try {
                const result = await ComponentProxy.remove({ path: componentPath });
                expect(result).toBe(true);
            } catch (e) {
                console.log(`组合测试 - 添加多个相同节点 - 错误 ${e}`);
                throw e;
            }
            console.log('组合测试 - 添加多个相同节点 - 结束');
        });
        it('setProperty - 设置组件属性 - number类型', async () => {
            try {
                expect(componentInfo?.properties['fontSize'].value).toBe(40);

                const setComponentProperty: ISetPropertyOptionsInfo = {
                    componentPath: componentPath,
                    properties: {
                        fontSize: 80,
                    }
                };
                const result = await ComponentProxy.setProperty(setComponentProperty);
                expect(result).toBe(true);
                componentInfo = await ComponentProxy.query(queryComponent) as IComponentInfo;
                expect(componentInfo?.properties['fontSize'].value).toBe(80);
            } catch (e) {
                console.log(`setComponentProperty test error:  ${e}`);
                throw e;
            }
        });
        it('setProperty - 设置组件属性 - enum类型', async () => {
            try {
                const setComponentProperty: ISetPropertyOptionsInfo = {
                    componentPath: componentPath,
                    properties: { overflow: 1 },
                };
                expect(componentInfo?.properties['overflow'].value).toBe(0);
                const result = await ComponentProxy.setProperty(setComponentProperty);
                expect(result).toBe(true);
                componentInfo = await ComponentProxy.query(queryComponent) as IComponentInfo;
                expect(componentInfo?.properties['overflow'].value).toBe(1);
            } catch (e) {
                console.log(`setComponentProperty test error:  ${e}`);
                throw e;
            }
        });
        it('setProperty - 设置组件属性 - boolean类型', async () => {
            try {
                const setComponentProperty: ISetPropertyOptionsInfo = {
                    componentPath: componentPath,
                    properties: { enableOutline: true },
                };
                expect(componentInfo?.properties['enableOutline'].value).toBe(false);
                const result = await ComponentProxy.setProperty(setComponentProperty);
                expect(result).toBe(true);
                componentInfo = await ComponentProxy.query(queryComponent) as IComponentInfo;
                expect(componentInfo?.properties['enableOutline'].value).toBe(true);
            } catch (e) {
                console.log(`setComponentProperty test error:  ${e}`);
                throw e;
            }
        });
        it('setProperty - 设置组件属性 - color类型', async () => {
            try {
                const setComponentProperty: ISetPropertyOptionsInfo = {
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
                componentInfo = await ComponentProxy.query(queryComponent) as IComponentInfo;
                expect(componentInfo?.properties['outlineColor'].value.r).toBe(50);
                expect(componentInfo?.properties['outlineColor'].value.g).toBe(100);
                expect(componentInfo?.properties['outlineColor'].value.b).toBe(150);
                expect(componentInfo?.properties['outlineColor'].value.a).toBe(200);
            } catch (e) {
                console.log(`setComponentProperty test error:  ${e}`);
                throw e;
            }
        });
        it('setProperty - 设置组件属性 - 设置枚举类型之外的值', async () => {
            try {
                const setComponentProperty: ISetPropertyOptionsInfo = {
                    componentPath: componentPath,
                    properties: {
                        overflow: 100000
                    }
                };
                expect(componentInfo?.properties['overflow'].value).toBe(1);
                const result = await ComponentProxy.setProperty(setComponentProperty);
                expect(result).toBe(true);
                componentInfo = await ComponentProxy.query(queryComponent) as IComponentInfo;
                expect(componentInfo?.properties['overflow'].value).toBe(100000);
            } catch (e) {
                console.log(`setComponentProperty test error:  ${e}`);
                throw e;
            }
        });
    });
    describe('4.1 设置Sprite属性测试', () => {
        const testComponent: string = 'cc.Sprite';
        let componentInfo: IComponentInfo | null;
        let componentPath: string = '';
        const queryComponent: IQueryComponentOptions = { path: '' };
        // 确保测试了中，没有其他的组件
        beforeAll(async () => {
            const addComponentInfo: IAddComponentOptions = {
                nodePath: nodePath,
                component: testComponent
            };
            try {
                const component = await ComponentProxy.add(addComponentInfo);
                componentPath = component.path;
                expect(component.path).toBe(`${nodePath}/cc.Sprite`);
                componentInfo = await ComponentProxy.query({ path: componentPath }) as IComponentInfo;
                expect(componentInfo).toBeDefined();
                queryComponent.path = componentPath;
            } catch (e) {
                console.log(`设置组件属性测试 - 设置不同类型的属性 - 异常 : ${e}`);
                throw e;
            }
        });
        afterAll(async () => {
            try {
                const result = await ComponentProxy.remove({ path: componentPath });
                expect(result).toBe(true);
            } catch (e) {
                console.log(`组合测试 - 添加多个相同节点 - 错误 ${e}`);
                throw e;
            }
        });
        it('setProperty - 设置组件属性 - 设置SpriteFrame', async () => {
            try {
                // 对错误的值 类型 会修改失败，但是返回还是true
                const setComponentProperty: ISetPropertyOptionsInfo = {
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
                componentInfo = await ComponentProxy.query(queryComponent) as IComponentInfo;
                expect(componentInfo?.properties['spriteFrame'].value.uuid).toBe('20835ba4-6145-4fbc-a58a-051ce700aa3e@f9941');
            } catch (e) {
                console.log(`setComponentProperty test error:  ${e}`);
                throw e;
            }
        });
    });

    describe('4.2 设置组件属性测试 - array类型', () => {
        let animCompPath = '';
        beforeAll(async () => {
            const comp = await ComponentProxy.add({ nodePath, component: 'cc.Animation' });
            animCompPath = comp.path;
        });
        afterAll(async () => {
            await ComponentProxy.remove({ path: animCompPath });
        });

        it('setProperty - 设置组件属性 - array类型 (clips 设为空数组)', async () => {
            try {
                const setComponentProperty: ISetPropertyOptionsInfo = {
                    componentPath: animCompPath,
                    properties: {
                        clips: []
                    }
                };
                const result = await ComponentProxy.setProperty(setComponentProperty);
                expect(result).toBe(true);
                const updated = await ComponentProxy.query({ path: animCompPath }) as IComponentInfo;
                expect(Array.isArray(updated.properties['clips'].value)).toBe(true);
                expect(updated.properties['clips'].value.length).toBe(0);
            } catch (e) {
                console.log(`setComponentProperty array test error: ${e}`);
                throw e;
            }
        });

        it('setProperty - 设置组件属性 - array类型 (clips 设为包含3个空资源的数组)', async () => {
            try {
                const setComponentProperty: ISetPropertyOptionsInfo = {
                    componentPath: animCompPath,
                    properties: {
                        clips: [
                            { uuid: '' },
                            { uuid: '' },
                            { uuid: '' },
                        ]
                    }
                };
                const result = await ComponentProxy.setProperty(setComponentProperty);
                expect(result).toBe(true);
                const updated = await ComponentProxy.query({ path: animCompPath }) as IComponentInfo;
                expect(Array.isArray(updated.properties['clips'].value)).toBe(true);
                expect(updated.properties['clips'].value.length).toBe(3);
            } catch (e) {
                console.log(`setComponentProperty array test error: ${e}`);
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
                includeChildren: false,
                includeComponents: true
            };
            const result = await NodeProxy.query(params) as INodeInfo | null;
            expect(result).toBeDefined();
            expect(result?.components?.length == 0);
        });

        it('add -添加内置组件测试 - 这个测试例设计有问题，可以忽略。', async () => {
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
                    const component = await ComponentProxy.add(componentInfo1);
                    createdComponents.push(component);
                } catch (e) {
                    // 这里会产生冲突、重复组件(因为依赖会创建一些重复组件，导致测试会异常), 这是正常的异常
                    console.log(`添加组件异常：${componentType} , 异常原因 ${e}`);
                    exceptionalComponentTypes.push(componentType);
                }

                try {
                    const params: IQueryNodeParams = {
                        path: nodePath,
                        includeChildren: false,
                        includeComponents: true
                    };
                    const node = await NodeProxy.query(params) as INodeInfo | null;
                    for (let i = 0; i < node!.components!.length; ++i) {
                        await ComponentProxy.remove({ path: node!.components!.at(i)!.path });
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
        const nodes: INodeInfo[] = [];
        beforeAll(async () => {
            for (let i = 0; i < testCount; ++i) {
                const params: ICreateByNodeTypeParams = {
                    path: 'TestNode',
                    nodeType: NodeType.EMPTY,
                    position: { x: 1, y: 2, z: 0 },
                };
                const testNode = await NodeProxy.createByType(params);
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
                await NodeProxy.delete(params);
                expect(params).toBeDefined();
            }
        });

        it('add -每个组件添加同一个组件，但是最后的组件名是一样的，只是节点名称不一样', async () => {
            try {
                const testComponent = 'cc.Layout';
                for (let i = 0; i < nodes.length; ++i) {
                    const componentInfo1: IAddComponentOptions = {
                        nodePath: nodes[i].path,
                        component: testComponent,
                    };
                    const component = await ComponentProxy.add(componentInfo1);
                    expect(component).toBeDefined();
                    expect(component.path).toBe(`${nodes[i].path}/cc.Layout`);
                }
                for (let i = 0; i < nodes.length; ++i) {
                    const componentInfo1: IAddComponentOptions = {
                        nodePath: nodes[i].path,
                        component: testComponent,
                    };
                    const component = await ComponentProxy.add(componentInfo1);
                    expect(component).toBeDefined();
                    expect(component.path).toBe(`${nodes[i].path}/cc.Layout_001`);
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
            const testNode = await NodeProxy.createByType(params);
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
            await NodeProxy.delete(params);
            expect(params).toBeDefined();
        });

        it('add -添加多个不允许并存的组件', async () => {
            const testComponent = 'cc.Label';
            const componentInfo: IAddComponentOptions = {
                nodePath: nodePath,
                component: testComponent,
            };
            let component = await ComponentProxy.add(componentInfo);
            expect(component).toBeDefined();
            expect(component.path).toBe(`${nodePath}/${testComponent}`);
            try {
                component = await ComponentProxy.add(componentInfo);
            } catch (e) {
                // 添加接受相同组件添加的错误
                expect(e instanceof Error ? e.message : String(e)).toBe(`Can't add component '${testComponent}' because ${nodeName} already contains the same component.`);
                expect(component.path).toBe(`${nodePath}/${testComponent}`);
            }
            const result = await ComponentProxy.remove({ path: component.path });
            expect(result).toBe(true);
        });
        it('add -添加多个冲突的组件', async () => {
            const testComponent = 'cc.Sprite';
            const testConfictsComponent = 'cc.Line';
            const componentInfo: IAddComponentOptions = {
                nodePath: nodePath,
                component: testComponent,
            };
            let component = await ComponentProxy.add(componentInfo);
            expect(component).toBeDefined();
            expect(component.path).toBe(`${nodePath}/${testComponent}`);
            try {
                const componentConficts: IAddComponentOptions = {
                    nodePath: nodePath,
                    component: testConfictsComponent,
                };
                component = await ComponentProxy.add(componentConficts);
            } catch (e) {
                // 添加异常冲突
                expect(e instanceof Error ? e.message : String(e)).toBe(`Can't add component '${testConfictsComponent}' to ${nodeName} because it conflicts with the existing '${testComponent}' derived component.`);
                expect(component.path).toBe(`${nodePath}/${testComponent}`);
            }
        });
    });


    describe('9. query - IComponentInfo 结构验证', () => {
        let componentPath = '';
        let componentUuid = '';
        beforeAll(async () => {
            const addComponentInfo: IAddComponentOptions = {
                nodePath: nodePath,
                component: 'cc.Label',
            };
            const component = await ComponentProxy.add(addComponentInfo);
            componentPath = component.path;
            componentUuid = component.uuid;
        });
        afterAll(async () => {
            await ComponentProxy.remove({ path: componentPath });
        });

        it('query - cli 返回 IComponentInfo 结构', async () => {
            const params: IQueryComponentOptions = {
                path: componentPath,
            };
            const result = await ComponentProxy.query(params) as IComponentInfo;
            expect(result).toBeDefined();
            expect(result.properties).toBeDefined();
            expect(typeof result.properties).toBe('object');
            expect(result.path).toBeDefined();
            expect(result.uuid).toBeDefined();
            expect(typeof result.name).toBe('string');
            expect(typeof result.enabled).toBe('boolean');
            expect(result.cid).toBe('cc.Label');
        });

        it('query - IComponentInfo 字段完整性验证', async () => {
            const result = await ComponentProxy.query({ path: componentPath }) as IComponentInfo;
            expect(result).toBeDefined();
            expect(result.cid).toBe('cc.Label');
            expect(result.path).toBe(componentPath);
            expect(result.uuid).toBe(componentUuid);
            expect(typeof result.name).toBe('string');
            expect(result.type).toBe('cc.Label');
            expect(typeof result.enabled).toBe('boolean');
            expect(typeof result.properties).toBe('object');
            expect(result.prefab).toBeNull();
        });
    });


    describe('15. setProperty - record 参数测试', () => {
        let componentPath = '';
        beforeAll(async () => {
            const queryNodeParam: IQueryNodeParams = {
                path: nodePath,
                includeChildren: false,
                includeComponents: false,
            };
            const nodeInfo = await NodeProxy.query(queryNodeParam) as INodeInfo | null;

            const addComponentInfo: IAddComponentOptions = {
                nodePath: nodePath,
                component: 'cc.Label',
            };
            const component = await ComponentProxy.add(addComponentInfo);

            componentPath = component.path;
        });
        afterAll(async () => {
            await ComponentProxy.remove({ path: componentPath });
        });

        it('setProperty - record:false 设置 string 属性', async () => {
            const result = await ComponentProxy.setProperty({
                componentPath: componentPath,
                properties: { string: 'pink-test' },
                record: false
            });
            expect(result).toBe(true);

            // 验证修改生效
            const updated = await ComponentProxy.query({
                path: componentPath,
            }) as IComponentInfo;
            expect(updated?.properties['string'].value).toBe('pink-test');
        });
    });

    describe('16. 组件命名规则测试 - 同类型组件自动添加后缀', () => {
        let testNodePath = '';
        beforeAll(async () => {
            const params: ICreateByNodeTypeParams = {
                path: 'TestNode',
                name: 'CompNamingTestNode',
                nodeType: NodeType.EMPTY,
                position: { x: 0, y: 0, z: 0 },
            };
            const testNode = await NodeProxy.createByType(params);
            expect(testNode).toBeDefined();
            testNodePath = testNode!.path;
        });
        afterAll(async () => {
            await NodeProxy.delete({ path: testNodePath, keepWorldTransform: false });
        });

        it('add - 唯一组件不添加后缀', async () => {
            const component = await ComponentProxy.add({
                nodePath: testNodePath,
                component: 'cc.Label',
            });
            expect(component).toBeDefined();
            expect(component.path).toBe(`${testNodePath}/cc.Label`);

            await ComponentProxy.remove({ path: component.path });
        });

        it('add - 两个不同类型组件各自不添加后缀', async () => {
            const comp1 = await ComponentProxy.add({
                nodePath: testNodePath,
                component: 'cc.Label',
            });
            const comp2 = await ComponentProxy.add({
                nodePath: testNodePath,
                component: 'cc.Layout',
            });
            expect(comp1.path).toBe(`${testNodePath}/cc.Label`);
            expect(comp2.path).toBe(`${testNodePath}/cc.Layout`);

            await ComponentProxy.remove({ path: comp2.path });
            await ComponentProxy.remove({ path: comp1.path });
        });

        it('add - 第二个同类型组件添加_001后缀', async () => {
            const comp1 = await ComponentProxy.add({
                nodePath: testNodePath,
                component: 'cc.Layout',
            });
            expect(comp1.path).toBe(`${testNodePath}/cc.Layout`);

            const comp2 = await ComponentProxy.add({
                nodePath: testNodePath,
                component: 'cc.Layout',
            });
            expect(comp2.path).toBe(`${testNodePath}/cc.Layout_001`);

            await ComponentProxy.remove({ path: comp2.path });
            await ComponentProxy.remove({ path: comp1.path });
        });

        it('add - 多个同类型组件依次添加_001,_002,...后缀', async () => {
            const totalCount = 5;
            const testComponent = 'cc.Layout';
            const components: IComponentIdentifier[] = [];

            for (let i = 0; i < totalCount; i++) {
                const comp = await ComponentProxy.add({
                    nodePath: testNodePath,
                    component: testComponent,
                });
                expect(comp).toBeDefined();
                if (i === 0) {
                    expect(comp.path).toBe(`${testNodePath}/${testComponent}`);
                } else {
                    expect(comp.path).toBe(`${testNodePath}/${testComponent}_${String(i).padStart(3, '0')}`);
                }
                components.push(comp);
            }

            for (const comp of components.reverse()) {
                await ComponentProxy.remove({ path: comp.path });
            }
        });

        it('add - 删除中间组件后新增应复用已删除的名称', async () => {
            const testComponent = 'cc.Layout';

            // 添加3个同类型组件: cc.Layout, cc.Layout_001, cc.Layout_002
            const comp0 = await ComponentProxy.add({ nodePath: testNodePath, component: testComponent });
            const comp1 = await ComponentProxy.add({ nodePath: testNodePath, component: testComponent });
            const comp2 = await ComponentProxy.add({ nodePath: testNodePath, component: testComponent });
            expect(comp0.path).toBe(`${testNodePath}/${testComponent}`);
            expect(comp1.path).toBe(`${testNodePath}/${testComponent}_001`);
            expect(comp2.path).toBe(`${testNodePath}/${testComponent}_002`);

            // 删除 _001
            const removeResult = await ComponentProxy.remove({ path: comp1.path });
            expect(removeResult).toBe(true);

            // 再添加2个，第一个应复用 _001，第二个为 _003
            const comp3 = await ComponentProxy.add({ nodePath: testNodePath, component: testComponent });
            const comp4 = await ComponentProxy.add({ nodePath: testNodePath, component: testComponent });
            expect(comp3.path).toBe(`${testNodePath}/${testComponent}_001`);
            expect(comp4.path).toBe(`${testNodePath}/${testComponent}_003`);

            // 清理
            await ComponentProxy.remove({ path: comp4.path });
            await ComponentProxy.remove({ path: comp3.path });
            await ComponentProxy.remove({ path: comp2.path });
            await ComponentProxy.remove({ path: comp0.path });
        });
    });

    describe('17. 边界情况与错误处理', () => {
        it('add - 添加到不存在的节点路径应抛异常', async () => {
            await expect(ComponentProxy.add({
                nodePath: 'non-existent-path',
                component: 'cc.Label',
            })).rejects.toThrow();
        });

        // it('remove - 移除不存在组件路径', async () => {
        //     const result = await ComponentProxy.remove({ path: `${nodePath}/cc.NonExistent` });
        //     expect(result).toBe(false);
        // });

        // it('query - 查询不存在组件返回 null', async () => {
        //     const result = await ComponentProxy.query({ path: `${nodePath}/cc.NonExistent` });
        //     expect(result).toBeNull();
        // });

        it('setProperty - 设置不存在组件路径应抛异常', async () => {
            await expect(ComponentProxy.setProperty({
                componentPath: `${nodePath}/cc.NonExistent`,
                properties: { string: 'test' },
            })).rejects.toThrow();
        });

        it('setProperty - 设置不存在的属性 key 应抛异常', async () => {
            const comp = await ComponentProxy.add({ nodePath, component: 'cc.Label' });
            try {
                await expect(ComponentProxy.setProperty({
                    componentPath: comp.path,
                    properties: { nonExistentProp: 42 },
                })).rejects.toThrow();
            } finally {
                await ComponentProxy.remove({ path: comp.path });
            }
        });

        it('setProperty - 同时设置多个属性', async () => {
            const comp = await ComponentProxy.add({ nodePath, component: 'cc.Label' });
            try {
                const result = await ComponentProxy.setProperty({
                    componentPath: comp.path,
                    properties: { fontSize: 60, string: 'multi-test' },
                });
                expect(result).toBe(true);

                const updated = await ComponentProxy.query({ path: comp.path }) as IComponentInfo;
                expect(updated.properties['fontSize'].value).toBe(60);
                expect(updated.properties['string'].value).toBe('multi-test');
            } finally {
                await ComponentProxy.remove({ path: comp.path });
            }
        });
    });

    describe('18. queryAll - 查询所有组件类型', () => {
        it('queryAll - 返回字符串数组', async () => {
            const result = await ComponentProxy.queryAll();
            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBeGreaterThan(0);
            for (const item of result) {
                expect(typeof item).toBe('string');
            }
        });

        it('queryAll - 包含已知内置组件', async () => {
            const result = await ComponentProxy.queryAll();
            expect(result).toContain('cc.Label');
            expect(result).toContain('cc.Sprite');
            expect(result).toContain('cc.Button');
        });
    });
});