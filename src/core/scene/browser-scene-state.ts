export interface IBrowserSceneState {
    uuid: string;
    url: string;
    type: string;
    name: string;
    updatedAt: number;
}

/**
 * Main-process bridge for the scene currently opened by PinK's browser editor.
 *
 * The browser editor and the headless screenshot worker are separate processes,
 * so the worker cannot infer a scene switch from its own EditorService state.
 */
class BrowserSceneState {
    private current: IBrowserSceneState | null = null;

    setCurrent(info: Omit<IBrowserSceneState, 'updatedAt'>): IBrowserSceneState {
        if (!info?.uuid) {
            throw new Error('Browser scene UUID is required.');
        }
        this.current = {
            uuid: info.uuid,
            url: info.url ?? '',
            type: info.type ?? '',
            name: info.name ?? '',
            updatedAt: Date.now(),
        };
        return { ...this.current };
    }

    getCurrent(): IBrowserSceneState | null {
        return this.current ? { ...this.current } : null;
    }

    clearCurrent(expectedUuid?: string): boolean {
        if (expectedUuid && this.current?.uuid !== expectedUuid) {
            return false;
        }
        this.current = null;
        return true;
    }
}

export const browserSceneState = new BrowserSceneState();
