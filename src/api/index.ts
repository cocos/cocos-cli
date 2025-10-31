import { IBuildCommandOption, Platform } from '../core/builder/@types/private';
import { ProjectType } from '../core/project/@types/public';

export class CocosAPI {

    /**
     * 启动 MCP 服务器
     * @param projectPath 
     * @param port 
     */
    public startupMcpServer(projectPath: string, port?: number) {
        this.startup(projectPath, port);
    }

    /**
     * 启动工程
     */
    public async startup(projectPath: string, port?: number) {
        const { default: Launcher } = await import('../core/launcher');
        const launcher = new Launcher(projectPath);
        import('../api/assets/assets');
        import('../api/engine/engine');
        import('../api/project/project');
        import('../api/builder/builder');
        import('../api/configuration/configuration');
        import('../api/scene/scene');
        import('../api/system/system');
        await launcher.startup(port);
    }

    /**
     * 命令行创建入口
     * 创建一个项目
     * @param projectPath 
     * @param type 
     */
    public async create(projectPath: string, type: ProjectType) {
        const { projectManager } = await import('../core/project-manager');
        return await projectManager.create(projectPath, type);
    }

    /**
     * 命令行构建入口
     * @param platform 
     * @param options 
     */
    public async build(projectPath: string, platform: Platform, options: Partial<IBuildCommandOption>) {
        const { default: Launcher } = await import('../core/launcher');
        const launcher = new Launcher(projectPath);
        return await launcher.build(platform, options);
    }
}
