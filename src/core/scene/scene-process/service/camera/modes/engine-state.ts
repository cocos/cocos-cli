import { Service } from '../../core/decorator';
import { NeedAnimState } from '../../engine';

export function enterCameraState(state: NeedAnimState) {
    try {
        (Service.Engine as any)?.enterState?.(state);
    } catch (e) {
        // Engine may not be ready
    }
}

export function exitCameraState(state: NeedAnimState) {
    try {
        (Service.Engine as any)?.exitState?.(state);
    } catch (e) {
        // Engine may not be ready
    }
}

export { NeedAnimState };
