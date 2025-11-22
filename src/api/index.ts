import type { EngineApi } from '../api/engine/engine';
import type { ProjectApi } from '../api/project/project';
import type { AssetsApi } from '../api/assets/assets';
import type { BuilderApi } from '../api/builder/builder';
import type { ConfigurationApi } from '../api/configuration/configuration';
import type { SceneApi } from '../api/scene/scene';
import type { SystemApi } from '../api/system/system';
import { SchemaProjectPath, SchemaPort, SchemaProjectType, TProjectPath, TPort, TProjectType } from './schema';
import { param } from './decorator/decorator';
import { SchemaPlatform, TPlatform, SchemaBuildOption, TBuildOption, SchemaPlatformCanMake, TPlatformCanMake, SchemaBuildDest, TBuildDest } from './builder/schema';

export class CocosAPI {
    public scene!: SceneApi;
    public engine!: EngineApi;
    public project!: ProjectApi;
    public assets!: AssetsApi;
    public builder!: BuilderApi;
    public configuration!: ConfigurationApi;
    public system!: SystemApi;

    static async create() {
        const api = new CocosAPI();
        await api._init();
        return api;
    }

    private constructor() {

    }

    /**
     * 初始化 API 实例，主要是为了实现按需加载
     */
    private async _init() {
        const { SceneApi } = await import('../api/scene/scene');
        this.scene = new SceneApi();
        const { EngineApi } = await import('../api/engine/engine');
        this.engine = new EngineApi();
        const { ProjectApi } = await import('../api/project/project');
        this.project = new ProjectApi();
        const { AssetsApi } = await import('../api/assets/assets');
        this.assets = new AssetsApi();
        const { BuilderApi } = await import('../api/builder/builder');
        this.builder = new BuilderApi();
        const { ConfigurationApi } = await import('../api/configuration/configuration');
        this.configuration = new ConfigurationApi();
        const { SystemApi } = await import('../api/system/system');
        this.system = new SystemApi();
    }

    /**
     * 启动 MCP 服务器
     * @param projectPath 
     * @param port 
     */
    public startupMcpServer(@param(SchemaProjectPath) projectPath: TProjectPath, @param(SchemaPort) port?: TPort) {
        this.startup(projectPath, port);
    }

    /**
     * 启动工程
     */
    public async startup(@param(SchemaProjectPath) projectPath: TProjectPath, @param(SchemaPort) port?: TPort) {
        const { default: Launcher } = await import('../core/launcher');
        const launcher = new Launcher(projectPath);
        await launcher.startup(port);
    }

    /**
     * 命令行创建入口
     * 创建一个项目
     * @param projectPath 
     * @param type 
     */
    public static async createProject(@param(SchemaProjectPath) projectPath: TProjectPath, @param(SchemaProjectType) type: TProjectType) {
        const { projectManager } = await import('../core/project-manager');
        return await projectManager.create(projectPath, type);
    }

    /**
     * 命令行构建入口
     * @param platform 
     * @param options 
     */
    public static async buildProject(projectPath: string, @param(SchemaPlatform) platform: TPlatform, @param(SchemaBuildOption) options: TBuildOption) {
        const { default: Launcher } = await import('../core/launcher');
        const launcher = new Launcher(projectPath);
        return await launcher.build(platform, options as any);
    }

    /**
     * 命令行打包入口
     * @param platform 
     * @param dest 
     */
    public static async makeProject(@param(SchemaPlatformCanMake) platform: TPlatformCanMake, @param(SchemaBuildDest) dest: TBuildDest) {
        const { default: Launcher } = await import('../core/launcher');
        return await Launcher.make(platform, dest);
    }

    /**
     * 命令行运行入口
     * @param platform 
     * @param dest 
     */
    public static async runProject(@param(SchemaPlatform) platform: TPlatform, @param(SchemaBuildDest) dest: TBuildDest) {
        const { default: Launcher } = await import('../core/launcher');
        return await Launcher.run(platform, dest);
    }
}
