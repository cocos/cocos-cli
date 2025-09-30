import { ProjectApi } from './project/project';
import utils from '../core/base/utils';
import { ConfigurationApi } from './configuration/configuration';
import { EngineApi } from './engine/engine';
import { AssetsApi } from './asset-db/assets';
import { PackDriverApi } from './pack-driver/pack-driver';

export class CocosAPI {
    public assetDB: AssetsApi;
    public engine: EngineApi;
    public project: ProjectApi;

    private packDriver: PackDriverApi;
    private configuration: ConfigurationApi;

    constructor(
        private projectPath: string,
        private enginePath: string
    ) {
        this.init();
        this.project = new ProjectApi(projectPath);
        this.configuration = new ConfigurationApi(projectPath);
        this.assetDB = new AssetsApi(projectPath);
        this.packDriver = new PackDriverApi(projectPath, enginePath);
        this.engine = new EngineApi(projectPath, enginePath);
    }

    private init() {
        //todo: 初始化一些基础模块信息,这边应该归纳到每个模块的 init 吧？
        utils.Path.register('project', {
            label: '项目',
            path: this.projectPath,
        });
    }

    /**
     * 初始化 Cocos API
     */
    public async startup() {
        try {
            await this.configuration.init();
            await this.project.init();
            await this.engine.init();
            await this.assetDB.init();
            await this.packDriver.init();
        } catch (e) {
            console.error('startup failed', e);
        }
    }
}
