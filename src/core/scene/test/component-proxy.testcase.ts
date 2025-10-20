import { Component, Prefab } from 'cc';
import type {
    ICreateByAssetParams,
    IDeleteNodeParams,
    IAddComponentOptions,
    IRemoveComponentOptions,
    IQueryComponentOptions,
    ISetPropertyOptions,
    IComponentInfo,
    IComponent
} from '../common';
import { ComponentProxy } from '../main-process/proxy/component-proxy';
import { NodeProxy } from '../main-process/proxy/node-proxy';

// 设置测试超时时间
jest.setTimeout(24 * 60 * 60 * 1000); // 24 小时，单位毫秒

describe('Component Proxy 测试', () => {
    let nodePath = '';
    let nodeId = '';
    beforeAll(async () => {
        const params: ICreateByAssetParams = {
            dbURL: 'db://internal/default_prefab/ui/Sprite.prefab',
            path: '/PrefabNode',
            name: 'PrefabNode',
        };

        const prefabNode = await NodeProxy.createNodeByAsset(params);
        expect(prefabNode).toBeDefined();
        expect(prefabNode?.name).toBe('PrefabNode');
        if (!prefabNode) {
            return;
        }
        nodePath = prefabNode.path;
        nodeId = prefabNode?.nodeId;
    });
    afterAll(async () => {
        try {
            const params: IDeleteNodeParams = {
                path: nodePath,
                keepWorldTransform: false
            };
            await NodeProxy.deleteNode(params);
        } catch (e) { }
    });

    describe('1. 基础组件操作- 添加，查询，设置属性，移除', () => {
        let componentPath = '';
        let componentInfo: IComponentInfo | null;
        it('addComponent - 添加节点', async () => {
            //console.log("Created prefab node path=", prefabNode?.path);
            const addComponentInfo: IAddComponentOptions = {
                nodePath: nodePath,
                component: 'cc.Label'
            }
            try {
                const component = await ComponentProxy.addComponent(addComponentInfo);
                componentPath = component.path;
                expect(component.path).toBe('cc.Label_1');
            } catch (e) {
                console.log(`addComponent test error: ${e}`);
            }
        });
        it('queryComponent - 查询组件', async () => {
            const queryComponent: IQueryComponentOptions = {
                path: componentPath
            }
            try {
                componentInfo = await ComponentProxy.queryComponent(queryComponent);
                expect(componentInfo).toBeDefined();
                if (componentInfo!.cid) {
                    expect(componentInfo!.cid).toBe('cc.Label');
                }
                if (componentInfo!.name) {
                    expect(componentInfo!.name).toBe('PrefabNode<Label>');
                }
                if (componentInfo!.type) {
                    expect(componentInfo!.type).toBe('cc.Label');
                }
            } catch (e) {
                console.log(`queryComponent test error:  ${e}`);
            }
        });
        it('setComponentProperty - 查询组件 - string类型', async () => {
            const queryComponent: IQueryComponentOptions = {
                path: componentPath
            }
            try {
                const setComponentProperty: ISetPropertyOptions = {
                    componentPath: componentPath,
                    mountPath: componentInfo?.properties.value['string'].name,
                    properties: componentInfo?.properties.value['string'],
                }
                expect(componentInfo?.properties.value['string'].value).toBe('label');
                setComponentProperty.properties.value = 'abc';
                const result = await ComponentProxy.setProperty(setComponentProperty);
                expect(result).toBe(true);
                componentInfo = await ComponentProxy.queryComponent(queryComponent);
                expect(componentInfo?.properties.value['string'].value).toBe('abc');
            } catch (e) {
                console.log(`setComponentProperty test error:  ${e}`);
            }
        });

        it('removeComponent - 删除组件', async () => {
            const removeComponentInfo: IRemoveComponentOptions = {
                path: componentPath
            }
            try {
                const result = await ComponentProxy.removeComponent(removeComponentInfo);
                expect(result).toBe(true);
            } catch (e) {
                console.log(`removeComponent test error:  ${e}`);
            }
        });
    });

    describe('2. 组合测试 - 添加多个不同节点', () => {
        let testComponents: string[] = ['cc.Label', 'cc.Mask', 'cc.AudioSource'];
        let components: IComponent[] = [];
        // 确保测试了中，没有其他的组件
        beforeAll(async () => {
            try {
                for (const componentName of testComponents) {
                    const queryComponent = await ComponentProxy.queryComponent({ path: `${componentName}_1` });
                    expect(queryComponent).toBeNull();
                };
                console.log('组合测试 - 添加多个不同节点 - 开始');
            } catch (e) {
                console.log(`组合测试 - 添加多个不同节点 - 异常 : ${e}`);
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
            }
            console.log('组合测试 - 添加多个不同节点 - 结束');
        });
        it('addComponent - 添加多个不同节点', async () => {
            try {
                for (const componentName of testComponents) {
                    const componentInfo: IAddComponentOptions = {
                        nodePath: nodePath,
                        component: componentName
                    }
                    const component = await ComponentProxy.addComponent(componentInfo);
                    expect(component.path).toBe(`${componentName}_1`);
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
            }
        });
    });
    describe('3. 组合测试 - 添加多个相同节点', () => {
        const testCount = 10;
        let testComponent: string = 'cc.Label';
        let components: IComponent[] = [];
        // 确保测试了中，没有其他的组件
        beforeAll(async () => {
            try {
                for (let i = 0; i < testCount; i++) {
                    const queryComponent = await ComponentProxy.queryComponent({ path: `${testComponent}_${i + 1}` });
                    expect(queryComponent).toBeNull();
                }
                console.log('组合测试 - 添加多个相同节点 - 开始');
            } catch (e) {
                console.log(`组合测试 - 添加多个相同节点 - 异常 : ${e}`);
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
            }
            console.log('组合测试 - 添加多个相同节点 - 结束');
        });
        it('addComponent - 添加多个相同节点', async () => {
            try {
                for (let i = 0; i < testCount; i++) {
                    const componentInfo1: IAddComponentOptions = {
                        nodePath: nodePath,
                        component: testComponent
                    }
                    const component = await ComponentProxy.addComponent(componentInfo1);
                    expect(component.path).toBe(`${testComponent}_${i + 1}`);
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
            }
        });
    });
    describe('4. 设置组件属性测试 - 设置不同类型的属性', () => {
        let testComponent: string = 'cc.Label';
        let componentInfo: IComponentInfo | null;
        let componentPath: string = '';
        const queryComponent: IQueryComponentOptions = { path: '' };
        // 确保测试了中，没有其他的组件
        beforeAll(async () => {
            const addComponentInfo: IAddComponentOptions = {
                nodePath: nodePath,
                component: testComponent
            }
            try {
                componentInfo = await ComponentProxy.queryComponent(queryComponent);
                expect(componentInfo).toBeNull();
                const component = await ComponentProxy.addComponent(addComponentInfo);
                componentPath = component.path;
                expect(component.path).toBe('cc.Label_1');
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
            }
            console.log('组合测试 - 添加多个相同节点 - 结束');
        });
        it('setComponentProperty - 查询组件 - number类型', async () => {
            try {
                const setComponentProperty: ISetPropertyOptions = {
                    componentPath: componentPath,
                    mountPath: componentInfo?.properties.value['fontSize'].name,
                    properties: componentInfo?.properties.value['fontSize'],
                }
                expect(componentInfo?.properties.value['fontSize'].value).toBe(40);
                setComponentProperty.properties.value = 80;
                const result = await ComponentProxy.setProperty(setComponentProperty);
                expect(result).toBe(true);
                componentInfo = await ComponentProxy.queryComponent(queryComponent);
                expect(componentInfo?.properties.value['fontSize'].value).toBe(80);
            } catch (e) {
                console.log(`setComponentProperty test error:  ${e}`);
            }
        });
        it('setComponentProperty - 查询组件 - enum类型', async () => {
            try {
                const setComponentProperty: ISetPropertyOptions = {
                    componentPath: componentPath,
                    mountPath: componentInfo?.properties.value['overflow'].name,
                    properties: componentInfo?.properties.value['overflow'],
                }
                expect(componentInfo?.properties.value['overflow'].value).toBe(0);
                setComponentProperty.properties.value = 1;
                const result = await ComponentProxy.setProperty(setComponentProperty);
                expect(result).toBe(true);
                componentInfo = await ComponentProxy.queryComponent(queryComponent);
                expect(componentInfo?.properties.value['overflow'].value).toBe(1);
            } catch (e) {
                console.log(`setComponentProperty test error:  ${e}`);
            }
        });
        it('setComponentProperty - 查询组件 - boolean类型', async () => {
            try {
                const setComponentProperty: ISetPropertyOptions = {
                    componentPath: componentPath,
                    mountPath: componentInfo?.properties.value['enableOutline'].name,
                    properties: componentInfo?.properties.value['enableOutline'],
                }
                expect(componentInfo?.properties.value['enableOutline'].value).toBe(false);
                setComponentProperty.properties.value = true;
                const result = await ComponentProxy.setProperty(setComponentProperty);
                expect(result).toBe(true);
                componentInfo = await ComponentProxy.queryComponent(queryComponent);
                expect(componentInfo?.properties.value['enableOutline'].value).toBe(true);
            } catch (e) {
                console.log(`setComponentProperty test error:  ${e}`);
            }
        });
        it('setComponentProperty - 查询组件 - color类型', async () => {
            try {
                const setComponentProperty: ISetPropertyOptions = {
                    componentPath: componentPath,
                    mountPath: componentInfo?.properties.value['outlineColor'].name,
                    properties: componentInfo?.properties.value['outlineColor'],
                }
                expect(componentInfo?.properties.value['outlineColor'].value.r).toBe(0);
                expect(componentInfo?.properties.value['outlineColor'].value.g).toBe(0);
                expect(componentInfo?.properties.value['outlineColor'].value.b).toBe(0);
                expect(componentInfo?.properties.value['outlineColor'].value.a).toBe(255);
                setComponentProperty.properties.value.r = 50;
                setComponentProperty.properties.value.g = 100;
                setComponentProperty.properties.value.b = 150;
                setComponentProperty.properties.value.a = 200;
                const result = await ComponentProxy.setProperty(setComponentProperty);
                expect(result).toBe(true);
                componentInfo = await ComponentProxy.queryComponent(queryComponent);
                expect(componentInfo?.properties.value['outlineColor'].value.r).toBe(50);
                expect(componentInfo?.properties.value['outlineColor'].value.g).toBe(100);
                expect(componentInfo?.properties.value['outlineColor'].value.b).toBe(150);
                expect(componentInfo?.properties.value['outlineColor'].value.a).toBe(200);
            } catch (e) {
                console.log(`setComponentProperty test error:  ${e}`);
            }
        });
        it('setComponentProperty - 查询组件 - 设置枚举类型之外的值', async () => {
            try {
                const setComponentProperty: ISetPropertyOptions = {
                    componentPath: componentPath,
                    mountPath: componentInfo?.properties.value['overflow'].name,
                    properties: componentInfo?.properties.value['overflow'],
                }
                expect(componentInfo?.properties.value['overflow'].value).toBe(1);
                setComponentProperty.properties.value = 100000;
                const result = await ComponentProxy.setProperty(setComponentProperty);
                expect(result).toBe(true);
                componentInfo = await ComponentProxy.queryComponent(queryComponent);
                expect(componentInfo?.properties.value['overflow'].value).toBe(100000);
            } catch (e) {
                console.log(`setComponentProperty test error:  ${e}`);
            }
        });
        it('setComponentProperty - 查询组件 - 设置不同类型的值', async () => {
            try {
                // 对错误的值 类型 会修改失败，但是返回还是true
                const setComponentProperty: ISetPropertyOptions = {
                    componentPath: componentPath,
                    mountPath: componentInfo?.properties.value['outlineColor'].name,
                    properties: componentInfo?.properties.value['outlineColor'],
                }
                expect(componentInfo?.properties.value['outlineColor'].value.r).toBe(50);
                expect(componentInfo?.properties.value['outlineColor'].value.g).toBe(100);
                expect(componentInfo?.properties.value['outlineColor'].value.b).toBe(150);
                expect(componentInfo?.properties.value['outlineColor'].value.a).toBe(200);
                setComponentProperty.properties.value = 50;
                const result = await ComponentProxy.setProperty(setComponentProperty);
                expect(result).toBe(true);
                componentInfo = await ComponentProxy.queryComponent(queryComponent);
                expect(componentInfo?.properties.value['outlineColor'].value.r).toBe(50);
                expect(componentInfo?.properties.value['outlineColor'].value.g).toBe(100);
                expect(componentInfo?.properties.value['outlineColor'].value.b).toBe(150);
                expect(componentInfo?.properties.value['outlineColor'].value.a).toBe(200);
            } catch (e) {
                console.log(`setComponentProperty test error:  ${e}`);
            }
        });
    });
});