import type { LightFXBakeTarget } from './types';
import type { ILightFXBakeHostService } from '../../../../common/lightfx-host';
import { lightFXBakeHost } from './host';

/** Local serialization plus a host reservation covering export through final scene rollback. */
export class LightFXSceneOperation {
    private active: { target: LightFXBakeTarget; action: 'bake' | 'clear' } | null = null;
    private transactionId: string | undefined;

    constructor(private readonly host: Pick<ILightFXBakeHostService, 'reserveSceneOperation' | 'releaseSceneOperation'> = lightFXBakeHost) {}

    get hostTransactionId(): string {
        if (!this.transactionId) throw new Error('No LightFX scene transaction is reserved.');
        return this.transactionId;
    }

    async run<T>(target: LightFXBakeTarget, action: 'bake' | 'clear', operation: () => Promise<T>, beforeReserve?: () => void): Promise<T> {
        if (this.active) {
            throw new Error(`A ${this.active.target} LightFX ${this.active.action} operation is already in progress.`);
        }
        // Reserve before invoking user code or reaching its first await. Rejected operations must
        // not enter snapshot/rollback code belonging to the current owner.
        const owner = { target, action };
        this.active = owner;
        try {
            // Capture synchronous request context after the busy check but before the first await.
            beforeReserve?.();
            const token = await this.host.reserveSceneOperation(owner);
            this.transactionId = token.transactionId;
            let result: T;
            try {
                result = await operation();
            } catch (error) {
                // Preserve the scene failure if host cleanup must remain locked and retryable.
                await this.host.releaseSceneOperation(token).catch((releaseError) => {
                    console.error('[LightFX] Scene reservation remains locked after failure:', releaseError);
                });
                throw error;
            }
            // A failed release must not be reported as successful completion.
            await this.host.releaseSceneOperation(token);
            return result;
        } finally {
            this.transactionId = undefined;
            if (this.active === owner) this.active = null;
        }
    }
}

export const lightFXSceneOperation = new LightFXSceneOperation();
