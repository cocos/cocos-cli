import type { LightFXBakeTarget } from './types';

/** Scene-local transaction guard. This does not replace the shared Node-host operation lease. */
export class LightFXSceneOperation {
    private active: { target: LightFXBakeTarget; action: 'bake' | 'clear' } | null = null;

    async run<T>(target: LightFXBakeTarget, action: 'bake' | 'clear', operation: () => Promise<T>): Promise<T> {
        if (this.active) {
            throw new Error(`A ${this.active.target} LightFX ${this.active.action} operation is already in progress.`);
        }
        // Reserve before invoking user code or reaching its first await. Rejected operations must
        // not enter snapshot/rollback code belonging to the current owner.
        const owner = { target, action };
        this.active = owner;
        try {
            return await operation();
        } finally {
            if (this.active === owner) this.active = null;
        }
    }
}

export const lightFXSceneOperation = new LightFXSceneOperation();
