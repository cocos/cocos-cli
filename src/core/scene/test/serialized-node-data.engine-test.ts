import { join } from 'path';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import type { Component, Node } from 'cc';
import { TestGlobalEnv } from '../../../tests/global-env';

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
