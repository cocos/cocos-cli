import { assetManager } from '../../assets';
import { ICreateByAssetParams } from '../common';
import { Rpc } from '../main-process/rpc';
import { EditorProxy } from '../main-process/proxy/editor-proxy';
import { NodeProxy } from '../main-process/proxy/node-proxy';
import { SceneTestEnv } from './scene-test-env';

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
    const sceneName = 'AnimationServiceScene';
    const clipName = 'AnimationServiceClip';
    let nodePath = '';
    let clipUuid = '';

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
    });

    afterAll(async () => {
        await EditorProxy.close({ save: false });
    });

    it('queryClip 返回真实 AnimationClip 的基础 dump', async () => {
        await request('enter', [{ rootPath: nodePath, clipUuid }]);

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

    it('applyOperation 在真实 AnimationClip 上应用基础普通 clip 操作', async () => {
        const result = await request('applyOperation', [{
            operations: [
                { type: 'changeSample', clipUuid, sample: 60 },
                { type: 'changeSpeed', clipUuid, speed: 1.5 },
                { type: 'changeWrapMode', clipUuid, wrapMode: 2 },
                { type: 'addEvent', clipUuid, frame: 30, func: 'onHalf', params: ['value'] },
                { type: 'moveEvents', clipUuid, frames: [30], offset: 6 },
            ],
        }]);
        const dump = await request('queryClip', [{ clipUuid }]);

        expect(result).toEqual({ state: 'success', result: true });
        expect(dump.sample).toBe(60);
        expect(dump.speed).toBe(1.5);
        expect(dump.wrapMode).toBe(2);
        expect(dump.events).toEqual([{ frame: 36, func: 'onHalf', params: ['value'] }]);
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

        expectUndoSuccess(await Undo.undo());
        const undoDump = await request('queryClip', [{ clipUuid }]);
        expect(undoDump.speed).toBe(before.speed);
        expect(undoDump.events).toEqual(before.events);
        expect(await Undo.isDirty()).toBe(false);
        expect(await Undo.canRedo()).toBe(true);

        expectUndoSuccess(await Undo.redo());
        const redoDump = await request('queryClip', [{ clipUuid }]);
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
