import { join, resolve } from 'path';
import Module from 'module';

export interface IEngineLoader {
    import(id: string): Promise<unknown>;
}

const ModuleInternal = Module as typeof Module & {
    _resolveFilename(this: Module, request: string): void;
    _load(this: Module, request: string): void;
};

export class EngineLoader {
    static isEngineModule(request: string): boolean {
        return request === 'cc' || (request.startsWith('cc/') && !request.startsWith('cc/preload')) || request.startsWith('cce:/internal/');
    }

    private static engineModules: Record<string, any> = {};
    public static getEngineModuleById(id: string): any {
        return EngineLoader.engineModules[id];
    }

    private static loader: IEngineLoader | undefined;

    private static createEngineLoader(engineDevPath: string): IEngineLoader {
        const loaderModule = require(resolve(join(engineDevPath, 'editor'), 'loader')) as {
            default: IEngineLoader;
        };

        return loaderModule.default;
    }

    public static async init(engineDevPath: string, modules: string[]) {
        this.loader = this.createEngineLoader(engineDevPath);
        await this.requiredModules(modules);

        const vendorResolveFilename = ModuleInternal._resolveFilename;
        ModuleInternal._resolveFilename = function (request: string) {
            if (EngineLoader.isEngineModule(request)) {
                return request;
            } else {
                // @ts-ignore

                return vendorResolveFilename.apply(this, arguments);
            }
        };

        const vendorLoad = ModuleInternal._load;
        ModuleInternal._load = function (request: string) {
            if (EngineLoader.isEngineModule(request)) {
                const module = EngineLoader.getEngineModuleById(request);
                if (module) {
                    return module;
                } else {
                    throw new Error(
                        `Can not load engine module: ${request}. Valid engine modules are: ${Object.keys(EngineLoader.engineModules).join(',')}`,
                    );
                }
            } else {
                // @ts-ignore

                return vendorLoad.apply(this, arguments);
            }
        };
    }

    public static async requiredModules(modules: string[]) {
        if (!this.loader) {
            throw new Error(`Failed to load engine module ${modules.join(',')}. ` + 'Loader has not been initialized. engineLoader.init.');
        }

        for (const module of modules) {
            try {
                EngineLoader.engineModules[module] = await this.loader!.import(module);
            } catch (e) {
                console.error(`Failed to load engine module: ${module}  e: ${e}`);
            }
        }
    }

    public static async importModule(module: string) {
        if (!this.loader) {
            throw new Error(`Failed to load engine module ${module}. ` + 'Loader has not been initialized. engineLoader.init.');
        }

        return await this.loader.import(module);
    }
}
