import { readFile } from 'fs-extra';
import { assetManager } from '../../assets';
import { NodeType, type IPrefabRuntimeRegistration, type PrefabWriteResult } from '../common';
import { EditorProxy } from '../main-process/proxy/editor-proxy';
import { NodeProxy } from '../main-process/proxy/node-proxy';
import { ComponentProxy } from '../main-process/proxy/component-proxy';
import { PrefabProxy } from '../main-process/proxy/prefab-proxy';
import { prefabWriteHost } from '../main-process/prefab-write-host';
import { Rpc } from '../main-process/rpc';
import { sceneWorker } from '../main-process/scene-worker';
import { SceneTestEnv } from './scene-test-env';
import { once } from './utils';
import type { ProcessRPC } from '../process-rpc';
import type { EditorService } from '../scene-process/service/editor';
import type { PrefabService } from '../scene-process/service/prefab';
import type { NodeService } from '../scene-process/service/node';

function value<T>(result: PrefabWriteResult<T>): T {
    if (!result.ok) throw new Error(result.error.message);
    return result.value;
}

describe('Prefab write integration', () => {
    const sceneUrl = `${SceneTestEnv.targetDirectoryURL}/Coordinated.scene`;
    const prefabUrl = `${SceneTestEnv.targetDirectoryURL}/Coordinated.prefab`;
    const registrations: IPrefabRuntimeRegistration[] = [];

    afterAll(async () => {
        for (const registration of registrations) await prefabWriteHost.unregisterRuntime(registration);
        await EditorProxy.close({ save: false });
    });

    it('protects overrides, arbitrates Apply and history, and synchronizes a clean source editor', async () => {
        await EditorProxy.create({
            type: 'scene',
            baseName: 'Coordinated',
            targetDirectory: SceneTestEnv.targetDirectoryURL,
        });
        await EditorProxy.open({ urlOrUUID: sceneUrl });
        await NodeProxy.createByType({ path: '/', name: 'Shared', nodeType: NodeType.EMPTY });
        const created = await PrefabProxy.createPrefabFromNode({ nodePath: 'Shared', dbURL: prefabUrl });
        const instancePath = created.path;
        expect(created.prefab).toBeTruthy();
        const asset = assetManager.queryAssetInfo(prefabUrl)!;
        const original = await readFile(asset.file, 'utf8');
        await NodeProxy.createByType({ path: instancePath, name: 'Added', nodeType: NodeType.EMPTY });
        await NodeProxy.update({ path: instancePath, properties: { scale: { x: 2, y: 3, z: 4 } } });
        const before = await NodeProxy.query({ path: instancePath });
        const dirtyTarget = value(
            await prefabWriteHost.registerRuntime({
                runtime: { runtimeId: 'integration-target', generation: 1 },
                prefabUuid: asset.uuid,
                editVersion: 0,
                state: { status: 'ready', dirty: true },
            }),
        );
        registrations.push(dirtyTarget);
        await expect(PrefabProxy.applyPrefabChanges({ nodePath: instancePath })).rejects.toMatchObject({
            code: 'PREFAB_DOCUMENT_DIRTY',
            commitState: 'not-committed',
        });
        expect(await NodeProxy.query({ path: instancePath })).toEqual(before);
        expect(await readFile(asset.file, 'utf8')).toBe(original);
        value(await prefabWriteHost.unregisterRuntime(dirtyTarget));
        registrations.pop();

        await expect(PrefabProxy.applyPrefabChanges({ nodePath: instancePath })).resolves.toBe(true);
        const applied = await readFile(asset.file, 'utf8');
        expect(applied).toContain('Added');
        await expect(Rpc.getInstance().request('Undo', 'undo', [])).resolves.toMatchObject({ success: true });
        expect(await readFile(asset.file, 'utf8')).toBe(original);
        await expect(Rpc.getInstance().request('Redo', 'redo', [])).resolves.toMatchObject({ success: true });
        expect(await readFile(asset.file, 'utf8')).toBe(applied);

        const changeSource = (content: string, scale: number) => {
            const json = JSON.parse(content);
            json[json[0].data.__id__]._lscale = { x: scale, y: scale, z: scale };
            return JSON.stringify(json, null, 2);
        };
        await assetManager.saveAsset(asset.uuid, changeSource(applied, 7));
        await expect(Rpc.getInstance().request('Undo', 'undo', [])).resolves.toMatchObject({
            success: false,
            error: { code: 'PREFAB_SOURCE_CHANGED' },
        });
        await expect(Rpc.getInstance().request('Undo', 'canUndo', [])).resolves.toBe(true);

        await EditorProxy.close({ save: false });
        await EditorProxy.open({ urlOrUUID: prefabUrl });
        const writer = value(
            await prefabWriteHost.registerRuntime({
                runtime: { runtimeId: 'integration-writer', generation: 1 },
                editVersion: 0,
                state: { status: 'ready', dirty: false },
            }),
        );
        registrations.push(writer);
        const source = value(await prefabWriteHost.readSource(asset.uuid));
        const lease = value(await prefabWriteHost.beginEdit({ registration: writer, expectedEditVersion: 0 }));
        const reloaded = once(sceneWorker, 'editor:reload', 5000);
        value(
            await prefabWriteHost.commit({
                source: lease,
                assetUuid: asset.uuid,
                expectedFingerprint: source.fingerprint,
                content: changeSource(source.content, 9),
            }),
        );
        value(await prefabWriteHost.finishEdit({ lease, dirty: false }));
        await reloaded;
        expect((await NodeProxy.query({ path: '/' }))?.properties?.scale).toEqual({ x: 9, y: 9, z: 9 });

        const sourceNodePath = (await NodeProxy.query())!.path;
        await NodeProxy.update({ path: sourceNodePath, properties: { scale: { x: 5, y: 5, z: 5 } } });
        expect((await NodeProxy.query({ path: sourceNodePath }))?.properties?.scale).toEqual({ x: 5, y: 5, z: 5 });
        await EditorProxy.save({ urlOrUUID: prefabUrl });
        await expect(Rpc.getInstance().request('Undo', 'isDirty', [])).resolves.toBe(false);
        expect(JSON.parse(await readFile(asset.file, 'utf8')).find((entry: { __type__?: string }) => entry.__type__ === 'cc.Node')._lscale.x).toBe(5);
        await NodeProxy.update({ path: sourceNodePath, properties: { scale: { x: 6, y: 6, z: 6 } } });
        const dirtyTree = await NodeProxy.query({ path: '/' });
        const latest = value(await prefabWriteHost.readSource(asset.uuid));
        await assetManager.saveAsset(asset.uuid, changeSource(latest.content, 11));
        await expect(EditorProxy.save({ urlOrUUID: prefabUrl })).rejects.toMatchObject({
            code: 'PREFAB_SOURCE_CHANGED',
        });
        expect(await NodeProxy.query({ path: '/' })).toEqual(dirtyTree);
        await EditorProxy.create({ type: 'prefab', baseName: 'CoordinatedCopy', targetDirectory: SceneTestEnv.targetDirectoryURL });
        const internalRpc = Rpc.getInstance() as unknown as ProcessRPC<{ Editor: Pick<EditorService, 'saveAs'> }>;
        await internalRpc.request('Editor', 'saveAs', [{ urlOrUUID: `${SceneTestEnv.targetDirectoryURL}/CoordinatedCopy.prefab` }]);
        expect(await NodeProxy.query({ path: '/' })).toEqual(dirtyTree);
        await expect(Rpc.getInstance().request('Undo', 'isDirty', [])).resolves.toBe(true);
    });
});

describe('Removed component Apply integration', () => {
    const registrations: IPrefabRuntimeRegistration[] = [];
    afterEach(async () => {
        for (const registration of registrations.splice(0)) await prefabWriteHost.unregisterRuntime(registration);
        await EditorProxy.close({ save: false });
    });

    it.each([false, true])('protects source writes and history for nested=%s', async nested => {
        const rpc = Rpc.getInstance() as unknown as ProcessRPC<{
            Prefab: Pick<PrefabService, 'applyRemovedComponent'>;
            Node: Pick<NodeService, 'setParent'>;
        }>;
        const suffix = nested ? 'Nested' : 'Direct';
        const directory = SceneTestEnv.targetDirectoryURL;
        await EditorProxy.create({ type: 'scene', baseName: `Component${suffix}`, targetDirectory: directory });
        await EditorProxy.open({ urlOrUUID: `${directory}/Component${suffix}.scene` });
        const created = (await NodeProxy.createByType({ path: '/', name: 'ComponentRoot', nodeType: NodeType.EMPTY }))!;
        await ComponentProxy.add({ nodePath: created.path, component: 'cc.Camera' });
        await ComponentProxy.add({ nodePath: created.path, component: 'cc.MeshRenderer' });
        const innerUrl = `${directory}/ComponentInner${suffix}.prefab`;
        let instance = await PrefabProxy.createPrefabFromNode({ nodePath: created.path, dbURL: innerUrl });
        let componentPath = instance.path;
        let sourceUrl = innerUrl;
        const innerAsset = assetManager.queryAssetInfo(innerUrl)!;
        const innerContent = await readFile(innerAsset.file, 'utf8');
        if (nested) {
            const outer = (await NodeProxy.createByType({ path: '/', name: 'Outer', nodeType: NodeType.EMPTY }))!;
            await rpc.request('Node', 'setParent', [{ paths: [instance.path], parentPath: outer.path }]);
            sourceUrl = `${directory}/ComponentOuter.prefab`;
            instance = await PrefabProxy.createPrefabFromNode({ nodePath: outer.path, dbURL: sourceUrl });
            componentPath = `${instance.path}/ComponentInner${suffix}`;
        }
        const asset = assetManager.queryAssetInfo(sourceUrl)!;
        // Keep a separate property override to prove this is component-only Apply.
        await NodeProxy.update({ path: componentPath, properties: { scale: { x: 2, y: 3, z: 4 } } });
        const camera = (await ComponentProxy.query({ path: `${componentPath}/cc.Camera` }))!;
        const fileId = camera.prefab!.fileId;
        const nestedInstance = (await NodeProxy.query({ path: componentPath }))!.prefab!.instance!;
        const removalPath = nested ? [nestedInstance.fileId, fileId] : [fileId];
        // Start from a persisted removed-component override. Component deletion itself
        // is a separate operation; this fixture exercises Apply through the real runtime.
        const sceneAsset = await EditorProxy.save({});
        await EditorProxy.close({ save: false });
        // Use valid source records: create-from-node can leave null component slots
        // in nested nodes, which the importer would otherwise repair during Undo.
        const sourceJson: Array<{ __type__?: string; _components?: unknown[] }> = JSON.parse(await readFile(asset.file, 'utf8'));
        for (const entry of sourceJson) {
            if (entry.__type__ === 'cc.Node' && entry._components) entry._components = entry._components.filter(component => component !== null);
        }
        await assetManager.saveAsset(asset.uuid, JSON.stringify(sourceJson, null, 2));
        const sceneJson = JSON.parse(await readFile(sceneAsset.file, 'utf8'));
        const root = sceneJson.find((entry: { __type__?: string; _name?: string }) => entry.__type__ === 'cc.Node' && entry._name === instance.name);
        const rootPrefab = sceneJson[root._prefab.__id__];
        const rootInstance = sceneJson[rootPrefab.instance.__id__];
        rootInstance.removedComponents.push({ __id__: sceneJson.length });
        sceneJson.push({ __type__: 'cc.TargetInfo', localID: removalPath });
        await assetManager.saveAsset(sceneAsset.uuid, JSON.stringify(sceneJson));
        await EditorProxy.open({ urlOrUUID: sceneAsset.uuid });
        const original = await readFile(asset.file, 'utf8');
        const before = (await NodeProxy.query({ path: instance.path }))!;
        const componentNode = (await NodeProxy.query({ path: componentPath }))!;
        const removed = before.prefab!.instance!.removedComponents;
        expect(removed).toHaveLength(1);
        const apply = () => rpc.request('Prefab', 'applyRemovedComponent', [componentNode.nodeId, fileId]);
        const target = value(await prefabWriteHost.registerRuntime({
            runtime: { runtimeId: `component-target-${suffix}`, generation: 1 },
            prefabUuid: asset.uuid, editVersion: 0, state: { status: 'ready', dirty: true },
        }));
        registrations.push(target);
        await expect(apply()).rejects.toMatchObject({ code: 'PREFAB_DOCUMENT_DIRTY', commitState: 'not-committed' });
        expect(await readFile(asset.file, 'utf8')).toBe(original);
        expect(await NodeProxy.query({ path: instance.path })).toEqual(before);
        value(await prefabWriteHost.unregisterRuntime(target));
        registrations.pop();

        await apply();
        const applied = await readFile(asset.file, 'utf8');
        expect(applied).not.toBe(original);
        const after = (await NodeProxy.query({ path: instance.path }))!;
        expect(after.prefab!.instance!.removedComponents).toHaveLength(0);
        expect(after.prefab!.instance!.propertyOverrides).toEqual(before.prefab!.instance!.propertyOverrides);
        const componentAfter = (await NodeProxy.query({ path: componentPath, includeComponents: true }))!;
        expect(componentAfter.components!.map(component => component.type)).toContain('cc.MeshRenderer');
        expect(componentAfter.components!.map(component => component.type)).not.toContain('cc.Camera');
        expect(componentAfter.properties.scale).toEqual({ x: 2, y: 3, z: 4 });
        if (nested) expect(await readFile(innerAsset.file, 'utf8')).toBe(innerContent);

        await expect(Rpc.getInstance().request('Undo', 'undo', [])).resolves.toMatchObject({ success: true });
        expect(await readFile(asset.file, 'utf8')).toBe(original);
        expect((await NodeProxy.query({ path: instance.path }))!.prefab!.instance!.removedComponents).toEqual(removed);
        await expect(Rpc.getInstance().request('Redo', 'redo', [])).resolves.toMatchObject({ success: true });
        const redone = await readFile(asset.file, 'utf8');
        // Asset import may canonicalize null slots in nested component lists on replay.
        const canonical = (content: string) => JSON.parse(content).map((entry: { __type__?: string; _components?: unknown[] }) =>
            entry.__type__ === 'cc.Node' && entry._components
                ? { ...entry, _components: entry._components.filter(component => component !== null) }
                : entry);
        expect(canonical(redone)).toEqual(canonical(applied));
        expect((await NodeProxy.query({ path: instance.path }))!.prefab!.instance!.removedComponents).toHaveLength(0);

        // A later writer must prevent this history entry from overwriting the new source.
        await assetManager.saveAsset(asset.uuid, `${redone}\n`);
        await expect(Rpc.getInstance().request('Undo', 'undo', [])).resolves.toMatchObject({
            success: false, error: { code: 'PREFAB_SOURCE_CHANGED', commitState: 'not-committed' },
        });
        await expect(Rpc.getInstance().request('Undo', 'canUndo', [])).resolves.toBe(true);
        expect(await readFile(asset.file, 'utf8')).toBe(`${redone}\n`);
    });
});
