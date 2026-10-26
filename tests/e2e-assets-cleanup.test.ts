jest.mock('../e2e/helpers/shared-mcp-server', () => ({ getSharedMCPServer: jest.fn() }));
jest.mock('../e2e/helpers/mcp-client', () => ({ MCPTestClient: jest.fn() }));
import { teardownAssetsTestEnvironment, AssetsTestContext } from '../e2e/helpers/test-utils';

test('closes the scene before deleting its backing assets', async () => {
    const callTool = jest.fn().mockResolvedValue({ code: 200 });
    await teardownAssetsTestEnvironment({
        mcpClient: { callTool }, testRootUrl: 'db://assets/e2e-test',
    } as unknown as AssetsTestContext);
    expect(callTool.mock.calls).toEqual([
        ['scene-close', {}],
        ['assets-delete-asset', { dbPath: 'db://assets/e2e-test' }],
    ]);
});

test('does not delete scene assets when closing the editor fails', async () => {
    const callTool = jest.fn().mockResolvedValue({ code: 500, reason: 'close failed' });
    await expect(teardownAssetsTestEnvironment({
        mcpClient: { callTool }, testRootUrl: 'db://assets/e2e-test',
    } as unknown as AssetsTestContext)).rejects.toThrow('close failed');
    expect(callTool).toHaveBeenCalledTimes(1);
});
