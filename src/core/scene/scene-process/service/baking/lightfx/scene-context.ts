import { director, type Scene } from 'cc';
import { Service } from '../../core';
import type { IEditorSessionService } from '../../core/editor-session';
import { lightFXSceneOperation } from './scene-operation';
import type { LightFXBakeTarget } from './types';

export type LightFXSceneContext = ReturnType<typeof captureLightFXScene>;

/** Capture the caller's scene before reserving the host; never retarget an accepted request. */
export function runLightFXSceneOperation<T>(target: LightFXBakeTarget, action: 'bake' | 'clear', operation: (context: LightFXSceneContext) => Promise<T>): Promise<T> {
    let context: LightFXSceneContext;
    return lightFXSceneOperation.run(target, action, () => {
        // Inside the reservation's cleanup scope so rejection releases this exact token.
        context.assertCurrent();
        return operation(context);
    }, () => {
        const scene = director.getScene();
        if (!scene) throw new Error('No scene is currently open.');
        context = captureLightFXScene(scene);
    });
}

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
        scene,
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
