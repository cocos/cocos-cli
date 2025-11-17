import { MCPTestClient } from '../../helpers/mcp-client';
import { AssetsTestContext, generateTestId, setupAssetsTestEnvironment, teardownAssetsTestEnvironment } from '../../helpers/test-utils';

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

    describe('create-prefab-from-node', () => {
        test('should create prefab from node', async () => {
            const nodeName = `PrefabNode-${generateTestId()}`;
            const createNodeResult = await mcpClient.callTool('scene-create-node-by-type', {
                options: {
                    path: `Canvas`,
                    name: nodeName,
                    nodeType: 'Empty',
                }
            });
            expect(createNodeResult.code).toBe(200);
    
            const prefabAssetURL = `${testDirURL}/prefab-${generateTestId()}.prefab`;
            const createPrefabResult = await mcpClient.callTool('create-prefab-from-node', {
                options: {
                    nodePath: createNodeResult.data.path,
                    dbURL: prefabAssetURL,
                }
            });
            expect(createPrefabResult.code).toBe(200);
            expect(createPrefabResult.data).toBeDefined();
            expect(createPrefabResult.data.path).toBeDefined();
        });
    
        test('should create prefab with overwrite option', async () => {
            const nodeName = `PrefabNodeOverwrite-${generateTestId()}`;
            const createNodeResult = await mcpClient.callTool('scene-create-node-by-type', {
                options: {
                    path: `Canvas`,
                    name: nodeName,
                    nodeType: 'Empty',
                }
            });
            expect(createNodeResult.code).toBe(200);
    
            const prefabAssetURL = `${testDirURL}/prefab-overwrite-${generateTestId()}.prefab`;
    
            // 第一次创建
            const createPrefabResult = await mcpClient.callTool('create-prefab-from-node', {
                options: {
                    nodePath: createNodeResult.data.path,
                    dbURL: prefabAssetURL,
                }
            });
            expect(createPrefabResult.code).toBe(200);
    
            // 第二次创建，使用 overwrite
            const overwriteResult = await mcpClient.callTool('create-prefab-from-node', {
                options: {
                    nodePath: createPrefabResult.data.path,
                    dbURL: prefabAssetURL,
                    overwrite: true,
                }
            });
            expect(overwriteResult.code).toBe(200);
        });
    
        test('should handle invalid node path', async () => {
            const prefabAssetURL = `${testDirURL}/prefab-invalid-${generateTestId()}.prefab`;
            const result = await mcpClient.callTool('create-prefab-from-node', {
                options: {
                    nodePath: `Canvas/NonExistentNode-${generateTestId()}`,
                    dbURL: prefabAssetURL,
                }
            });
            expect(result.code).not.toBe(200);
            expect(result.reason).toBeDefined();
        });
    
        test('should handle invalid dbURL', async () => {
            const nodeName = `PrefabNodeInvalidURL-${generateTestId()}`;
            const createNodeResult = await mcpClient.callTool('scene-create-node-by-type', {
                options: {
                    path: `Canvas`,
                    name: nodeName,
                    nodeType: 'Empty',
                }
            });
            expect(createNodeResult.code).toBe(200);
    
            const result = await mcpClient.callTool('create-prefab-from-node', {
                options: {
                    nodePath: createNodeResult.data.path,
                    dbURL: 'invalid-url',
                }
            });
            expect(result.code).not.toBe(200);
            expect(result.reason).toBeDefined();
        });
    });
    
    describe('is-prefab-instance', () => {
        test('should return true for prefab instance', async () => {
            const nodeName = `PrefabInstanceNode-${generateTestId()}`;
            const createNodeResult = await mcpClient.callTool('scene-create-node-by-type', {
                options: {
                    path: `Canvas`,
                    name: nodeName,
                    nodeType: 'Empty',
                }
            });
            expect(createNodeResult.code).toBe(200);
    
            const prefabAssetURL = `${testDirURL}/prefab-instance-${generateTestId()}.prefab`;
            const createPrefabResult = await mcpClient.callTool('create-prefab-from-node', {
                options: {
                    nodePath: createNodeResult.data.path,
                    dbURL: prefabAssetURL,
                }
            });
            expect(createPrefabResult.code).toBe(200);
    
            const isInstanceResult = await mcpClient.callTool('is-prefab-instance', {
                options: {
                    nodePath: createPrefabResult.data.path,
                }
            });
            expect(isInstanceResult.code).toBe(200);
            expect(isInstanceResult.data).toBe(true);
        });
    
        test('should return false for non-prefab node', async () => {
            const nodeName = `NonPrefabNode-${generateTestId()}`;
            const createNodeResult = await mcpClient.callTool('scene-create-node-by-type', {
                options: {
                    path: `Canvas`,
                    name: nodeName,
                    nodeType: 'Empty',
                }
            });
            expect(createNodeResult.code).toBe(200);
    
            const isInstanceResult = await mcpClient.callTool('is-prefab-instance', {
                options: {
                    nodePath: createNodeResult.data.path,
                }
            });
            expect(isInstanceResult.code).toBe(200);
            expect(isInstanceResult.data).toBe(false);
        });
    
        test('should handle invalid node path', async () => {
            const result = await mcpClient.callTool('is-prefab-instance', {
                options: {
                    nodePath: `Canvas/NonExistentNode-${generateTestId()}`,
                }
            });
            expect(result.code).not.toBe(200);
            expect(result.reason).toBeDefined();
        });
    });
    
    // describe('get-prefab-info', () => {
    //     test('should get prefab info for prefab instance', async () => {
    //         const nodeName = `PrefabInfoNode-${generateTestId()}`;
    //         const createNodeResult = await mcpClient.callTool('scene-create-node-by-type', {
    //             options: {
    //                 path: `Canvas`,
    //                 name: nodeName,
    //                 nodeType: 'Empty',
    //             }
    //         });
    //         expect(createNodeResult.code).toBe(200);
    //
    //         const prefabAssetURL = `${testDirURL}/prefab-info-${generateTestId()}.prefab`;
    //         const createPrefabResult = await mcpClient.callTool('create-prefab-from-node', {
    //             options: {
    //                 nodePath: createNodeResult.data.path,
    //                 dbURL: prefabAssetURL,
    //             }
    //         });
    //         expect(createPrefabResult.code).toBe(200);
    //
    //         const getInfoResult = await mcpClient.callTool('get-prefab-info', {
    //             options: {
    //                 nodePath: createPrefabResult.data.path,
    //             }
    //         });
    //         expect(getInfoResult.code).toBe(200);
    //         expect(getInfoResult.data).not.toBeNull();
    //         if (getInfoResult.data) {
    //             expect(typeof getInfoResult.data.fileId).toBe('string');
    //         }
    //     });
    //
    //     test('should return null for non-prefab node', async () => {
    //         const nodeName = `NonPrefabInfoNode-${generateTestId()}`;
    //         const createNodeResult = await mcpClient.callTool('scene-create-node-by-type', {
    //             options: {
    //                 path: `Canvas`,
    //                 name: nodeName,
    //                 nodeType: 'Empty',
    //             }
    //         });
    //         expect(createNodeResult.code).toBe(200);
    //
    //         const getInfoResult = await mcpClient.callTool('get-prefab-info', {
    //             options: {
    //                 nodePath: createNodeResult.data.path,
    //             }
    //         });
    //         expect(getInfoResult.code).toBe(200);
    //         expect(getInfoResult.data).toBeNull();
    //     });
    //
    //     test('should handle invalid node path', async () => {
    //         const result = await mcpClient.callTool('get-prefab-info', {
    //             options: {
    //                 nodePath: `Canvas/NonExistentNode-${generateTestId()}`,
    //             }
    //         });
    //         expect(result.code).not.toBe(200);
    //         expect(result.reason).toBeDefined();
    //     });
    // });
    
    describe('apply-prefab-changes', () => {
        test('should apply changes to prefab asset', async () => {
            const nodeName = `PrefabApplyNode-${generateTestId()}`;
            const createNodeResult = await mcpClient.callTool('scene-create-node-by-type', {
                options: {
                    path: `Canvas`,
                    name: nodeName,
                    nodeType: 'Empty',
                }
            });
            expect(createNodeResult.code).toBe(200);
            const basePos = createNodeResult.data.properties.position;
    
            const prefabAssetURL = `${testDirURL}/prefab-apply-${generateTestId()}.prefab`;
            const createPrefabResult = await mcpClient.callTool('create-prefab-from-node', {
                options: {
                    nodePath: createNodeResult.data.path,
                    dbURL: prefabAssetURL,
                }
            });
            expect(createPrefabResult.code).toBe(200);
            const prefabNodePath = createPrefabResult.data.path;
    
            // 修改预制体实例
            await mcpClient.callTool('scene-update-node', {
                options: {
                    path: prefabNodePath,
                    properties: {
                        position: { x: 100, y: basePos.y, z: basePos.z },
                    },
                },
            });
    
            // 应用更改
            const applyChangesResult = await mcpClient.callTool('apply-prefab-changes', {
                options: {
                    nodePath: prefabNodePath,
                }
            });
            expect(applyChangesResult.code).toBe(200);
            expect(applyChangesResult.data).toBe(true);
        });
    
        test('should handle non-prefab node', async () => {
            const nodeName = `NonPrefabApplyNode-${generateTestId()}`;
            const createNodeResult = await mcpClient.callTool('scene-create-node-by-type', {
                options: {
                    path: `Canvas`,
                    name: nodeName,
                    nodeType: 'Empty',
                }
            });
            expect(createNodeResult.code).toBe(200);
    
            const result = await mcpClient.callTool('apply-prefab-changes', {
                options: {
                    nodePath: createNodeResult.data.path,
                }
            });
            expect(result.code).not.toBe(200);
            expect(result.reason).toBeDefined();
        });
    
        test('should handle invalid node path', async () => {
            const result = await mcpClient.callTool('apply-prefab-changes', {
                options: {
                    nodePath: `Canvas/NonExistentNode-${generateTestId()}`,
                }
            });
            expect(result.code).not.toBe(200);
            expect(result.reason).toBeDefined();
        });
    });

    describe('revert-prefab', () => {
        test('should revert scale but keep position and rotation overrides', async () => {
            const nodeName = `PrefabRevertNode-${generateTestId()}`;
            const createNodeResult = await mcpClient.callTool('scene-create-node-by-type', {
                options: {
                    path: `Canvas`,
                    name: nodeName,
                    nodeType: 'Empty',
                }
            });
            expect(createNodeResult.code).toBe(200);

            const prefabAssetURL = `${testDirURL}/revert-prefab-${generateTestId()}.prefab`;
            const createPrefabResult = await mcpClient.callTool('create-prefab-from-node', {
                options: {
                    nodePath: createNodeResult.data.path,
                    dbURL: prefabAssetURL,
                }
            });
            expect(createPrefabResult.code).toBe(200);
            const prefabNodePath = createPrefabResult.data.path;

            const initialQuery = await mcpClient.callTool('scene-query-node', {
                options: {
                    path: prefabNodePath,
                    queryChildren: false,
                }
            });
            expect(initialQuery.code).toBe(200);
            const initialProps = initialQuery.data?.properties ?? {};
            const originalName = initialQuery.data?.name ?? nodeName;
            const originalPosition = initialProps.position ?? { x: 0, y: 0, z: 0 };
            const originalScale = initialProps.scale ?? { x: 1, y: 1, z: 1 };

            const overriddenPosition = {
                x: originalPosition.x + 50,
                y: originalPosition.y + 60,
                z: originalPosition.z + 70,
            };
            const overriddenRotation = {
                x: 0,
                y: 0,
                z: 0.7071068, // 90° 绕 Z 轴
                w: 0.7071068,
            };
            const overriddenScale = {
                x: originalScale.x + 2,
                y: originalScale.y + 3,
                z: originalScale.z + 4,
            };
            const overriddenName = `${originalName}-Renamed`;

            const updateResult = await mcpClient.callTool('scene-update-node', {
                options: {
                    path: prefabNodePath,
                    name: overriddenName,
                    properties: {
                        position: overriddenPosition,
                        rotation: overriddenRotation,
                        scale: overriddenScale,
                    },
                },
            });
            expect(updateResult.code).toBe(200);
            const updatedPrefabNodePath = updateResult.data?.path ?? prefabNodePath;

            const revertResult = await mcpClient.callTool('revert-prefab', {
                options: {
                    nodePath: updatedPrefabNodePath,
                }
            });
            expect(revertResult.code).toBe(200);
            expect(revertResult.data).toBe(true);

            const revertedQuery = await mcpClient.callTool('scene-query-node', {
                options: {
                    path: updatedPrefabNodePath,
                    queryChildren: false,
                }
            });
            expect(revertedQuery.code).toBe(200);
            const revertedProps = revertedQuery.data?.properties ?? {};

            expect(revertedProps.scale?.x).toBeCloseTo(originalScale.x, 5);
            expect(revertedProps.scale?.y).toBeCloseTo(originalScale.y, 5);
            expect(revertedProps.scale?.z).toBeCloseTo(originalScale.z, 5);

            expect(revertedProps.position?.x).toBeCloseTo(overriddenPosition.x, 5);
            expect(revertedProps.position?.y).toBeCloseTo(overriddenPosition.y, 5);
            expect(revertedProps.position?.z).toBeCloseTo(overriddenPosition.z, 5);

            expect(revertedProps.rotation?.x).toBeCloseTo(overriddenRotation.x, 5);
            expect(revertedProps.rotation?.y).toBeCloseTo(overriddenRotation.y, 5);
            expect(revertedProps.rotation?.z).toBeCloseTo(overriddenRotation.z, 5);
            expect(revertedProps.rotation?.w).toBeCloseTo(overriddenRotation.w, 5);
            expect(revertedQuery.data?.name).toBe(overriddenName);
        });

        test('should handle non-prefab node', async () => {
            const nodeName = `NonPrefabRevertNode-${generateTestId()}`;
            const createNodeResult = await mcpClient.callTool('scene-create-node-by-type', {
                options: {
                    path: `Canvas`,
                    name: nodeName,
                    nodeType: 'Empty',
                }
            });
            expect(createNodeResult.code).toBe(200);

            const result = await mcpClient.callTool('revert-prefab', {
                options: {
                    nodePath: createNodeResult.data.path,
                }
            });
            expect(result.code).toBe(200);
            expect(result.data).toBe(false);
        });

        test('should handle invalid node path', async () => {
            const result = await mcpClient.callTool('revert-prefab', {
                options: {
                    nodePath: `Canvas/NonExistentNode-${generateTestId()}`,
                }
            });
            expect(result.code).not.toBe(200);
            expect(result.reason).toBeDefined();
        });
    });

    describe('unpack-prefab', () => {
        test('should unpack prefab instance', async () => {
            const nodeName = `PrefabUnpackNode-${generateTestId()}`;
            const createNodeResult = await mcpClient.callTool('scene-create-node-by-type', {
                options: {
                    path: `Canvas`,
                    name: nodeName,
                    nodeType: 'Empty',
                }
            });
            expect(createNodeResult.code).toBe(200);
    
            const prefabAssetURL = `${testDirURL}/unpack-prefab-${generateTestId()}.prefab`;
            const createPrefabResult = await mcpClient.callTool('create-prefab-from-node', {
                options: {
                    nodePath: createNodeResult.data.path,
                    dbURL: prefabAssetURL,
                }
            });
            expect(createPrefabResult.code).toBe(200);
            const prefabNodePath = createPrefabResult.data.path;
    
            // 解包预制体实例
            const unpackResult = await mcpClient.callTool('unpack-prefab', {
                options: {
                    nodePath: prefabNodePath,
                    recursive: false,
                }
            });
            expect(unpackResult.code).toBe(200);
            expect(unpackResult.data).toBeDefined();
    
            // 验证不再是预制体实例
            const isInstanceResult = await mcpClient.callTool('is-prefab-instance', {
                options: {
                    nodePath: prefabNodePath,
                }
            });
            expect(isInstanceResult.code).toBe(200);
            expect(isInstanceResult.data).toBe(false);
        });
    
        test('should unpack prefab instance with recursive option', async () => {
            const nodeName = `PrefabUnpackRecursiveNode-${generateTestId()}`;
            const createNodeResult = await mcpClient.callTool('scene-create-node-by-type', {
                options: {
                    path: `Canvas`,
                    name: nodeName,
                    nodeType: 'Empty',
                }
            });
            expect(createNodeResult.code).toBe(200);
    
            const prefabAssetURL = `${testDirURL}/unpack-prefab-recursive-${generateTestId()}.prefab`;
            const createPrefabResult = await mcpClient.callTool('create-prefab-from-node', {
                options: {
                    nodePath: createNodeResult.data.path,
                    dbURL: prefabAssetURL,
                }
            });
            expect(createPrefabResult.code).toBe(200);
            const prefabNodePath = createPrefabResult.data.path;
    
            // 解包预制体实例（递归）
            const unpackResult = await mcpClient.callTool('unpack-prefab', {
                options: {
                    nodePath: prefabNodePath,
                    recursive: true,
                }
            });
            expect(unpackResult.code).toBe(200);
            expect(unpackResult.data).toBeDefined();
    
            // 验证不再是预制体实例
            const isInstanceResult = await mcpClient.callTool('is-prefab-instance', {
                options: {
                    nodePath: prefabNodePath,
                }
            });
            expect(isInstanceResult.code).toBe(200);
            expect(isInstanceResult.data).toBe(false);
        });
    
        test('should error in unpack prefab by normal node ', async () => {
            const nodeName = `NonPrefabUnpackNode-${generateTestId()}`;
            const createNodeResult = await mcpClient.callTool('scene-create-node-by-type', {
                options: {
                    path: `Canvas`,
                    name: nodeName,
                    nodeType: 'Empty',
                }
            });
            expect(createNodeResult.code).toBe(200);
    
            const result = await mcpClient.callTool('unpack-prefab', {
                options: {
                    nodePath: createNodeResult.data.path,
                    recursive: false,
                }
            });
            expect(result.reason).toContain('普通节点');
            expect(result.code).toBe(500);
        });
    
        test('should handle invalid node path', async () => {
            const result = await mcpClient.callTool('unpack-prefab', {
                options: {
                    nodePath: `Canvas/NonExistentNode-${generateTestId()}`,
                    recursive: false,
                }
            });
            expect(result.code).not.toBe(200);
            expect(result.reason).toBeDefined();
        });
    });
    
    describe('Prefab workflow integration tests', () => {
        it('should test complete prefab workflow', async () => {
            // 1. Create a node by type
            const nodeName = `WorkflowNode-${generateTestId()}`;
            const createNodeResult = await mcpClient.callTool('scene-create-node-by-type', {
                options: {
                    path: `Canvas`,
                    name: nodeName,
                    nodeType: 'Empty',
                }
            });
            expect(createNodeResult.code).toBe(200);
            let nodePath = createNodeResult.data.path;
            const basePos = createNodeResult.data.properties.position;
            const baseScale = createNodeResult.data.properties.scale ?? { x: 1, y: 1, z: 1 };
    
            // 2. Create a prefab from the node
            const prefabAssetURL = `${testDirURL}/workflow-prefab-${generateTestId()}.prefab`;
            const createPrefabResult = await mcpClient.callTool('create-prefab-from-node', {
                options: {
                    nodePath: nodePath,
                    dbURL: prefabAssetURL,
                }
            });
            nodePath = createPrefabResult.data.path;
            expect(createPrefabResult.code).toBe(200);
    
            // 3. Test overwrite functionality
            const overwriteResult = await mcpClient.callTool('create-prefab-from-node', {
                options: {
                    nodePath: createPrefabResult.data.path,
                    dbURL: prefabAssetURL,
                    overwrite: true,
                }
            });
            expect(overwriteResult.code).toBe(200);
    
            // 4. Check if the node is a prefab instance
            const isInstanceResult = await mcpClient.callTool('is-prefab-instance', {
                options: {
                    nodePath: nodePath,
                }
            });
            expect(isInstanceResult.data).toBe(true);
    
            // 5. Check a non-prefab node
            const anotherNodeName = `AnotherNode-${generateTestId()}`;
            const anotherNodeResult = await mcpClient.callTool('scene-create-node-by-type', {
                options: {
                    path: `Canvas/${anotherNodeName}`,
                    name: anotherNodeName,
                    nodeType: 'Empty'
                }
            });
            const isNotInstanceResult = await mcpClient.callTool('is-prefab-instance', {
                options: {
                    nodePath: anotherNodeResult.data.path,
                }
            });
            expect(isNotInstanceResult.data).toBe(false);
    
            // 6. Get prefab info
            // const getInfoResult = await mcpClient.callTool('get-prefab-info', {
            //     options: {
            //         nodePath: nodePath,
            //     }
            // });
            // expect(getInfoResult.code).toBe(200);
            // expect(getInfoResult.data).not.toBeNull();
            // if (getInfoResult.data) {
            //     expect(typeof getInfoResult.data.fileId).toBe('string');
            // }
    
            // 7. Modify the prefab instance
            const appliedScale = {
                x: baseScale.x + 0.5,
                y: baseScale.y + 0.5,
                z: baseScale.z + 0.5,
            };
            const appliedRotation = {
                x: 0,
                y: 0,
                z: 0.3826834,
                w: 0.9238795,
            };
            const renamedNode = `${nodeName}-Renamed`;
            const initialUpdateResult = await mcpClient.callTool('scene-update-node', {
                options: {
                    path: nodePath,
                    name: renamedNode,
                    properties: {
                        position: { x: 100, y: basePos.y, z: basePos.z },
                        rotation: appliedRotation,
                        scale: appliedScale,
                    },
                },
            });
            expect(initialUpdateResult.code).toBe(200);
            nodePath = initialUpdateResult.data?.path ?? nodePath;
    
            // 8. Apply changes to the prefab asset
            const applyChangesResult = await mcpClient.callTool('apply-prefab-changes', {
                options: {
                    nodePath: nodePath,
                }
            });
            expect(applyChangesResult.code).toBe(200);
            expect(applyChangesResult.data).toBe(true);
    
            // 9. Modify the prefab instance again
            const changedScale = {
                x: appliedScale.x + 1,
                y: appliedScale.y + 1,
                z: appliedScale.z + 1,
            };
            const changedPosition = { x: 150, y: 200, z: basePos.z + 25 };
            const changedRotation = {
                x: 0,
                y: 0,
                z: 0.7071068,
                w: 0.7071068,
            };
            const secondUpdateResult = await mcpClient.callTool('scene-update-node', {
                options: {
                    path: nodePath,
                    properties: {
                        position: changedPosition,
                        rotation: changedRotation,
                        scale: changedScale,
                    },
                },
            });
            expect(secondUpdateResult.code).toBe(200);
            nodePath = secondUpdateResult.data?.path ?? nodePath;
    
            // 10. Revert changes
            const revertResult = await mcpClient.callTool('revert-prefab', {
                options: {
                    nodePath: nodePath,
                }
            });
            expect(revertResult.code).toBe(200);
            expect(revertResult.data).toBe(true);
    
            // Verify revert by checking the property
            const queryNodeResult = await mcpClient.callTool('scene-query-node', {
                options: {
                    path: nodePath,
                    queryChildren: false,
                }
            });
            expect(queryNodeResult.data).not.toBeNull();
            if (queryNodeResult.data) {
                const props = queryNodeResult.data.properties ?? {};
                expect(props.scale).toEqual(appliedScale);
                expect(props.position).toEqual(changedPosition);
                expect(props.rotation).toEqual(changedRotation);
            }
            expect(queryNodeResult.data?.name).toBe(renamedNode);
    
            // 11. Unpack the prefab instance
            const unpackResult = await mcpClient.callTool('unpack-prefab', {
                options: {
                    nodePath: nodePath,
                    recursive: false,
                }
            });
            expect(unpackResult.code).toBe(200);
            expect(unpackResult.data).toBeDefined();
    
            // 12. Verify it's no longer a prefab instance
            const isUnpackedInstanceResult = await mcpClient.callTool('is-prefab-instance', {
                options: {
                    nodePath: nodePath,
                }
            });
            expect(isUnpackedInstanceResult.data).toBe(false);
        });
    
        it('should handle nested prefab operations', async () => {
            // 创建父节点
            const parentNodeName = `ParentNode-${generateTestId()}`;
            const parentNodeResult = await mcpClient.callTool('scene-create-node-by-type', {
                options: {
                    path: `Canvas/${parentNodeName}`,
                    name: parentNodeName,
                    nodeType: 'Empty',
                }
            });
            expect(parentNodeResult.code).toBe(200);
    
            // 创建子节点
            const childNodeName = `ChildNode-${generateTestId()}`;
            const childNodeResult = await mcpClient.callTool('scene-create-node-by-type', {
                options: {
                    path: `${parentNodeResult.data.path}/${childNodeName}`,
                    name: childNodeName,
                    nodeType: 'Empty',
                }
            });
            expect(childNodeResult.code).toBe(200);
    
            // 从父节点创建预制体（包含子节点）
            const prefabAssetURL = `${testDirURL}/nested-prefab-${generateTestId()}.prefab`;
            const createPrefabResult = await mcpClient.callTool('create-prefab-from-node', {
                options: {
                    nodePath: parentNodeResult.data.path,
                    dbURL: prefabAssetURL,
                }
            });
            expect(createPrefabResult.code).toBe(200);
    
            // 验证父节点是预制体实例
            const isParentInstanceResult = await mcpClient.callTool('is-prefab-instance', {
                options: {
                    nodePath: createPrefabResult.data.path,
                }
            });
            expect(isParentInstanceResult.code).toBe(200);
            expect(isParentInstanceResult.data).toBe(true);
        });
    });
    
    describe('Error handling and edge cases', () => {
        test('should handle operations on unpacked prefab instance', async () => {
            const nodeName = `UnpackedNode-${generateTestId()}`;
            const createNodeResult = await mcpClient.callTool('scene-create-node-by-type', {
                options: {
                    path: `Canvas`,
                    name: nodeName,
                    nodeType: 'Empty',
                }
            });
            expect(createNodeResult.code).toBe(200);
    
            const prefabAssetURL = `${testDirURL}/unpacked-prefab-${generateTestId()}.prefab`;
            const createPrefabResult = await mcpClient.callTool('create-prefab-from-node', {
                options: {
                    nodePath: createNodeResult.data.path,
                    dbURL: prefabAssetURL,
                }
            });
            expect(createPrefabResult.code).toBe(200);
            const prefabNodePath = createPrefabResult.data.path;
    
            // 解包预制体
            const unpackResult = await mcpClient.callTool('unpack-prefab', {
                options: {
                    nodePath: prefabNodePath,
                    recursive: false,
                }
            });
            expect(unpackResult.code).toBe(200);
    
            // 尝试对已解包的节点应用更改（应该失败）
            const applyResult = await mcpClient.callTool('apply-prefab-changes', {
                options: {
                    nodePath: prefabNodePath,
                }
            });
            expect(applyResult.code).not.toBe(200);
        });
    
        test('should handle multiple apply and revert operations', async () => {
            const nodeName = `MultiOpNode-${generateTestId()}`;
            const createNodeResult = await mcpClient.callTool('scene-create-node-by-type', {
                options: {
                    path: `Canvas`,
                    name: nodeName,
                    nodeType: 'Empty',
                }
            });
            expect(createNodeResult.code).toBe(200);
            const basePos = createNodeResult.data.properties.position;
    
            const prefabAssetURL = `${testDirURL}/multi-op-prefab-${generateTestId()}.prefab`;
            const createPrefabResult = await mcpClient.callTool('create-prefab-from-node', {
                options: {
                    nodePath: createNodeResult.data.path,
                    dbURL: prefabAssetURL,
                }
            });
            expect(createPrefabResult.code).toBe(200);
            const prefabNodePath = createPrefabResult.data.path;
    
            // 多次修改和应用
            for (let i = 0; i < 3; i++) {
                await mcpClient.callTool('scene-update-node', {
                    options: {
                        path: prefabNodePath,
                        properties: {
                            position: { x: 100 + i * 10, y: basePos.y + i * 10, z: basePos.z },
                        },
                    },
                });
    
                const applyResult = await mcpClient.callTool('apply-prefab-changes', {
                    options: {
                        nodePath: prefabNodePath,
                    }
                });
                expect(applyResult.reason).toBeUndefined();
                expect(applyResult.code).toBe(200);
            }
    
            // 修改后还原
            await mcpClient.callTool('scene-update-node', {
                options: {
                    path: prefabNodePath,
                    properties: {
                        position: { x: 999, y: 999, z: basePos.z },
                    },
                },
            });
    
            const revertResult = await mcpClient.callTool('revert-prefab', {
                options: {
                    nodePath: prefabNodePath,
                }
            });
            expect(revertResult.code).toBe(200);
            expect(revertResult.data).toBe(true);
        });
    });
});
