import type Launcher from './launcher';
import { ProjectType } from './project/@types/public';

/**
 * 项目管理器，提供打开项目、创建项目的入口
 */
class ProjectManager {

    private _currentLauncher: Launcher | null = null;

    /**
     * 查询所有项目模板，用于创建的命令行选项显示
     * @returns 
     */
    queryTemplates() {
        // TODO
    }

    /**
     * 创建一个项目
     * @param projectPath 
     * @param type 
     * @returns 
     */
    async create(projectPath: string, type: ProjectType = '3d', template?: string) {
        const { Project } = await import('./project/script');
        // TODO 支持模板后，Project 模块，无需支持空项目的创建了，都由管理器拷贝模板
        return await Project.create(projectPath, type);
    }

    /**
     * 打开某个项目
     * @param path
     */
    async open(path: string) {
        const { default: Launcher } = await import('./launcher');
        const projectLauncher = new Launcher(path);
        await projectLauncher.startup();
    }

    async close() {
        if (!this._currentLauncher) {
            throw new Error('No project is open');
        }
        await this._currentLauncher.close();
        this._currentLauncher = null;
    }
}

export const projectManager = new ProjectManager();
