import { MCPTestClient } from '../../helpers/mcp-client';
import { AssetsTestContext, setupAssetsTestEnvironment, teardownAssetsTestEnvironment } from '../../helpers/test-utils';

describe('MCP Prefab API', () => {
    let context: AssetsTestContext;
    let mcpClient: MCPTestClient;
    let testDirURL: string;
    let sceneAssetUUID: string;

    beforeAll(async () => {
        context = await setupAssetsTestEnvironment();
        mcpClient = context.mcpClient;
        testDirURL = `${context.testRootUrl}/prefab-test`;

        const result = await mcpClient.callTool('scene-create', {
            options: {
                dbURL: testDirURL,
                baseName: 'scene-test',
                templateType: '2d',
            },
        });
        sceneAssetUUID = result.data.assetUuid;

        await mcpClient.callTool('scene-open', {
            dbURLOrUUID: sceneAssetUUID,
        });
    });

    afterAll(async () => {
        await teardownAssetsTestEnvironment(context);
    });

    it('should test all prefab APIs', async () => {
        // 1. Create a node by type
        const nodeName = 'test-node-for-prefab';
        const createNodeResult = await mcpClient.callTool('scene-create-node-by-type', {
            options: {
                path: `Canvas/${nodeName}`,
                name: nodeName,
                nodeType: 'Empty',
            }
        });
        expect(createNodeResult.code).toBe(200);
        let nodePath = createNodeResult.data.path;
        const basePos = createNodeResult.data.properties.position;

        // 2. Create a prefab from the node
        const prefabAssetURL = `${testDirURL}/test-prefab.prefab`;
        const createPrefabResult = await mcpClient.callTool('scene-prefab-create-from-node', {
            options: {
                nodePath: nodePath,
                dbURL: prefabAssetURL,
            }
        });
        nodePath = createPrefabResult.data.path;
        expect(createPrefabResult.code).toBe(200);

        // 3. Test overwrite functionality
        const overwriteResult = await mcpClient.callTool('scene-prefab-create-from-node', {
            options: {
                nodePath: createPrefabResult.data.path,
                dbURL: prefabAssetURL,
                overwrite: true,
            }
        });
        expect(overwriteResult.code).toBe(200);

        // 4. Check if the node is a prefab instance
        const isInstanceResult = await mcpClient.callTool('scene-prefab-is-instance', {
            options: {
                nodePath: nodePath,
            }
        });
        expect(isInstanceResult.data).toBe(true);

        // 5. Check a non-prefab node
        const anotherNodeResult = await mcpClient.callTool('scene-create-node-by-type', {
            options: {
                path: `Canvas/another-node`,
                name: 'another-node',
                nodeType: 'Empty'
            }
        });
        const isNotInstanceResult = await mcpClient.callTool('scene-prefab-is-instance', {
            options: {
                nodePath: anotherNodeResult.data.path,
            }
        });
        expect(isNotInstanceResult.data).toBe(false);

        // 6. Get prefab info
        const getInfoResult = await mcpClient.callTool('scene-prefab-get-info', {
            options: {
                nodePath: nodePath,
            }
        });
        expect(getInfoResult.code).toBe(200);
        expect(getInfoResult.data).not.toBeNull();
        if (getInfoResult.data) {
            expect(typeof getInfoResult.data.fileId).toBe('string');
        }

        // 7. Modify the prefab instance
        await mcpClient.callTool('scene-update-node', {
            options: {
                path: nodePath,
                properties: {
                    position: { x: 100, y: basePos.y, z: basePos.z },
                },
            },
        });

        // 8. Apply changes to the prefab asset
        const applyChangesResult = await mcpClient.callTool('scene-prefab-apply-changes', {
            options: {
                nodePath: nodePath,
            }
        });
        expect(applyChangesResult.code).toBe(200);

        // 9. Modify the prefab instance again
        await mcpClient.callTool('scene-update-node', {
            options: {
                path: nodePath,
                properties: {
                    position: { x: 100, y: 200, z: basePos.z },
                },
            },
        });

        // 10. Revert changes
        const revertResult = await mcpClient.callTool('scene-prefab-revert', {
            options: {
                nodePath: nodePath,
            }
        });
        expect(revertResult.code).toBe(200);
        
        // Verify revert by checking the property
        const queryNodeResult = await mcpClient.callTool('scene-query-node', {
            options: {
                path: nodePath,
                queryChildren: false,
            }
        });
        expect(queryNodeResult.data).not.toBeNull();
        if (queryNodeResult.data) {
            expect(queryNodeResult.data.properties.position.y).not.toBe(200);
        }


        // 11. Unpack the prefab instance
        const unpackResult = await mcpClient.callTool('scene-prefab-unpack', {
            options: {
                nodePath: nodePath,
                recursive: false,
            }
        });
        expect(unpackResult.code).toBe(200);

        // 12. Verify it's no longer a prefab instance
        const isUnpackedInstanceResult = await mcpClient.callTool('scene-prefab-is-instance', {
            options: {
                nodePath: nodePath,
            }
        });
        expect(isUnpackedInstanceResult.data).toBe(false);
    });
});
