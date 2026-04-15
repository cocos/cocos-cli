import type {
    IComponent,
    IComponentForPinK,
    IAddComponentOptions,
    IRemoveComponentOptions,
    ISetPropertyOptionsForPink,
    IExecuteComponentMethodOptions,
} from '../../core/scene/common/component';

import { Scene } from '../../core/scene';

/**
 * Add component to node // 添加组件到节点
 */
export async function addComponent(options: IAddComponentOptions): Promise<IComponent> {
    return await Scene.addComponent(options);
}

/**
 * Add component to node // 添加组件到节点
 */
export async function createComponent(options: IAddComponentOptions): Promise<boolean> {
    return await Scene.createComponent(options);
}

/**
 * Remove component from node // 移除节点上的组件
 */
export async function removeComponent(options: IRemoveComponentOptions): Promise<boolean> {
    return await Scene.removeComponent(options);
}

/**
 * Query component info // 查询组件信息
 */
export async function queryComponent(uuid: string): Promise<IComponentForPinK | null> {
    return await Scene.queryComponent({ pathOrUuidOrUrl: uuid, isFull: true }) as IComponentForPinK;
}

export async function resetComponent(uuid: string) {
    Scene.resetComponent({ pathOrUuidOrUrl: uuid });
}

/**
 * Set component property // 设置组件属性
 */
export async function setProperty(options: ISetPropertyOptionsForPink): Promise<boolean> {
    return await Scene.setPropertyForPink(options.uuid, options.path, options.dump, options.record);
}

export async function executeComponentMethod(options: IExecuteComponentMethodOptions): Promise<boolean> {
    return await Scene.executeComponentMethod(options);
}

/**
 * Query all component names // 查询所有组件名称
 */
export async function queryAllComponent(): Promise<string[]> {
    return await Scene.queryAllComponent();
}
