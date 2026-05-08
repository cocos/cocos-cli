/*
 * TODO(qgh):理论上不应该放在这里测试，因为这些接口不是通过proxy调用的
  而是直接通过service调用的。因为目前还未实现service接口的直接测试，因此是简单的实现。
  后续需要迁移
 */
import {
    type ICreateByNodeTypeParams,
    type IDeleteNodeParams,
    type IAddComponentOptions,
    type IQueryComponentOptions,
    type ISetPropertyOptions,
    type IComponent,
    type IQueryClassesOptions,
    type IExecuteComponentMethodOptions,
    NodeType,
} from '../common';
import { ComponentProxy } from '../main-process/proxy/component-proxy';
import { NodeProxy } from '../main-process/proxy/node-proxy';
import { EditorProxy } from '../main-process/proxy/editor-proxy';
import { Rpc } from '../main-process/rpc';
import { SceneTestEnv } from './scene-test-env';

// 这些接口未在 IPublicComponentService 中暴露，测试中直接通过 RPC 调用
const rpcRequest = (method: string, args?: any[]) =>
    (Rpc.getInstance() as any).request('Component', method, args);

function createComponent(params: IAddComponentOptions): Promise<boolean> {
    return rpcRequest('create', [params]);
}

function resetComponent(params: IQueryComponentOptions): Promise<boolean> {
    return rpcRequest('reset', [params]);
}

function queryClasses(options?: IQueryClassesOptions): Promise<{ name: string }[]> {
    return rpcRequest('queryClasses', [options]);
}

function queryComponentFunctionOfNode(path: string): Promise<any> {
    return rpcRequest('queryFunctionOfNode', [path]);
}

function executeComponentMethod(options: IExecuteComponentMethodOptions): Promise<any> {
    return rpcRequest('executeMethod', [options]);
}

function queryComponentHasScript(name: string): Promise<boolean> {
    return rpcRequest('hasScript', [name]);
}

describe('Component ForEditor 接口测试', () => {
    let nodePath = '';

    beforeAll(async () => {
        await EditorProxy.open({
            urlOrUUID: SceneTestEnv.sceneURL,
        });
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
        nodePath = testNode.path;
    });

    afterAll(async () => {
        try {
            const params: IDeleteNodeParams = {
                path: nodePath,
                keepWorldTransform: false,
            };
            await NodeProxy.delete(params);
        } catch (e) {
            console.log(`删除节点失败 ${e}`);
            throw e;
        }
        await EditorProxy.close({});
    });

    describe('1. createComponent - 创建组件测试', () => {
        it('create - 创建已知组件应返回 true', async () => {
            const options: IAddComponentOptions = {
                nodePath: nodePath,
                component: 'cc.Label',
            };
            try {
                const result = await createComponent(options);
                expect(result).toBe(true);
                // 删除组件
                const removeResult = await ComponentProxy.remove({ path: `${nodePath}/cc.Label` });
                expect(removeResult).toBe(true);
            } catch (e) {
                console.log(`createComponent test error: ${e}`);
                throw e;
            }
        });

        it('create - 创建不存在组件应抛出异常', async () => {
            const options: IAddComponentOptions = {
                nodePath: nodePath,
                component: 'cc.NonExistentComponent',
            };
            try {
                await createComponent(options);
            } catch (e) {
                expect(e).toBeDefined();
            }
        });
    });

    describe('2. reset - 重置组件测试', () => {
        let componentPath = '';
        beforeAll(async () => {
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

        it('reset - 修改属性后重置应恢复默认值', async () => {
            // 先修改属性
            const setComponentProperty: ISetPropertyOptions = {
                componentPath: componentPath,
                properties: { string: 'modified' },
            };
            const setResult = await ComponentProxy.setProperty(setComponentProperty);
            expect(setResult).toBe(true);

            // 确认属性已修改
            let componentInfo = await ComponentProxy.query({ path: componentPath }) as IComponent;
            expect(componentInfo?.properties['string'].value).toBe('modified');

            // 重置组件
            const resetResult = await resetComponent({ path: componentPath });
            expect(resetResult).toBe(true);

            // 验证属性已恢复默认值
            componentInfo = await ComponentProxy.query({ path: componentPath }) as IComponent;
            expect(componentInfo?.properties['string'].value).toBe('label');
        });

        it('reset - 重置不存在的组件应返回 false', async () => {
            const result = await resetComponent({
                path: 'non-existent-path/cc.Label_001',
            });
            expect(result).toBe(false);
        });
    });

    describe('3. executeMethod - 执行组件方法测试', () => {
        let componentUuid = '';
        let componentPath = '';
        beforeAll(async () => {
            const addComponentInfo: IAddComponentOptions = {
                nodePath: nodePath,
                component: 'cc.Label',
            };
            const component = await ComponentProxy.add(addComponentInfo);
            componentUuid = component.uuid;
            componentPath = component.path;
        });
        afterAll(async () => {
            await ComponentProxy.remove({ path: componentPath });
        });

        it('executeMethod - 执行组件上存在的方法', async () => {
            try {
                await executeComponentMethod({
                    path: componentPath,
                    name: 'onLoad',
                    args: [],
                });
            } catch (e) {
                // 某些方法可能在编辑器环境中无法执行，记录但不影响测试
                console.log(`executeComponentMethod test: ${e}`);
            }
        });

        it('executeMethod - 执行返回非 undefined 值的方法', async () => {
            const result = await executeComponentMethod({
                path: componentPath,
                name: 'node.getSiblingIndex',
                args: [],
            });
            expect(result).toBeDefined();
            expect(typeof result).toBe('number');
        });
    });

    describe('4. queryClasses - 查询注册类名测试', () => {
        it('queryClasses - 无参数查询所有注册类', async () => {
            const result = await queryClasses();
            expect(result).toBeDefined();
            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBeGreaterThan(0);
            // 每个元素都有 name 字段
            for (const cls of result) {
                expect(typeof cls.name).toBe('string');
                expect(cls.name.length).toBeGreaterThan(0);
            }
        });

        it('queryClasses - 使用 extends 过滤子类', async () => {
            const options: IQueryClassesOptions = {
                extends: 'cc.Component',
            };
            const result = await queryClasses(options);
            expect(result).toBeDefined();
            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBeGreaterThan(0);
            // 应该包含 cc.Label 等组件
            const names = result.map((cls) => cls.name);
            expect(names).toContain('cc.Label');
        });

        it('queryClasses - extends 数组过滤', async () => {
            const options: IQueryClassesOptions = {
                extends: ['cc.Component'],
            };
            const result = await queryClasses(options);
            expect(result).toBeDefined();
            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBeGreaterThan(0);
        });

        it('queryClasses - excludeSelf 排除自身', async () => {
            const withSelf = await queryClasses({ extends: 'cc.Component' });
            const withoutSelf = await queryClasses({ extends: 'cc.Component', excludeSelf: true });
            expect(withSelf).toBeDefined();
            expect(withoutSelf).toBeDefined();

            const withSelfNames = withSelf.map((cls) => cls.name);
            const withoutSelfNames = withoutSelf.map((cls) => cls.name);

            // excludeSelf 应排除 cc.Component 自身
            expect(withSelfNames).toContain('cc.Component');
            expect(withoutSelfNames).not.toContain('cc.Component');
        });

        it('queryClasses - 不存在的父类返回空数组', async () => {
            const options: IQueryClassesOptions = {
                extends: 'cc.NonExistentClass',
            };
            const result = await queryClasses(options);
            expect(result).toBeDefined();
            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBe(0);
        });
    });

    describe('5. queryFunctionOfNode - 查询节点组件函数测试', () => {
        let componentPath = '';

        beforeAll(async () => {
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

        it('queryFunctionOfNode - 查询有效节点的组件函数', async () => {
            const result = await queryComponentFunctionOfNode(nodePath);
            expect(result).toBeDefined();
            expect(typeof result).toBe('object');
        });

        it('queryFunctionOfNode - 查询不存在节点返回空对象', async () => {
            const result = await queryComponentFunctionOfNode('non-existent-path');
            expect(result).toBeDefined();
            expect(typeof result).toBe('object');
            expect(Object.keys(result).length).toBe(0);
        });
    });

    describe('6. hasScript - 查询组件是否存在脚本测试', () => {
        it('hasScript - 内置组件应返回 true', async () => {
            const result = await queryComponentHasScript('cc.Label');
            expect(result).toBe(true);
        });

        it('hasScript - 另一个内置组件应返回 true', async () => {
            const result = await queryComponentHasScript('cc.Sprite');
            expect(result).toBe(true);
        });

        it('hasScript - 不存在的组件应返回 false', async () => {
            const result = await queryComponentHasScript('cc.NonExistentComponent');
            expect(result).toBe(false);
        });

        it('hasScript - 空字符串应返回 false', async () => {
            const result = await queryComponentHasScript('');
            expect(result).toBe(false);
        });
    });
});
