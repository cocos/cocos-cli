import { browserSceneState } from '../browser-scene-state';

describe('BrowserSceneState', () => {
    beforeEach(() => {
        browserSceneState.clearCurrent();
    });

    it('stores a copy of the current PinK scene', () => {
        const stored = browserSceneState.setCurrent({
            uuid: 'scene-uuid',
            url: 'db://assets/main.scene',
            type: 'scene',
            name: 'main.scene',
        });

        expect(stored).toMatchObject({ uuid: 'scene-uuid', url: 'db://assets/main.scene' });
        expect(stored.selection).toEqual([]);
        expect(browserSceneState.getCurrent()).toEqual(stored);
        expect(stored.updatedAt).toEqual(expect.any(Number));
    });

    it('tracks browser selection only for the currently published scene', () => {
        browserSceneState.setCurrent({
            uuid: 'scene-uuid',
            url: 'db://assets/main.scene',
            type: 'scene',
            name: 'main.scene',
        });

        expect(browserSceneState.setEditorState('other-scene', { selection: ['Canvas/Other'] })).toBe(false);
        expect(browserSceneState.setEditorState('scene-uuid', {
            selection: ['Canvas/GreenBtn'],
            camera: {
                is2D: true,
                position: { x: 640, y: 360, z: 5000 },
                rotation: { x: 0, y: 0, z: 0, w: 1 },
                projection: 0,
                fov: 45,
                orthoHeight: 360,
                near: 6,
                far: 10000,
            },
        })).toBe(true);
        expect(browserSceneState.getCurrent()?.selection).toEqual(['Canvas/GreenBtn']);
        expect(browserSceneState.getCurrent()?.camera?.orthoHeight).toBe(360);
    });

    it('does not let an older browser scene clear a newer selection', () => {
        browserSceneState.setCurrent({
            uuid: 'new-scene-uuid',
            url: 'db://assets/new.scene',
            type: 'scene',
            name: 'new.scene',
        });

        expect(browserSceneState.clearCurrent('old-scene-uuid')).toBe(false);
        expect(browserSceneState.getCurrent()?.uuid).toBe('new-scene-uuid');
        expect(browserSceneState.clearCurrent('new-scene-uuid')).toBe(true);
        expect(browserSceneState.getCurrent()).toBeNull();
    });

    it('merges live node transforms and ignores an older update for the same node', () => {
        browserSceneState.setCurrent({
            uuid: 'scene-uuid',
            url: 'db://assets/main.scene',
            type: 'scene',
            name: 'main.scene',
        });
        const transform = (revision: number, x: number) => ({
            uuid: 'button-uuid',
            path: 'Canvas/Button',
            revision,
            position: { x, y: 20, z: 0 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            scale: { x: 1, y: 1, z: 1 },
        });

        browserSceneState.setEditorState('scene-uuid', { nodeTransforms: [transform(2, 200)] });
        browserSceneState.setEditorState('scene-uuid', { nodeTransforms: [transform(1, 100)] });

        const current = browserSceneState.getCurrent()!;
        expect(current.nodeTransforms).toEqual([transform(2, 200)]);
        current.nodeTransforms[0].position.x = 999;
        expect(browserSceneState.getCurrent()!.nodeTransforms[0].position.x).toBe(200);
    });

    it('stores independent copies of the latest inspector dump for each node', () => {
        browserSceneState.setCurrent({
            uuid: 'scene-uuid',
            url: 'db://assets/main.scene',
            type: 'scene',
            name: 'main.scene',
        });
        const newer = {
            uuid: 'button-uuid',
            path: 'Canvas/Button',
            revision: 2,
            dump: { active: { value: true }, __comps__: [{ value: { color: { value: '#ff0000' } } }] },
        };
        browserSceneState.setEditorState('scene-uuid', { nodeSnapshots: [newer] });
        browserSceneState.setEditorState('scene-uuid', {
            nodeSnapshots: [{ ...newer, revision: 1, dump: { active: { value: false } } }],
        });

        const current = browserSceneState.getCurrent()!;
        expect(current.nodeSnapshots).toEqual([newer]);
        (current.nodeSnapshots[0].dump as any).active.value = false;
        expect((browserSceneState.getCurrent()!.nodeSnapshots[0].dump as any).active.value).toBe(true);
    });
});
