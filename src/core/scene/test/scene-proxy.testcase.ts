import type { ICreateSceneOptions, IOpenSceneOptions, ISceneInfo } from '../common';
import { Scene } from '../main-process';

// 单个测试文件生效
jest.setTimeout(24 * 60 * 60 * 1000); // 24 小时，单位毫秒

describe('Scene Proxy 测试', () => {
    describe('Scene 操作', () => {
        let createdScene: ISceneInfo | null;

        it('getCurrentScene', async () => {
            const result = await Scene.getCurrentScene();
            expect(result).toBeDefined();
        });

        it('createScene', async () => {
            const options: ICreateSceneOptions = {
                targetPathOrURL: 'db://assets/scenes/TestScene.scene',
                templateType: '2d'
            };
            createdScene = await Scene.createScene(options);
            expect(createdScene).toBeDefined();
            expect(createdScene?.name).toBe('TestScene.scene');
        });

        it('openScene', async () => {
            expect(createdScene).not.toBeNull();
            if (createdScene) {
                const openOptions: IOpenSceneOptions = {
                    uuid: createdScene.uuid
                };
                const result = await Scene.openScene(openOptions);
                expect(result).toBeDefined();
            }
        });

        it('saveScene', async () => {
            expect(createdScene).not.toBeNull();
            if (createdScene) {
                const openOptions: IOpenSceneOptions = {
                    uuid: createdScene.uuid
                };
                const result = await Scene.saveScene(openOptions);
                expect(result).toBeDefined();
                // TODO 这里可能需要对比保存后的数据，来判断是否保存正常
            }
        });

        it('closeScene', async () => {
            const result = await Scene.closeScene();
            expect(result).toBeDefined();
        });
    });
});
