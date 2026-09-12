import { resolve } from 'path';

const mockClients: any[] = [];
const mockGetProject = jest.fn();
jest.mock('../e2e/helpers/test-utils', () => ({
    getSharedTestProject: (...args: unknown[]) => mockGetProject(...args),
}));
jest.mock('../e2e/helpers/mcp-client', () => ({
    MCPTestClient: jest.fn().mockImplementation(options => {
        const client = {
            options,
            start: jest.fn().mockResolvedValue(undefined),
            connectToRunningServer: jest.fn().mockResolvedValue(undefined),
            callTool: jest.fn().mockResolvedValue({ code: 200 }),
            close: jest.fn().mockResolvedValue(undefined),
        };
        mockClients.push(client);
        return client;
    }),
}));

const previousDescriptor = process.env.__E2E_SHARED_MCP__;
beforeEach(() => {
    jest.resetModules();
    mockClients.length = 0;
    mockGetProject.mockReset();
    process.env.__E2E_SHARED_MCP__ = JSON.stringify({
        port: 12345,
        projectPath: resolve('test-workspace/shared/project'),
        projectName: 'mcp-e2e-shared',
        fixtureProject: resolve('tests/fixtures/projects/asset-operation'),
    });
});
afterAll(() => {
    if (previousDescriptor === undefined) delete process.env.__E2E_SHARED_MCP__;
    else process.env.__E2E_SHARED_MCP__ = previousDescriptor;
});

test('separate Jest module registries attach to the same server without copying the project or spawning', async () => {
    for (let file = 0; file < 2; file++) {
        jest.resetModules();
        const { getSharedMCPServer } = await import('../e2e/helpers/shared-mcp-server');
        const server = getSharedMCPServer();
        await Promise.all([server.initialize(), server.initialize()]);
        expect(server.getTestProject().path).toBe(resolve('test-workspace/shared/project'));
        await server.cleanup();
    }
    expect(mockGetProject).not.toHaveBeenCalled();
    expect(mockClients).toHaveLength(2);
    for (const client of mockClients) {
        expect(client.options.port).toBe(12345);
        expect(client.start).not.toHaveBeenCalled();
        expect(client.connectToRunningServer).toHaveBeenCalledTimes(1);
        expect(client.callTool).toHaveBeenCalledWith('scene-close', {});
        expect(client.close).toHaveBeenCalledTimes(1);
    }
});

test('a mismatched fixture fails instead of silently using the wrong project', async () => {
    const { getSharedMCPServer } = await import('../e2e/helpers/shared-mcp-server');
    await expect(getSharedMCPServer().initialize(resolve('another-fixture'))).rejects.toThrow('does not match');
    expect(mockClients).toHaveLength(0);
    expect(mockGetProject).not.toHaveBeenCalled();
});

test('global setup owns the server when no descriptor has been published', async () => {
    delete process.env.__E2E_SHARED_MCP__;
    mockGetProject.mockResolvedValue({ path: 'owner-project', name: 'mcp-e2e-shared' });
    const { getSharedMCPServer } = await import('../e2e/helpers/shared-mcp-server');
    const server = getSharedMCPServer();
    await server.initialize();
    expect(mockGetProject).toHaveBeenCalledTimes(1);
    expect(mockClients[0].start).toHaveBeenCalledTimes(1);
    expect(mockClients[0].connectToRunningServer).not.toHaveBeenCalled();
    await server.cleanup();
    expect(mockClients[0].close).toHaveBeenCalledTimes(1);
});

test('an explicit project name creates an isolated server for build tests', async () => {
    mockGetProject.mockResolvedValue({ path: 'builder-project', name: 'mcp-e2e-builder' });
    const { getSharedMCPServer } = await import('../e2e/helpers/shared-mcp-server');
    const server = getSharedMCPServer();
    await server.initialize(undefined, 'mcp-e2e-builder');
    expect(mockGetProject).toHaveBeenCalledWith(expect.any(String), 'mcp-e2e-builder');
    expect(mockClients[0].options.projectPath).toBe('builder-project');
    expect(mockClients[0].start).toHaveBeenCalledTimes(1);
    expect(mockClients[0].connectToRunningServer).not.toHaveBeenCalled();
    await server.cleanup();
    expect(mockClients[0].close).toHaveBeenCalledTimes(1);
});
