import 'reflect-metadata';

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

// 全局存储 manager 实例
export const managers: Record<string, Record<string, Function>> = {};

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

/** 类装饰器：注册 Manager 类 */
export function register(name?: string): ClassDecorator {
    return (target: any) => {
        const instance = new target();
        const proto = target.prototype;
        const publicMethods: (string | symbol)[] =
            Reflect.getMetadata(PUBLIC_METHODS_KEY, proto) || [];

        const managerName = name || target.name;
        console.log(name || target.name);
        const map: Record<string, Function> = {};

        for (const key of publicMethods) {
            if (typeof instance[key] === 'function') {
                map[key as string] = instance[key].bind(instance);
            }
        }

        managers[managerName] = map;
        console.log(`[Manager] Registered: ${managerName} -> [${Object.keys(map).join(', ')}]`);
    };
}
