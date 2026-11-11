import { cpus, totalmem } from 'os';
import { dirname, join } from 'path';
import { outputJSON } from 'fs-extra';

/**
 * 构建性能 Profile 模块（P0-1）
 *
 * 通过 `cocos build --profile`（或环境变量 COCOS_BUILD_PROFILE=1）开启，
 * 在构建管线的各插桩点记录任务耗时与内存快照，构建结束（无论成败）后
 * 在构建日志同目录生成 `profile-{taskId}.json` 报告。
 *
 * 设计约束：
 * - 未开启时所有 API 近似零开销（早退），不改变任何构建行为；
 * - 记录失败（如写盘异常）绝不允许影响构建结果；
 * - 报告结构见 IBuildProfileReport。
 */

export interface IBuildProfileMeta {
    taskId?: string;
    taskName?: string;
    platform?: string;
    logDest?: string;
}

export interface IBuildProfileEntry {
    /** 任务名，如 data-task/asset、subprocess:build-engine、pkgName:onBeforeBuild */
    name: string;
    /** 所属作用域路径（外层 profiled 名称以 / 连接），如 build/dataTasks */
    stage: string;
    /** 相对构建开始的偏移（ms） */
    startOffsetMs: number;
    durationMs: number;
    heapUsedStartMB: number;
    heapUsedEndMB: number;
    rssStartMB: number;
    rssEndMB: number;
    /** 任务抛错时记录错误摘要 */
    error?: string;
}

export interface IBuildProfileReport {
    meta: {
        taskId?: string;
        taskName?: string;
        platform?: string;
        logDest?: string;
        startTime: string;
        endTime: string;
        totalDurationMs: number;
        success: boolean;
        code?: number;
        reason?: string;
        dest?: string;
        env: {
            nodeVersion: string;
            platform: string;
            arch: string;
            cpuCount: number;
            cpuModel: string;
            totalMemoryMB: number;
        };
    };
    entries: IBuildProfileEntry[];
    summary: {
        byStage: Record<string, { count: number; totalDurationMs: number }>;
        top: Array<{ name: string; stage: string; durationMs: number }>;
    };
}

interface IPendingEntry {
    name: string;
    stage: string;
    start: number;
    heapUsedStart: number;
    rssStart: number;
}

export interface IBuildProfileToken {
    id: number;
}

const MB = 1024 * 1024;

function toMB(bytes: number): number {
    return Math.round((bytes / MB) * 10) / 10;
}

function isEnvEnabled(): boolean {
    const value = process.env.COCOS_BUILD_PROFILE;
    return value === '1' || value === 'true';
}

class BuildProfiler {
    private _enabled = false;
    private _entries: IBuildProfileEntry[] = [];
    private _pending = new Map<number, IPendingEntry>();
    private _scopes: string[] = [];
    private _nextId = 1;
    private _startTs = 0;
    private _meta: IBuildProfileMeta | null = null;

    /** 显式开启（CLI --profile 调用） */
    public enable() {
        this._enabled = true;
    }

    public disable() {
        this._enabled = false;
    }

    public get isEnabled(): boolean {
        return this._enabled || isEnvEnabled();
    }

    /**
     * 构建开始时调用，重置记录状态
     */
    public beginBuild(meta: IBuildProfileMeta) {
        if (!this.isEnabled) {
            return;
        }
        this._entries = [];
        this._pending.clear();
        this._scopes = [];
        this._nextId = 1;
        this._startTs = Date.now();
        this._meta = { ...meta };
    }

    /**
     * 开始记录一个任务，返回 token 供 endEntry 使用。
     * 未开启时返回 null，endEntry(null) 为空操作。
     */
    public startEntry(name: string): IBuildProfileToken | null {
        if (!this.isEnabled || !this._startTs) {
            return null;
        }
        const mem = process.memoryUsage();
        const id = this._nextId++;
        this._pending.set(id, {
            name,
            stage: this._scopes.join('/'),
            start: Date.now(),
            heapUsedStart: mem.heapUsed,
            rssStart: mem.rss,
        });
        return { id };
    }

    /**
     * 结束记录一个任务
     */
    public endEntry(token: IBuildProfileToken | null, error?: string) {
        if (!token) {
            return;
        }
        const pending = this._pending.get(token.id);
        if (!pending) {
            return;
        }
        this._pending.delete(token.id);
        const end = Date.now();
        const mem = process.memoryUsage();
        const entry: IBuildProfileEntry = {
            name: pending.name,
            stage: pending.stage,
            startOffsetMs: pending.start - this._startTs,
            durationMs: end - pending.start,
            heapUsedStartMB: toMB(pending.heapUsedStart),
            heapUsedEndMB: toMB(mem.heapUsed),
            rssStartMB: toMB(pending.rssStart),
            rssEndMB: toMB(mem.rss),
        };
        if (error) {
            entry.error = error;
        }
        this._entries.push(entry);
    }

    /**
     * 进入一个作用域：作用域内记录的所有 entry 的 stage 会带上该名称。
     * 返回退出作用域的函数（异常安全由调用方 try/finally 或 profiled 保证）。
     */
    public pushScope(name: string): () => void {
        if (!this.isEnabled) {
            return () => { /* noop */ };
        }
        this._scopes.push(name);
        let popped = false;
        return () => {
            if (popped) {
                return;
            }
            popped = true;
            const index = this._scopes.lastIndexOf(name);
            if (index >= 0) {
                this._scopes.splice(index, 1);
            }
        };
    }

    /**
     * 构建结束时调用，生成并写盘报告。
     * @returns 报告文件路径；未开启或写入失败返回 null
     */
    public async endBuild(result: { success: boolean; code?: number; reason?: string; dest?: string }): Promise<string | null> {
        if (!this.isEnabled || !this._startTs || !this._meta) {
            return null;
        }
        const endTime = Date.now();
        const report = this.buildReport(result, endTime);
        const reportPath = this.resolveReportPath();
        // 重置状态，避免同一进程内二次构建串数据
        this._startTs = 0;
        this._meta = null;
        this._entries = [];
        this._pending.clear();
        this._scopes = [];
        if (!reportPath) {
            return null;
        }
        try {
            await outputJSON(reportPath, report, { spaces: 2 });
            console.log(`📊 Build profile report: ${reportPath}`);
            return reportPath;
        } catch (error) {
            // Profile 失败绝不影响构建结果
            console.debug(`[profile] write report failed: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
    }

    private buildReport(result: { success: boolean; code?: number; reason?: string; dest?: string }, endTime: number): IBuildProfileReport {
        const meta = this._meta!;
        const entries = [...this._entries, ...this.flushPending(endTime)];
        const byStage: Record<string, { count: number; totalDurationMs: number }> = {};
        for (const entry of entries) {
            const stage = entry.stage || '(root)';
            if (!byStage[stage]) {
                byStage[stage] = { count: 0, totalDurationMs: 0 };
            }
            byStage[stage].count++;
            byStage[stage].totalDurationMs += entry.durationMs;
        }
        const top = [...entries]
            .sort((a, b) => b.durationMs - a.durationMs)
            .slice(0, 10)
            .map((entry) => ({ name: entry.name, stage: entry.stage, durationMs: entry.durationMs }));
        const cpuList = cpus();
        return {
            meta: {
                taskId: meta.taskId,
                taskName: meta.taskName,
                platform: meta.platform,
                logDest: meta.logDest,
                startTime: new Date(this._startTs).toISOString(),
                endTime: new Date(endTime).toISOString(),
                totalDurationMs: endTime - this._startTs,
                success: result.success,
                code: result.code,
                reason: result.reason,
                dest: result.dest,
                env: {
                    nodeVersion: process.version,
                    platform: process.platform,
                    arch: process.arch,
                    cpuCount: cpuList.length,
                    cpuModel: cpuList[0]?.model?.trim() || 'unknown',
                    totalMemoryMB: toMB(totalmem()),
                },
            },
            entries,
            summary: { byStage, top },
        };
    }

    /**
     * 构建结束时仍未闭合的任务（如中途异常返回），按当前时间强制闭合，标记 error
     */
    private flushPending(endTime: number): IBuildProfileEntry[] {
        const result: IBuildProfileEntry[] = [];
        for (const pending of this._pending.values()) {
            const mem = process.memoryUsage();
            result.push({
                name: pending.name,
                stage: pending.stage,
                startOffsetMs: pending.start - this._startTs,
                durationMs: endTime - pending.start,
                heapUsedStartMB: toMB(pending.heapUsedStart),
                heapUsedEndMB: toMB(mem.heapUsed),
                rssStartMB: toMB(pending.rssStart),
                rssEndMB: toMB(mem.rss),
                error: 'unclosed entry (build ended before task finished)',
            });
        }
        return result;
    }

    private resolveReportPath(): string | null {
        const meta = this._meta!;
        const taskId = meta.taskId || String(this._startTs);
        if (meta.logDest) {
            return join(dirname(meta.logDest), `profile-${taskId}.json`);
        }
        return null;
    }
}

export const buildProfiler = new BuildProfiler();

/** CLI --profile 入口 */
export function enableBuildProfile() {
    buildProfiler.enable();
}

/**
 * 便捷包裹函数：记录 fn 的执行耗时/内存，并把 name 压入作用域栈，
 * 使 fn 内部嵌套记录的 entry 自动带上 stage 前缀。
 * 未开启 profile 时直接透传执行，无额外开销。
 */
export async function profiled<T>(name: string, fn: () => Promise<T> | T): Promise<T> {
    if (!buildProfiler.isEnabled) {
        return await fn();
    }
    const token = buildProfiler.startEntry(name);
    const popScope = buildProfiler.pushScope(name);
    try {
        const result = await fn();
        buildProfiler.endEntry(token);
        return result;
    } catch (error) {
        buildProfiler.endEntry(token, error instanceof Error ? error.message : String(error));
        throw error;
    } finally {
        popScope();
    }
}
