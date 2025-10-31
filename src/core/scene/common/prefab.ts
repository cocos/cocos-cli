import { IServiceEvents } from '../scene-process/service/core';

/**
 * 预制体事件类型
 */
export interface IPrefabEvents {

}

export interface IPublicPrefabService extends Omit<IPrefabService, keyof IServiceEvents> {}

export interface IPrefabService extends IServiceEvents {

}
