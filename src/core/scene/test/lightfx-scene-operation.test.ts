import { LightFXSceneOperation } from '../scene-process/service/baking/lightfx/scene-operation';

const targets = ['light-probe', 'lightmap'] as const;
const actions = ['bake', 'clear'] as const;

describe('LightFX scene-local transactions', () => {
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
