import { join } from "path";
import { ImporterApi } from "./importer/importer";
export class CocosAPI {
    private _projectPath: string;
    private _enginePath: string;
    loaded: boolean = false;

    importer: ImporterApi;
    constructor(projectPath: string, enginePath: string) {
        this._projectPath = projectPath;
        this._enginePath = enginePath;
        this.importer = new ImporterApi(this._projectPath, this._enginePath);
    }
    /**
     * 初始化 Cocos API
     */
    async startup() {
        try {
            // 初始化项目信息
            const { default: Project } = await import('../core/project');
            await Project.open(this._projectPath);
            // 初始化引擎
            const { default: Engine } = await import('../core/engine');
            await Engine.init(this._enginePath);
            await Engine.initEngine({
                importBase: join(this._projectPath, 'library'),
                nativeBase: join(this._projectPath, 'library'),
            })
            // 启动以及初始化资源数据库
            const { startupAssetDB } = await import('../core/assets');
            await startupAssetDB();

            //各个 importer 的初始化
            await this.importer.init();
        } catch (e) {
            console.error('ImporterApi init failed', e);
        }
        //加载引擎，加载项目配置等操作
        this.loaded = true;
    }
}
