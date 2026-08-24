const mockRegisteredTools = new Map<string, (args: unknown, extra: any) => Promise<unknown>>();
const mockToolExecution = jest.fn();
const mockToolRegistry = new Map<string, any>([
    ['context-probe', {
        target: {
            execute: (...args: unknown[]) => mockToolExecution(...args),
        },
        meta: {
            toolName: 'context-probe',
            description: 'Context probe',
            paramSchemas: [],
            methodName: 'execute',
        },
    }],
]);

jest.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
    McpServer: jest.fn().mockImplementation(() => ({
        tool: jest.fn((name: string, _description: string, _schema: unknown, callback: any) => {
            mockRegisteredTools.set(name, callback);
        }),
        resource: jest.fn(),
        connect: jest.fn(),
        server: {
            setRequestHandler: jest.fn(),
        },
    })),
    ResourceTemplate: jest.fn(),
}));

jest.mock('../src/api/decorator/decorator', () => ({
    toolRegistry: mockToolRegistry,
}));

jest.mock('../src/mcp/resources', () => ({
    ResourceManager: jest.fn().mockImplementation(() => ({
        loadAllResources: jest.fn(() => []),
    })),
}));

jest.mock('../src/mcp/hooks/builder.hook', () => ({
    BuilderHook: jest.fn().mockImplementation(() => ({
        onBeforeExecute: jest.fn(),
        onRegisterParam: jest.fn(),
        onValidationFailed: jest.fn(),
    })),
}));

jest.mock('../src/core/assets', () => ({
    assetManager: {
        queryAssetInfos: jest.fn(() => []),
    },
}));

import { McpMiddleware } from '../src/mcp/mcp.middleware';
import {
    getCurrentToolCallContext,
    registerToolCallFinalizer,
    requireMcpToolCallContext,
} from '../src/mcp/tool-call-context';

function requestExtra(headers?: Record<string, string | string[] | undefined>): any {
    return {
        requestInfo: headers ? { headers } : undefined,
        requestId: 1,
        signal: new AbortController().signal,
        sendNotification: jest.fn(),
        sendRequest: jest.fn(),
    };
}

describe('McpMiddleware tool-call context integration', () => {
    let debugSpy: jest.SpyInstance;
    let errorSpy: jest.SpyInstance;

    beforeEach(() => {
        mockRegisteredTools.clear();
        mockToolExecution.mockReset();
        debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => undefined);
        errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        new McpMiddleware();
    });

    afterEach(() => {
        debugSpy.mockRestore();
        errorSpy.mockRestore();
    });

    it('covers the target method async lifecycle without logging request headers', async () => {
        const headerSecret = 'secret-opaque-value';
        const snapshots: ReturnType<typeof requireMcpToolCallContext>[] = [];
        mockToolExecution.mockImplementation(async () => {
            snapshots.push(requireMcpToolCallContext());
            await Promise.resolve();
            snapshots.push(requireMcpToolCallContext());
            return { code: 200 };
        });

        const handler = mockRegisteredTools.get('context-probe');
        expect(handler).toBeDefined();
        await handler!({}, requestExtra({ 'x-HOST-ROUTE': headerSecret }));

        expect(snapshots).toHaveLength(2);
        expect(snapshots[0]).toBe(snapshots[1]);
        expect(snapshots[0].getHeader('X-host-route')).toBe(headerSecret);
        expect(snapshots[0].lifecycleState).toBe('completed');
        expect(snapshots[0]).not.toHaveProperty('origin');
        expect(snapshots[0]).not.toHaveProperty('routeToken');
        expect(getCurrentToolCallContext()).toBeUndefined();

        const logOutput = JSON.stringify([
            ...debugSpy.mock.calls,
            ...errorSpy.mock.calls,
        ]);
        expect(logOutput).not.toContain(headerSecret);
    });

    it('creates a context when the SDK request has no headers', async () => {
        let observedContext: ReturnType<typeof requireMcpToolCallContext> | undefined;
        mockToolExecution.mockImplementation(async () => {
            observedContext = requireMcpToolCallContext();
            return { code: 200 };
        });

        const handler = mockRegisteredTools.get('context-probe');
        await handler!({}, requestExtra());

        expect(observedContext?.getHeader('x-host-route')).toBeUndefined();
        expect(observedContext?.lifecycleState).toBe('completed');
    });

    it('awaits one keyed finalizer after a successful tool call', async () => {
        let notifyFinalizerStarted!: () => void;
        let releaseFinalizer!: () => void;
        const finalizerStarted = new Promise<void>(resolve => {
            notifyFinalizerStarted = resolve;
        });
        const finalizerGate = new Promise<void>(resolve => {
            releaseFinalizer = resolve;
        });
        const firstFinalizer = jest.fn(async () => {
            notifyFinalizerStarted();
            await finalizerGate;
        });
        const ignoredFinalizer = jest.fn();
        let observedContext: ReturnType<typeof requireMcpToolCallContext> | undefined;
        mockToolExecution.mockImplementation(async () => {
            observedContext = requireMcpToolCallContext();
            registerToolCallFinalizer('host-operation', firstFinalizer);
            await Promise.resolve();
            registerToolCallFinalizer('host-operation', ignoredFinalizer);
            return { code: 200, data: 'ok' };
        });

        const handler = mockRegisteredTools.get('context-probe');
        const handlerPromise = handler!({}, requestExtra()) as Promise<{ isError: boolean }>;
        let handlerSettled = false;
        void handlerPromise.finally(() => {
            handlerSettled = true;
        });

        await finalizerStarted;
        await Promise.resolve();
        expect(handlerSettled).toBe(false);
        expect(observedContext?.lifecycleState).toBe('completing');
        releaseFinalizer();
        const result = await handlerPromise;

        expect(result.isError).toBe(false);
        expect(firstFinalizer).toHaveBeenCalledTimes(1);
        expect(ignoredFinalizer).not.toHaveBeenCalled();
        expect(observedContext?.lifecycleState).toBe('completed');
    });

    it('preserves the tool error when finalization also fails and logs no failure detail', async () => {
        const headerSecret = 'secret-route-value';
        const finalizerSecret = 'private-finalizer-failure';
        const finalizer = jest.fn(async () => {
            throw new Error(`${finalizerSecret}: ${headerSecret}`);
        });
        mockToolExecution.mockImplementation(async () => {
            registerToolCallFinalizer('host-operation', finalizer);
            throw new Error('original-tool-failure');
        });

        const handler = mockRegisteredTools.get('context-probe');
        const result = await handler!({}, requestExtra({
            'X-Host-Route': headerSecret,
        })) as {
            isError: boolean;
            structuredContent: { result: { reason: string } };
        };

        expect(result.isError).toBe(true);
        expect(result.structuredContent.result.reason).toContain('original-tool-failure');
        expect(result.structuredContent.result.reason).not.toContain(finalizerSecret);
        expect(finalizer).toHaveBeenCalledTimes(1);

        const logOutput = JSON.stringify(errorSpy.mock.calls);
        expect(logOutput).toContain('Tool-call finalization failed');
        expect(logOutput).not.toContain(finalizerSecret);
        expect(logOutput).not.toContain(headerSecret);
    });

    it('preserves a successful result when finalization fails', async () => {
        mockToolExecution.mockImplementation(async () => {
            registerToolCallFinalizer('host-operation', async () => {
                throw new Error('private-finalizer-failure');
            });
            return { code: 200, data: 'ok' };
        });

        const handler = mockRegisteredTools.get('context-probe');
        const result = await handler!({}, requestExtra()) as {
            isError: boolean;
            structuredContent: { result: { data: string } };
        };

        expect(result.isError).toBe(false);
        expect(result.structuredContent.result.data).toBe('ok');
        expect(errorSpy).toHaveBeenCalledWith('[MCP] Tool-call finalization failed.');
    });
});
