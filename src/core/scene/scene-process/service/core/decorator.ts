import 'reflect-metadata';
import type { IServiceManager } from '../interfaces';

/**
 * 范例
 * @register('Scene')
 * class SceneManager {
 *   loadScene(name: string) {
 *     console.log(`loading scene: ${name}`);
 *   }
 *
 *   unloadScene(name: string) {
 *     console.log(`unloading scene: ${name}`);
 *   }
 *
 *   private internal() {
 *     console.log('private logic');
 *   }
 * }
 *
 * // 使用
 * import { Service } from './service';
 * Service.Editor.loadScene('Main');
 */

export type ServiceName = keyof IServiceManager; // 'Scene' | 'Node' | 'Script' ...

// 真正的存储容器
const _serviceRegistry: Record<string, any> = {};

/** 类装饰器：注册 Service 类，自动收集所有公有方法 */
export function register(name?: string): ClassDecorator {
    return (target: any) => {
        const instance = new target();
        const managerName = (name || target.name) as ServiceName;

        _serviceRegistry[managerName] = instance;
        console.log(`[Manager] Registered: ${managerName}`);
    };
}

/**
 * 全局代理：通过 Service.Editor.xxx() 访问
 */
export const Service = new Proxy({} as IServiceManager, {
    get(_, prop: string) {
        const svc = _serviceRegistry[prop as ServiceName];
        if (!svc) {
            throw new Error(`[Service] '${prop}' is not registered.`);
        }
        return svc;
    },
});

/**
 * 获取全部 Service
 */
export function getServiceAll() {
    return Object.values(_serviceRegistry);
}
