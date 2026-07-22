import { join } from 'path';
import { BuildExitCode, IBuildCommandOption, Platform } from './builder/@types/protected';
import utils from './base/utils';
import { newConsole } from './base/console';
import { startServer, getServerUrl } from '../server';
import { GlobalConfig, GlobalPaths } from '../global';
import scripting from './scripting';
import { startupScene } from './scene';

interface IPreviewStartOptions {
    port?: number;
    platform?: Platform | string;
    open?: boolean;
    buildOptions?: Partial<IBuildCommandOption>;
}


/**
 * 启动器，主要用于整合各个模块的初始化和关闭流程
 * 默认支持几种启动方式：单独导入项目、单独启动项目、单独构建项目
 */
export default class Launcher {
    private projectPath: string;

    private _init = false;
    private _import = false;

    constructor(projectPath: string) {
        this.projectPath = projectPath;
        // 初始化日志系统
        newConsole.init(join(this.projectPath, 'temp', 'logs', 'cocos.log'), true);
        newConsole.record();
    }

    private async init() {
        if (this._init) {
            return;
        }
        this._init = true;
        /**
         * 初始化一些基础模块信息
         */
        utils.Path.register('project', {
            label: '项目',
            path: this.projectPath,
        });
        const { configurationManager } = await import('./configuration');
        await configurationManager.initialize(this.projectPath);
        // 初始化项目信息
        const { default: Project } = await import('./project');
        await Project.open(this.projectPath);
        // 初始化引擎
        const { initEngine } = await import('./engine');
        await initEngine(GlobalPaths.enginePath, this.projectPath);
        console.log('initEngine success');
    }

    /**
     * 导入资源
     */
    async import() {
        if (this._import) {
            return;
        }
        this._import = true;
        await this.init();
        // 在导入资源之前，初始化 scripting 模块，才能正常导入编译脚本
        const { Engine } = await import('./engine');
        await scripting.initialize(this.projectPath, GlobalPaths.enginePath, Engine.getConfig().includeModules);

        const { createProgrammingFacet } = await import('./scripting/programming/FacetInstance');
        await createProgrammingFacet(Engine.getInfo().typescript.path, scripting.projectPath, Engine.getConfig().includeModules);

        // 启动以及初始化资源数据库
        const { initAssetDB, startAssetDB } = await import('./assets');
        await initAssetDB();
        await startAssetDB();
    }

    /**
     * 启动项目
     */
    async startup(port?: number) {
        await this.import();
        await startServer(port);
        // 初始化构建
        const { init: initBuilder } = await import('./builder');
        await initBuilder();

        // 启动场景进程，需要在 Builder 之后，因为服务器路由场景还没有做前缀约束匹配范围比较广
        await startupScene(GlobalPaths.enginePath, this.projectPath);
    }

    async startPreview(options: number | IPreviewStartOptions = {}) {
        const previewOptions: IPreviewStartOptions = typeof options === 'number' ? { port: options } : options;
        const platform = previewOptions.platform || previewOptions.buildOptions?.platform || 'web-desktop';
        if (!platform.startsWith('web')) {
            throw new Error(`Preview only supports web platforms, got: ${platform}`);
        }

        GlobalConfig.mode = 'simple';
        await this.import();
        await startServer(previewOptions.port);

        const { init, build } = await import('./builder');
        await init([platform]);

        const buildOptions: Partial<IBuildCommandOption> = {
            ...previewOptions.buildOptions,
            platform,
            outputName: previewOptions.buildOptions?.outputName || 'preview',
            taskName: previewOptions.buildOptions?.taskName || 'preview',
        };
        if (buildOptions.debug === undefined) {
            buildOptions.debug = true;
        }

        const result = await build(platform as Platform, buildOptions);
        if (result.code !== BuildExitCode.BUILD_SUCCESS) {
            throw new Error(result.reason || 'Preview build failed.');
        }

        const previewUrl = result.custom?.previewUrl;
        if (!previewUrl) {
            throw new Error('Preview build completed but did not return a preview URL.');
        }

        console.log(`Preview URL: ${previewUrl}`);
        if (previewOptions.open !== false) {
            const { openUrlAsync } = await import('./builder/platforms/web-common/utils');
            await openUrlAsync(previewUrl);
        }

        return result;
    }

    /**
     * 启动动态游戏预览（只托管不构建，对齐编辑器浏览器预览）。
     * 与场景编辑器预览的区别：不启动场景进程 / RPC。
     */
    async startGamePreview(options: { port?: number; scene?: string; open?: boolean } = {}) {
        await this.import();
        await startServer(options.port);

        // getPreviewSettings 需要 builder 初始化
        const { init: initBuilder } = await import('./builder');
        await initBuilder();

        const { registerBrowserPreview } = await import('./preview/register');
        await registerBrowserPreview(this.projectPath);

        const serverUrl = getServerUrl();
        const url = options.scene ? `${serverUrl}/?scene=${encodeURIComponent(options.scene)}` : serverUrl;
        console.log(`Game preview: ${url}`);
        await this.printPreviewScenes(serverUrl, options.scene);
        if (options.open !== false) {
            const { openUrlAsync } = await import('./builder/platforms/web-common/utils');
            await openUrlAsync(url);
        }
    }

    /**
     * 打印当前启动场景与项目内可用场景列表，方便用 ?scene=<url|uuid> 切换。
     */
    private async printPreviewScenes(serverUrl: string, scene?: string) {
        try {
            const { assetManager } = await import('./assets');
            const { getCachedPreviewSettings } = await import('./preview/preview-settings');
            const { settings } = await getCachedPreviewSettings(scene || '');
            const launchUuid = (settings as any)?.launch?.launchScene || '';
            const launchInfo = launchUuid ? assetManager.queryAssetInfo(launchUuid) : null;
            console.log(`Launch scene: ${launchInfo?.url || launchUuid || '(none)'}`);

            const scenes = assetManager.queryAssetInfos({ ccType: 'cc.SceneAsset' });
            if (scenes && scenes.length) {
                console.log('Available scenes (switch via ?scene=<url-or-uuid>):');
                for (const s of scenes) {
                    console.log(`  ${serverUrl}/?scene=${encodeURIComponent(s.url)}`);
                }
            } else {
                console.log('No scene asset found in project.');
            }
        } catch (err) {
            console.warn('[Preview] Failed to list scenes:', err);
        }
    }

    async startSceneEditorPreview(options: number | { port?: number; open?: boolean } = {}) {
        const opts = typeof options === 'number' ? { port: options } : options;
        await this.import();
        await startServer(opts.port);
        // 初始化构建
        const { init: initBuilder } = await import('./builder');
        await initBuilder();

        // initScene() 内部会先注册浏览器游戏预览路由（/ 及资源路由），再注册场景中间件，
        // 使浏览器预览与场景编辑器共用一台 server 且路由优先级正确（见 scene/index.ts init）。
        const { init: initScene } = await import('./scene');
        await initScene();

        // 注册调试用的中间件（仅 preview 模式）
        const { middlewareService } = await import('../server/middleware');
        const { default: PreviewDebugMiddleware } = await import('./scene/preview.debug.middleware');
        middlewareService.register('PreviewDebug', PreviewDebugMiddleware);

        const { Rpc } = await import('./scene/main-process/rpc');
        await Rpc.startup();

        const serverUrl = getServerUrl();
        const sceneEditorUrl = `${serverUrl}/scene-editor/`;
        console.log(`Scene editor preview: ${sceneEditorUrl}`);
        console.log(`Browser preview: ${serverUrl}/`);

        if (opts.open !== false) {
            const { openUrlAsync } = await import('./builder/platforms/web-common/utils');
            await openUrlAsync(sceneEditorUrl);
        }
    }

    /**
     * 构建，主要是作为命令行构建的入口
     * @param platform
     * @param options
     */
    async build(platform: Platform, options: Partial<IBuildCommandOption>) {
        GlobalConfig.mode = 'simple';
        // 先导入项目
        await this.import();
        // 执行构建流程
        const { init, build } = await import('./builder');
        await init([platform]);
        return await build(platform, options);
    }

    static async make(platform: Platform, dest: string) {
        GlobalConfig.mode = 'simple';
        const { init, executeBuildStageTask } = await import('./builder');
        await init([platform]);
        return await executeBuildStageTask('command make', 'make', {
            platform,
            dest,
        });
    }

    static async run(platform: Platform, dest: string) {
        GlobalConfig.mode = 'simple';
        const { init, executeBuildStageTask } = await import('./builder');
        if (platform.startsWith('web')) {
            await startServer();
        }
        await init([platform]);
        return await executeBuildStageTask('command run', 'run', {
            platform,
            dest,
        });
    }

    static async upload(platform: Platform, dest: string, accessToken?: string) {
        GlobalConfig.mode = 'simple';
        const { init, executeBuildStageTask } = await import('./builder');
        await init([platform]);
        return await executeBuildStageTask('command upload', 'upload', {
            platform,
            dest,
            packages: accessToken ? {
                [platform]: {
                    accessToken,
                },
            } : undefined,
        });
    }

    async close() {
        // 释放浏览器预览资源（扩展预览后端 + 热重载监听），对齐 Creator 生命周期
        try {
            const { disposeBrowserPreview } = await import('./preview/register');
            await disposeBrowserPreview();
        } catch (err) {
            console.warn('[Preview] dispose failed:', err);
        }

        // 关闭服务器
        const { stopServer } = await import('../server');
        await stopServer();

        // 关闭场景进程
        const { sceneWorker } = await import('./scene/main-process/scene-worker');
        await sceneWorker.stop();

        // 关闭资源数据库
        const { stopAssetDB } = await import('./assets');
        await stopAssetDB();

        // 关闭脚本管理器
        const { default: scripting } = await import('./scripting');
        await scripting.close();

        // 保存项目配置
        const { default: Project } = await import('./project');
        await Project.close();
        // ----- TODO 可能有的更多其他模块的保存销毁操作 ----
    }
}
