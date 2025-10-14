import path from 'path';
import { Scene } from '../main-process';
import { startServer } from '../../../server';

describe('Scene 测试', () => {
    const user = require('../../../../.user.json');
    const enginePath = user.engine;
    const projectPath = user.project;

    it('准备阶段', async () => {
        // 启动服务器
        await startServer();
        // 初始化配置
        const { configurationManager } = await import('../../configuration');
        await configurationManager.initialize(projectPath);
        // 打开项目
        const { default: Project } = await import('../../project');
        await Project.open(projectPath);
        // 初始化引擎
        const { Engine, initEngine } = await import('../../engine');
        await initEngine(enginePath, projectPath);
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
