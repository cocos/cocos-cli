import type {
    ICreateSceneOptions,
    ISaveSceneOptions,
    IOpenSceneOptions,
    ICreateNodeOptions,
    IDeleteNodeOptions,
    IUpdateNodeOptions,
    ISceneInfo
} from '../common';
import { Scene } from '../main-process';

describe('Scene Proxy 测试', () => {
    describe('Scene 操作', () => {
        let createdScene: ISceneInfo | null;

        it('获取当前场景信息', async () => {
            const result = await Scene.getCurrentScene();
            expect(result).toBeDefined();
        });

        it('创建新场景', async () => {
            const options: ICreateSceneOptions = {
                targetPathOrURL: 'db://assets/scenes/TestScene.scene',
                templateType: 'default'
            };
            createdScene = await Scene.createScene(options);
            expect(createdScene).toBeDefined();
            expect(createdScene?.name).toBe('TestScene.scene');
        });

        it('打开场景', async () => {
            expect(createdScene).not.toBeNull();
            if (createdScene) {
                const openOptions: IOpenSceneOptions = {
                    uuid: createdScene.uuid
                };
                const result = await Scene.openScene(openOptions);
                expect(result).toBeDefined();
            }
        });

        // it('关闭场景', async () => {
        //     const result = await Scene.closeScene();
        //     expect(result).toBeDefined();
        // });

    // });
    //
    // describe('Node 操作', () => {
    //     it('查询节点', async () => {
    //         const result = await Scene.queryNode();
    //         expect(result).toBeDefined();
    //     });
    //
    //     it('创建节点', async () => {
    //         const options: ICreateNodeOptions = {};
    //         const result = await Scene.createNode(options);
    //         expect(result).toBeDefined();
    //     });
    //
    //     it('删除节点', async () => {
    //         const options: IDeleteNodeOptions = {};
    //         const result = await Scene.deleteNode(options);
    //         expect(result).toBeDefined();
    //     });
    //
    //     it('更新节点', async () => {
    //         const options: IUpdateNodeOptions = {};
    //         const result = await Scene.updateNode(options);
    //         expect(result).toBeDefined();
    //     });
    });
});
