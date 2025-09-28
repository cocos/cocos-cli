import { join } from "path";
import { ImporterApi } from "./importer/importer";
import { ProjectApi } from "./project/project";
import utils from "../core/base/utils";
import { PackerDriver } from "../core/scripting/packer-driver";
export class CocosAPI {
    private _projectPath: string;
    private _enginePath: string;
    loaded: boolean = false;

    importer: ImporterApi;
    project: ProjectApi;
    constructor(projectPath: string, enginePath: string) {
        this._projectPath = projectPath;
        this._enginePath = enginePath;
        this.importer = new ImporterApi();
        this.project = new ProjectApi();
    }
    /**
     * 初始化 Cocos API
     */
    async startup() {
        try {
            //todo: 初始化一些基础模块信息,这边应该归纳到每个模块的 init 吧？
            utils.Path.register('project', {
                label: '项目',
                path: this._projectPath,
            });
            const { configurationManager } = await import('../core/configuration');
            await configurationManager.initialize(this._projectPath);
            // 初始化项目信息
            const { default: Project } = await import('../core/project');
            await Project.open(this._projectPath);
            // 初始化引擎
            const { default: Engine } = await import('../core/engine');
            await Engine.init(this._enginePath);
            console.log('initEngine', this._enginePath);
            await Engine.initEngine({
                importBase: join(this._projectPath, 'library'),
                nativeBase: join(this._projectPath, 'library'),
            });
            console.log('initEngine success');
            // 启动以及初始化资源数据库
            const { startupAssetDB } = await import('../core/assets');
            console.log('startupAssetDB', this._projectPath);
            await startupAssetDB({
                root: this._projectPath,
                assetDBList: [{
                    name: 'assets',
                    target: join(this._projectPath, 'assets'),
                    readonly: false,
                    visible: true,
                    library: join(this._projectPath, 'library'),
                }],
            });

            const packDriver = await PackerDriver.create(this._projectPath, this._enginePath);
            await packDriver.init(Engine.getConfig().includedModules);
            await packDriver.pullAssetDb();

            await this.project.init();
            await this.importer.init();
        } catch (e) {
            console.error('ImporterApi init failed', e);
        }
        //加载引擎，加载项目配置等操作
        this.loaded = true;
    }
}
