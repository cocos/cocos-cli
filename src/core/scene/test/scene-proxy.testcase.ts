import type {
    ICreateSceneOptions,
    IOpenSceneOptions,
    ISaveSceneOptions,
    IScene,
    ISoftReloadSceneOptions
} from '../common';
import { SceneProxy } from '../main-process/proxy/scene-proxy';
import { SceneTestEnv } from './scene-test-env';

// 单个测试文件生效
jest.setTimeout(24 * 60 * 60 * 1000); // 24 小时，单位毫秒

describe('Scene Proxy 测试', () => {
    let createdScene: IScene | null = null;

    describe('基础场景操作（无依赖）', () => {
        it('getScenes - 获取所有场景', async () => {
            const scenes = await SceneProxy.queryScenes();
            expect(Array.isArray(scenes)).toBe(true);
        });

        it('createScene - 创建新场景', async () => {
            const options: ICreateSceneOptions = {
                targetPathOrURL: SceneTestEnv.newSceneURL,
                templateType: '2d'
            };
            createdScene = await SceneProxy.create(options);
            expect(createdScene).toBeDefined();
            expect(createdScene?.name).toBe('TestScene.scene');
        });
    });

    describe('场景打开相关操作（依赖创建的场景）', () => {
        it('openScene - 打开场景', async () => {
            expect(createdScene).not.toBeNull();
            if (createdScene) {
                const openOptions: IOpenSceneOptions = {
                    urlOrUUIDOrPath: createdScene.uuid
                };
                const result = await SceneProxy.open(openOptions);
                expect(result).toBeDefined();
                expect(result.uuid).toBe(createdScene.uuid);
            }
        });

        it('queryCurrentScene - 获取当前场景（依赖打开场景）', async () => {
            const result = await SceneProxy.queryCurrentScene();
            expect(result).not.toBeNull();
            expect(result && result.uuid).toBe(createdScene?.uuid);
        });
    });

    describe('场景保存相关操作（依赖打开的场景）', () => {
        it('saveScene - 保存场景', async () => {
            const saveOptions: ISaveSceneOptions = {};
            const result = await SceneProxy.save(saveOptions);
            expect(result).toBe(true);
        });
    });

    describe('场景重载相关操作（依赖打开的场景）', () => {
        it('reload - 重载场景', async () => {
            const result = await SceneProxy.reload();
            expect(result).toBe(true);
        });

        it('softReload - 软重载场景', async () => {
            const softReloadOptions: ISoftReloadSceneOptions = {};
            const result = await SceneProxy.softReload(softReloadOptions);
            expect(result).toBe(true);
        });
    });
});
