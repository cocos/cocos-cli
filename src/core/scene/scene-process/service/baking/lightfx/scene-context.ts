import { director, type Scene } from 'cc';
import { Service } from '../../core';
import type { IEditorSessionService } from '../../core/editor-session';

/** Pin both the saved editor session and the actual Scene, including same-URL reloads. */
export function captureLightFXScene(scene: Scene) {
    const editor = Service.Editor as unknown as IEditorSessionService;
    const session = editor.getEditorSession();
    const assertCurrent = () => {
        if (director.getScene() !== scene || !editor.isCurrentEditorSession(session)) {
            throw new Error('The source scene changed during the LightFX operation. Retry in the intended scene.');
        }
    };
    assertCurrent();
    return {
        assertCurrent,
        // Only result application/save/cleanup holds the lifecycle queue; native work does not.
        run<T>(operation: (save: () => Promise<unknown>) => Promise<T>): Promise<T> {
            return editor.runForSession(session, async save => {
                assertCurrent();
                return operation(async () => { assertCurrent(); return save(); });
            });
        },
    };
}
