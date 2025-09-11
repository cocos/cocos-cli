
import Project from './core/project';
import Engine from './core/engine';
import { startupAssetDB } from './core/assets';

class ProjectManager {
    create() {

    }

    /**
     * 打开某个项目
     * @param path
     * @param enginePath
     */
    async open(path: string, enginePath: string) {
        // 初始化项目信息
        await Project.open(path);
        // TODO 初始化引擎环境
        await Engine.init(enginePath);

        // 启动以及初始化资源数据库
        await startupAssetDB();
    }

    /**
     * 构建某个项目
     * @param projectPath 
     * @param options 
     */
    async build(projectPath: string, options: any) {

    }
}

export const projectManager = new ProjectManager();
