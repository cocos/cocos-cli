import {
    getCurrentToolCallContext,
    registerToolCallFinalizer,
} from '../src/lib/mcp/mcp';
import {
    completeMcpToolCallContext,
    requireMcpToolCallContext,
    runWithMcpToolCallContext,
} from '../src/mcp/tool-call-context';

interface Deferred<T> {
    readonly promise: Promise<T>;
    readonly resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((resolvePromise) => {
        resolve = resolvePromise;
    });
    return { promise, resolve };
}

describe('MCP tool-call context', () => {
    it('exposes a frozen context and a case-insensitive header snapshot across awaits', async () => {
        const repeatedHeader = ['first-value', 'second-value'];
        const headers: Record<string, string | string[] | undefined> = {
            'X-Host-Route': repeatedHeader,
        };

        const result = await runWithMcpToolCallContext(headers, async () => {
            const beforeAwait = requireMcpToolCallContext();
            headers['X-Host-Route'] = 'changed-value';
            repeatedHeader[0] = 'changed-array-value';
            await Promise.resolve();
            const afterAwait = getCurrentToolCallContext();

            return { beforeAwait, afterAwait };
        });

        expect(result.beforeAwait).toBe(result.afterAwait);
        expect(result.beforeAwait.getHeader('x-HOST-route')).toBe('first-value');
        expect(result.beforeAwait.getHeader('missing-header')).toBeUndefined();
        expect(result.beforeAwait.lifecycleState).toBe('running');
        expect(result.beforeAwait.operationId).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        );
        expect(Object.isFrozen(result.beforeAwait)).toBe(true);
        expect(getCurrentToolCallContext()).toBeUndefined();
    });

    it('supports calls without request headers', () => {
        const context = runWithMcpToolCallContext(undefined, () => requireMcpToolCallContext());

        expect(context.getHeader('x-host-route')).toBeUndefined();
    });

    it('isolates concurrent calls and assigns a unique operation id to each one', async () => {
        const firstEntered = deferred<void>();
        const secondEntered = deferred<void>();
        const releaseFirst = deferred<void>();
        const releaseSecond = deferred<void>();

        const firstCall = runWithMcpToolCallContext({
            'x-operation-route': 'first-route',
        }, async () => {
            const beforeAwait = requireMcpToolCallContext();
            firstEntered.resolve();
            await releaseFirst.promise;
            return { beforeAwait, afterAwait: requireMcpToolCallContext() };
        });
        const secondCall = runWithMcpToolCallContext({
            'X-OPERATION-ROUTE': 'second-route',
        }, async () => {
            const beforeAwait = requireMcpToolCallContext();
            secondEntered.resolve();
            await releaseSecond.promise;
            return { beforeAwait, afterAwait: requireMcpToolCallContext() };
        });

        await Promise.all([firstEntered.promise, secondEntered.promise]);
        expect(getCurrentToolCallContext()).toBeUndefined();

        releaseSecond.resolve();
        releaseFirst.resolve();
        const [first, second] = await Promise.all([firstCall, secondCall]);

        expect(first.beforeAwait).toBe(first.afterAwait);
        expect(second.beforeAwait).toBe(second.afterAwait);
        expect(first.beforeAwait.getHeader('x-operation-route')).toBe('first-route');
        expect(second.beforeAwait.getHeader('x-operation-route')).toBe('second-route');
        expect(first.beforeAwait.operationId).not.toBe(second.beforeAwait.operationId);
    });

    it('fails explicitly when context-only APIs are used outside a tool call', () => {
        expect(getCurrentToolCallContext()).toBeUndefined();
        expect(() => requireMcpToolCallContext()).toThrow(
            'MCP tool-call context is unavailable outside a tool handler',
        );
        expect(() => registerToolCallFinalizer('cleanup', jest.fn())).toThrow(
            'MCP tool-call context is unavailable outside a tool handler',
        );
    });

    it('keeps the first finalizer for a key and runs distinct keys in registration order', async () => {
        const calls: string[] = [];
        const sharedKey = 'shared-cleanup';
        const symbolKey = Symbol('second-cleanup');
        const firstFinalizer = jest.fn(async () => {
            calls.push('first');
        });
        const ignoredFinalizer = jest.fn(async () => {
            calls.push('ignored');
        });
        const secondFinalizer = jest.fn(() => {
            calls.push('second');
        });
        let context!: ReturnType<typeof requireMcpToolCallContext>;

        await runWithMcpToolCallContext(undefined, async () => {
            context = requireMcpToolCallContext();
            registerToolCallFinalizer(sharedKey, firstFinalizer);
            registerToolCallFinalizer(sharedKey, ignoredFinalizer);
            registerToolCallFinalizer(symbolKey, secondFinalizer);
            await completeMcpToolCallContext();
            await completeMcpToolCallContext();
        });

        expect(calls).toEqual(['first', 'second']);
        expect(firstFinalizer).toHaveBeenCalledTimes(1);
        expect(ignoredFinalizer).not.toHaveBeenCalled();
        expect(secondFinalizer).toHaveBeenCalledTimes(1);
        expect(context.lifecycleState).toBe('completed');
    });

    it('shares one completion and rejects registration once completion starts', async () => {
        const completionEntered = deferred<void>();
        const releaseCompletion = deferred<void>();
        let context!: ReturnType<typeof requireMcpToolCallContext>;

        await runWithMcpToolCallContext(undefined, async () => {
            context = requireMcpToolCallContext();
            registerToolCallFinalizer('cleanup', async () => {
                completionEntered.resolve();
                await releaseCompletion.promise;
            });

            const firstCompletion = completeMcpToolCallContext();
            const secondCompletion = completeMcpToolCallContext();
            expect(secondCompletion).toBe(firstCompletion);
            expect(context.lifecycleState).toBe('completing');
            expect(() => registerToolCallFinalizer('late-cleanup', jest.fn())).toThrow(
                'MCP tool-call context is completing',
            );

            await completionEntered.promise;
            releaseCompletion.resolve();
            await firstCompletion;
            expect(context.lifecycleState).toBe('completed');
            expect(() => registerToolCallFinalizer('later-cleanup', jest.fn())).toThrow(
                'MCP tool-call context is completed',
            );
        });
    });

    it('runs every finalizer and aggregates multiple failures', async () => {
        const firstFailure = new Error('first private failure');
        const secondFailure = new Error('second private failure');
        const middleFinalizer = jest.fn();
        let context!: ReturnType<typeof requireMcpToolCallContext>;

        await runWithMcpToolCallContext(undefined, async () => {
            context = requireMcpToolCallContext();
            registerToolCallFinalizer('first', async () => {
                throw firstFailure;
            });
            registerToolCallFinalizer('middle', middleFinalizer);
            registerToolCallFinalizer('second', async () => {
                throw secondFailure;
            });

            const completion = completeMcpToolCallContext();
            await expect(completion).rejects.toMatchObject({
                name: 'AggregateError',
                errors: [firstFailure, secondFailure],
            });
            await expect(completeMcpToolCallContext()).rejects.toMatchObject({
                name: 'AggregateError',
                errors: [firstFailure, secondFailure],
            });
        });

        expect(middleFinalizer).toHaveBeenCalledTimes(1);
        expect(context.lifecycleState).toBe('completed');
    });

    it('rethrows one finalizer failure without wrapping it', async () => {
        const failure = new Error('private failure');

        await runWithMcpToolCallContext(undefined, async () => {
            registerToolCallFinalizer('cleanup', async () => {
                throw failure;
            });

            await expect(completeMcpToolCallContext()).rejects.toBe(failure);
        });
    });
});
