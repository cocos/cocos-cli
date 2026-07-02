import { assetManager } from '../../assets';
import { ICreateByAssetParams, NodeType } from '../common';
import { sceneWorker } from '../main-process/scene-worker';
import { Rpc } from '../main-process/rpc';
import { EditorProxy } from '../main-process/proxy/editor-proxy';
import { NodeProxy } from '../main-process/proxy/node-proxy';
import { ComponentProxy } from '../main-process/proxy/component-proxy';
import { SceneTestEnv } from './scene-test-env';
import * as utils from './utils';

function request<T = any>(method: string, args: any[] = []): Promise<T> {
    return (Rpc.getInstance() as any).request('Animation', method, args) as Promise<T>;
}

function requestService<T = any>(service: string, method: string, args: any[] = []): Promise<T> {
    return (Rpc.getInstance() as any).request(service, method, args) as Promise<T>;
}

const Undo = {
    clearHistory: () => requestService('Undo', 'clearHistory'),
    markSaved: () => requestService('Undo', 'markSaved'),
    isDirty: () => requestService<boolean>('Undo', 'isDirty'),
    canUndo: () => requestService<boolean>('Undo', 'canUndo'),
    undo: () => requestService('Undo', 'undo'),
    canRedo: () => requestService<boolean>('Redo', 'canRedo'),
    redo: () => requestService('Redo', 'redo'),
};

function expectUndoSuccess(result: any) {
    if (!result?.success) {
        throw new Error(`Undo/Redo command failed: ${JSON.stringify(result)}`);
    }
    expect(result.success).toBe(true);
}

async function ensureAnimationSession(rootPath: string, clipUuid: string): Promise<void> {
    const state = await request('queryState');
    if (!state.active || state.rootPath !== rootPath || state.clipUuid !== clipUuid) {
        await request('enter', [{ rootPath, clipUuid }]);
    }
}

function waitForAnimationPlayState(playState: string, timeout = 5000): Promise<any> {
    return new Promise((resolve, reject) => {
        const handler = (event: any) => {
            if (event?.state?.playState !== playState) {
                return;
            }
            clearTimeout(timer);
            sceneWorker.off('animation:state-changed', handler);
            resolve(event);
        };
        const timer = setTimeout(() => {
            sceneWorker.off('animation:state-changed', handler);
            reject(new Error(`Timeout waiting for animation playState "${playState}"`));
        }, timeout);
        sceneWorker.on('animation:state-changed', handler);
    });
}

function createAnimationClipContent(options: { sample?: number; duration?: number } = {}) {
    return JSON.stringify({
        __type__: 'cc.AnimationClip',
        _name: '',
        _objFlags: 0,
        _native: '',
        sample: options.sample ?? 30,
        speed: 1,
        wrapMode: 1,
        events: [],
        _duration: options.duration ?? 1,
        _keys: [],
        _stepness: 0,
        curveDatas: {},
        _curves: [],
        _commonTargets: [],
        _hash: 0,
    }, null, 2);
}

describe('Animation Service 场景进程测试', () => {
    const testRunId = Date.now().toString(36);
    const sceneName = `AnimationServiceScene_${testRunId}`;
    const clipName = `AnimationServiceClip_${testRunId}`;
    const emptyClipName = `AnimationServiceEmptyClip_${testRunId}`;
    const keyDataClipName = `AnimationServiceKeyDataClip_${testRunId}`;
    const childClipName = `AnimationServiceChildClip_${testRunId}`;
    const rootEditClipName = `AnimationServiceRootEditClip_${testRunId}`;
    const spriteFrameClipName = `AnimationServiceSpriteFrameClip_${testRunId}`;
    let nodePath = '';
    let childNodePath = '';
    let clipUuid = '';
    let emptyNodePath = '';
    let emptyClipUuid = '';
    let keyDataNodePath = '';
    let keyDataClipUuid = '';
    let childRootNodePath = '';
    let childTrackNodePath = '';
    let childClipUuid = '';
    let rootEditNodePath = '';
    let rootEditClipUuid = '';
    let spriteFrameNodePath = '';
    let spriteFrameClipUuid = '';
    let spriteFrameUuid = '';

    beforeAll(async () => {
        await EditorProxy.create({
            type: 'scene',
            baseName: sceneName,
            templateType: '2d',
            targetDirectory: SceneTestEnv.targetDirectoryURL,
        });
        await EditorProxy.open({
            urlOrUUID: `${SceneTestEnv.targetDirectoryURL}/${sceneName}.scene`,
        });

        const clipInfo = await assetManager.createAssetByType('animation-clip', SceneTestEnv.targetDirectoryURL, clipName, {
            overwrite: true,
            content: createAnimationClipContent(),
        });
        clipUuid = clipInfo.uuid;

        const emptyClipInfo = await assetManager.createAssetByType('animation-clip', SceneTestEnv.targetDirectoryURL, emptyClipName, {
            overwrite: true,
            content: createAnimationClipContent({ duration: 0 }),
        });
        emptyClipUuid = emptyClipInfo.uuid;

        const keyDataClipInfo = await assetManager.createAssetByType('animation-clip', SceneTestEnv.targetDirectoryURL, keyDataClipName, {
            overwrite: true,
            content: createAnimationClipContent({ duration: 0 }),
        });
        keyDataClipUuid = keyDataClipInfo.uuid;

        const childClipInfo = await assetManager.createAssetByType('animation-clip', SceneTestEnv.targetDirectoryURL, childClipName, {
            overwrite: true,
            content: createAnimationClipContent({ sample: 60, duration: 0 }),
        });
        childClipUuid = childClipInfo.uuid;

        const rootEditClipInfo = await assetManager.createAssetByType('animation-clip', SceneTestEnv.targetDirectoryURL, rootEditClipName, {
            overwrite: true,
            content: createAnimationClipContent({ sample: 60, duration: 0 }),
        });
        rootEditClipUuid = rootEditClipInfo.uuid;

        const spriteFrameClipInfo = await assetManager.createAssetByType('animation-clip', SceneTestEnv.targetDirectoryURL, spriteFrameClipName, {
            overwrite: true,
            content: createAnimationClipContent({ sample: 30, duration: 0 }),
        });
        spriteFrameClipUuid = spriteFrameClipInfo.uuid;

        const spriteFrameAssets = await assetManager.queryAssetInfos({ pattern: 'db://internal/default_ui/default_editbox_bg.png/spriteFrame' });
        if (spriteFrameAssets.length === 0 || !spriteFrameAssets[0].uuid) {
            throw new Error('Failed to query internal SpriteFrame test asset.');
        }
        spriteFrameUuid = spriteFrameAssets[0].uuid;

        const createParams: ICreateByAssetParams = {
            dbURL: clipInfo.url,
            path: '',
            name: 'AnimationServiceNode',
            position: { x: 2, y: 3, z: 4 },
        };
        const node = await NodeProxy.createByAsset(createParams);
        if (!node) {
            throw new Error('Failed to create animation node.');
        }
        nodePath = node.path;

        const emptyNode = await NodeProxy.createByAsset({
            dbURL: emptyClipInfo.url,
            path: '',
            name: 'AnimationServiceEmptyNode',
            position: { x: 0, y: 0, z: 0 },
        });
        if (!emptyNode) {
            throw new Error('Failed to create empty animation node.');
        }
        emptyNodePath = emptyNode.path;

        const keyDataNode = await NodeProxy.createByAsset({
            dbURL: keyDataClipInfo.url,
            path: '',
            name: 'AnimationServiceKeyDataNode',
            position: { x: 0, y: 0, z: 0 },
        });
        if (!keyDataNode) {
            throw new Error('Failed to create key data animation node.');
        }
        keyDataNodePath = keyDataNode.path;

        const childRootNode = await NodeProxy.createByAsset({
            dbURL: childClipInfo.url,
            path: '',
            name: 'AnimationServiceChildSamplingRoot',
            position: { x: 0, y: 0, z: 0 },
        });
        if (!childRootNode) {
            throw new Error('Failed to create child sampling animation node.');
        }
        childRootNodePath = childRootNode.path;

        const childTrackNode = await NodeProxy.createByType({
            path: childRootNodePath,
            name: 'AnimationServiceChildSamplingChild',
            nodeType: NodeType.EMPTY,
        });
        if (!childTrackNode) {
            throw new Error('Failed to create child sampling target node.');
        }
        childTrackNodePath = childTrackNode.path;

        const rootEditNode = await NodeProxy.createByAsset({
            dbURL: rootEditClipInfo.url,
            path: '',
            name: 'AnimationServiceRootEditNode',
            position: { x: 0, y: 0, z: 0 },
        });
        if (!rootEditNode) {
            throw new Error('Failed to create root keyframe editing animation node.');
        }
        rootEditNodePath = rootEditNode.path;

        const spriteFrameNode = await NodeProxy.createByAsset({
            dbURL: spriteFrameClipInfo.url,
            path: '',
            name: 'AnimationServiceSpriteFrameNode',
            position: { x: 0, y: 0, z: 0 },
        });
        if (!spriteFrameNode) {
            throw new Error('Failed to create sprite frame animation node.');
        }
        spriteFrameNodePath = spriteFrameNode.path;
        await ComponentProxy.add({ nodePath: spriteFrameNodePath, component: 'cc.Sprite' });

        const childNode = await NodeProxy.createByType({
            path: nodePath,
            name: 'AnimationServiceChild',
            nodeType: NodeType.EMPTY,
        });
        if (!childNode) {
            throw new Error('Failed to create animation child node.');
        }
        childNodePath = childNode.path;
    });

    afterAll(async () => {
        await EditorProxy.close({ save: false });
    });

    it('enter 广播 animation:state-changed 供 UI 订阅', async () => {
        const eventPromise = utils.once<Record<'animation:state-changed', any>>(sceneWorker, 'animation:state-changed');

        const state = await request('enter', [{ rootPath: nodePath, clipUuid }]);
        const event = await eventPromise;

        expect(state.active).toBe(true);
        expect(event).toMatchObject({
            reason: 'enter',
            state: {
                active: true,
                rootPath: nodePath,
                clipUuid,
                playState: 'stop',
            },
        });
    });

    it('queryClip 返回真实 AnimationClip 的基础 dump', async () => {
        await ensureAnimationSession(nodePath, clipUuid);

        const dump = await request('queryClip', [{ clipUuid }]);

        expect(dump.name).toBe(clipName);
        expect(dump.duration).toBe(1);
        expect(dump.sample).toBe(30);
        expect(dump.speed).toBe(1);
        expect(dump.wrapMode).toBe(1);
        expect(dump.events).toEqual([]);
        expect(dump.curves).toEqual([]);
    });

    it('queryPropertyValueAtFrame 使用真实 AnimationState 采样并恢复时间', async () => {
        await request('setTime', [{ time: 0.25 }]);

        const value = await request('queryPropertyValueAtFrame', [{
            clipUuid,
            nodePath,
            propKey: 'position',
            frame: 15,
        }]);
        const time = await request<number>('queryTime', [{ clipUuid }]);

        expect(value).toMatchObject({ x: 2, y: 3, z: 4 });
        expect(time).toBe(0.25);
    });

    it('setTime 广播 animation:time-changed 供 UI 订阅', async () => {
        await ensureAnimationSession(nodePath, clipUuid);
        const eventPromise = utils.once<Record<'animation:time-changed', any>>(sceneWorker, 'animation:time-changed');

        await request('setTime', [{ time: 0.5 }]);
        const event = await eventPromise;

        expect(event).toMatchObject({
            reason: 'set-time',
            rootPath: nodePath,
            clipUuid,
            time: 0.5,
            playState: 'stop',
        });
    });

    it('setTime 在编辑态允许移动到短 clip 当前 duration 之外', async () => {
        await ensureAnimationSession(emptyNodePath, emptyClipUuid);

        const before = await request('queryClip', [{ rootPath: emptyNodePath, clipUuid: emptyClipUuid }]);
        await request('setTime', [{ time: 0.5 }]);
        const state = await request('queryState');
        const time = await request<number>('queryTime', [{ clipUuid: emptyClipUuid }]);

        expect(before.duration).toBe(0);
        expect(state.time).toBe(0.5);
        expect(time).toBe(0.5);
    });

    it('queryPropertyValueAtFrame 采样短 clip 后保留 duration 外的编辑时间', async () => {
        await ensureAnimationSession(emptyNodePath, emptyClipUuid);

        await request('setTime', [{ time: 0.5 }]);
        await request('queryPropertyValueAtFrame', [{
            clipUuid: emptyClipUuid,
            nodePath: emptyNodePath,
            propKey: 'position',
            frame: 0,
        }]);
        const state = await request('queryState');
        const time = await request<number>('queryTime', [{ clipUuid: emptyClipUuid }]);

        expect(state.time).toBe(0.5);
        expect(time).toBe(0.5);
    });

    it('changePlayState 广播 animation:state-changed 供 UI 订阅', async () => {
        await ensureAnimationSession(nodePath, clipUuid);
        const eventPromise = utils.once<Record<'animation:state-changed', any>>(sceneWorker, 'animation:state-changed');

        await request('changePlayState', [{ operate: 'pause' }]);
        const event = await eventPromise;

        expect(event).toMatchObject({
            reason: 'play-state',
            state: {
                rootPath: nodePath,
                clipUuid,
                playState: 'pause',
            },
        });
    });

    it('play 广播运行态 animation:time-changed 供 UI 同步播放指针', async () => {
        await ensureAnimationSession(nodePath, clipUuid);
        await request('setTime', [{ time: 0 }]);
        const eventPromise = utils.once<Record<'animation:time-changed', any>>(sceneWorker, 'animation:time-changed', 5000);

        await request('changePlayState', [{ operate: 'play' }]);
        const event = await eventPromise;
        await request('changePlayState', [{ operate: 'stop' }]);

        expect(event).toMatchObject({
            reason: 'play-state',
            rootPath: nodePath,
            clipUuid,
            playState: 'playing',
        });
        expect(event.time).toBeGreaterThan(0);
    });

    it('play 自然结束时广播最终时间和 stop 状态', async () => {
        await ensureAnimationSession(nodePath, clipUuid);
        await request('setTime', [{ time: 0 }]);
        const statePromise = waitForAnimationPlayState('stop');

        await request('changePlayState', [{ operate: 'play' }]);
        const event = await statePromise;
        const time = await request<number>('queryTime', [{ clipUuid }]);

        expect(event).toMatchObject({
            reason: 'play-state',
            state: {
                rootPath: nodePath,
                clipUuid,
                playState: 'stop',
            },
        });
        expect(time).toBeGreaterThanOrEqual(0.95);
    });

    it('applyOperation 在真实 AnimationClip 上应用基础普通 clip 操作', async () => {
        const eventPromise = utils.once<Record<'animation:clip-changed', any>>(sceneWorker, 'animation:clip-changed');
        const result = await request('applyOperation', [{
            operations: [
                { type: 'changeSample', clipUuid, sample: 60 },
                { type: 'changeSpeed', clipUuid, speed: 1.5 },
                { type: 'changeWrapMode', clipUuid, wrapMode: 2 },
                { type: 'addEvent', clipUuid, frame: 30, func: 'onHalf', params: ['value'] },
                { type: 'moveEvents', clipUuid, frames: [30], offset: 6 },
            ],
        }]);
        const event = await eventPromise;
        const dump = await request('queryClip', [{ clipUuid }]);

        expect(result).toEqual({ state: 'success', result: true });
        expect(event).toMatchObject({
            reason: 'operation',
            rootPath: nodePath,
            clipUuid,
        });
        expect(dump.sample).toBe(60);
        expect(dump.speed).toBe(1.5);
        expect(dump.wrapMode).toBe(2);
        expect(dump.events).toEqual([{ frame: 36, func: 'onHalf', params: ['value'] }]);
    });

    it('applyOperation 支持普通属性曲线 keyframe 的创建、移动和删除', async () => {
        await ensureAnimationSession(nodePath, clipUuid);
        await Undo.clearHistory();
        await Undo.markSaved();

        const before = await request('queryClip', [{ clipUuid }]);
        const createResult = await request('applyOperation', [{
            operations: [
                { type: 'createPropertyKey', clipUuid, nodePath, propKey: 'position', frame: 0, value: { x: 2, y: 3, z: 4 } },
                { type: 'createPropertyKey', clipUuid, nodePath, propKey: 'position', frame: 60, value: { x: 8, y: 9, z: 10 } },
                { type: 'movePropertyKeys', clipUuid, nodePath, propKey: 'position', frames: [60], offset: -30 },
            ],
        }]);
        const afterCreate = await request('queryClip', [{ clipUuid }]);
        const positionCurve = afterCreate.curves.find((curve: any) => curve.nodePath === '' && curve.key === 'position');

        expect(createResult).toEqual({ state: 'success', result: true });
        expect(positionCurve).toMatchObject({
            nodePath: '',
            key: 'position',
            displayName: 'position',
            type: { value: 'cc.Vec3' },
        });
        expect(positionCurve.keyframes).toEqual([
            { frame: 0, dump: { value: { x: 2, y: 3, z: 4 }, type: 'cc.Vec3' } },
            { frame: 30, dump: { value: { x: 8, y: 9, z: 10 }, type: 'cc.Vec3' } },
        ]);

        const sampled = await request('queryPropertyValueAtFrame', [{
            clipUuid,
            nodePath,
            propKey: 'position',
            frame: 30,
        }]);
        expect(sampled).toMatchObject({ x: 8, y: 9, z: 10 });

        expectUndoSuccess(await Undo.undo());
        const afterUndo = await request('queryClip', [{ clipUuid }]);
        expect(afterUndo.curves).toEqual(before.curves);

        expectUndoSuccess(await Undo.redo());
        const afterRedo = await request('queryClip', [{ clipUuid }]);
        expect(afterRedo.curves).toEqual(afterCreate.curves);

        const removeResult = await request('applyOperation', [{
            operations: [
                { type: 'removePropertyKey', clipUuid, nodePath, propKey: 'position', frames: [0] },
            ],
        }]);
        const afterRemove = await request('queryClip', [{ clipUuid }]);
        const removedCurve = afterRemove.curves.find((curve: any) => curve.nodePath === '' && curve.key === 'position');

        expect(removeResult).toEqual({ state: 'success', result: true });
        expect(removedCurve.keyframes).toEqual([
            { frame: 30, dump: { value: { x: 8, y: 9, z: 10 }, type: 'cc.Vec3' } },
        ]);
    });

    it('applyOperation 在空 clip 创建属性 key 后重算 duration 并支持 undo/redo', async () => {
        await ensureAnimationSession(emptyNodePath, emptyClipUuid);
        await Undo.clearHistory();
        await Undo.markSaved();

        const before = await request('queryClip', [{ clipUuid: emptyClipUuid }]);
        expect(before.duration).toBe(0);

        const result = await request('applyOperation', [{
            operations: [
                { type: 'createPropertyKey', clipUuid: emptyClipUuid, nodePath: emptyNodePath, propKey: 'position', frame: 30, value: { x: 1, y: 2, z: 3 } },
            ],
        }]);
        const afterCreate = await request('queryClip', [{ clipUuid: emptyClipUuid }]);
        await request('setTime', [{ time: 1 }]);
        const time = await request<number>('queryTime', [{ clipUuid: emptyClipUuid }]);
        const saveResult = await request('save');
        const afterSave = await request('queryClip', [{ clipUuid: emptyClipUuid }]);

        expect(result).toEqual({ state: 'success', result: true });
        expect(afterCreate.duration).toBe(1);
        expect(Math.round(afterCreate.duration * afterCreate.sample)).toBe(30);
        expect(time).toBe(1);
        expect(saveResult).toBe(true);
        expect(afterSave.duration).toBe(1);

        expectUndoSuccess(await Undo.undo());
        const afterUndo = await request('queryClip', [{ clipUuid: emptyClipUuid }]);
        expect(afterUndo.duration).toBe(0);
        expect(afterUndo.curves).toEqual(before.curves);

        expectUndoSuccess(await Undo.redo());
        const afterRedo = await request('queryClip', [{ clipUuid: emptyClipUuid }]);
        expect(afterRedo.duration).toBe(1);
        expect(afterRedo.curves).toEqual(afterCreate.curves);
    });

    it('setTime 对 child nodePath 属性轨道采样到真实子节点', async () => {
        await ensureAnimationSession(childRootNodePath, childClipUuid);

        const result = await request('applyOperation', [{
            operations: [
                { type: 'createPropertyKey', clipUuid: childClipUuid, nodePath: childTrackNodePath, propKey: 'position', frame: 0, value: { x: 0, y: 0, z: 0 } },
                { type: 'createPropertyKey', clipUuid: childClipUuid, nodePath: childTrackNodePath, propKey: 'position', frame: 60, value: { x: 100, y: 0, z: 0 } },
            ],
            recordUndo: false,
        }]);
        const dump = await request('queryClip', [{ rootPath: childRootNodePath, clipUuid: childClipUuid }]);
        await request('setTime', [{ time: 1 }]);
        const time = await request<number>('queryTime', [{ clipUuid: childClipUuid }]);
        const childNode = await NodeProxy.query({ path: childTrackNodePath, includeChildren: false, includeComponents: false }) as any;

        expect(result).toEqual({ state: 'success', result: true });
        expect(Math.round(dump.duration * dump.sample)).toBe(60);
        expect(dump.curves.find((curve: any) => curve.nodePath === 'AnimationServiceChildSamplingChild' && curve.key === 'position')).toBeDefined();
        expect(time).toBe(1);
        expect(childNode?.properties.position).toMatchObject({ x: 100, y: 0, z: 0 });

        await request('setTime', [{ time: 0 }]);
        const resetChildNode = await NodeProxy.query({ path: childTrackNodePath, includeChildren: false, includeComponents: false }) as any;
        expect(resetChildNode?.properties.position).toMatchObject({ x: 0, y: 0, z: 0 });
    });

    it('setTime 在 root keyframe 编辑保存重进后采样最终曲线', async () => {
        await ensureAnimationSession(rootEditNodePath, rootEditClipUuid);
        await Undo.clearHistory();
        await Undo.markSaved();

        const result = await request('applyOperation', [{
            operations: [
                { type: 'createPropertyKey', clipUuid: rootEditClipUuid, nodePath: rootEditNodePath, propKey: 'position', frame: 0, value: { x: 0, y: 0, z: 0 } },
                { type: 'createPropertyKey', clipUuid: rootEditClipUuid, nodePath: rootEditNodePath, propKey: 'position', frame: 105, value: { x: 100, y: 0, z: 0 } },
                { type: 'movePropertyKeys', clipUuid: rootEditClipUuid, nodePath: rootEditNodePath, propKey: 'position', frames: [105], offset: -15 },
                { type: 'copyPropertyKeysTo', clipUuid: rootEditClipUuid, nodePath: rootEditNodePath, propKey: 'position', frames: [90], dstFrame: 120 },
                { type: 'movePropertyKeys', clipUuid: rootEditClipUuid, nodePath: rootEditNodePath, propKey: 'position', frames: [120], offset: -15 },
                { type: 'removePropertyKeys', clipUuid: rootEditClipUuid, nodePath: rootEditNodePath, propKey: 'position', frames: [105] },
            ],
        }]);
        const afterEdit = await request('queryClip', [{ rootPath: rootEditNodePath, clipUuid: rootEditClipUuid }]);
        const positionCurve = afterEdit.curves.find((curve: any) => curve.nodePath === '' && curve.key === 'position');

        expect(result).toEqual({ state: 'success', result: true });
        expect(Math.round(afterEdit.duration * afterEdit.sample)).toBe(90);
        expect(positionCurve.keyframes).toEqual([
            { frame: 0, dump: { value: { x: 0, y: 0, z: 0 }, type: 'cc.Vec3' } },
            { frame: 90, dump: { value: { x: 100, y: 0, z: 0 }, type: 'cc.Vec3' } },
        ]);
        expect(await request('save')).toBe(true);

        await request('exit', [{ restoreSelection: false, restoreSampledSceneState: false }]);
        await request('enter', [{ rootPath: rootEditNodePath, clipUuid: rootEditClipUuid }]);
        await request('setTime', [{ time: 1.5 }]);
        const time = await request<number>('queryTime', [{ clipUuid: rootEditClipUuid }]);
        const sampledEndNode = await NodeProxy.query({ path: rootEditNodePath, includeChildren: false, includeComponents: false }) as any;

        expect(time).toBe(1.5);
        expect(sampledEndNode?.properties.position).toMatchObject({ x: 100, y: 0, z: 0 });

        await request('setTime', [{ time: 0 }]);
        const sampledStartNode = await NodeProxy.query({ path: rootEditNodePath, includeChildren: false, includeComponents: false }) as any;
        expect(sampledStartNode?.properties.position).toMatchObject({ x: 0, y: 0, z: 0 });
    });

    it('applyOperation 支持分量级属性 keyframe 并保留切线信息', async () => {
        await ensureAnimationSession(nodePath, clipUuid);

        const result = await request('applyOperation', [{
            operations: [
                { type: 'createPropertyKey', clipUuid, nodePath, propKey: 'scale', frame: 0, value: { x: 1, y: 1, z: 1 } },
                {
                    type: 'createPropertyKey',
                    clipUuid,
                    nodePath,
                    propKey: 'scale',
                    frame: 15,
                    channel: 'y',
                    value: 2,
                    keyData: {
                        inTangent: 0.25,
                        outTangent: 0.5,
                        inTangentWeight: 0.75,
                        outTangentWeight: 1,
                        interpMode: 2,
                        tangentWeightMode: 1,
                        broken: true,
                    },
                },
            ],
        }]);
        const dump = await request('queryClip', [{ clipUuid }]);
        const scaleCurve = dump.curves.find((curve: any) => curve.nodePath === '' && curve.key === 'scale');

        expect(result).toEqual({ state: 'success', result: true });
        expect(scaleCurve.partKeys).toEqual(['x', 'y', 'z']);
        expect(scaleCurve.keyframes).toEqual([
            { frame: 0, dump: { value: { x: 1, y: 1, z: 1 }, type: 'cc.Vec3' } },
            { frame: 15, dump: { value: { x: 1, y: 2, z: 1 }, type: 'cc.Vec3' } },
        ]);
        expect(scaleCurve.channels.find((channel: any) => channel.key === 'x').keyframes).toEqual([
            { frame: 0, dump: { value: 1, type: 'cc.Number' } },
        ]);
        expect(scaleCurve.channels.find((channel: any) => channel.key === 'y').keyframes).toEqual([
            { frame: 0, dump: { value: 1, type: 'cc.Number' } },
            {
                frame: 15,
                dump: { value: 2, type: 'cc.Number' },
                inTangent: 0.25,
                outTangent: 0.5,
                inTangentWeight: 0.75,
                outTangentWeight: 1,
                interpMode: 2,
                tangentWeightMode: 1,
                broken: true,
            },
        ]);
        expect(scaleCurve.channels.find((channel: any) => channel.key === 'z').keyframes).toEqual([
            { frame: 0, dump: { value: 1, type: 'cc.Number' } },
        ]);
    });

    it('applyOperation 通过 updatePropertyKey 持久化 RealCurve keyframe broken 状态', async () => {
        await ensureAnimationSession(nodePath, clipUuid);
        await Undo.clearHistory();
        await Undo.markSaved();

        const createResult = await request('applyOperation', [{
            operations: [
                { type: 'createPropertyKey', clipUuid, nodePath, propKey: 'scale', frame: 21, value: { x: 1, y: 1, z: 1 } },
                { type: 'updatePropertyKey', clipUuid, nodePath, propKey: 'scale', frame: 21, channel: 'y', value: 2, keyData: { broken: true } },
            ],
        }]);
        const afterBroken = await request('queryClip', [{ clipUuid }]);
        const brokenScaleCurve = afterBroken.curves.find((curve: any) => curve.nodePath === '' && curve.key === 'scale');
        const brokenKey = brokenScaleCurve.channels.find((channel: any) => channel.key === 'y').keyframes.find((keyframe: any) => keyframe.frame === 21);

        expect(createResult).toEqual({ state: 'success', result: true });
        expect(brokenKey.broken).toBe(true);

        const updateResult = await request('applyOperation', [{
            operations: [
                { type: 'updatePropertyKey', clipUuid, nodePath, propKey: 'scale', frame: 21, channel: 'y', value: 2, keyData: { broken: false } },
            ],
        }]);
        const afterLinked = await request('queryClip', [{ clipUuid }]);
        const linkedScaleCurve = afterLinked.curves.find((curve: any) => curve.nodePath === '' && curve.key === 'scale');
        const linkedKey = linkedScaleCurve.channels.find((channel: any) => channel.key === 'y').keyframes.find((keyframe: any) => keyframe.frame === 21);

        expect(updateResult).toEqual({ state: 'success', result: true });
        expect(linkedKey.broken).toBe(false);

        expectUndoSuccess(await Undo.undo());
        const afterUndo = await request('queryClip', [{ clipUuid }]);
        const undoScaleCurve = afterUndo.curves.find((curve: any) => curve.nodePath === '' && curve.key === 'scale');
        const undoKey = undoScaleCurve.channels.find((channel: any) => channel.key === 'y').keyframes.find((keyframe: any) => keyframe.frame === 21);
        expect(undoKey.broken).toBe(true);

        expectUndoSuccess(await Undo.redo());
        const afterRedo = await request('queryClip', [{ clipUuid }]);
        const redoScaleCurve = afterRedo.curves.find((curve: any) => curve.nodePath === '' && curve.key === 'scale');
        const redoKey = redoScaleCurve.channels.find((channel: any) => channel.key === 'y').keyframes.find((keyframe: any) => keyframe.frame === 21);
        expect(redoKey.broken).toBe(false);
    });

    it('applyOperation 通过 updatePropertyKey 合并并持久化 RealCurve keyData', async () => {
        await ensureAnimationSession(keyDataNodePath, keyDataClipUuid);
        await Undo.clearHistory();
        await Undo.markSaved();

        const queryPositionXKey = async () => {
            const dump = await request('queryClip', [{ rootPath: keyDataNodePath, clipUuid: keyDataClipUuid }]);
            const positionCurve = dump.curves.find((curve: any) => curve.nodePath === '' && curve.key === 'position');
            return positionCurve?.channels
                .find((channel: any) => channel.key === 'x')?.keyframes
                .find((keyframe: any) => keyframe.frame === 60);
        };

        const before = await request('queryClip', [{ rootPath: keyDataNodePath, clipUuid: keyDataClipUuid }]);
        const result = await request('applyOperation', [{
            operations: [
                { type: 'createPropertyKey', clipUuid: keyDataClipUuid, propKey: 'position', frame: 60, value: { x: 80, y: 9, z: 10 } },
                { type: 'updatePropertyKey', clipUuid: keyDataClipUuid, propKey: 'position', channel: 'x', frame: 60, keyData: { interpMode: 1 } },
                { type: 'updatePropertyKey', clipUuid: keyDataClipUuid, propKey: 'position', channel: 'x', frame: 60, keyData: { broken: true } },
            ],
        }]);
        const afterUpdateKey = await queryPositionXKey();

        expect(result).toEqual({ state: 'success', result: true });
        expect(afterUpdateKey).toMatchObject({
            frame: 60,
            dump: { value: 80, type: 'cc.Number' },
            interpMode: 1,
            broken: true,
        });

        expectUndoSuccess(await Undo.undo());
        const afterUndo = await request('queryClip', [{ rootPath: keyDataNodePath, clipUuid: keyDataClipUuid }]);
        expect(afterUndo.curves).toEqual(before.curves);

        expectUndoSuccess(await Undo.redo());
        const afterRedoKey = await queryPositionXKey();
        expect(afterRedoKey).toMatchObject({
            frame: 60,
            dump: { value: 80, type: 'cc.Number' },
            interpMode: 1,
            broken: true,
        });

        expect(await request('applyOperation', [{
            operations: [
                { type: 'updatePropertyKey', clipUuid: keyDataClipUuid, propKey: 'position', channel: 'x', frame: 60, keyData: { broken: false } },
            ],
        }])).toEqual({ state: 'success', result: true });
        const afterBrokenFalseKey = await queryPositionXKey();
        expect(afterBrokenFalseKey).toMatchObject({
            frame: 60,
            dump: { value: 80, type: 'cc.Number' },
            interpMode: 1,
            broken: false,
        });

        expectUndoSuccess(await Undo.undo());
        const afterBrokenFalseUndoKey = await queryPositionXKey();
        expect(afterBrokenFalseUndoKey).toMatchObject({
            frame: 60,
            dump: { value: 80, type: 'cc.Number' },
            interpMode: 1,
            broken: true,
        });

        expectUndoSuccess(await Undo.redo());
        const afterBrokenFalseRedoKey = await queryPositionXKey();
        expect(afterBrokenFalseRedoKey).toMatchObject({
            frame: 60,
            dump: { value: 80, type: 'cc.Number' },
            interpMode: 1,
            broken: false,
        });

        expect(await request('save')).toBe(true);
        await request('exit', [{ restoreSelection: false, restoreSampledSceneState: false }]);
        await request('enter', [{ rootPath: keyDataNodePath, clipUuid: keyDataClipUuid }]);
        const afterReenterKey = await queryPositionXKey();
        expect(afterReenterKey).toMatchObject({
            frame: 60,
            dump: { value: 80, type: 'cc.Number' },
            interpMode: 1,
            broken: false,
        });
    });

    it('applyOperation 更新 RealCurve keyData 时保留显式 0 值', async () => {
        await ensureAnimationSession(keyDataNodePath, keyDataClipUuid);

        const queryEulerYKey = async () => {
            const dump = await request('queryClip', [{ rootPath: keyDataNodePath, clipUuid: keyDataClipUuid }]);
            const eulerCurve = dump.curves.find((curve: any) => curve.nodePath === '' && curve.key === 'eulerAngles');
            return eulerCurve?.channels
                .find((channel: any) => channel.key === 'y')?.keyframes
                .find((keyframe: any) => keyframe.frame === 84);
        };

        const result = await request('applyOperation', [{
            operations: [
                {
                    type: 'createPropertyKey',
                    clipUuid: keyDataClipUuid,
                    propKey: 'eulerAngles',
                    channel: 'y',
                    frame: 84,
                    value: 84,
                    keyData: {
                        inTangent: 0,
                        outTangent: 0,
                        inTangentWeight: 0,
                        outTangentWeight: 0,
                        interpMode: 0,
                        tangentWeightMode: 0,
                        tangentMode: 0,
                        easingMethod: 0,
                    },
                },
                {
                    type: 'updatePropertyKeyData',
                    clipUuid: keyDataClipUuid,
                    propKey: 'eulerAngles',
                    channel: 'y',
                    frame: 84,
                    keyData: { broken: true },
                },
            ],
        }]);
        const key = await queryEulerYKey();

        expect(result).toEqual({ state: 'success', result: true });
        expect(key).toMatchObject({
            frame: 84,
            dump: { value: 84, type: 'cc.Number' },
            inTangent: 0,
            outTangent: 0,
            inTangentWeight: 0,
            outTangentWeight: 0,
            interpMode: 0,
            tangentWeightMode: 0,
            tangentMode: 0,
            easingMethod: 0,
            broken: true,
        });
    });

    it('applyOperation 失败时不会留下已执行的 clip 局部修改', async () => {
        await ensureAnimationSession(keyDataNodePath, keyDataClipUuid);
        await Undo.clearHistory();
        await Undo.markSaved();

        const before = await request('queryClip', [{ rootPath: keyDataNodePath, clipUuid: keyDataClipUuid }]);
        const result = await request('applyOperation', [{
            operations: [
                { type: 'createPropertyKey', clipUuid: keyDataClipUuid, propKey: 'position', frame: 72, value: { x: 72, y: 0, z: 0 } },
                { type: 'updatePropertyKeyData', clipUuid: keyDataClipUuid, propKey: 'position', channel: 'x', frame: 99, keyData: { interpMode: 1 } },
            ],
        }]);
        const after = await request('queryClip', [{ rootPath: keyDataNodePath, clipUuid: keyDataClipUuid }]);

        expect(result).toMatchObject({ state: 'failure', result: false });
        expect(after.curves).toEqual(before.curves);
        expect(after.duration).toBe(before.duration);
        expect(await Undo.isDirty()).toBe(false);
    });

    it('applyOperation 更新复合属性 keyData 时不会部分写入分量曲线', async () => {
        await ensureAnimationSession(keyDataNodePath, keyDataClipUuid);

        const createResult = await request('applyOperation', [{
            operations: [
                { type: 'createPropertyKey', clipUuid: keyDataClipUuid, propKey: 'eulerAngles', channel: 'x', frame: 36, value: 1 },
            ],
        }]);
        expect(createResult).toEqual({ state: 'success', result: true });

        const before = await request('queryClip', [{ rootPath: keyDataNodePath, clipUuid: keyDataClipUuid }]);
        const result = await request('applyOperation', [{
            operations: [
                { type: 'updatePropertyKeyData', clipUuid: keyDataClipUuid, propKey: 'eulerAngles', frame: 36, keyData: { interpMode: 1 } },
            ],
            recordUndo: false,
        }]);
        const after = await request('queryClip', [{ rootPath: keyDataNodePath, clipUuid: keyDataClipUuid }]);

        const beforeEulerX = before.curves
            .find((curve: any) => curve.nodePath === '' && curve.key === 'eulerAngles')?.channels
            .find((channel: any) => channel.key === 'x')?.keyframes
            .find((keyframe: any) => keyframe.frame === 36);
        const afterEulerX = after.curves
            .find((curve: any) => curve.nodePath === '' && curve.key === 'eulerAngles')?.channels
            .find((channel: any) => channel.key === 'x')?.keyframes
            .find((keyframe: any) => keyframe.frame === 36);

        expect(result).toMatchObject({ state: 'failure', result: false });
        expect(beforeEulerX).toEqual({ frame: 36, dump: { value: 1, type: 'cc.Number' } });
        expect(afterEulerX).toEqual(beforeEulerX);
    });

    it('applyOperation 支持 queryProperties 暴露的 rotation 和 active 属性', async () => {
        await ensureAnimationSession(nodePath, clipUuid);

        const properties = await request('queryProperties', [{ nodePath: childNodePath }]);
        const result = await request('applyOperation', [{
            operations: [
                { type: 'createPropertyKey', clipUuid, nodePath, propKey: 'rotation', frame: 3, value: { x: 0, y: 0, z: 0, w: 1 } },
                { type: 'createPropertyKey', clipUuid, nodePath: childNodePath, propKey: 'active', frame: 3, value: false },
            ],
        }]);
        const dump = await request('queryClip', [{ clipUuid }]);

        expect(properties.map((item: any) => item.key)).toEqual(expect.arrayContaining(['rotation', 'active']));
        expect(result).toEqual({ state: 'success', result: true });
        expect(dump.curves.find((curve: any) => curve.nodePath === '' && curve.key === 'rotation')).toMatchObject({
            type: { value: 'cc.Quat' },
            keyframes: [
                { frame: 3, dump: { value: { x: 0, y: 0, z: 0, w: 1 }, type: 'cc.Quat' } },
            ],
        });
        expect(dump.curves.find((curve: any) => curve.nodePath === 'AnimationServiceChild' && curve.key === 'active')).toMatchObject({
            type: { value: 'cc.Boolean' },
            isCurveSupport: false,
            keyframes: [
                { frame: 3, dump: { value: false, type: 'cc.Boolean' } },
            ],
        });
    });

    it('applyOperation 支持 cc.Sprite.spriteFrame 单帧 key 保存重进闭环', async () => {
        await ensureAnimationSession(spriteFrameNodePath, spriteFrameClipUuid);

        const properties = await request('queryProperties', [{ nodePath: spriteFrameNodePath }]);
        const spriteFrameProperty = properties.find((item: any) => item.key === 'cc.Sprite.spriteFrame');
        expect(spriteFrameProperty).toMatchObject({
            key: 'cc.Sprite.spriteFrame',
            comp: 'cc.Sprite',
            type: { value: 'cc.SpriteFrame' },
        });

        const createResult = await request('applyOperation', [{
            operations: [
                { type: 'addPropertyCurve', clipUuid: spriteFrameClipUuid, nodePath: spriteFrameNodePath, propKey: 'cc.Sprite.spriteFrame', value: { uuid: spriteFrameUuid } },
                { type: 'createPropertyKey', clipUuid: spriteFrameClipUuid, nodePath: spriteFrameNodePath, propKey: 'cc.Sprite.spriteFrame', frame: 0, value: null },
                { type: 'createPropertyKey', clipUuid: spriteFrameClipUuid, nodePath: spriteFrameNodePath, propKey: 'cc.Sprite.spriteFrame', frame: 30, value: { uuid: spriteFrameUuid } },
            ],
            recordUndo: false,
        }]);
        const afterCreate = await request('queryClip', [{ rootPath: spriteFrameNodePath, clipUuid: spriteFrameClipUuid }]);
        const spriteFrameCurve = afterCreate.curves.find((curve: any) => curve.nodePath === '' && curve.key === 'cc.Sprite.spriteFrame');
        const sampledStart = await request('queryPropertyValueAtFrame', [{
            clipUuid: spriteFrameClipUuid,
            nodePath: spriteFrameNodePath,
            propKey: 'cc.Sprite.spriteFrame',
            frame: 0,
        }]);
        const sampledEnd = await request('queryPropertyValueAtFrame', [{
            clipUuid: spriteFrameClipUuid,
            nodePath: spriteFrameNodePath,
            propKey: 'cc.Sprite.spriteFrame',
            frame: 30,
        }]);

        expect(createResult).toEqual({ state: 'success', result: true });
        expect(Math.round(afterCreate.duration * afterCreate.sample)).toBe(31);
        expect(spriteFrameCurve).toMatchObject({
            type: { value: 'cc.SpriteFrame' },
            isCurveSupport: false,
            keyframes: [
                { frame: 0, dump: { value: null, type: 'cc.SpriteFrame' } },
                { frame: 30, dump: { value: { uuid: spriteFrameUuid }, type: 'cc.SpriteFrame' } },
            ],
        });
        expect(sampledStart).toBeNull();
        expect(sampledEnd).toMatchObject({ uuid: spriteFrameUuid });
        expect(await request('save')).toBe(true);
        const afterSave = await request('queryClip', [{ rootPath: spriteFrameNodePath, clipUuid: spriteFrameClipUuid }]);
        const savedCurve = afterSave.curves.find((curve: any) => curve.nodePath === '' && curve.key === 'cc.Sprite.spriteFrame');

        expect(savedCurve?.keyframes).toEqual(spriteFrameCurve.keyframes);

        await request('exit', [{ restoreSelection: false, restoreSampledSceneState: false }]);
        await request('enter', [{ rootPath: spriteFrameNodePath, clipUuid: spriteFrameClipUuid }]);
        const afterReenter = await request('queryClip', [{ rootPath: spriteFrameNodePath, clipUuid: spriteFrameClipUuid }]);
        const reenteredCurve = afterReenter.curves.find((curve: any) => curve.nodePath === '' && curve.key === 'cc.Sprite.spriteFrame');

        expect(Math.round(afterReenter.duration * afterReenter.sample)).toBe(31);
        expect(reenteredCurve?.keyframes).toEqual(spriteFrameCurve.keyframes);
    });

    it('applyOperation 支持普通属性曲线的创建、更新、复制、批量删除和 extrapolation', async () => {
        await ensureAnimationSession(nodePath, clipUuid);

        const result = await request('applyOperation', [{
            operations: [
                { type: 'addPropertyCurve', clipUuid, nodePath, propKey: 'position' },
                { type: 'createPropertyKey', clipUuid, nodePath, propKey: 'position', frame: 0, value: { x: 1, y: 2, z: 3 } },
                { type: 'createPropertyKey', clipUuid, nodePath, propKey: 'position', frame: 15, value: { x: 4, y: 5, z: 6 } },
                { type: 'updatePropertyKey', clipUuid, nodePath, propKey: 'position', frame: 15, value: { x: 7, y: 8, z: 9 } },
                { type: 'copyPropertyKeysTo', clipUuid, nodePath, propKey: 'position', frames: [0, 15], dstFrame: 30 },
                { type: 'removePropertyKeys', clipUuid, nodePath, propKey: 'position', frames: [0, 45] },
                { type: 'setPropertyCurveExtrapolation', clipUuid, nodePath, propKey: 'position', preExtrap: 1, postExtrap: 2 },
            ],
        }]);
        const dump = await request('queryClip', [{ clipUuid }]);
        const positionCurve = dump.curves.find((curve: any) => curve.nodePath === '' && curve.key === 'position');

        expect(result).toEqual({ state: 'success', result: true });
        expect(positionCurve).toMatchObject({
            preExtrap: 1,
            postExtrap: 2,
        });
        expect(positionCurve.keyframes).toEqual([
            { frame: 15, dump: { value: { x: 7, y: 8, z: 9 }, type: 'cc.Vec3' } },
            { frame: 30, dump: { value: { x: 1, y: 2, z: 3 }, type: 'cc.Vec3' } },
        ]);
    });

    it('removePropertyKeys 清空关键帧时保留属性轨道，removePropertyCurve 才移除轨道', async () => {
        await ensureAnimationSession(emptyNodePath, emptyClipUuid);

        const clearResult = await request('applyOperation', [{
            operations: [
                { type: 'addPropertyCurve', clipUuid: emptyClipUuid, nodePath: emptyNodePath, propKey: 'scale' },
                { type: 'createPropertyKey', clipUuid: emptyClipUuid, nodePath: emptyNodePath, propKey: 'scale', frame: 0, value: { x: 1, y: 1, z: 1 } },
                { type: 'removePropertyKeys', clipUuid: emptyClipUuid, nodePath: emptyNodePath, propKey: 'scale', frames: [0] },
            ],
        }]);
        const afterClear = await request('queryClip', [{ rootPath: emptyNodePath, clipUuid: emptyClipUuid }]);
        const scaleCurveAfterClear = afterClear.curves.find((curve: any) => curve.nodePath === '' && curve.key === 'scale');

        expect(clearResult).toEqual({ state: 'success', result: true });
        expect(scaleCurveAfterClear).toBeDefined();
        expect(scaleCurveAfterClear.keyframes).toEqual([]);
        expect(scaleCurveAfterClear.channels.every((channel: any) => channel.keyframes.length === 0)).toBe(true);

        const removeResult = await request('applyOperation', [{
            operations: [
                { type: 'removePropertyCurve', clipUuid: emptyClipUuid, nodePath: emptyNodePath, propKey: 'scale' },
            ],
        }]);
        const afterRemove = await request('queryClip', [{ rootPath: emptyNodePath, clipUuid: emptyClipUuid }]);

        expect(removeResult).toEqual({ state: 'success', result: true });
        expect(afterRemove.curves.find((curve: any) => curve.nodePath === '' && curve.key === 'scale')).toBeUndefined();
    });

    it('applyOperation 创建普通属性 key 时 value 可省略并从当前场景采样', async () => {
        await ensureAnimationSession(nodePath, clipUuid);
        await request('setTime', [{ time: 0 }]);
        const sampled = await request('queryPropertyValueAtFrame', [{
            clipUuid,
            nodePath,
            propKey: 'position',
            frame: 6,
        }]);

        const result = await request('applyOperation', [{
            operations: [
                { type: 'createPropertyKey', clipUuid, nodePath, propKey: 'position', frame: 6 },
            ],
        }]);
        const dump = await request('queryClip', [{ clipUuid }]);
        const positionCurve = dump.curves.find((curve: any) => curve.nodePath === '' && curve.key === 'position');

        expect(result).toEqual({ state: 'success', result: true });
        expect(positionCurve.keyframes).toEqual(expect.arrayContaining([
            { frame: 6, dump: { value: sampled, type: 'cc.Vec3' } },
        ]));
    });

    it('applyOperation 不接受旧 funcName/args 格式', async () => {
        const result = await request('applyOperation', [{
            operations: [{ funcName: 'changeSample', args: [clipUuid, 60] }],
        }]);

        expect(result).toMatchObject({
            state: 'failure',
            result: false,
            reason: 'Animation operation is invalid.',
        });
    });

    it('applyOperation 对非当前 clip 显式失败', async () => {
        const result = await request('applyOperation', [{
            operations: [{ type: 'changeSample', clipUuid: 'other-clip', sample: 60 }],
        }]);

        expect(result).toMatchObject({
            state: 'failure',
            result: false,
            reason: `current edit clip: '${clipUuid}' but you want to operate: 'other-clip'`,
        });
    });

    it('applyOperation 支持真实 AnimationClip 的 embedded player 基础操作', async () => {
        const result = await request('applyOperation', [{
            operations: [
                {
                    type: 'addEmbeddedPlayerGroup',
                    clipUuid,
                    group: { key: 'particle-track', name: 'Particle Track', type: 'particle-system' },
                },
                {
                    type: 'addEmbeddedPlayer',
                    clipUuid,
                    embeddedPlayer: {
                        begin: 12,
                        end: 30,
                        reconciledSpeed: true,
                        group: 'particle-track',
                        displayName: 'Burst',
                        playable: { type: 'particle-system', path: 'Particles' },
                    },
                },
            ],
        }]);
        const dump = await request('queryClip', [{ clipUuid }]);

        expect(result).toEqual({ state: 'success', result: true });
        expect(dump.embeddedPlayerGroups).toEqual([
            { key: 'particle-track', name: 'Particle Track', type: 'particle-system' },
        ]);
        expect(dump.embeddedPlayers).toEqual([{
            begin: 12,
            end: 30,
            reconciledSpeed: true,
            group: 'particle-track',
            displayName: 'Burst',
            playable: { type: 'particle-system', path: 'Particles' },
        }]);
    });

    it('applyOperation 支持真实 AnimationClip 的 auxiliary curve 基础操作', async () => {
        const result = await request('applyOperation', [{
            operations: [
                { type: 'addAuxiliaryCurve', clipUuid, name: 'BlendWeight' },
                { type: 'createAuxKey', clipUuid, name: 'BlendWeight', frame: 0, value: 0.25 },
                { type: 'createAuxKey', clipUuid, name: 'BlendWeight', frame: 60, value: 0.75 },
            ],
        }]);
        const dump = await request('queryClip', [{ clipUuid }]);

        expect(result).toEqual({ state: 'success', result: true });
        expect(dump.auxiliaryCurves.BlendWeight.keyframes).toEqual([
            { frame: 0, value: 0.25 },
            { frame: 60, value: 0.75 },
        ]);
    });

    it('applyOperation 支持 auxiliary curve keyData 写入读回和按帧采样', async () => {
        await ensureAnimationSession(nodePath, clipUuid);

        const result = await request('applyOperation', [{
            operations: [
                { type: 'addAuxiliaryCurve', clipUuid, name: 'CurveWeight' },
                { type: 'createAuxKey', clipUuid, name: 'CurveWeight', frame: 0, value: 0, keyData: { interpMode: 1 } },
                { type: 'createAuxKey', clipUuid, name: 'CurveWeight', frame: 30, value: 1 },
                { type: 'updateAuxKeyData', clipUuid, name: 'CurveWeight', frame: 30, keyData: { broken: true, outTangent: 0.5 } },
            ],
        }]);
        const dump = await request('queryClip', [{ clipUuid }]);
        const sampledStart = await request('queryAuxiliaryCurveValueAtFrame', [{ clipUuid, name: 'CurveWeight', frame: 0 }]);
        const sampled = await request('queryAuxiliaryCurveValueAtFrame', [{ clipUuid, name: 'CurveWeight', frame: 15 }]);
        const sampledEnd = await request('queryAuxiliaryCurveValueAtFrame', [{ clipUuid, name: 'CurveWeight', frame: 30 }]);

        expect(result).toEqual({ state: 'success', result: true });
        expect(dump.auxiliaryCurves.CurveWeight.keyframes).toEqual([
            { frame: 0, value: 0, interpMode: 1 },
            { frame: 30, value: 1, broken: true, outTangent: 0.5 },
        ]);
        expect(sampledStart).toEqual({ value: 0, type: 'cc.Number' });
        expect(sampled.type).toBe('cc.Number');
        expect(sampled.value).toBeGreaterThanOrEqual(0);
        expect(sampled.value).toBeLessThanOrEqual(1);
        expect(sampledEnd).toEqual({ value: 1, type: 'cc.Number' });
    });

    it('applyOperation 支持 auxiliary curve 编辑后重算 duration', async () => {
        await ensureAnimationSession(emptyNodePath, emptyClipUuid);

        const result = await request('applyOperation', [{
            operations: [
                { type: 'addAuxiliaryCurve', clipUuid: emptyClipUuid, name: 'DurationWeight' },
                { type: 'createAuxKey', clipUuid: emptyClipUuid, name: 'DurationWeight', frame: 90, value: 1 },
            ],
            recordUndo: false,
        }]);
        const dump = await request('queryClip', [{ clipUuid: emptyClipUuid }]);

        expect(result).toEqual({ state: 'success', result: true });
        expect(Math.round(dump.duration * dump.sample)).toBeGreaterThanOrEqual(90);
    });

    it('applyOperation 默认记录 undo/dirty，并支持 undo/redo 恢复真实 AnimationClip', async () => {
        await ensureAnimationSession(nodePath, clipUuid);
        await Undo.clearHistory();
        await Undo.markSaved();

        const before = await request('queryClip', [{ clipUuid }]);
        const result = await request('applyOperation', [{
            operations: [
                { type: 'changeSpeed', clipUuid, speed: 2.25 },
                { type: 'addEvent', clipUuid, frame: 12, func: 'onUndoCheck', params: ['undo'] },
            ],
        }]);
        const after = await request('queryClip', [{ clipUuid }]);

        expect(result).toEqual({ state: 'success', result: true });
        expect(await Undo.isDirty()).toBe(true);
        expect(await Undo.canUndo()).toBe(true);
        expect(await Undo.canRedo()).toBe(false);
        expect(after.speed).toBe(2.25);
        expect(after.events).toEqual(expect.arrayContaining([
            { frame: 12, func: 'onUndoCheck', params: ['undo'] },
        ]));

        const undoEventPromise = utils.once<Record<'animation:clip-changed', any>>(sceneWorker, 'animation:clip-changed');
        expectUndoSuccess(await Undo.undo());
        const undoEvent = await undoEventPromise;
        const undoDump = await request('queryClip', [{ clipUuid }]);
        expect(undoEvent).toMatchObject({
            reason: 'undo-redo',
            rootPath: nodePath,
            clipUuid,
        });
        expect(undoDump.speed).toBe(before.speed);
        expect(undoDump.events).toEqual(before.events);
        expect(await Undo.isDirty()).toBe(false);
        expect(await Undo.canRedo()).toBe(true);

        const redoEventPromise = utils.once<Record<'animation:clip-changed', any>>(sceneWorker, 'animation:clip-changed');
        expectUndoSuccess(await Undo.redo());
        const redoEvent = await redoEventPromise;
        const redoDump = await request('queryClip', [{ clipUuid }]);
        expect(redoEvent).toMatchObject({
            reason: 'undo-redo',
            rootPath: nodePath,
            clipUuid,
        });
        expect(redoDump.speed).toBe(after.speed);
        expect(redoDump.events).toEqual(after.events);
        expect(await Undo.isDirty()).toBe(true);
    });

    it('applyOperation recordUndo 为 false 时不写入 undo 栈', async () => {
        await ensureAnimationSession(nodePath, clipUuid);
        await Undo.clearHistory();
        await Undo.markSaved();

        const before = await request('queryClip', [{ clipUuid }]);
        const result = await request('applyOperation', [{
            recordUndo: false,
            operations: [
                { type: 'changeSpeed', clipUuid, speed: before.speed + 0.125 },
            ],
        }]);
        const after = await request('queryClip', [{ clipUuid }]);

        expect(result).toEqual({ state: 'success', result: true });
        expect(after.speed).toBe(before.speed + 0.125);
        expect(await Undo.isDirty()).toBe(false);
        expect(await Undo.canUndo()).toBe(false);
        expect(await Undo.canRedo()).toBe(false);
    });
});
