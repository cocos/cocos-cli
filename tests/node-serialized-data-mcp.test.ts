const mockRequest = jest.fn();

jest.mock('../src/api/decorator/decorator.js', () => jest.requireActual('../src/api/decorator/decorator'), { virtual: true });

jest.mock('../src/core/scene/main-process/rpc', () => ({
    Rpc: { getInstance: () => ({ request: mockRequest }) },
}));

jest.mock('../src/core/scene', () => ({
    NodeType: jest.requireActual('../src/core/scene/common/node').NodeType,
    Scene: { Node: jest.requireActual('../src/core/scene/main-process/proxy/node-proxy').NodeProxy },
}));

jest.mock('../src/core/assets', () => ({ assetManager: {} }));

jest.mock('../src/mcp/resources', () => ({
    ResourceManager: jest.fn().mockImplementation(() => ({ loadAllResources: () => [] })),
}));

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import { COMMON_STATUS } from '../src/api/base/schema-base';
import { toolRegistry } from '../src/api/decorator/decorator';
import '../src/api/scene/node';
import { SchemaSerializedNodeData } from '../src/api/scene/node-schema';
import type { SerializedNodeData } from '../src/core/scene/common/node';
import { McpMiddleware } from '../src/mcp/mcp.middleware';

const nodeData: SerializedNodeData = {
    version: 1,
    serialized: JSON.stringify([
        { roots: [{ __id__: 1 }, { __id__: 2 }] },
        { __type__: 'cc.Node', _name: 'Panel', target: { __id__: 2 }, asset: { __uuid__: 'asset-uuid' } },
        { __type__: 'cc.Node', _name: 'Target', external: { $nodeReference: 'ref-1' } },
    ]),
    rootTransforms: [0, 10].map(x => ({
        position: { x, y: 2, z: 3 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        scale: { x: 1, y: 1, z: 1 },
    })),
    externalReferences: [
        { id: 'ref-1', type: 'node', uuid: 'external-node' },
        { id: 'ref-2', type: 'component', uuid: 'external-component' },
    ],
};

describe('Serialized node MCP tools', () => {
    let client: Client;
    let server: McpServer;

    beforeEach(async () => {
        mockRequest.mockReset();
        jest.spyOn(console, 'debug').mockImplementation(() => undefined);
        jest.spyOn(console, 'error').mockImplementation(() => undefined);
        const middleware = new McpMiddleware();
        server = (middleware as unknown as { server: McpServer }).server;
        client = new Client({ name: 'node-serialization-test', version: '1.0.0' });
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    });

    afterEach(async () => {
        await client.close();
        await server.close();
        jest.restoreAllMocks();
    });

    it('publishes both tools with structured input and complete result schemas', async () => {
        const { tools } = await client.listTools();
        expect(tools.find(tool => tool.name === 'scene-serialize-nodes')?.inputSchema).toMatchObject({
            type: 'object',
            required: ['options'],
            properties: {
                options: {
                    type: 'object',
                    required: ['paths'],
                    properties: { paths: { type: 'array', items: { type: 'string' } } },
                },
            },
        });
        expect(tools.find(tool => tool.name === 'scene-create-nodes-by-serialized-data')?.inputSchema).toMatchObject({
            properties: {
                options: {
                    type: 'object',
                    required: ['data', 'parentPath'],
                    properties: {
                        data: {
                            type: 'object',
                            required: ['version', 'serialized', 'rootTransforms', 'externalReferences'],
                        },
                        siblingIndex: { type: 'integer', minimum: 0 },
                        externalReferences: { enum: ['clear', 'resolve'] },
                    },
                },
            },
        });

        const serializeResult = { code: COMMON_STATUS.SUCCESS, data: nodeData };
        const createResult = { code: COMMON_STATUS.SUCCESS, data: ['Panel', 'Target'] };
        expect(toolRegistry.get('scene-serialize-nodes')?.meta.returnSchema?.parse(serializeResult)).toEqual(serializeResult);
        expect(toolRegistry.get('scene-create-nodes-by-serialized-data')?.meta.returnSchema?.parse(createResult)).toEqual(createResult);
    });

    it('passes the complete serialized batch through MCP and the Node RPC proxy unchanged', async () => {
        const options = { paths: ['Source/Panel', 'Source/Target'] };
        mockRequest.mockResolvedValueOnce(nodeData).mockResolvedValueOnce(['Destination/Panel', 'Destination/Target']);

        const serialized = await client.callTool({ name: 'scene-serialize-nodes', arguments: { options } });
        expect(mockRequest).toHaveBeenNthCalledWith(1, 'Node', 'serialize', [options]);
        expect(serialized).toMatchObject({
            isError: false,
            structuredContent: { result: { code: COMMON_STATUS.SUCCESS, data: nodeData } },
        });

        const response = serialized.structuredContent as { result: { data: SerializedNodeData } };
        const createOptions = { data: response.result.data, parentPath: 'Destination' };
        const created = await client.callTool({
            name: 'scene-create-nodes-by-serialized-data',
            arguments: { options: createOptions },
        });

        expect(mockRequest).toHaveBeenNthCalledWith(2, 'Node', 'createBySerializedData', [createOptions]);
        expect(mockRequest).toHaveBeenCalledTimes(2);
        expect(created).toMatchObject({
            isError: false,
            structuredContent: { result: { code: COMMON_STATUS.SUCCESS, data: ['Destination/Panel', 'Destination/Target'] } },
        });
    });

    it.each(['clear', 'resolve'])('forwards placement, transforms, and the explicit %s reference policy', async externalReferences => {
        const options = { data: nodeData, parentPath: '/', siblingIndex: 0, keepWorldTransform: true, externalReferences };
        mockRequest.mockResolvedValue(['Panel', 'Target']);

        await client.callTool({ name: 'scene-create-nodes-by-serialized-data', arguments: { options } });

        expect(mockRequest).toHaveBeenCalledWith('Node', 'createBySerializedData', [options]);
    });

    it.each([
        ['missing options', {}],
        ['empty selection', { options: { paths: [] } }],
        ['empty node path', { options: { paths: [''] } }],
    ])('rejects %s before serializing nodes', async (_name, args) => {
        await expect(client.callTool({ name: 'scene-serialize-nodes', arguments: args }))
            .rejects.toMatchObject({ code: ErrorCode.InvalidParams });

        expect(mockRequest).not.toHaveBeenCalled();
    });

    it.each([
        ['missing data', { parentPath: '/' }],
        ['unsupported version', { data: { ...nodeData, version: 2 }, parentPath: '/' }],
        ['empty graph', { data: { ...nodeData, serialized: '' }, parentPath: '/' }],
        ['missing root transforms', { data: { ...nodeData, rootTransforms: [] }, parentPath: '/' }],
        ['invalid reference kind', { data: { ...nodeData, externalReferences: [{ id: 'ref', type: 'asset', uuid: 'asset' }] }, parentPath: '/' }],
        ['missing parent', { data: nodeData }],
        ['negative sibling index', { data: nodeData, parentPath: '/', siblingIndex: -1 }],
        ['fractional sibling index', { data: nodeData, parentPath: '/', siblingIndex: 0.5 }],
        ['invalid reference policy', { data: nodeData, parentPath: '/', externalReferences: 'keep' }],
        ['invalid transform option', { data: nodeData, parentPath: '/', keepWorldTransform: 'true' }],
    ])('rejects %s before creating nodes', async (_name, options) => {
        await expect(client.callTool({ name: 'scene-create-nodes-by-serialized-data', arguments: { options } }))
            .rejects.toMatchObject({ code: ErrorCode.InvalidParams });

        expect(mockRequest).not.toHaveBeenCalled();
    });

    it('rejects non-finite saved transforms', () => {
        expect(SchemaSerializedNodeData.safeParse({
            ...nodeData,
            rootTransforms: [{ ...nodeData.rootTransforms[0], rotation: { x: 0, y: 0, z: 0, w: Infinity } }],
        }).success).toBe(false);
    });

    it.each([
        ['scene-serialize-nodes', { paths: ['Missing'] }, 'Node cannot be serialized at path: Missing', COMMON_STATUS.FAIL],
        ['scene-create-nodes-by-serialized-data', { data: nodeData, parentPath: 'Missing' }, 'Parent node not found at path: Missing', COMMON_STATUS.NOT_FOUND],
        ['scene-create-nodes-by-serialized-data', { data: nodeData, parentPath: '/' }, 'Failed to load serialized nodes', COMMON_STATUS.FAIL],
    ])('returns the RPC failure from %s without reporting created nodes', async (name, options, reason, code) => {
        mockRequest.mockRejectedValue(new Error(reason));

        const result = await client.callTool({ name, arguments: { options } });

        expect(result).toMatchObject({
            isError: code === COMMON_STATUS.FAIL,
            structuredContent: { result: { code, reason } },
        });
        expect(result.structuredContent).not.toHaveProperty('result.data');
        expect(mockRequest).toHaveBeenCalledTimes(1);
    });
});
