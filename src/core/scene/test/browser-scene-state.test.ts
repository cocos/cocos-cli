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
        expect(browserSceneState.getCurrent()).toEqual(stored);
        expect(stored.updatedAt).toEqual(expect.any(Number));
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
});
