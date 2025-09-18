import { join } from 'path';

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
        const { default: Project } = await import('./core/project');
        await Project.open(path);
        // 初始化引擎
        const { default: Engine } = await import('./core/engine');
        await Engine.init(enginePath);
        console.log('initEngine', enginePath);
        await Engine.initEngine({
            importBase: join(path, 'library'),
            nativeBase: join(path, 'library'),
        });
        console.log('initEngine success');
        // 启动以及初始化资源数据库
        const { startupAssetDB } = await import('./core/assets');
        console.log('startupAssetDB', path);
        await startupAssetDB({
            root: path,
            assetDBList: [{
                name: 'assets',
                target: join(path, 'assets'),
                readonly: false,
                visible: true,
                library: join(path, 'library'),
                preImportExtList: ['.ts', '.chunk', '.effect'],
            }],
        });
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
