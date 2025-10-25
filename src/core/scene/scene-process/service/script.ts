import cc from 'cc';
import { EventEmitter } from 'events';
import { Executor } from '@cocos/lib-programming/dist/executor';
import { QuickPackLoaderContext } from '@cocos/creator-programming-quick-pack/lib/loader';
import utils from '../../../base/utils';
import type { IAssetInfo } from '../../../assets/@types/public';
import { Rpc } from '../rpc';
import { register, expose } from './decorator';
import { IScriptService } from '../../common';

/**
 * 异步迭代。有以下特点：
 * 1. 每次调用 `nextIteration()` 会执行一次传入的**迭代函数**；迭代函数允许是异步的，在构造函数中确定之后不能更改；
 * 2. 同时**最多仅会有一例**迭代在执行；
 * 3. **迭代是可合并的**，也就是说，在前面的迭代没完成之前，后面的所有迭代都会被合并成一个。
 */
class AsyncIterationConcurrency1 {
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
            return this._pendingPromise;
        }
    }
}

/**
 * 导入时异常的消息的标签。
 */
const importExceptionLogTag = '::SceneExecutorImportExceptionHandler::';
const importExceptionLogRegex = new RegExp(importExceptionLogTag);

class GlobalEnv {
    public async record(fn: () => Promise<void>) {
        this.clear();
        this._queue.push(async () => {
            const beforeKeys = Object.keys(globalThis);
            await fn();
            const afterKeys = Object.keys(globalThis);
            for (const afterKey of afterKeys) {
                if (!beforeKeys.includes(afterKey)) {
                    this._incrementalKeys.add(afterKey);
                }
            }
            console.debug(`Incremental keys: ${Array.from(this._incrementalKeys)}`);
        });
        await this.processQueue(); // 处理队列
    }

    private clear() {
        this._queue.push(async () => {
            for (const incrementalKey of this._incrementalKeys) {
                delete (globalThis as any)[incrementalKey];
            }
            this._incrementalKeys.clear();
        });
    }

    private async processQueue() {
        while (this._queue.length > 0) {
            const next = this._queue.shift();
            if (next) await next(); // 执行队列中的下一个任务
        }
    }

    private _incrementalKeys = new Set<string>();
    private _queue: (() => Promise<void>)[] = [];
}

const globalEnv = new GlobalEnv();

@register('Script')
export class ScriptService extends EventEmitter implements IScriptService {
    /**
     * 当脚本刷新并执行完成时触发。
     */
    public readonly EXECUTION_FINISHED = 'execution-finished';

    private _executor!: Executor;

    private _suspendPromise: Promise<void> | null = null;

    private _syncPluginScripts: AsyncIterationConcurrency1;
    private _reloadScripts: AsyncIterationConcurrency1;

    /**
     * 非引擎定义的组件
     * @private
     */
    private customComponents: Set<Function> = new Set();

    constructor() {
        super();
        this._reloadScripts = new AsyncIterationConcurrency1(() => this._execute());
        this._syncPluginScripts = new AsyncIterationConcurrency1(() => this._syncPluginScriptList());
    }

    /**
     * 挂起脚本管理器直到 `condition` 结束，才会进行下一次执行。
     * @param condition
     */
    public suspend(condition: Promise<void>) {
        this._suspendPromise = condition;
    }

    @expose()
    async init() {
        EditorExtends.on('class-registered', (classConstructor: Function, metadata: any, className: string) => {
            console.log('classRegistered', className);
            console.log('class-registered ' + cc.js.isChildClassOf(classConstructor, cc.Component));
            if (metadata && // Only project scripts
                cc.js.isChildClassOf(classConstructor, cc.Component) // Only components
            ) {
                this.customComponents.add(classConstructor);
                EditorExtends.Component.addMenu(
                    classConstructor, 'i18n:menu.custom_script/' + className, -1);
            }
        });
        const serializedPackLoaderContext = await Rpc.request('programming', 'getPackerDriverLoaderContext', ['editor']);
        if (!serializedPackLoaderContext) {
            throw new Error('packer-driver/get-loader-context is not defined');
        }
        const quickPackLoaderContext = QuickPackLoaderContext.deserialize(serializedPackLoaderContext);

        const { loadDynamic } = await import('cc/preload');
        const cceModuleMap = await Rpc.request('programming', 'queryCCEModuleMap');
        this._executor = await Executor.create({
            // @ts-ignore
            importEngineMod: async (id) => {
                return await loadDynamic(id) as Record<string, unknown>;
            },
            quickPackLoaderContext,
            beforeUnregisterClass: (classConstructor) => {
                // 清除 menu 里面的缓存
                this.customComponents.delete(classConstructor);
                EditorExtends.Component.removeMenu(classConstructor);
            },
            logger: {
                loadException: (moduleId, error, hasBeenThrown?: boolean) => {
                    // console.error(`An exception is thrown during load of module "${moduleId}" (or its recursive dependencies). `, error);
                },
                possibleCircularReference: (imported: string, moduleRequest: string, importMeta: any, extras: any) => {
                    const moduleUrlToAssetLink = (url: string) => {
                        const prefix = 'project:///';
                        return url.startsWith(prefix) ? `{asset(db://${url.slice(prefix.length).replace('.js', '.ts')})}` : url;
                    };
                    console.warn(`在 ${moduleUrlToAssetLink(importMeta.url)} 中检测到可能的循环引用：从 ${moduleRequest} 导入 ${imported} 时。`,
                        extras?.error?.stack,
                    );
                },
            },
            importExceptionHandler: (...args) => this._handleImportException(...args),
            cceModuleMap,
        });
        globalThis.self = window;
        this._executor.addPolyfillFile(require.resolve('@cocos/build-polyfills/prebuilt/editor/bundle'));
        // 同步插件脚本列表
        await this._syncPluginScripts.nextIteration();
        // 重载项目与插件脚本
        await this._reloadScripts.nextIteration();
    }

    @expose()
    async investigatePackerDriver() {
        void this._executeAsync();
    }

    /**
     * 传入一个 uuid 返回这个 uuid 对应的脚本组件名字
     * @param uuid
     */
    @expose()
    async queryScriptName(uuid: string) {
        const compressUuid = utils.UUID.compressUUID(uuid, false);
        const list = this._executor.queryClassesInModule(compressUuid);
        if (!list) {
            return null;
        }
        const classConstructor = list.find((classConstructor) => cc.js.isChildClassOf(classConstructor as Function, cc.Component));
        return classConstructor ? cc.js.getClassName(classConstructor) : null;
    }

    /**
     * 传入一个 uuid 返回这个 uuid 对应的脚本的 cid
     * @param uuid
     */
    @expose()
    async queryScriptCid(uuid: string) {
        const compressUuid = utils.UUID.compressUUID(uuid, false);
        const list = this._executor.queryClassesInModule(compressUuid);
        if (!list) {
            return null;
        }
        const classConstructor = list.find((classConstructor) => cc.js.isChildClassOf(classConstructor as Function, cc.Component));
        return classConstructor ? cc.js.getClassId(classConstructor) : null;
    }

    /**
     * 是否是自定义脚本（不是引擎定义的组件）
     * @param classConstructor
     */
    @expose()
    public isCustomComponent(classConstructor: Function) {
        return this.customComponents.has(classConstructor);
    }

    async _loadScripts() { }

    /**
     * 加载脚本时触发
     */
    @expose()
    async loadScript() {
        this._syncPluginScriptListAsync();
    }

    /**
     * 删除脚本时触发
     */
    @expose()
    async removeScript() {
        this._syncPluginScriptListAsync();
    }

    /**
     * 脚本发生变化时触发
     */
    @expose()
    async scriptChange() {
        this._syncPluginScriptListAsync();
    }

    private _executeAsync() {

        void this._reloadScripts.nextIteration();
    }

    private async _execute(): Promise<void> {
        return Promise.resolve(this._suspendPromise ?? undefined).catch((reason) => {
            console.error(reason);
        }).finally(() => {
            this._suspendPromise = null;

            return globalEnv.record(
                () => this._executor.reload().finally(() => {
                    this.emit(this.EXECUTION_FINISHED);
                }),
            );
        });
    }

    /**
     * 防止插件脚本切换到项目脚本或者反之时，没有同步插件脚本列表
     * 这里使用了 AsyncIterationConcurrency1 功能，为了防止被多次调用，进行了迭代合并
     * @private
     */
    private _syncPluginScriptListAsync() {
        void this._syncPluginScripts.nextIteration();
    }

    /**
     * 同步插件脚本列表到 Executor
     * @private
     */
    private async _syncPluginScriptList() {
        return Promise.resolve(Rpc.request('assetManager', 'querySortedPlugins', [{
            loadPluginInEditor: true,
        }]))
            .then((pluginScripts) => {
                this._executor.setPluginScripts(pluginScripts);
            })
            .catch((reason) => {
                console.error(reason);
            });
    }

    private _handleImportException(err: unknown) {
        console.error(`{hidden(${importExceptionLogTag})}`, err);
    }
}
