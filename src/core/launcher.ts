import { join } from 'path';
import { IBuildCommandOption, Platform } from './builder/@types/protected';
import utils from './base/utils';
import { newConsole } from './base/console';
import { startServer } from '../server';
import { GlobalConfig, GlobalPaths } from '../global';
import scripting from './scripting';
import { startupScene } from './scene';
import { ensureProjectOwnership, releaseProjectOwnership, ProjectBackendError, type ProjectBackendLease } from './project-backend/ownership';
import { ensureOwnedSceneSession, closeOwnedSceneSession } from './project-backend/runtime';



/**
 * 启动器，主要用于整合各个模块的初始化和关闭流程
 * 默认支持几种启动方式：单独导入项目、单独启动项目、单独构建项目
 */
export default class Launcher {
    protected projectPath: string;

    private _init = false;
    private _import = false;
    private static active: Launcher | undefined;
    private ownership?: ProjectBackendLease;
    private importPromise?: Promise<void>;
    private startupPromise?: Promise<void>;
    private closePromise?: Promise<void>;
    private projectOpened = false;
    private scriptsStarted = false;
    private assetsStarted = false;
    private serverStarted = false;
    private sceneStarted = false;

    constructor(projectPath: string) {
        this.projectPath = projectPath;
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
        this.projectOpened = true;
        // 初始化引擎
        const { initEngine } = await import('./engine');
        await initEngine(GlobalPaths.enginePath, this.projectPath);
        console.log('initEngine success');
    }

    /**
     * 导入资源
     */
    async import() {
        if (this.closePromise) throw new Error('Launcher is closed; create a new Launcher');
        return this.importPromise ??= this.importOwned();
    }

    private async importOwned() {
        if (Launcher.active && Launcher.active !== this) throw new ProjectBackendError('PROCESS_PROJECT_CONFLICT', 'Another Launcher already owns this CLI process');
        Launcher.active = this;
        try {
            this.ownership = await ensureProjectOwnership(this.projectPath);
            this.projectPath = this.ownership.descriptor.project;
            this.ownership.onShutdown(() => this.close());
            // Logging also writes project files, so initialize it only after ownership is acquired.
            newConsole.init(join(this.projectPath, 'temp', 'logs', 'cocos.log'), true);
            newConsole.record();
            await this.init();
            // 在导入资源之前，初始化 scripting 模块，才能正常导入编译脚本
            const { Engine } = await import('./engine');
            this.scriptsStarted = true;
            await scripting.initialize(this.projectPath, GlobalPaths.enginePath, Engine.getConfig().includeModules);

            const { createProgrammingFacet } = await import('./scripting/programming/FacetInstance');
            await createProgrammingFacet(Engine.getInfo().typescript.path, scripting.projectPath, Engine.getConfig().includeModules);

            // 启动以及初始化资源数据库
            const { initAssetDB, startAssetDB } = await import('./assets');
            this.assetsStarted = true;
            await initAssetDB();
            await startAssetDB();
            this._import = true;
        } catch (error) {
            if (this.ownership) await this.cleanup().catch(cleanupError => console.error('[Backend] Initialization cleanup failed; ownership retained:', cleanupError));
            else if (Launcher.active === this) Launcher.active = undefined;
            throw error;
        }
    }

    /**
     * 启动项目
     */
    async startup(port?: number, options: { allowedOrigins?: string[]; publishReady?: boolean } = {}) {
        if (this.closePromise) throw new Error('Launcher is closed; create a new Launcher');
        return this.startupPromise ??= this.startupOwned(port, options);
    }

    private async startupOwned(port?: number, options: { allowedOrigins?: string[]; publishReady?: boolean } = {}) {
        await this.import();
        try {
            this.serverStarted = true;
            await startServer(port);
            // 初始化构建
            const { init: initBuilder } = await import('./builder');
            await initBuilder();

            // 启动场景进程，需要在 Builder 之后，因为服务器路由场景还没有做前缀约束匹配范围比较广
            this.sceneStarted = true;
            await startupScene(GlobalPaths.enginePath, this.projectPath);
            await ensureOwnedSceneSession({ project: this.projectPath, allowedOrigins: options.allowedOrigins });
            if (options.publishReady !== false) await this.ownership!.publish({ state: 'ready' });
        } catch (error) {
            await this.cleanup().catch(cleanupError => console.error('[Backend] Startup cleanup failed; ownership retained:', cleanupError));
            throw error;
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

    static async publish(platform: Platform, dest: string) {
        GlobalConfig.mode = 'simple';
        const { init, executeBuildStageTask } = await import('./builder');
        await init([platform]);
        return await executeBuildStageTask('command publish', 'publish', {
            platform,
            dest,
        });
    }

    async close() {
        return this.closePromise ??= (async () => {
            await (this.startupPromise ?? this.importPromise)?.catch(() => undefined);
            await this.cleanup();
        })();
    }

    private async cleanup() {
        if (!this.ownership) return; // A losing Launcher must never stop another owner's singletons.
        const errors: unknown[] = [];
        const attempt = async (action: () => Promise<unknown>) => { try { await action(); } catch (error) { errors.push(error); } };
        await attempt(() => this.ownership!.publish({ state: 'stopping' }));
        await attempt(() => closeOwnedSceneSession());
        if (this.sceneStarted) await attempt(async () => { const { sceneWorker } = await import('./scene/main-process/scene-worker'); if (!await sceneWorker.stop()) throw new Error('Scene worker did not stop'); this.sceneStarted = false; });
        if (this.serverStarted) await attempt(async () => { const { stopServer } = await import('../server'); await stopServer(); this.serverStarted = false; });
        if (this.assetsStarted) await attempt(async () => { const { stopAssetDB } = await import('./assets'); await stopAssetDB(); this.assetsStarted = false; });
        if (this.scriptsStarted) await attempt(async () => { await scripting.close(); this.scriptsStarted = false; });
        if (this.projectOpened) await attempt(async () => { const { default: Project } = await import('./project'); await Project.close(); this.projectOpened = false; });
        if (errors.length) {
            await this.ownership.publish({ state: 'failed' }).catch(() => undefined);
            throw new AggregateError(errors, `Project shutdown failed; backend ownership was not released: ${errors.map(error => error instanceof Error ? error.message : String(error)).join('; ')}`);
        }
        await releaseProjectOwnership(this.ownership);
        this.ownership = undefined;
        this._init = this._import = false;
        if (Launcher.active === this) Launcher.active = undefined;
    }
}
