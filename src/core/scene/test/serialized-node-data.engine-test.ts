import { join } from 'path';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import type { Component, Node } from 'cc';
import { TestGlobalEnv } from '../../../tests/global-env';
import type { IEditorSessionSnapshot } from '../scene-process/service/core/editor-session';

const engineModules = [
    'cc', 'cc/editor/populate-internal-constants', 'cc/editor/serialization',
    'cc/editor/new-gen-anim', 'cc/editor/embedded-player', 'cc/editor/reflection-probe',
    'cc/editor/lod-group-utils', 'cc/editor/material', 'cc/editor/2d-misc',
    'cc/editor/offline-mappings', 'cc/editor/custom-pipeline', 'cc/editor/animation-clip-migration',
    'cc/editor/exotic-animation', 'cc/editor/color-utils',
];

describe('Serialized node data with the real engine', () => {
    let engine: typeof import('cc');
    let helpers: typeof import('../scene-process/service/node/serialized-node-data');
    let writablePath: string;
    let References: new () => Component & { target: Node | null; component: Component | null; nodes: Node[] };

    beforeAll(async () => {
        jest.resetModules();
        const { EngineLoader } = await import('cc/loader.js');
        engineModules.forEach(module => {
            jest.doMock(module, () => EngineLoader.getEngineModuleById(module), { virtual: true });
        });
        writablePath = await mkdtemp(join(tmpdir(), 'cocos-serialized-nodes-'));
        const { Engine } = await import('../../engine');
        await Engine.importEditorExtensions();
        const { default: preload } = await import('cc/preload');
        await preload({
            engineRoot: TestGlobalEnv.engineRoot,
            engineDev: join(TestGlobalEnv.engineRoot, 'bin/.cache/dev-cli'),
            writablePath,
            requiredModules: engineModules,
        });
        await Engine.initEditorExtensions();
        engine = await import('cc');
        class TestReferences extends engine.Component {
            target: Node | null = null;
            component: Component | null = null;
            nodes: Node[] = [];
        }
        engine._decorator.property(engine.Node)(TestReferences.prototype, 'target');
        engine._decorator.property(engine.Component)(TestReferences.prototype, 'component');
        engine._decorator.property([engine.Node])(TestReferences.prototype, 'nodes');
        engine._decorator.ccclass('SerializedNodeTestReferences')(TestReferences);
        References = TestReferences;
        helpers = await import('../scene-process/service/node/serialized-node-data');
    });

    afterAll(async () => {
        if (writablePath) {
            await rm(writablePath, { recursive: true, force: true });
        }
    });

    it('preserves cyclic references between roots and components with fresh identities on every creation', async () => {
        const first = new engine.Node('First');
        const second = new engine.Node('Second');
        const firstComponent = first.addComponent(References);
        const secondComponent = second.addComponent(References);
        firstComponent.target = second;
        firstComponent.component = secondComponent;
        firstComponent.nodes = [first, second];
        secondComponent.target = first;
        secondComponent.component = firstComponent;
        const data = helpers.serializeNodes([first, second]);
        const created = await helpers.deserializeNodes(JSON.parse(JSON.stringify(data)), 'clear');
        const again = await helpers.deserializeNodes(data, 'clear');
        const a = created[0].getComponent(References)!;
        const b = created[1].getComponent(References)!;
        expect([a.target, a.component, b.target, b.component, ...a.nodes])
            .toEqual([created[1], b, created[0], a, created[0], created[1]]);
        expect(new Set([first, second, ...created, ...again].map(node => node.uuid)).size).toBe(6);
        expect(new Set([firstComponent, secondComponent, a, b].map(component => component.uuid)).size).toBe(4);
        expect(firstComponent.target).toBe(second);
    });

    it('visits every path through shared component data without following cycles', () => {
        class SharedReferences extends engine.Component {
            first: Record<string, unknown> | null = null;
            second: Record<string, unknown> | null = null;
        }
        engine._decorator.property({ serializable: true })(SharedReferences.prototype, 'first');
        engine._decorator.property({ serializable: true })(SharedReferences.prototype, 'second');
        engine._decorator.ccclass('SerializedSharedReferences')(SharedReferences);

        const root = new engine.Node('Root');
        const target = new engine.Node('Target');
        const component = root.addComponent(SharedReferences);

        // 两个属性指向同一个对象，该对象还引用自身；两条属性路径都应被检查
        const shared: Record<string, unknown> = { target, component };
        shared.self = shared;
        component.first = shared;
        component.second = shared;
        const visit = jest.fn();

        try {
            helpers.visitSerializedComponentReferences([root], visit);

            expect(visit.mock.calls).toEqual([
                [component, ['first', 'target'], target],
                [component, ['first', 'component'], component],
                [component, ['second', 'target'], target],
                [component, ['second', 'component'], component],
            ]);
        } finally {
            root.destroy();
            target.destroy();
            engine.CCObject._deferredDestroy();
        }
    });

    it('records external node and component references without serializing their subtrees', async () => {
        const parent = new engine.Node('UnselectedParent');
        const root = new engine.Node('Selected');
        const external = new engine.Node('External');
        root.parent = parent;
        external.parent = parent;
        const component = root.addComponent(References);
        const externalComponent = external.addComponent(References);
        component.target = external;
        component.component = externalComponent;
        component.nodes = [root, external];
        const data = helpers.serializeNodes([root]);
        expect(data.serialized).not.toContain('UnselectedParent');
        expect(data.serialized).not.toContain('"External"');
        expect(data.externalReferences.map(reference => [reference.type, reference.uuid]))
            .toEqual([['node', external.uuid], ['component', externalComponent.uuid]]);
        const [created] = await helpers.deserializeNodes(data, 'clear');
        const copy = created.getComponent(References)!;
        expect([copy.target, copy.component, copy.nodes]).toEqual([null, null, [created, null]]);
        expect([root.parent, component.target, component.component]).toEqual([parent, external, externalComponent]);
        const [unresolved] = await helpers.deserializeNodes(data, 'resolve');
        expect(unresolved.getComponent(References)!.target).toBeNull();
    });

    it('retains prefab assets and overrides, changes instance identity and unlinks individually serialized children', async () => {
        const root = new engine.Node('PrefabRoot');
        const child = new engine.Node('Child');
        child.parent = root;
        const asset = new engine.Prefab();
        asset._uuid = 'serialized-test-prefab';
        asset.data = root;
        engine.assetManager.assets.add(asset._uuid, asset);
        const info = new engine.Prefab._utils.PrefabInfo();
        info.root = root;
        info.asset = asset;
        info.fileId = 'root-file-id';
        info.instance = new engine.Prefab._utils.PrefabInstance();
        info.instance.fileId = 'instance-file-id';
        root['_prefab'] = info;
        const override = new engine.Prefab._utils.PropertyOverrideInfo();
        override.targetInfo = new engine.Prefab._utils.TargetInfo();
        override.targetInfo.localID = ['root-file-id'];
        override.propertyPath = ['_name'];
        override.value = 'PrefabRoot';
        info.instance.propertyOverrides.push(override);
        const childInfo = new engine.Prefab._utils.PrefabInfo();
        childInfo.root = root;
        childInfo.asset = asset;
        childInfo.fileId = 'child-file-id';
        child['_prefab'] = childInfo;

        const data = helpers.serializeNodes([root]);
        const [created] = await helpers.deserializeNodes(data, 'clear');
        expect(created['_prefab']!.asset).toBe(asset);
        expect(created['_prefab']!.instance!.fileId).not.toBe(info.instance.fileId);
        expect(created['_prefab']!.instance!.propertyOverrides[0].value).toBe('PrefabRoot');
        expect(created.children[0]['_prefab']!.root).toBe(created);
        const [plainChild] = await helpers.deserializeNodes(helpers.serializeNodes([child]), 'clear');
        expect(plainChild['_prefab']).toBeNull();
        expect(root['_prefab']).toBe(info);
        engine.assetManager.assets.remove(asset._uuid);
    });

    it('preserves node and component identities when restoring the batch for Redo', async () => {
        const root = new engine.Node('Root');
        root.addComponent(References);
        const [restored] = await helpers.deserializeNodes(helpers.serializeNodes([root], true), 'clear', true);
        expect([restored.uuid, restored.components[0].uuid]).toEqual([root.uuid, root.components[0].uuid]);
    });

    it('keeps restored references compatible with legacy node copying', async () => {
        const first = new engine.Node('First');
        const second = new engine.Node('Second');
        first.addComponent(References).target = second;
        second.addComponent(References).target = first;
        const created = await helpers.deserializeNodes(helpers.serializeNodes([first, second]), 'clear');

        const copied = engine.instantiate(created[0]);

        expect(copied.getComponent(References)!.target).toBe(created[1]);
        expect(copied.uuid).not.toBe(created[0].uuid);
    });

    it('preserves mounted children in a complete prefab and unlinks them when copied separately', async () => {
        const { prefabUtils } = await import('../scene-process/service/prefab/utils');
        const root = new engine.Node('PrefabRoot');
        const child = new engine.Node('MountedChild');
        child.parent = root;
        const info = new engine.Prefab._utils.PrefabInfo();
        info.root = root;
        info.fileId = 'prefab-root';
        info.instance = new engine.Prefab._utils.PrefabInstance();
        info.instance.fileId = 'prefab-instance';
        root['_prefab'] = info;
        prefabUtils.setMountedRoot(child, root);
        const mounted = new engine.Prefab._utils.MountedChildrenInfo();
        mounted.nodes = [child];
        mounted.targetInfo = new engine.Prefab._utils.TargetInfo();
        mounted.targetInfo.localID = [info.fileId];
        info.instance.mountedChildren.push(mounted);
        const component = child.addComponent(References);
        prefabUtils.setMountedRoot(component, root);

        const [created] = await helpers.deserializeNodes(helpers.serializeNodes([root]), 'clear');
        const copiedChild = created.children[0];
        expect(prefabUtils.getPrefabStateInfo(copiedChild).isAddedChild).toBe(true);
        expect(prefabUtils.getMountedRoot(copiedChild)).toBe(created);
        expect(prefabUtils.getMountedRoot(copiedChild.components[0])).toBe(created);
        expect(created['_prefab']!.instance!.mountedChildren[0].nodes[0]).toBe(copiedChild);

        const separateData = helpers.serializeNodes([child]);
        expect(separateData.externalReferences.some(reference => reference.uuid === root.uuid)).toBe(false);
        const [separate] = await helpers.deserializeNodes(separateData, 'resolve');
        expect(prefabUtils.getMountedRoot(separate)).toBeUndefined();
        expect(prefabUtils.getMountedRoot(separate.components[0])).toBeUndefined();
        expect(prefabUtils.getMountedRoot(child)).toBe(root);
        expect(prefabUtils.getMountedRoot(component)).toBe(root);
    });

    it.each([
        ['Float32Array', Float32Array],
        ['Uint8Array', Uint8Array],
    ] as const)('round-trips serialized %s component fields', async (name, ArrayType) => {
        class TypedValues extends engine.Component {
            values = new ArrayType([1, 2, 3]);
        }
        engine._decorator.property({ serializable: true })(TypedValues.prototype, 'values');
        engine._decorator.ccclass(`SerializedNode${name}Values`)(TypedValues);
        const root = new engine.Node('TypedValues');
        root.addComponent(TypedValues);

        const [created] = await helpers.deserializeNodes(helpers.serializeNodes([root]), 'clear');

        expect(created.getComponent(TypedValues)!.values).toBeInstanceOf(ArrayType);
        expect(Array.from(created.getComponent(TypedValues)!.values)).toEqual([1, 2, 3]);
    });

    it.each(['second root', 'undo snapshot'])('destroys mounted components when creation fails at the %s', async stage => {
        const { ServiceEvents } = await import('../scene-process/service/core');
        const { mountSerializedNodes } = await import('../scene-process/service/undo/commands/create-serialized-nodes-command');
        const parent = new engine.Node('RollbackParent');
        const roots = [new engine.Node('First'), new engine.Node('Second')];
        const child = new engine.Node('Child');
        child.parent = roots[0];
        const components = [...roots, child].map(node => node.addComponent(References));
        const destroyCalls = components.map(component => jest.spyOn(component, '_destroyImmediate'));
        const failOnAdd = (node: Node) => {
            if (stage === 'second root' && node === roots[1]) {
                throw new Error('injected creation failure');
            }
        };
        ServiceEvents.on('node:add', failOnAdd);
        try {
            const data = helpers.serializeNodes(roots);
            expect(() => mountSerializedNodes({
                nodes: roots,
                parent,
                editorRoot: parent,
                siblingIndex: 0,
                data,
                keepWorldTransform: false,
                onMounted: () => {
                    throw new Error('injected creation failure');
                },
            })).toThrow('injected creation failure');

            // 推进引擎延迟销毁阶段，确认组件已实际销毁
            engine.CCObject._deferredDestroy();

            expect({
                children: parent.children.length,
                componentsValid: components.map(component => component.isValid),
                destroyCalls: destroyCalls.map(spy => spy.mock.calls.length),
            }).toEqual({ children: 0, componentsValid: [false, false, false], destroyCalls: [1, 1, 1] });
        } finally {
            ServiceEvents.off('node:add', failOnAdd);
        }
    });

    it('creates through NodeService and restores the entire referenced batch as one Undo command', async () => {
        const { register, Service, ServiceEvents } = await import('../scene-process/service/core');
        await import('../scene-process/service/undo');
        await import('../scene-process/service/node');
        const parent = new engine.Node('Target');
        register('Editor')(class TestEditor {
            getRootNode() { return parent; }
            getCurrentEditorType() { return 'scene'; }
            getEditorSession() { return { uuid: parent.uuid, generation: 0 }; }
            isCurrentEditorSession(session: IEditorSessionSnapshot) {
                return session.uuid === parent.uuid && session.generation === 0;
            }
            async lock() {}
            unlock() {}
        });
        const addTree = (node: Node) => node.walk(child => {
            EditorExtends.Node.add(child.uuid, child);
            child.components.forEach(component => EditorExtends.Component.add(component.uuid, component));
        });
        const removeTree = (node: Node) => node.walk(child => {
            child.components.forEach(component => EditorExtends.Component.remove(component.uuid));
            EditorExtends.Node.remove(child.uuid);
        });
        // 这里只替代场景加载器的注册流程，节点创建、变更和撤销均使用真实实现
        EditorExtends.Node.add(parent.uuid, parent);
        ServiceEvents.on('node:add', addTree);
        ServiceEvents.on('node:remove', removeTree);
        try {
            const first = new engine.Node('First');
            const second = new engine.Node('Second');
            first.addComponent(References).target = second;
            second.addComponent(References).target = first;
            const data = helpers.serializeNodes([first, second]);
            const paths = await Service.Node.createBySerializedData({ data, parentPath: '/' });
            const ids = parent.children.map(node => node.uuid);
            const componentIds = parent.children.map(node => node.components[0].uuid);
            expect(paths).toHaveLength(2);
            expect(parent.children[0].getComponent(References)!.target).toBe(parent.children[1]);
            expect(Service.Undo.isDirty()).toBe(true);
            expect((await Service.Undo.undo()).success).toBe(true);
            expect(parent.children).toEqual([]);
            expect(Service.Undo.canUndo()).toBe(false);
            expect(Service.Undo.isDirty()).toBe(false);
            expect((await Service.Undo.redo()).success).toBe(true);
            expect(parent.children.map(node => node.uuid)).toEqual(ids);
            expect(parent.children.map(node => node.components[0].uuid)).toEqual(componentIds);
            expect(parent.children[0].getComponent(References)!.target).toBe(parent.children[1]);
            expect(parent.children[1].getComponent(References)!.target).toBe(parent.children[0]);
        } finally {
            ServiceEvents.off('node:add', addTree);
            ServiceEvents.off('node:remove', removeTree);
            removeTree(parent);
            parent.destroy();
            Service.Undo.clearHistory();
        }
    });

    it('rejects malformed data before creating nodes', async () => {
        const data = helpers.serializeNodes([new engine.Node('Root')]);
        await expect(helpers.deserializeNodes({ ...data, serialized: '[{"__id__":999}]' }, 'clear')).rejects.toThrow('Invalid serialized object reference');
        await expect(helpers.deserializeNodes({ ...data, serialized: '{"__type__":"MissingComponent"}' }, 'clear')).rejects.toThrow('class is unavailable');
    });

    it.each(['count', 'mixed roots', 'non-array roots'])('destroys allocated components when root validation rejects %s', async invalidShape => {
        // 记录创建出的组件，检查反序列化失败后是否将它们销毁
        const instances: Component[] = [];
        class TrackedComponent extends engine.Component {
            constructor() {
                super();
                instances.push(this);
            }
        }
        engine._decorator.ccclass(`SerializedInvalidRoots${invalidShape}`)(TrackedComponent);

        const source = new engine.Node('Root');
        source.addComponent(TrackedComponent);
        const data = helpers.serializeNodes([source]);
        instances.length = 0;

        // 故意破坏根节点数据，让反序列化在创建组件后校验失败
        if (invalidShape === 'count') {
            data.rootTransforms.push(data.rootTransforms[0]);
        } else {
            const graph = JSON.parse(data.serialized);
            if (invalidShape === 'mixed roots') {
                graph[0].roots.push(null);
                data.rootTransforms.push(data.rootTransforms[0]);
            } else {
                graph[0].roots = graph[0].roots[0];
            }
            data.serialized = JSON.stringify(graph);
        }

        await expect(helpers.deserializeNodes(data, 'clear')).rejects.toThrow('Invalid serialized node roots');

        // 执行引擎的延迟销毁，确认新组件已销毁，源节点仍然有效
        engine.CCObject._deferredDestroy();

        expect(instances).toHaveLength(1);
        expect(instances[0].isValid).toBe(false);
        expect(source.isValid).toBe(true);

        source.destroy();
    });

    describe('Prefab reference persistence', () => {
        let scene: import('cc').Scene;
        let asset: import('cc').Prefab;
        let prefabNodes: typeof import('../scene-process/service/prefab/node')['nodeOperation'];
        let services: typeof import('../scene-process/service/core');
        let sceneUtils: typeof import('../scene-process/service/scene/utils')['sceneUtils'];
        let addTree: (node: Node) => void;
        let removeTree: (node: Node) => void;
        let onChange: (node: Node, options: object) => void;
        let editorGeneration: number;
        let editorUuid: string;

        beforeEach(async () => {
            services = await import('../scene-process/service/core');
            prefabNodes = (await import('../scene-process/service/prefab/node')).nodeOperation;
            sceneUtils = (await import('../scene-process/service/scene/utils')).sceneUtils;
            await import('../scene-process/service/undo');
            await import('../scene-process/service/node');

            // 让创建和 Undo/Redo 都操作这个测试场景
            scene = new engine.Scene('Target');
            editorGeneration = 0;
            editorUuid = scene.uuid;
            services.register('Editor')(class TestEditor {
                getRootNode() {
                    return scene;
                }

                getCurrentEditorType() {
                    return 'scene';
                }

                getEditorSession() {
                    return { uuid: editorUuid, generation: editorGeneration };
                }

                isCurrentEditorSession(session: IEditorSessionSnapshot) {
                    return session.uuid === editorUuid && session.generation === editorGeneration;
                }

                async lock() {}

                unlock() {}
            });

            // 给 Prefab 中的节点和组件设置 fileId，重新加载时用它们找到引用目标
            asset = new engine.Prefab();
            asset._uuid = 'serialized-reference-prefab';
            asset.data = new engine.Node('Template');
            const child = new engine.Node('Child');
            child.parent = asset.data;
            for (const [node, fileId] of [[asset.data, 'root'], [child, 'child']] as const) {
                const info = new engine.Prefab._utils.PrefabInfo();
                info.root = asset.data;
                info.asset = asset;
                info.fileId = fileId;
                node['_prefab'] = info;
            }
            const component = child.addComponent(References);
            component.__prefab = new engine.Prefab._utils.CompPrefabInfo();
            component.__prefab.fileId = 'child-component';
            engine.assetManager.assets.add(asset._uuid, asset);

            // 节点增删时同步更新注册表和 Prefab 信息，模拟场景编辑流程
            addTree = node => {
                node.walk(child => {
                    EditorExtends.Node.add(child.uuid, child);
                    child.components.forEach(component => EditorExtends.Component.add(component.uuid, component));
                    prefabNodes.onNodeAdded(child);
                });
                prefabNodes.onAddNode(node);
            };

            removeTree = node => node.walk(child => {
                child.components.forEach(component => EditorExtends.Component.remove(component.uuid));
                EditorExtends.Node.remove(child.uuid);
                prefabNodes.onNodeRemoved(child);
            });

            onChange = (node, options) => prefabNodes.onNodeChangedInGeneralMode(node, options, scene);

            EditorExtends.Node.add(scene.uuid, scene);
            services.ServiceEvents.on('node:add', addTree);
            services.ServiceEvents.on('node:remove', removeTree);
            services.ServiceEvents.on('node:change', onChange);
            services.Service.Undo.clearHistory();
        });

        afterEach(() => {
            services.ServiceEvents.off('node:add', addTree);
            services.ServiceEvents.off('node:remove', removeTree);
            services.ServiceEvents.off('node:change', onChange);
            prefabNodes._timerUtil.clear();

            removeTree(scene);
            services.Service.Undo.clearHistory();
            scene.destroy();
            asset.data.destroy();
            engine.assetManager.assets.remove(asset._uuid);
            engine.CCObject._deferredDestroy();
        });

        /** 创建已有节点及其 Prefab 引用记录，检查 Undo 和回滚是否误删这些记录 */
        const addExistingReference = () => {
            const existing = new engine.Node('Existing');
            const prefab = engine.instantiate(asset);
            prefab.name = 'ExistingPrefab';
            existing.parent = scene;
            prefab.parent = scene;
            const component = existing.addComponent(References);
            component.target = prefab.children[0];

            addTree(existing);
            addTree(prefab);
            prefabNodes.checkToAddTargetOverride(component, { pathKeys: ['target'], value: component.target }, scene);
            return scene['_prefab']!.targetOverrides![0];
        };

        /**
         * 序列化 A、B 两个节点，A 的组件引用 B 内的子节点和组件
         * 随后销毁源场景，确认还原时不依赖源对象
         */
        const createData = (prefabSource = false) => {
            const source = new engine.Scene('Source');
            const a = prefabSource ? engine.instantiate(asset) : new engine.Node('A');
            a.name = 'A';
            a.parent = source;
            const b = engine.instantiate(asset);
            b.name = 'B';
            b.parent = source;

            const component = prefabSource
                ? a.children[0].getComponent(References)!
                : a.addComponent(References);
            component.target = b.children[0];
            component.component = b.children[0].getComponent(References)!;
            component.nodes = [b.children[0], b.children[0]];

            // 数组中两项引用同一个节点，也要分别保存两个位置的引用记录
            for (const [pathKeys, value] of [
                [['target'], component.target],
                [['component'], component.component],
                [['nodes', '0'], component.nodes[0]],
                [['nodes', '1'], component.nodes[1]],
            ] as const) {
                prefabNodes.checkToAddTargetOverride(component, { pathKeys: [...pathKeys], value }, source);
            }

            const data = helpers.serializeNodes([a, b]);
            source.destroy();
            return data;
        };

        /** 保存并重新加载场景，检查节点和组件引用是否保留 */
        const expectSavedReferences = (prefabSource: boolean) => {
            const details = new engine.deserialize.Details();
            const saved = sceneUtils.serialize(scene);
            const restored = engine.deserialize(saved, details) as import('cc').SceneAsset;
            details.assignAssetsBy(uuid => engine.assetManager.assets.get(uuid)!);

            // 先还原 Prefab 内部节点，再根据引用记录恢复组件属性
            engine.Prefab._utils.expandNestedPrefabInstanceNode(restored.scene!);
            engine.Prefab._utils.applyTargetOverrides(restored.scene!);

            const a = restored.scene!.getChildByName('A')!;
            const b = restored.scene!.getChildByName('B')!;
            const component = (prefabSource ? a.children[0] : a).getComponent(References)!;
            expect(component.target).toBe(b.children[0]);
            expect(component.component).toBe(b.children[0].getComponent(References));
            expect(component.nodes).toEqual([b.children[0], b.children[0]]);

            restored.scene!.destroy();
            details.reset();
        };

        /** 按保存数据重建场景，保留编辑会话和撤销历史 */
        const reloadScene = () => {
            const details = new engine.deserialize.Details();
            const restored = engine.deserialize(sceneUtils.serialize(scene), details) as import('cc').SceneAsset;
            details.assignAssetsBy(uuid => engine.assetManager.assets.get(uuid)!);
            engine.Prefab._utils.expandNestedPrefabInstanceNode(restored.scene!);
            engine.Prefab._utils.applyTargetOverrides(restored.scene!);

            removeTree(scene);
            scene.destroy();
            scene = restored.scene!;
            addTree(scene);
            details.reset();
        };

        it.each(['undo', 'redo'] as const)('keeps serialized creation %s usable after a scene reload', async direction => {
            const first = new engine.Node('First');
            const second = new engine.Node('Second');
            first.addComponent(References).target = second;
            const data = helpers.serializeNodes([first, second]);
            first.destroy();
            second.destroy();
            await services.Service.Node.createBySerializedData({ data, parentPath: '/' });
            const ids = scene.children.map(node => node.uuid);

            if (direction === 'redo') {
                expect((await services.Service.Undo.undo()).success).toBe(true);
            }
            reloadScene();

            expect((await services.Service.Undo[direction]()).success).toBe(true);
            if (direction === 'undo') {
                expect(scene.children).toHaveLength(0);
                expect((await services.Service.Undo.redo()).success).toBe(true);
            }
            expect(scene.children.map(node => node.uuid)).toEqual(ids);
            expect(scene.children[0].getComponent(References)!.target).toBe(scene.children[1]);
        });

        it.each(['undo', 'redo'] as const)('rejects serialized creation %s from an earlier editor session', async direction => {
            await services.Service.Node.createBySerializedData({ data: createData(), parentPath: '/' });
            if (direction === 'redo') {
                expect((await services.Service.Undo.undo()).success).toBe(true);
            }
            const before = [...scene.children];

            // 同一资源重新打开也属于新会话，不能继续应用旧命令
            editorGeneration++;
            expect((await services.Service.Undo[direction]()).success).toBe(false);
            expect(scene.children).toEqual(before);
        });

        /** 创建 Outer 和嵌套实例 Inner，供复制测试使用 */
        const createNestedSource = () => {
            const outer = new engine.Node('Outer');
            outer.parent = scene;
            const outerInfo = new engine.Prefab._utils.PrefabInfo();
            outerInfo.root = outer;
            outerInfo.fileId = 'outer-root';
            outerInfo.instance = new engine.Prefab._utils.PrefabInstance();
            outerInfo.instance.fileId = 'outer-instance';
            outer['_prefab'] = outerInfo;

            const inner = engine.instantiate(asset);
            inner.name = 'Inner';
            inner.parent = outer;
            inner['_prefab']!.instance!.prefabRootNode = outer;
            addTree(outer);
            return { outer, inner, outerInstance: outerInfo.instance };
        };

        it.each(['clear', 'resolve'] as const)('preserves nested prefab overrides after copying with %s and saving', async externalReferences => {
            const { outer, inner, outerInstance } = createNestedSource();
            inner.children[0].name = 'ChangedChild';
            const override = new engine.Prefab._utils.PropertyOverrideInfo();
            override.targetInfo = new engine.Prefab._utils.TargetInfo();
            override.targetInfo.localID = [inner['_prefab']!.instance!.fileId, 'child'];
            override.propertyPath = ['_name'];
            override.value = 'ChangedChild';
            outerInstance.propertyOverrides.push(override);
            const sourceData = helpers.serializeNodes([outer], true);
            const sceneSpy = jest.spyOn(engine.director, 'getScene').mockImplementation(() => scene);

            try {
                const data = await services.Service.Node.serialize({ paths: [EditorExtends.Node.getNodePath(inner)] });
                await services.Service.Node.createBySerializedData({ data, parentPath: '/', externalReferences });
                const copy = scene.children[1];
                expect(copy['_prefab']!.asset).toBe(asset);
                expect(copy.children[0].name).toBe('ChangedChild');
                expect(helpers.serializeNodes([outer], true)).toEqual(sourceData);

                // 移除原 Outer 后再保存和重做，验证副本不再依赖原实例
                removeTree(outer);
                outer.setParent(null);
                outer.destroy();

                for (let cycle = 0; cycle < 2; cycle++) {
                    reloadScene();
                    expect(scene.children[0].children[0].name).toBe('ChangedChild');
                    expect((await services.Service.Undo.undo()).success).toBe(true);
                    expect(scene.children).toHaveLength(0);
                    expect((await services.Service.Undo.redo()).success).toBe(true);
                }
            } finally {
                sceneSpy.mockRestore();
            }
        });

        it('detaches a copied nested prefab from its previous owner in resolve mode', async () => {
            const { prefabUtils } = await import('../scene-process/service/prefab/utils');
            const { outer, inner } = createNestedSource();
            const sceneSpy = jest.spyOn(engine.director, 'getScene').mockReturnValue(scene);

            try {
                await services.Service.Node.createBySerializedData({
                    data: helpers.serializeNodes([inner]),
                    parentPath: '/',
                    externalReferences: 'resolve',
                });
                const copy = scene.children[1];
                expect(copy['_prefab']!.instance!.prefabRootNode).toBeFalsy();
                expect(prefabUtils.getOutMostPrefabInstanceInfo(copy).outMostPrefabInstanceNode).toBe(copy);
                expect(inner['_prefab']!.instance!.prefabRootNode).toBe(outer);
            } finally {
                sceneSpy.mockRestore();
            }
        });

        it('uses the outermost matching override when exporting a deeply nested instance', async () => {
            const { outer, inner, outerInstance } = createNestedSource();
            const top = new engine.Node('Top');
            top.parent = scene;
            outer.parent = top;
            const topInfo = new engine.Prefab._utils.PrefabInfo();
            topInfo.root = top;
            topInfo.instance = new engine.Prefab._utils.PrefabInstance();
            topInfo.instance.fileId = 'top-instance';
            top['_prefab'] = topInfo;
            outerInstance.prefabRootNode = top;

            const innerInstance = inner['_prefab']!.instance!;
            const addOverride = (instance: import('cc').Prefab._utils.PrefabInstance, localID: string[], name: string) => {
                const override = new engine.Prefab._utils.PropertyOverrideInfo();
                override.targetInfo = new engine.Prefab._utils.TargetInfo();
                override.targetInfo.localID = localID;
                override.propertyPath = ['_name'];
                override.value = name;
                instance.propertyOverrides.push(override);
            };
            addOverride(innerInstance, ['child'], 'InnerOverride');
            addOverride(outerInstance, [innerInstance.fileId, 'child'], 'OuterOverride');
            addOverride(topInfo.instance, [outerInstance.fileId, innerInstance.fileId, 'child'], 'TopOverride');
            addOverride(topInfo.instance, ['unselected-instance', 'child'], 'UnrelatedOverride');
            inner.children[0].name = 'TopOverride';
            addTree(top);
            const before = helpers.serializeNodes([top], true);

            await services.Service.Node.createBySerializedData({ data: helpers.serializeNodes([inner]), parentPath: '/' });
            const copy = scene.children[1];
            const nameOverrides = copy['_prefab']!.instance!.propertyOverrides.filter(override =>
                override.targetInfo?.localID.join('/') === 'child' && override.propertyPath.join('.') === '_name');
            expect(nameOverrides.map(override => override.value)).toEqual(['TopOverride']);
            expect(helpers.serializeNodes([top], true)).toEqual(before);

            removeTree(top);
            top.setParent(null);
            top.destroy();
            reloadScene();
            expect(scene.children[0].children[0].name).toBe('TopOverride');
        });

        it.each([false, true])('preserves saved references and removes only batch mappings on Undo (prefab source: %s)', async prefabSource => {
            const existing = addExistingReference();
            const data = createData(prefabSource);

            await services.Service.Node.createBySerializedData({ data, parentPath: '/' });
            const ids = scene.children.slice(2).map(node => node.uuid);

            // 重复 Undo/Redo，检查引用记录没有重复添加或误删，节点 UUID 不变
            for (let cycle = 0; cycle < 2; cycle++) {
                expectSavedReferences(prefabSource);
                expect(scene['_prefab']!.targetOverrides).toHaveLength(5);

                expect((await services.Service.Undo.undo()).success).toBe(true);
                expect(scene.children).toHaveLength(2);
                expect(scene['_prefab']!.targetOverrides).toEqual([existing]);

                expect((await services.Service.Undo.redo()).success).toBe(true);
                expect(scene.children.slice(2).map(node => node.uuid)).toEqual(ids);
            }

            expectSavedReferences(prefabSource);
        });

        it.each([false, true])('rolls back reference mappings when the Undo snapshot fails (existing mappings: %s)', async hasExisting => {
            const existing = hasExisting ? addExistingReference() : null;
            const beforePrefab = scene['_prefab'];
            const data = createData();

            // 写入引用记录后，让撤销快照生成失败，检查新增节点和记录能否一起清理
            let createdComponent: Component | undefined;
            const serialize = jest.spyOn(helpers, 'serializeNodes').mockImplementationOnce(nodes => {
                createdComponent = nodes[0].getComponent(References)!;
                expect(scene['_prefab']!.targetOverrides).toHaveLength(hasExisting ? 5 : 4);
                throw new Error('snapshot failure after reference mapping');
            });

            try {
                await expect(services.Service.Node.createBySerializedData({ data, parentPath: '/' }))
                    .rejects.toThrow('snapshot failure after reference mapping');
            } finally {
                serialize.mockRestore();
            }

            engine.CCObject._deferredDestroy();
            expect(createdComponent!.isValid).toBe(false);
            expect(scene.children).toHaveLength(hasExisting ? 2 : 0);
            if (existing) {
                expect(scene['_prefab']!.targetOverrides).toEqual([existing]);
            } else {
                expect(scene['_prefab']).toBe(beforePrefab);
            }

            expect(services.Service.Undo.canUndo()).toBe(false);
            expect(services.Service.Undo.isDirty()).toBe(false);
        });
    });

    it('stops before deserialization when a resource cannot be loaded', async () => {
        const root = new engine.Node('Root');
        const data = helpers.serializeNodes([root]);
        const graph = JSON.parse(data.serialized);
        graph[0].asset = { __uuid__: 'missing-serialized-asset' };
        data.serialized = JSON.stringify(graph);
        const { sceneUtils } = await import('../scene-process/service/scene/utils');
        const load = jest.spyOn(sceneUtils, 'loadAny').mockRejectedValueOnce(new Error('resource unavailable'));
        try {
            await expect(helpers.deserializeNodes(data, 'clear')).rejects.toThrow('resource unavailable');
            expect(load).toHaveBeenCalledWith('missing-serialized-asset');
            expect(root.isValid).toBe(true);
        } finally {
            load.mockRestore();
        }
    });
});
