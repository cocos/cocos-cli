import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';

export type McpToolCallLifecycleState = 'running' | 'completing' | 'completed';

export interface McpToolCallContext {
    readonly operationId: string;
    readonly lifecycleState: McpToolCallLifecycleState;
    getHeader(name: string): string | undefined;
}

export type McpRequestHeaders = Readonly<Record<string, string | readonly string[] | undefined>>;

type ToolCallFinalizer = () => void | Promise<void>;

interface MutableMcpToolCallContext {
    publicContext: Readonly<McpToolCallContext>;
    lifecycleState: McpToolCallLifecycleState;
    readonly finalizers: Map<string | symbol, ToolCallFinalizer>;
    completionPromise?: Promise<void>;
}

const toolCallContextStorage = new AsyncLocalStorage<MutableMcpToolCallContext>();

/** Returns the MCP tool-call context for the current asynchronous scope. */
export function getCurrentToolCallContext(): Readonly<McpToolCallContext> | undefined {
    return toolCallContextStorage.getStore()?.publicContext;
}

/** Returns the current MCP tool-call context, or throws when called outside a tool handler. */
export function requireMcpToolCallContext(): Readonly<McpToolCallContext> {
    const context = getCurrentToolCallContext();
    if (!context) {
        throw new Error('MCP tool-call context is unavailable outside a tool handler');
    }
    return context;
}

/** Runs a complete MCP tool call in an isolated asynchronous context. */
export function runWithMcpToolCallContext<T>(
    headers: McpRequestHeaders | undefined,
    callback: () => T,
): T {
    const headerSnapshot = snapshotHeaders(headers);
    const mutableContext = {
        lifecycleState: 'running' as McpToolCallLifecycleState,
        finalizers: new Map<string | symbol, ToolCallFinalizer>(),
    } as MutableMcpToolCallContext;
    const publicContext: Readonly<McpToolCallContext> = Object.freeze({
        operationId: randomUUID(),
        get lifecycleState() {
            return mutableContext.lifecycleState;
        },
        getHeader(name: string): string | undefined {
            return headerSnapshot.get(name.toLowerCase());
        },
    });
    mutableContext.publicContext = publicContext;

    return toolCallContextStorage.run(mutableContext, callback);
}

/**
 * Registers a finalizer for the current MCP tool call. Only the first callback for each key is
 * retained, allowing callers to register the same cleanup safely more than once per tool call.
 */
export function registerToolCallFinalizer(
    key: string | symbol,
    callback: () => void | Promise<void>,
): void {
    const context = requireMutableContext();
    if (context.lifecycleState !== 'running') {
        throw new Error(`MCP tool-call context is ${context.lifecycleState}`);
    }
    if (typeof key !== 'string' && typeof key !== 'symbol') {
        throw new TypeError('MCP tool-call finalizer key must be a string or symbol');
    }
    if (typeof callback !== 'function') {
        throw new TypeError('MCP tool-call finalizer must be a function');
    }

    if (!context.finalizers.has(key)) {
        context.finalizers.set(key, callback);
    }
}

/**
 * Runs all finalizers for the current MCP tool call in registration order. A failure does not
 * prevent later finalizers from running, and the context always transitions to `completed`.
 */
export function completeMcpToolCallContext(): Promise<void> {
    const context = requireMutableContext();
    if (context.completionPromise) {
        return context.completionPromise;
    }
    if (context.lifecycleState === 'completed') {
        return Promise.resolve();
    }

    context.lifecycleState = 'completing';
    const finalizers = [...context.finalizers.values()];
    context.finalizers.clear();

    // Defer execution to a microtask so concurrent completion calls can reuse the same promise.
    context.completionPromise = Promise.resolve().then(async () => {
        const errors: unknown[] = [];
        try {
            for (const finalizer of finalizers) {
                try {
                    await finalizer();
                } catch (error) {
                    errors.push(error);
                }
            }

            if (errors.length === 1) {
                throw errors[0];
            }
            if (errors.length > 1) {
                throw new AggregateError(errors, 'Multiple MCP tool-call finalizers failed');
            }
        } finally {
            context.lifecycleState = 'completed';
        }
    });

    return context.completionPromise;
}

function requireMutableContext(): MutableMcpToolCallContext {
    const context = toolCallContextStorage.getStore();
    if (!context) {
        throw new Error('MCP tool-call context is unavailable outside a tool handler');
    }
    return context;
}

function snapshotHeaders(headers: McpRequestHeaders | undefined): ReadonlyMap<string, string> {
    const snapshot = new Map<string, string>();
    if (!headers) {
        return snapshot;
    }

    for (const [name, value] of Object.entries(headers)) {
        const normalizedName = name.toLowerCase();
        if (snapshot.has(normalizedName)) {
            continue;
        }

        const firstValue = typeof value === 'string' ? value : value?.[0];
        if (firstValue !== undefined) {
            snapshot.set(normalizedName, firstValue);
        }
    }

    return snapshot;
}
