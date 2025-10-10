import type { ICreateSceneOptions, ISaveSceneOptions, IOpenSceneOptions, ICreateNodeOptions, IDeleteNodeOptions, IUpdateNodeOptions } from '../common';
import { Scene } from '../main-process';

describe('Scene Proxy 测试', () => {
    describe('Scene 操作', () => {
        it('获取当前场景信息', async () => {
            const result = await Scene.getCurrentScene();
            console.log('12312323213')
            console.log(result);
            console.log('12312323213')
            expect(result).toBeDefined();
        });

    //     it('创建新场景', async () => {
    //         const options: ICreateSceneOptions = {
    //             name: 'TestScene',
    //             targetPath: 'assets/scenes/TestScene.scene',
    //             templateType: 'default'
    //         };
    //         const result = await Scene.createScene(options);
    //         expect(result).toBeDefined();
    //         expect(result?.name).toBe('TestScene');
    //     });
    //
    //     it('保存场景', async () => {
    //         const options: ISaveSceneOptions = {};
    //         const result = await Scene.saveScene(options);
    //         expect(result).toBeDefined();
    //     });
    //
    //     it('打开场景', async () => {
    //         // 先创建一个场景
    //         const createOptions: ICreateSceneOptions = {
    //             name: 'OpenTestScene',
    //             targetPath: 'assets/scenes/OpenTestScene.scene'
    //         };
    //         const createdScene = await Scene.createScene(createOptions);
    //
    //         if (createdScene) {
    //             const openOptions: IOpenSceneOptions = {
    //                 uuid: createdScene.uuid
    //             };
    //             const result = await Scene.openScene(openOptions);
    //             expect(result).toBeDefined();
    //         }
    //     });
    //
    //     it('关闭场景', async () => {
    //         const result = await Scene.closeScene();
    //         expect(result).toBeDefined();
    //     });
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
