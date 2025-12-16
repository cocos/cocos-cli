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

    private configInstance: IBaseConfiguration | null = null;
    private initPromise: Promise<void> | null = null;

    async init() {
        if (this.initPromise) {
            return this.initPromise;
        }
        this.initPromise = this._doInit();
        return this.initPromise;
    }

    private async _doInit() {
        this.configInstance = await configurationRegistry.register('scene', this.defaultConfig);
    }

    private async ensureInitialized(): Promise<IBaseConfiguration> {
        if (!this.configInstance) {
            if (this.initPromise) {
                await this.initPromise;
            } else {
                throw new Error('[SceneConfig] Configuration not initialized. Call init() first.');
            }
        }
        return this.configInstance!;
    }

    public async get<T>(path?: string, scope?: ConfigurationScope): Promise<T> {
        const config = await this.ensureInitialized();
        return config.get(path, scope);
    }

    public async set(path: string, value: any, scope?: ConfigurationScope) {
        const config = await this.ensureInitialized();
        return config.set(path, value, scope);
    }
}

export const sceneConfigInstance = new SceneConfig();