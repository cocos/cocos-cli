import { IServiceEvents } from '../scene-process/service/core';

export interface IScriptEvents {
    /**
     * 当脚本刷新并执行完成时触发
     */
    'script:execution-finished': [],
}

export interface IPublicScriptService extends Omit<IScriptService, keyof IServiceEvents | 'suspend' | 'isCustomComponent'> { }

export interface IScriptService extends IServiceEvents {
    investigatePackerDriver(): Promise<void>;
    load(): Promise<void>;
    remove(): Promise<void>;
    change(): Promise<void>;
    queryCid(uuid: string): Promise<string | null>;
    queryName(uuid: string): Promise<string | null>;
    isCustomComponent(classConstructor: Function): boolean;
    suspend(condition: Promise<any>): void;
}
