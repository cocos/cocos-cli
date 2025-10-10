import path from 'path';
import { Scene } from '../main-process';

describe('Scene 测试', () => {
    const user = require('../../../../.user.json');
    const enginePath = user.engine;
    const projectPath = user.project;

    it('准备阶段', async () => {
        // 初始化配置
        const { configurationManager } = await import('../../configuration');
        await configurationManager.initialize(projectPath);
        // 打开项目
        const { default: Project } = await import('../../project');
        await Project.open(projectPath);
        // 初始化引擎
        const { default: Engine } = await import('../../engine');
        await Engine.init(enginePath);
        await Engine.initEngine({
            importBase: path.join(projectPath, 'library'),
            nativeBase: path.join(projectPath, 'library'),
            writablePath: path.join(projectPath, 'temp'),
        });
        // 启动 db
        const { startupAssetDB } = await import('../../assets');
        await startupAssetDB();
        // 初始化项目脚本
        const { PackerDriver } = await import('../../scripting/packer-driver');
        const packDriver = await PackerDriver.create(projectPath, enginePath);
        await packDriver.init(Engine.getConfig().includeModules);
    })

    it('启动场景进程', async () => {
        // 启动场景进程
        const result = await Scene.worker.start(enginePath, projectPath);
        expect(result).toBe(true);
    });

});
