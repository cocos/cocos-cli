import { configurationRegistry, ConfigurationScope, IBaseConfiguration } from '../configuration';

export interface ISceneConfig {
    /**
     * 是否循环
     */
    tick: boolean;
}

class SceneConfig {
    private defaultConfig: ISceneConfig = {
        tick: false,
    };

    private configInstance!: IBaseConfiguration;

    async init() {
        this.configInstance = await configurationRegistry.register('scene', this.defaultConfig);
    }

    public get<T>(path?: string, scope?: ConfigurationScope): Promise<T> {
        return this.configInstance.get(path, scope);
    }

    public set(path: string, value: any, scope?: ConfigurationScope) {
        return this.configInstance.set(path, value, scope);
    }
}

export const sceneConfigInstance = new SceneConfig();