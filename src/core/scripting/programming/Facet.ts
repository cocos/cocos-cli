'use strict';

import ps from 'path';
import fs from 'fs-extra';
import type { QuickPackLoader } from '@cocos/creator-programming-quick-pack/lib/loader';

import { ImportMap } from '../../builder/@types/protected';
import { StatsQuery } from '@cocos/ccbuild';
import * as moduleSystem from '@cocos/module-system';

/**
 * 异步迭代。有以下特点：
 * 1. 每次调用 `nextIteration()` 会执行一次传入的**迭代函数**；迭代函数允许是异步的，在构造函数中确定之后不能更改；
 * 2. 同时**最多仅会有一例**迭代在执行；
 * 3. **迭代是可合并的**，也就是说，在前面的迭代没完成之前，后面的所有迭代都会被合并成一个。
 */
class AsyncIterationConcurrency {
    private _iterate: () => Promise<void>;

    private _executionPromise: Promise<void> | null = null;

    private _pendingPromise: Promise<void> | null = null;

    constructor(iterate: () => Promise<void>) {
        this._iterate = iterate;
    }

    public nextIteration(): Promise<any> {
        if (!this._executionPromise) {
            // 如果未在执行，那就去执行
            // assert(!this._pendingPromise)
            return this._executionPromise = Promise.resolve(this._iterate()).finally(() => {
                this._executionPromise = null;
            });
        } else if (!this._pendingPromise) {
            // 如果没有等待队列，创建等待 promise，在 执行 promise 完成后执行
            return this._pendingPromise = this._executionPromise.finally(() => {
                this._pendingPromise = null;
                // 等待 promise 将等待执行 promise，并在完成后重新入队
                return this.nextIteration();
            });
        } else {
            // 如果已经有等待队列，那就等待现有的队列
            console.debug(`[Facet] There is a pending promise task, waiting ...`);
            return this._pendingPromise;
        }
    }
}

interface IEngineOptions {
    /**
     * 引擎仓库根目录。
     */
    root: string;

    /**
     * 引擎编译后的根目录。
     */
    distRoot: string;

    /**
     * 引擎基础 URL。
     */
    baseUrl: string;

    /**
     * 使用的引擎功能。
     */
    features: string[];
}

export class ProgrammingFacet {
    private _packerDriverUpdateCount = 0;
    private _asyncIteration: AsyncIterationConcurrency;
    public static async create(
        engine: IEngineOptions,
        projectPath: string
    ) {
        const previewFacet = new ProgrammingFacet(
            engine.root,
            engine.distRoot, // engineDistRoot
            projectPath
        );
        await previewFacet._initialize({ engine });
        return previewFacet;
    }



    get engineRoot() {
        return this._engineRoot;
    }

    get engineDistRoot() {
        return this._engineDistRoot;
    }

    get systemJsHomeDir() {
        return this._systemJsHomeDir;
    }

    get systemJsIndexFile() {
        return this._systemJsBundleFileName;
    }

    get engineImportMapURL() {
        return '/scripting/engine/import-map.json';
    }

    get packImportMapURL() {
        return this._quickPackLoader!.importMapURL;
    }

    get packResolutionDetailMapURL() {
        return this._quickPackLoader!.resolutionDetailMapURL;
    }

    public async loadPackResource(url: string) {
        return await this._getQuickPackLoader().loadAny(url);
    }

    public async getGlobalImportMap() {
        return this._staticImportMap;
    }

    private async reload(): Promise<void> {
        const reloadIndex = ++this._packerDriverUpdateCount;
        console.debug(`[[Facet.reload]], before lock, count: ${reloadIndex}`);
        const loader = this._getQuickPackLoader();
        let unlockPromise: (() => Promise<void>) | undefined;
        try {
            unlockPromise = await loader.lock();
        } catch (err: any) {
            console.error(`[[Facet.reload]] lock failed: ${err}, stack: ${err.stack}, count: ${reloadIndex}`);
        }
        console.debug(`[[Facet.reload]], after lock, count: ${reloadIndex}`);

        try {
            await loader.reload();
        } catch (err: any) {
            console.error(`[[Facet.reload]], failed: ${err}, ${err.stack}, count: ${reloadIndex}`);
            throw err;
        } finally {
            console.debug(`[[Facet.reload]], before unlock, count: ${reloadIndex}`);
            try {
                if (unlockPromise) {
                    await unlockPromise();
                }
            } catch (err: any) {
                console.error(`[[Facet.reload]] unlock failed: ${err}, stack: ${err.stack}, count: ${reloadIndex}`);
            }
            console.debug(`[[Facet.reload]], after unlock, count: ${reloadIndex}`);
        }
    }

    public async notifyPackDriverUpdated() {
        return this._asyncIteration.nextIteration();
    }

    private _staticImportMap: ImportMap & { imports: NonNullable<ImportMap['imports']> } = {
        imports: {},
    };

    private _engineRoot: string;

    private _engineDistRoot: string;

    private _systemJsHomeDir: string;

    private _systemJsBundleFileName = 'system.js';

    private declare _engineStatsQuery: StatsQuery;

    private _quickPackLoader: QuickPackLoader | undefined;

    private constructor(
        engineRoot: string,
        engineDistRoot: string,
        projectRoot: string,
    ) {
        this._systemJsHomeDir = ps.join(projectRoot, 'temp', 'cli', 'programming', 'preview', 'systemjs');
        this._engineRoot = engineRoot;
        this._engineDistRoot = engineDistRoot;
        this._asyncIteration = new AsyncIterationConcurrency(async () => {
            return this.reload();
        });
    }

    private _getQuickPackLoader() {
        if (!this._quickPackLoader) {
            throw new Error('Loader has not been created.');
        } else {
            return this._quickPackLoader;
        }
    }

    private async _initialize({
        engine,
    }: {
        engine: IEngineOptions;
    }) {
        this._engineStatsQuery = await StatsQuery.create(engine.root);
        const imports = this._staticImportMap.imports;

        imports['cc'] = 'q-bundled:///virtual/cc.js';
        imports['cc/env'] = 'cc/editor/populate-internal-constants';
        // TODO: deprecated cce.env is only live in 3.0-preview
        imports['cce.env'] = imports['cc/env'];
        imports['cc/userland/macro'] = './userland/macro';

        console.debug(`Preview import map: ${JSON.stringify(this._staticImportMap, undefined, 2)}`);

        await this._buildSystemJs();

        await this._resetQuickPackLoader();
    }

    private async _buildSystemJs() {
        const systemJsBundleOutFile = ps.join(this._systemJsHomeDir, this._systemJsBundleFileName);
        await fs.ensureDir(ps.dirname(systemJsBundleOutFile));

        // NOTE: The @cocos/rollup-plugin-typescript requires document.baseURI to resolve tslib in Node.js environment.
        // In cocos-cli, web-adapter.js (loaded by initEngine) polyfills `document` but not `baseURI`.
        // If `document` is defined, the rollup plugin enters a browser-only branch and fails if `baseURI` is missing.
        // Use the cocos-cli package root (not process.cwd()) so tslib resolves correctly when
        // the CLI is invoked from an arbitrary working directory.
        if (typeof document !== 'undefined' && !document.baseURI) {
            const { pathToFileURL } = require('url');
            const cliRoot = ps.resolve(__dirname, '..', '..', '..', '..');
            (document as any).baseURI = pathToFileURL(ps.join(cliRoot, 'index.js')).href;
        }

        await moduleSystem.build({
            out: systemJsBundleOutFile,
            minify: false,
            sourceMap: true,
            platform: 'web-mobile',
            editor: true,
        });
    }

    private async _resetQuickPackLoader() {
        const { default: scripting } = await import('../index');
        const contextSerialize = scripting.getPackerDriverLoaderContext('preview');
        const { QuickPackLoaderContext, QuickPackLoader } = await import('@cocos/creator-programming-quick-pack/lib/loader');
        const context = QuickPackLoaderContext.deserialize(contextSerialize!);
        const quickPackLoader = new QuickPackLoader(context);
        this._quickPackLoader = quickPackLoader;
    }
}

