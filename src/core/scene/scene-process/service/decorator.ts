import 'reflect-metadata';
import type { ISceneModule } from './interfaces';

/**
 * @register('Scene')
 * class SceneManager {
 *   @expose()
 *   loadScene(name: string) {
 *     console.log(`loading scene: ${name}`);
 *   }
 *
 *   @expose()
 *   unloadScene(name: string) {
 *     console.log(`unloading scene: ${name}`);
 *   }
 *
 *   private internal() {
 *     console.log('private logic');
 *   }
 * }
 */

// 全局存储 manager 实例（键限定为已定义的 Service 名称）
export type ServiceName = keyof ISceneModule; // 'Scene' | 'Node' | 'Script' ...
export const Service: Partial<Record<ServiceName, Record<string, Function>>> = {};

// 元数据 key
const PUBLIC_METHODS_KEY = Symbol('public_methods');

/** 方法装饰器：标记为公共可注册方法 */
export function expose(): MethodDecorator {
    return (target, key) => {
        const existing = Reflect.getMetadata(PUBLIC_METHODS_KEY, target) || [];
        existing.push(key);
        Reflect.defineMetadata(PUBLIC_METHODS_KEY, existing, target);
    };
}

/** 类装饰器：注册 Service 类 */
export function register(name?: string): ClassDecorator {
    return (target: any) => {
        const instance = new target();
        const proto = target.prototype;
        const publicMethods: (string | symbol)[] =
            Reflect.getMetadata(PUBLIC_METHODS_KEY, proto) || [];

        const managerName = (name || target.name) as ServiceName;
        const map: Record<string, Function> = {};

        for (const key of publicMethods) {
            if (typeof instance[key] === 'function') {
                map[key as string] = instance[key].bind(instance);
            }
        }

        Service[managerName] = map;
        console.log(`[Manager] Registered: ${managerName} -> [${Object.keys(map).join(', ')}]`);
    };
}
