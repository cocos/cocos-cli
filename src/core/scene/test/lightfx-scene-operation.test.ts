import { LightFXSceneOperation } from '../scene-process/service/baking/lightfx/scene-operation';

jest.mock('../scene-process/service/baking/lightfx/host', () => ({
    lightFXBakeHost: {
        reserveSceneOperation: jest.fn(async () => ({ transactionId: 'test-owner' })),
        releaseSceneOperation: jest.fn(async () => undefined),
    },
}));

const targets = ['light-probe', 'lightmap'] as const;
const actions = ['bake', 'clear'] as const;

describe('LightFX scene-local transactions', () => {
    it('captures request context synchronously and releases the local guard when capture fails', async () => {
        const host = { reserveSceneOperation: jest.fn(async () => ({ transactionId: 'owner' })), releaseSceneOperation: jest.fn(async () => undefined) };
        const guard = new LightFXSceneOperation(host);
        const operation = jest.fn(async () => 1);
        const capture = jest.fn(() => { throw new Error('No source scene'); });
        const failed = guard.run('lightmap', 'clear', operation, capture);
        expect(capture).toHaveBeenCalledTimes(1);
        await expect(failed).rejects.toThrow('No source scene');
        expect(host.reserveSceneOperation).not.toHaveBeenCalled();
        expect(host.releaseSceneOperation).not.toHaveBeenCalled();
        expect(operation).not.toHaveBeenCalled();
        await expect(guard.run('lightmap', 'clear', operation)).resolves.toBe(1);
    });

    it('does not run scene code or release another owner when the host rejects reservation', async () => {
        const host = { reserveSceneOperation: jest.fn(async () => { throw new Error('Host busy'); }), releaseSceneOperation: jest.fn() };
        const operation = jest.fn();
        await expect(new LightFXSceneOperation(host).run('light-probe', 'clear', operation)).rejects.toThrow('Host busy');
        expect(operation).not.toHaveBeenCalled();
        expect(host.releaseSceneOperation).not.toHaveBeenCalled();
    });

    it('holds local ownership until the host release finishes and passes the exact token', async () => {
        let release!: () => void;
        const releasing = new Promise<void>(resolve => { release = resolve; });
        const host = { reserveSceneOperation: jest.fn(async () => ({ transactionId: 'owner-A' })), releaseSceneOperation: jest.fn(() => releasing) };
        const guard = new LightFXSceneOperation(host);
        const current = guard.run('light-probe', 'bake', async () => guard.hostTransactionId);
        await Promise.resolve(); await Promise.resolve();
        await expect(guard.run('lightmap', 'clear', async () => 0)).rejects.toThrow('already in progress');
        expect(host.releaseSceneOperation).toHaveBeenCalledWith({ transactionId: 'owner-A' });
        release();
        await expect(current).resolves.toBe('owner-A');
        expect(() => guard.hostTransactionId).toThrow('No LightFX scene transaction');
    });

    it('reports release failure without claiming successful completion', async () => {
        const host = { reserveSceneOperation: jest.fn(async () => ({ transactionId: 'owner-A' })), releaseSceneOperation: jest.fn(async () => { throw new Error('Cleanup pending'); }) };
        await expect(new LightFXSceneOperation(host).run('lightmap', 'clear', async () => 1)).rejects.toThrow('Cleanup pending');
    });

    it('preserves the scene failure when host release also fails', async () => {
        const host = { reserveSceneOperation: jest.fn(async () => ({ transactionId: 'owner-A' })), releaseSceneOperation: jest.fn(async () => { throw new Error('Rollback pending'); }) };
        const errorLog = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        try {
            await expect(new LightFXSceneOperation(host).run('light-probe', 'bake', async () => { throw new Error('Scene apply failed'); })).rejects.toThrow('Scene apply failed');
            expect(host.releaseSceneOperation).toHaveBeenCalledWith({ transactionId: 'owner-A' });
            expect(errorLog).toHaveBeenCalled();
        } finally { errorLog.mockRestore(); }
    });

    for (const target of targets) for (const action of actions) {
        it(`${target} ${action} excludes all four entrances until the entire transaction settles`, async () => {
            const guard = new LightFXSceneOperation();
            let release!: () => void;
            const held = new Promise<void>(resolve => { release = resolve; });
            const current = guard.run(target, action, async () => { await held; return 42; });
            const rejected = jest.fn(async () => 0);
            for (const otherTarget of targets) for (const otherAction of actions) {
                await expect(guard.run(otherTarget, otherAction, rejected)).rejects.toThrow(`${target} LightFX ${action}`);
            }
            expect(rejected).not.toHaveBeenCalled();
            release();
            await expect(current).resolves.toBe(42);
            await expect(guard.run('light-probe', 'clear', async () => 7)).resolves.toBe(7);
        });
    }

    it('reserves before the first await and keeps ownership during asynchronous failure cleanup', async () => {
        const guard = new LightFXSceneOperation();
        let finishCleanup!: () => void;
        const cleanup = new Promise<void>(resolve => { finishCleanup = resolve; });
        const current = guard.run('light-probe', 'bake', async () => {
            try {
                await expect(guard.run('lightmap', 'clear', async () => 1)).rejects.toThrow('already in progress');
                throw new Error('Bake failed');
            } finally { await cleanup; }
        });
        const failure = expect(current).rejects.toThrow('Bake failed');
        await expect(guard.run('light-probe', 'clear', async () => 1)).rejects.toThrow('already in progress');
        finishCleanup();
        await failure;
        await expect(guard.run('lightmap', 'clear', async () => 2)).resolves.toBe(2);
    });

    it('releases a synchronous exception without masking it', async () => {
        const guard = new LightFXSceneOperation();
        await expect(guard.run('lightmap', 'bake', () => { throw new Error('Prepare failed'); })).rejects.toThrow('Prepare failed');
        await expect(guard.run('lightmap', 'bake', async () => true)).resolves.toBe(true);
    });
});
