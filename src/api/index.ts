import { ProjectApi } from './project/project';
import utils from '../core/base/utils';
import { ConfigurationApi } from './configuration/configuration';
import { EngineApi } from './engine/engine';
import { AssetsApi } from './assets/assets';
import { PackDriverApi } from './pack-driver/pack-driver';
import { SceneApi } from './scene/scene';
import { BuilderApi } from './builder/builder';
import { startServer } from '../server';

export class CocosAPI {
    public assets: AssetsApi;
    public engine: EngineApi;
    public project: ProjectApi;
    public builder: BuilderApi;

    private packDriver: PackDriverApi;
    private configuration: ConfigurationApi;

    private scene: SceneApi;

    constructor(
        private projectPath: string,
        private enginePath: string
    ) {
        this.init();
        this.project = new ProjectApi(projectPath);
        this.configuration = new ConfigurationApi(projectPath);
        this.assets = new AssetsApi(projectPath);
        this.packDriver = new PackDriverApi(projectPath, enginePath);
        this.engine = new EngineApi(projectPath, enginePath);
        this.scene = new SceneApi(projectPath, enginePath);
        this.builder = new BuilderApi();
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
    public async startup(port?: number) {
        try {
            await startServer(port);
            await this.configuration.init();
            await this.project.init();
            await this.engine.init();
            await this.assets.init();
            await this.packDriver.init();
            await this.builder.init();
            await this.scene.init();
        } catch (e) {
            console.error('startup failed', e);
        }
    }
}
