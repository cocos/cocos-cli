
import { ChildProcess, fork, ForkOptions, spawn } from 'child_process';
import { dirname, join } from 'path';
import { IQuickSpawnOption } from '../../@types/protected';
import { GlobalPaths } from '../../../../global';

// 获取 CPU 数量，有几个 CPU 就创建几个子进程，这样就可以最大化的利用机器性能
const workerPath = join(__dirname, './sub-process');

interface ChildProcessMessageInfo {
    type: string;
    data: any;
    code?: number;
}

interface ITask {
    name: string; // 任务名称
    path: string; // 执行的脚本
    lazy?: boolean; // 是否使用时再创建进程
}

class ProcessPool {
    private pool: Set<ChildProcess> = new Set();
    // 中断构建任务时，会杀掉正在运行的进程，其他进程会继续保留等待后续调用
    private runningPool: Set<ChildProcess> = new Set();

    add(child: ChildProcess) {
        this.pool.add(child);
    }

    running(child: ChildProcess) {
        this.runningPool.add(child);
    }

    notRunning(child: ChildProcess) {
        this.runningPool.delete(child);
    }

    /**
     * 删除进程，将会移除所有进程池里的索引
     * @param child 
     */
    delete(child: ChildProcess) {
        this.notRunning(child);
        this.pool.delete(child);
    }

    killAll() {
        this.pool.forEach((child) => {
            child.kill();
        });
        this.pool.clear();
    }

    kill(child: ChildProcess) {
        child.kill();
        this.notRunning(child);
        this.delete(child);
    }

    killRunning() {
        this.runningPool.forEach((child) => {
            child.kill();
            this.delete(child);
        });
        this.runningPool.clear();
    }

    killFree() {
        this.pool.forEach((child) => {
            if (this.runningPool.has(child)) {
                return;
            }
            child.kill();
            this.pool.delete(child);
        });
    }
}

const processPool = new ProcessPool();

class WorkerTask {
    path: string;
    lazy = false;
    busy = false;

    _name: string;
    _method?: string;

    get name() {
        return this._method || this._name;
    }

    _hasResolve = false;
    _hasReject = false;

    _resolve?: (value?: any) => void;
    _reject?: (error?: any) => void;

    setResolve = (resolve: (value?: any) => void) => {
        this._hasResolve = false;
        this._resolve = resolve;
    };
    setReject = (reject: (error?: any) => void) => {
        this._hasReject = false;
        this._reject = reject;
    };

    readonly resolve = (value?: any) => {
        if (this._hasResolve || !this._method || !this._resolve) {
            return;
        }
        console.debug(`execute-script-end with ${this.name} ${Date.now() - this.startTime}ms`);
        this._hasResolve = true;
        delete this._method;
        this._resolve(value);
    };
    readonly reject = (error?: Error) => {
        if (this._hasReject || !this._method || !this._reject) {
            error && console.debug(error);
            return;
        }
        console.error(error);
        this._hasReject = true;
        delete this._method;
        this._reject(error);
    };

    startTime = Date.now();
    _handleProcess?: ChildProcess;

    constructor(params: ITask) {
        this._name = params.name;
        this.path = params.path;
        this.lazy = params.lazy || false;
    }

    public async execute(method: string, args?: any[]) {
        const child = await this.getWorkerProcess();
        if (!child) {
            throw new Error('No worker ' + this.name);
        }
        return new Promise<any>((resolve, reject) => {
            this._method = method;
            this.setResolve(resolve);
            this.setReject(reject);
            this.startTime = Date.now();
            child.send({
                type: 'execute-script',
                path: this.path,
                method,
                args,
            });
            processPool.running(child);
        });
    }

    private async getWorkerProcess() {
        if (!this._handleProcess) {
            this._handleProcess = await this.createWorkerProcess();
        }
        return this._handleProcess;
    }

    private async createWorkerProcess() {
        const child = fork(workerPath, [], {
            execArgv: WorkerManager.defaultArgv || [],
            stdio: ['ipc', 'pipe', 'pipe', 'pipe'],
            // 进程默认的 cwd 不同系统上不稳定，在编译脚本时可能遇到问题
            cwd: dirname(GlobalPaths.workspace),
        });
        child.on('message', (m: ChildProcessMessageInfo) => {
            if (m && m.type === 'execute-script-end') {
                processPool.notRunning(child);
                m.code === 0 ? this.resolve(m.data) : this.reject(new Error(`execute-task ${this.name} failed with code ${m.code}!`));
            }
        });
        child.on('error', (err) => {
            this.reject(err);
            this.close();
        });
        child.on('exit', (code, signal) => {
            if (code !== 0) {
                this.reject(new Error(`Exit process with code:${code}, signal:${signal} in task ${this.name}`));
            } else {
                this.resolve();
            }
            this.close();
        });
        child.stdout?.on('data', (data: Buffer) => {
            console.log(`[${this.name}]` + data.toString());
        });
        child.stderr?.on('data', (data) => {
            const info: string = data.toString();
            // 调试模式下开启进程默认会在 stderr 里输出一段调试信息，这段信息在不同的设备上有的显示多行有的显示单行文字，因而需要做多次过滤
            if (!info || info.includes('Debugger') || info.includes('For help, see') || info.includes('Starting inspector on')) {
                console.debug(info);
                return;
            }
            // 子进程警告输出 HACK 2/2
            if (info.includes('[warning]')) {
                console.warn(`[${this.name}]` + info.replace('[warning]', ''));
                return;
            }
            console.error(`[${this.name}]` + info);
        });
        processPool.add(child);
        return child;
    }

    public close() {
        this.busy = false;
        delete this._method;
        if (this._handleProcess) {
            processPool.kill(this._handleProcess);
            delete this._handleProcess;
        }
    }
}

/**
 * 任务进程管理器
 */
export class WorkerManager {
    // 任务队列
    private taskMap: Record<string, WorkerTask> = {};
    private _clearFreeChildTimer?: NodeJS.Timeout;
    static defaultArgv: string[] = [];

    static toggleDebug() {
        if (WorkerManager.defaultArgv.includes('--inspect')) {
            WorkerManager.defaultArgv = WorkerManager.defaultArgv.filter((arg) => arg !== '--inspect');
        } else {
            WorkerManager.defaultArgv.push('--inspect');
        }
    }

    constructor(tasks?: ITask[]) {
        tasks && tasks.forEach((task) => this.registerTask(task));
    }

    /**
     * 注册一个需要开启子进程独立运行的任务信息，注册后会开启子进程，等待执行，有重复的任务会复用进程
     * @param task
     * @returns
     */
    public async registerTask(task: ITask) {
        if (this.taskMap[task.name]) {
            return;
        }
        this.taskMap[task.name] = new WorkerTask(task);
    }

    public async runTask(name: string, method: string, args?: any[]) {
        this.resetClearTimer();
        const task = this.taskMap[name];
        if (!task) {
            throw new Error('No worker ' + name);
        }
        return await task.execute(method, args);
    }

    /**
     * 停止某个进程
     * @param name
     */
    public kill(name: string) {
        const task = this.taskMap[name];
        if (!task) {
            return;
        }
        task.close();
    }

    /**
     * 中断所有正在执行的进程任务，和直接 kill 有差异
     */
    public killRunningChilds = processPool.killRunning.bind(processPool);

    /**
     * 清理在空闲状态的进程
     */
    public killFreeChilds = processPool.killFree.bind(processPool);

    /**
     * 重置清理进程池的定时器, 20 分钟之内没有多余操作，就清理空闲子进程
     */
    private resetClearTimer() {
        this._clearFreeChildTimer && clearTimeout(this._clearFreeChildTimer);
        this._clearFreeChildTimer = setTimeout(() => {
            this.killFreeChilds();
        }, 20 * 1000 * 60);
    }

    /**
     * 快速开启子进程
     * @param command
     * @param cmdParams
     * @param options
     * @returns
     */
    public quickSpawn(command: string, cmdParams: string[], options: IQuickSpawnOption = {
        downGradeLog: true,
        prefix: '',
    }): Promise<number | boolean> {
        if (command === 'npm') {
            command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
        }
        options.prefix = options.prefix || '';
        return new Promise((resolve, reject) => {
            const ls = spawn(command, cmdParams, {
                cwd: options?.cwd || undefined,
                env: options?.env,
                shell: !!options?.shell,
            });
            processPool.add(ls);
            processPool.running(ls);
            if (!options.ignoreLog) {
                ls.stdout.on('data', (data) => {
                    data = data.toString();
                    if (options?.downGradeLog) {
                        console.debug(options.prefix + data.toString());
                    } else {
                        console.log(options.prefix + data.toString());
                    }
                });
            }

            ls.stderr.on('data', (err) => {
                const error = err.toString();
                // 过滤掉空或只有换行的报错，以及 native-pack-tool 没有设置私有仓库的警告（就不去 engine 修改了）
                if (!error || error === '\n' || /^(?=.*native-pack-tool)(?=.*No repository field)/gi.test(error)) {
                    return;
                }
                const data = options.prefix + error;
                let type = 'error';
                if (/warn/gi.test(data)) {
                    type = 'warn';
                    if (options?.downGradeWaring) {
                        type = 'log';
                    }
                } else if (options?.downGradeError) {
                    type = 'log';
                }
                // @ts-ignore
                console[type](data);
            });

            ls.on('close', (code) => {
                processPool.delete(ls);
                if (code !== 0) {
                    reject(options.prefix + `Child process exit width code ${code}:${command} ${cmdParams.toString()}`);
                } else {
                    resolve(true);
                    console.debug(options.prefix + `Child process exit width code ${code}`);
                }
            });
            ls.on('error', (err: Error) => {
                processPool.delete(ls);
                console.error(options.prefix + `child process error: ${command} ${cmdParams.toString()}`);
                reject(err);
            });
            ls.on('exit', (code) => {
                processPool.delete(ls);
                if (code !== 0) {
                    reject(options.prefix + `Child process exit width code ${code}:${command} ${cmdParams.toString()}`);
                } else {
                    resolve(true);
                    console.debug(options.prefix + `Child process exit width code ${code}`);
                }
            });
        });
    }
}

export const workerManager = new WorkerManager();
