import { compareVersion } from "./utils";

export type MigrateStage = 'migrate' | 'preMigrate' | 'postMigrate';

/**
 * 迁移队列
 */
export interface Migrate<T> {
    version: string;
    migrate: (data: T, ...args: any[]) => Promise<T>;
}

/**
 * 钩子函数
 */
export interface MigrateHook<T> {
    pre?: (data: T, ...args: any[]) => Promise<T>;
    post?: (data: T, ...args: any[]) => Promise<T>;
    onError?: (error: Error, stage: MigrateStage, data: T, ...args: any[]) => void;
}

export class Migrator<T> {
    private migrations: Migrate<T>[];
    private hook?: MigrateHook<T>;
    private lastedVersion: string;
    constructor(migrations: Migrate<T>[], lastedVersion: string, hook?: MigrateHook<T>) {
        this.migrations = migrations;
        this.lastedVersion = lastedVersion;
        this.hook = hook;
        if (hook?.onError) {
            this.onError = hook.onError;
        }
    }

    async run(data: T, startVersion: string, extArgs?: any[]): Promise<T> {
        if (startVersion === this.lastedVersion) {
            return data;
        }

        if (this.hook && this.hook.pre) {
            try {
                await this.hook.pre(data);
            } catch (error) {
                this.onError(error, 'preMigrate', data, ...(extArgs || []))
            }
        }

        let res = data;
        for (const task of this.migrations) {
            const index = compareVersion(startVersion, task.version);
            if (index > 0) {
                continue;
            }

            // 迁移流程
            try {
                console.debug(`Migration: -> ${task.version}`)
                res = await task.migrate(res, ...(extArgs || []));
            } catch (error) {
                this.onError(error, 'migrate', res, ...(extArgs || []))
            }
        }

        if (this.hook && this.hook.post) {
            try {
                await this.hook.post(data);
            } catch (error) {
                this.onError(error, 'postMigrate', data, ...(extArgs || []))
            }
        }

        return res;
    }

    private onError(error: any, stage: MigrateStage, data: T, ...args: any[]) {
        console.error(`Migrate error in ${stage}`);
        console.error(error);
    }
}