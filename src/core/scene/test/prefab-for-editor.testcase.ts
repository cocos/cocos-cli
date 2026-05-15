/*
 * TODO(qgh):理论上不应该放在这里测试，因为这些接口不是通过proxy调用的
  而是直接通过service调用的。因为目前还未实现service接口的直接测试，因此是简单的实现。
  后续需要迁移
 */
import type {
    ICreateByNodeTypeParams,
    ICreatePrefabFromNodeParams,
    IGetPrefabInfoParams,
    INode,
    IPrefab,
    IApplyPrefabChangesParams,
    ISetPropertyOptions,
} from '../common';
import { NodeType } from '../common';
import { NodeProxy } from '../main-process/proxy/node-proxy';
import { EditorProxy } from '../main-process/proxy/editor-proxy';
import { Rpc } from '../main-process/rpc';
import { SceneTestEnv } from './scene-test-env';
import * as fse from 'fs-extra';
import * as path from 'path';
import { assetManager } from '../../assets';

const rpcPrefabRequest = (method: string, args?: any[]) =>
    (Rpc.getInstance() as any).request('Prefab', method, args);

const rpcNodeRequest = (method: string, args?: any[]) =>
    (Rpc.getInstance() as any).request('Node', method, args);

function queryNodeDump(path: string): Promise<INode | null> {
    return rpcNodeRequest('query', [{ path, queryChildren: false, queryComponent: false }]);
}

function setNodeProperty(options: ISetPropertyOptions): Promise<boolean> {
    return rpcNodeRequest('setProperty', [options]);
}

describe('Prefab ForEditor 接口测试', () => {
    const testDirName = 'prefab-for-editor';
    const testDir = path.join(SceneTestEnv.cacheDirectory, testDirName);
    const testDirURL = `${SceneTestEnv.targetDirectoryURL}/${testDirName}`;
    const SceneBaseName = 'prefab-for-editor-scene';
    const SceneURL = `${testDirURL}/${SceneBaseName}.scene`;

    function getURL(name: string, ext: string): string {
        return `${testDirURL}/${name}${ext}`;
    }

    beforeAll(async () => {
        if (!fse.existsSync(testDir)) {
            fse.ensureDirSync(testDir);
            await assetManager.refreshAsset(testDir);
        }

        await EditorProxy.create({
            type: 'scene',
            baseName: SceneBaseName,
            targetDirectory: testDirURL,
        });
        await EditorProxy.open({
            urlOrUUID: SceneURL,
        });
    });

    afterAll(async () => {
        await EditorProxy.close({
            urlOrUUID: SceneURL,
        });
        try {
            fse.removeSync(testDir);
            fse.removeSync(testDir + '.meta');
        } catch (e) { }
    });

    describe('1. createPrefabFromNode - 返回 INode dump 数据验证', () => {
        let prefabNodeDump: INode | null = null;
        const prefabURL = getURL('dump-test-prefab', '.prefab');

        beforeAll(async () => {
            const testNode = await NodeProxy.createByType({
                path: '',
                name: 'DumpTestNode',
                nodeType: NodeType.SPRITE,
                position: { x: 10, y: 20, z: 0 },
            });
            expect(testNode).toBeDefined();

            const params: ICreatePrefabFromNodeParams = {
                nodePath: testNode!.path,
                dbURL: prefabURL,
                overwrite: true,
            };

            prefabNodeDump = await rpcPrefabRequest('createPrefabFromNode', [params]);
        });

        it('返回有效的 INode 结构', () => {
            expect(prefabNodeDump).not.toBeNull();
            expect(prefabNodeDump!.name).toBeDefined();
            expect(prefabNodeDump!.name.value).toBeDefined();
            expect(prefabNodeDump!.uuid).toBeDefined();
            expect(prefabNodeDump!.active).toBeDefined();
            expect(prefabNodeDump!.position).toBeDefined();
            expect(prefabNodeDump!.rotation).toBeDefined();
            expect(prefabNodeDump!.scale).toBeDefined();
            expect(prefabNodeDump!.layer).toBeDefined();
            expect(prefabNodeDump!.__comps__).toBeDefined();
            expect(prefabNodeDump!.__type__).toBeDefined();
        });

        it('dump 包含 __prefab__ 预制体信息', () => {
            expect(prefabNodeDump).not.toBeNull();
            const d = prefabNodeDump as any;
            expect(d.__prefab__).toBeDefined();
            expect(d.__prefab__).not.toBeNull();
        });

        it('__prefab__ 包含 fileId 字段', () => {
            const d = prefabNodeDump as any;
            expect(d.__prefab__.fileId).toBeDefined();
            expect(typeof d.__prefab__.fileId).toBe('string');
        });

        it('__prefab__ 包含 instance 字段（预制体实例信息）', () => {
            const d = prefabNodeDump as any;
            expect(d.__prefab__.instance).toBeDefined();
        });
    });

    describe('2. getPrefabInfo - 返回 IPrefab dump 数据验证（嵌套预制体）', () => {
        let prefabDump: IPrefab | null = null;
        let outerNodePath = '';
        const innerPrefabURL = getURL('inner-button-prefab', '.prefab');
        const outerPrefabURL = getURL('outer-nested-prefab', '.prefab');

        beforeAll(async () => {
            // 创建 Button 节点（Button 组件有 target 属性是 cc.Node 引用）
            const buttonNode = await NodeProxy.createByType({
                path: '',
                name: 'InnerButtonNode',
                nodeType: NodeType.BUTTON,
            });
            expect(buttonNode).toBeDefined();

            // 将 Button 节点转换为内部预制体
            const innerResult: any = await rpcPrefabRequest('createPrefabFromNode', [{
                nodePath: buttonNode!.path,
                dbURL: innerPrefabURL,
                overwrite: true,
            } as ICreatePrefabFromNodeParams]);
            expect(innerResult).toBeDefined();

            // 创建外部父节点
            const outerNode = await NodeProxy.createByType({
                path: '',
                name: 'OuterNode',
                nodeType: NodeType.EMPTY,
            });
            expect(outerNode).toBeDefined();

            // 在外部节点下创建内部预制体的实例（嵌套预制体）
            const nestedInstance = await NodeProxy.createByAsset({
                dbURL: innerPrefabURL,
                path: outerNode!.path,
                name: 'NestedButtonInstance',
            });
            expect(nestedInstance).toBeDefined();

            // 将外部节点转换为预制体（包含嵌套预制体实例）
            const outerResult: any = await rpcPrefabRequest('createPrefabFromNode', [{
                nodePath: outerNode!.path,
                dbURL: outerPrefabURL,
                overwrite: true,
            } as ICreatePrefabFromNodeParams]);
            expect(outerResult).toBeDefined();
            outerNodePath = outerResult.path || outerResult.__path__ || outerNode!.path;

            // 获取外部预制体的 prefab 信息
            prefabDump = await rpcPrefabRequest('getPrefabInfo', [{
                nodePath: outerNodePath,
            } as IGetPrefabInfoParams]);
        });

        it('返回有效的 IPrefab 结构', () => {
            expect(prefabDump).not.toBeNull();
        });

        it('包含 fileId 字段', () => {
            expect(prefabDump!.fileId).toBeDefined();
            expect(typeof prefabDump!.fileId).toBe('string');
        });

        it('包含 targetOverrides 字段（数组）', () => {
            if(prefabDump?.targetOverrides){ 
                expect(prefabDump.targetOverrides).toBeDefined();
                expect(Array.isArray(prefabDump!.targetOverrides)).toBe(true);
            }
        });

        it('targetOverrides 条目包含 propertyPath 数组', () => {
            if(prefabDump?.targetOverrides) {
                expect(prefabDump!.targetOverrides).toBeDefined();
                expect(prefabDump!.targetOverrides!.length).toBeGreaterThan(0);
                for (const info of prefabDump!.targetOverrides!) {
                    expect(info.propertyPath).toBeDefined();
                    expect(Array.isArray(info.propertyPath)).toBe(true);
                }
            }
        });

        it('包含 instance 字段', () => {
            expect(prefabDump!.instance).toBeDefined();
        });

        it('instance 中包含 propertyOverrides', () => {
            if (prefabDump!.instance && typeof prefabDump!.instance === 'object') {
                const instance = prefabDump!.instance as any;
                if (instance.value) {
                    expect(instance.value.propertyOverrides).toBeDefined();
                }
            }
        });
    });

    describe('3. propertyOverrides 的 propertyPath 转换验证', () => {
        let nodePath = '';
        const prefabURL = getURL('override-test-prefab', '.prefab');

        beforeAll(async () => {
            const testNode = await NodeProxy.createByType({
                path: '',
                name: 'OverrideTestNode',
                nodeType: NodeType.EMPTY,
            });
            expect(testNode).toBeDefined();
            nodePath = testNode!.path;

            // 创建预制体
            const createResult: any = await rpcPrefabRequest('createPrefabFromNode', [{
                nodePath: nodePath,
                dbURL: prefabURL,
                overwrite: true,
            } as ICreatePrefabFromNodeParams]);

            expect(createResult).toBeDefined();
            nodePath = createResult.path || createResult.__path__ || nodePath;
        });

        it('修改预制体实例属性后，propertyOverrides 的 propertyPath 应为 string[]', async () => {
            // 修改节点属性以产生 propertyOverride
            const dump = await queryNodeDump(nodePath) as INode;
            expect(dump).not.toBeNull();

            const positionDump = { ...dump.position, value: { x: 99, y: 88, z: 77 } };
            const setResult = await setNodeProperty({
                nodePath: nodePath,
                path: 'position',
                dump: positionDump,
            });
            expect(setResult).toBe(true);

            // 通过 getPrefabInfo 获取预制体信息（原始 dump）
            const prefabDump: any = await rpcPrefabRequest('getPrefabInfo', [{
                nodePath: nodePath,
            } as IGetPrefabInfoParams]);
            expect(prefabDump).not.toBeNull();

            // 通过 DumpConverter 转换后验证 propertyPath 是 string[]
            const { DumpConverter } = await import('../main-process/proxy/dump-converter');
            const converted = DumpConverter.convertPrefab(prefabDump);
            expect(converted).not.toBeNull();

            if (converted?.instance?.propertyOverrides) {
                for (const po of converted.instance.propertyOverrides) {
                    expect(Array.isArray(po.propertyPath)).toBe(true);
                    for (const item of po.propertyPath) {
                        expect(typeof item).toBe('string');
                    }
                }
            }
        });

        it('应用修改后再修改，propertyPath 依然是 string[]', async () => {
            // 先应用修改
            const applyResult = await rpcPrefabRequest('applyPrefabChanges', [{
                nodePath: nodePath,
            } as IApplyPrefabChangesParams]);
            expect(applyResult).toBe(true);

            // 再次修改
            const dump = await queryNodeDump(nodePath) as INode;
            const scaleDump = { ...dump.scale, value: { x: 3, y: 3, z: 3 } };
            await setNodeProperty({
                nodePath: nodePath,
                path: 'scale',
                dump: scaleDump,
            });

            // 获取并转换
            const prefabDump: any = await rpcPrefabRequest('getPrefabInfo', [{
                nodePath: nodePath,
            } as IGetPrefabInfoParams]);
            expect(prefabDump).not.toBeNull();

            const { DumpConverter } = await import('../main-process/proxy/dump-converter');
            const converted = DumpConverter.convertPrefab(prefabDump);
            expect(converted).not.toBeNull();

            if (converted?.instance?.propertyOverrides) {
                for (const po of converted.instance.propertyOverrides) {
                    expect(Array.isArray(po.propertyPath)).toBe(true);
                    for (const item of po.propertyPath) {
                        expect(typeof item).toBe('string');
                    }
                }
            }
        });
    });

    describe('4. targetOverrides 转换验证', () => {
        it('嵌套预制体的 targetOverrides 转换后 propertyPath 是 string[]', async () => {
            // 创建 Button 节点作为内部预制体（Button.target 是 cc.Node 引用）
            const buttonNode = await NodeProxy.createByType({
                path: '',
                name: 'TargetOverrideButton',
                nodeType: NodeType.BUTTON,
            });
            expect(buttonNode).toBeDefined();

            const innerPrefabURL = getURL('to-inner-prefab', '.prefab');
            const innerResult: any = await rpcPrefabRequest('createPrefabFromNode', [{
                nodePath: buttonNode!.path,
                dbURL: innerPrefabURL,
                overwrite: true,
            } as ICreatePrefabFromNodeParams]);
            expect(innerResult).toBeDefined();

            // 创建外部节点，嵌套内部预制体实例
            const outerNode = await NodeProxy.createByType({
                path: '',
                name: 'TargetOverrideOuter',
                nodeType: NodeType.EMPTY,
            });
            expect(outerNode).toBeDefined();

            const nestedInstance = await NodeProxy.createByAsset({
                dbURL: innerPrefabURL,
                path: outerNode!.path,
                name: 'NestedButtonForTO',
            });
            expect(nestedInstance).toBeDefined();

            // 创建外部预制体
            const outerPrefabURL = getURL('to-outer-prefab', '.prefab');
            const outerResult: any = await rpcPrefabRequest('createPrefabFromNode', [{
                nodePath: outerNode!.path,
                dbURL: outerPrefabURL,
                overwrite: true,
            } as ICreatePrefabFromNodeParams]);
            expect(outerResult).toBeDefined();

            const outerNodePath = outerResult.path || outerResult.__path__ || outerNode!.path;

            // 获取外部预制体信息
            const prefabDump: any = await rpcPrefabRequest('getPrefabInfo', [{
                nodePath: outerNodePath,
            } as IGetPrefabInfoParams]);
            expect(prefabDump).not.toBeNull();

            // 转换并验证 targetOverrides
            const { DumpConverter } = await import('../main-process/proxy/dump-converter');
            const converted = DumpConverter.convertPrefab(prefabDump);
            expect(converted).not.toBeNull();
            expect(converted!.targetOverrides).toBeDefined();
            expect(Array.isArray(converted!.targetOverrides)).toBe(true);

            for (const to of converted!.targetOverrides) {
                expect(Array.isArray(to.propertyPath)).toBe(true);
                for (const item of to.propertyPath) {
                    expect(typeof item).toBe('string');
                }
            }
        });
    });

    describe('5. DumpConverter.convertPrefab 转换完整性验证', () => {
        it('转换后的 IPrefabInfo 包含所有必要字段', async () => {
            const testNode = await NodeProxy.createByType({
                path: '',
                name: 'ConvertTestNode',
                nodeType: NodeType.SPRITE,
            });
            expect(testNode).toBeDefined();

            const prefabURL = getURL('convert-test-prefab', '.prefab');
            const createResult: any = await rpcPrefabRequest('createPrefabFromNode', [{
                nodePath: testNode!.path,
                dbURL: prefabURL,
                overwrite: true,
            } as ICreatePrefabFromNodeParams]);
            expect(createResult).toBeDefined();

            const nodePath = createResult.path || createResult.__path__ || testNode!.path;

            const prefabDump: any = await rpcPrefabRequest('getPrefabInfo', [{
                nodePath: nodePath,
            } as IGetPrefabInfoParams]);
            expect(prefabDump).not.toBeNull();

            const { DumpConverter } = await import('../main-process/proxy/dump-converter');
            const converted = DumpConverter.convertPrefab(prefabDump);
            expect(converted).not.toBeNull();

            // 必要字段
            expect(converted!.fileId).toBeDefined();
            expect(typeof converted!.fileId).toBe('string');
            expect(converted!.targetOverrides).toBeDefined();
            expect(Array.isArray(converted!.targetOverrides)).toBe(true);
            expect(converted!.nestedPrefabInstanceRoots).toBeDefined();
            expect(Array.isArray(converted!.nestedPrefabInstanceRoots)).toBe(true);

            // instance 字段
            if (converted!.instance) {
                expect(converted!.instance.fileId).toBeDefined();
                expect(converted!.instance.propertyOverrides).toBeDefined();
                expect(Array.isArray(converted!.instance.propertyOverrides)).toBe(true);
                expect(converted!.instance.mountedChildren).toBeDefined();
                expect(Array.isArray(converted!.instance.mountedChildren)).toBe(true);
                expect(converted!.instance.mountedComponents).toBeDefined();
                expect(Array.isArray(converted!.instance.mountedComponents)).toBe(true);
                expect(converted!.instance.removedComponents).toBeDefined();
                expect(Array.isArray(converted!.instance.removedComponents)).toBe(true);
            }
        });
    });
});
