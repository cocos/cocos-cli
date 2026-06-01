import { EventEmitter } from 'events';
import { newConsole } from '../../base/console';
import { BaseConfiguration, IBaseConfiguration } from './config';
import { ConfigurationEventName, TypedEventEmitter } from './interface';
import type {
    ICocosConfigurationMetadataRegistration,
    ICocosConfigurationNode,
    ICocosConfigurationPropertySchema,
} from './metadata';
import * as utils from './utils';

export interface IConfigurationRegistration {
    defaults?: Record<string, any>;
    nodes?: ICocosConfigurationMetadataRegistration;
}

export type ConfigurationRegistryEvents = {
    [ConfigurationEventName.Registry]: [instance: IBaseConfiguration];
    [ConfigurationEventName.UnRegistry]: [instance: IBaseConfiguration];
};

export interface IConfigurationRegistry extends TypedEventEmitter<ConfigurationRegistryEvents> {
    getInstances(): Record<string, IBaseConfiguration>;
    getInstance(moduleName: string): IBaseConfiguration | undefined;

    register(moduleName: string, registration?: IConfigurationRegistration): Promise<IBaseConfiguration>;
    register(moduleName: string, defaultConfig?: Record<string, any>): Promise<IBaseConfiguration>;

    register<T extends IBaseConfiguration>(moduleName: string, instance: T): Promise<T>;
    register<T extends IBaseConfiguration>(moduleName: string, instance: T, registration: IConfigurationRegistration): Promise<T>;

    unregister(moduleName: string): Promise<void>;
    getMetadata(): Promise<ICocosConfigurationNode[]>;
}

function isConfigurationInstance(value: unknown): value is IBaseConfiguration {
    return !!value
        && typeof value === 'object'
        && 'moduleName' in value
        && typeof (value as IBaseConfiguration).get === 'function';
}

function isConfigurationRegistration(value: unknown): value is IConfigurationRegistration {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }

    const keys = Object.keys(value as Record<string, unknown>);
    return keys.length > 0 && keys.every((key) => key === 'defaults' || key === 'nodes');
}

function cloneValue<T>(value: T): T {
    if (Array.isArray(value)) {
        return value.map((item) => cloneValue(item)) as T;
    }

    if (value && typeof value === 'object') {
        const result: Record<string, unknown> = {};
        for (const [key, childValue] of Object.entries(value as Record<string, unknown>)) {
            result[key] = cloneValue(childValue);
        }
        return result as T;
    }

    return value;
}

function getDefaultValueFromPropertySchema(schema: ICocosConfigurationPropertySchema): unknown {
    if (schema.default !== undefined) {
        return cloneValue(schema.default);
    }

    if (schema.type === 'array') {
        return [];
    }

    if (schema.type === 'object') {
        if (!schema.properties || !Object.keys(schema.properties).length) {
            return {};
        }

        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(schema.properties)) {
            const defaultValue = getDefaultValueFromPropertySchema(value);
            if (defaultValue !== undefined) {
                result[key] = defaultValue;
            }
        }
        return result;
    }

    return undefined;
}

function mergeNodes(nodes: ICocosConfigurationNode[] = []): ICocosConfigurationNode[] {
    const merged = new Map<string, ICocosConfigurationNode>();

    for (const node of nodes) {
        const existing = merged.get(node.id);
        if (!existing) {
            merged.set(node.id, {
                ...node,
                properties: { ...node.properties },
            });
            continue;
        }

        merged.set(node.id, {
            ...existing,
            title: node.title || existing.title,
            group: node.group || existing.group,
            order: node.order ?? existing.order,
            properties: {
                ...existing.properties,
                ...node.properties,
            },
        });
    }

    return Array.from(merged.values());
}

async function resolveRegistrationNodes(
    nodes?: ICocosConfigurationMetadataRegistration
): Promise<ICocosConfigurationNode[]> {
    if (!nodes) {
        return [];
    }

    const resolved = typeof nodes === 'function'
        ? await nodes()
        : nodes;

    return mergeNodes(resolved);
}

function mergeNodeRegistrations(
    previous?: ICocosConfigurationMetadataRegistration,
    next?: ICocosConfigurationMetadataRegistration
): ICocosConfigurationMetadataRegistration | undefined {
    if (!previous) {
        return next;
    }

    if (!next) {
        return previous;
    }

    return async () => {
        const [previousNodes, nextNodes] = await Promise.all([
            resolveRegistrationNodes(previous),
            resolveRegistrationNodes(next),
        ]);
        return mergeNodes([
            ...previousNodes,
            ...nextNodes,
        ]);
    };
}

function sortNodes(nodes: ICocosConfigurationNode[]): ICocosConfigurationNode[] {
    return [...nodes].sort((left, right) => {
        if (left.order === undefined && right.order === undefined) {
            return left.id.localeCompare(right.id);
        }

        if (left.order === undefined) {
            return 1;
        }

        if (right.order === undefined) {
            return -1;
        }

        if (left.order === right.order) {
            return left.id.localeCompare(right.id);
        }

        return left.order - right.order;
    });
}

export class ConfigurationRegistry extends EventEmitter implements IConfigurationRegistry {
    private instances: Record<string, IBaseConfiguration> = {};
    private registrations: Record<string, IConfigurationRegistration> = {};

    public on<K extends keyof ConfigurationRegistryEvents>(eventName: K, listener: (...args: ConfigurationRegistryEvents[K]) => void): this;
    public on(eventName: string | symbol, listener: (...args: any[]) => void): this {
        return super.on(eventName, listener);
    }

    public off<K extends keyof ConfigurationRegistryEvents>(eventName: K, listener: (...args: ConfigurationRegistryEvents[K]) => void): this;
    public off(eventName: string | symbol, listener: (...args: any[]) => void): this {
        return super.off(eventName, listener);
    }

    public once<K extends keyof ConfigurationRegistryEvents>(eventName: K, listener: (...args: ConfigurationRegistryEvents[K]) => void): this;
    public once(eventName: string | symbol, listener: (...args: any[]) => void): this {
        return super.once(eventName, listener);
    }

    public emit<K extends keyof ConfigurationRegistryEvents>(eventName: K, ...args: ConfigurationRegistryEvents[K]): boolean;
    public emit(eventName: string | symbol, ...args: any[]): boolean {
        return super.emit(eventName, ...args);
    }

    public getInstances(): Record<string, IBaseConfiguration> {
        return this.instances;
    }

    public getInstance(moduleName: string): IBaseConfiguration | undefined {
        const instance = this.instances[moduleName];
        if (!instance) {
            console.warn(`[Configuration] 获取配置实例错误，${moduleName} 未注册配置。`);
            return undefined;
        }
        return instance;
    }

    public async register(moduleName: string, registration?: IConfigurationRegistration): Promise<IBaseConfiguration>;
    public async register(moduleName: string, defaultConfig?: Record<string, any>): Promise<IBaseConfiguration>;

    public async register<T extends IBaseConfiguration>(moduleName: string, instance: T): Promise<T>;
    public async register<T extends IBaseConfiguration>(moduleName: string, instance: T, registration: IConfigurationRegistration): Promise<T>;

    public async register<T extends IBaseConfiguration>(
        moduleName: string,
        configOrInstanceOrRegistration?: Record<string, any> | IConfigurationRegistration | T | null,
        registrationArg?: IConfigurationRegistration
    ): Promise<IBaseConfiguration | T> {
        if (!utils.isValidConfigKey(moduleName)) {
            throw new Error('[Configuration] 注册配置失败：模块名不能为空。');
        }

        const {
            defaultConfig,
            instance,
            registration,
        } = this.parseRegisterArguments(moduleName, configOrInstanceOrRegistration, registrationArg);

        if (registration) {
            this.registrations[moduleName] = this.mergeRegistration(this.registrations[moduleName], registration);
        }

        const resolvedDefaults = await this.resolveDefaultConfig(
            moduleName,
            defaultConfig,
            this.registrations[moduleName]
        );

        const existingInstance = this.instances[moduleName];
        if (existingInstance) {
            if (resolvedDefaults !== undefined) {
                existingInstance.mergeDefaultConfig(resolvedDefaults);
            }

            if (instance && existingInstance !== instance) {
                newConsole.warn(`[Configuration] 配置项 "${moduleName}" 已存在，跳过注册。`);
            }

            return existingInstance as IBaseConfiguration | T;
        }

        const nextInstance = instance ?? new BaseConfiguration(moduleName);
        if (resolvedDefaults !== undefined) {
            nextInstance.mergeDefaultConfig(resolvedDefaults);
        }

        this.instances[moduleName] = nextInstance;
        this.emit(ConfigurationEventName.Registry, nextInstance);
        return nextInstance as IBaseConfiguration | T;
    }

    public async unregister(moduleName: string): Promise<void> {
        const instance = this.instances[moduleName];
        this.emit(ConfigurationEventName.UnRegistry, instance);
        delete this.instances[moduleName];
        delete this.registrations[moduleName];
    }

    public async getMetadata(): Promise<ICocosConfigurationNode[]> {
        const aggregated: ICocosConfigurationNode[] = [];

        for (const moduleName of Object.keys(this.instances)) {
            const registration = this.registrations[moduleName];
            const nodes = await resolveRegistrationNodes(registration?.nodes);
            if (!nodes.length) {
                continue;
            }

            aggregated.push(...nodes);
        }

        return sortNodes(aggregated);
    }

    private parseRegisterArguments(
        moduleName: string,
        configOrInstanceOrRegistration?: Record<string, any> | IConfigurationRegistration | IBaseConfiguration | null,
        registrationArg?: IConfigurationRegistration
    ): {
        defaultConfig?: Record<string, any>;
        instance?: IBaseConfiguration;
        registration?: IConfigurationRegistration;
    } {
        let registration = registrationArg;
        let defaultConfig: Record<string, any> | undefined;
        let instance: IBaseConfiguration | undefined;

        if (isConfigurationInstance(configOrInstanceOrRegistration)) {
            instance = configOrInstanceOrRegistration;
            if (instance.moduleName !== moduleName) {
                throw new Error(
                    `[Configuration] 注册配置失败：配置实例的模块名 "${instance.moduleName}" 与注册的模块名 "${moduleName}" 不匹配。`
                );
            }
        } else if (isConfigurationRegistration(configOrInstanceOrRegistration)) {
            registration = configOrInstanceOrRegistration;
        } else if (configOrInstanceOrRegistration && typeof configOrInstanceOrRegistration === 'object') {
            defaultConfig = configOrInstanceOrRegistration as Record<string, any>;
        }

        return {
            defaultConfig,
            instance,
            registration,
        };
    }

    private async resolveDefaultConfig(
        moduleName: string,
        defaultConfig?: Record<string, any>,
        registration?: IConfigurationRegistration
    ): Promise<Record<string, any> | undefined> {
        let merged: Record<string, any> = {};
        let hasDefaults = false;

        const nodeDefaults = this.deriveDefaultsFromNodes(
            moduleName,
            await resolveRegistrationNodes(registration?.nodes)
        );
        if (Object.keys(nodeDefaults).length > 0) {
            merged = utils.deepMerge(merged, nodeDefaults);
            hasDefaults = true;
        }

        if (registration?.defaults !== undefined) {
            merged = utils.deepMerge(merged, cloneValue(registration.defaults));
            hasDefaults = true;
        }

        if (defaultConfig !== undefined) {
            merged = utils.deepMerge(merged, cloneValue(defaultConfig));
            hasDefaults = true;
        }

        return hasDefaults ? merged : undefined;
    }

    private mergeRegistration(
        previous: IConfigurationRegistration | undefined,
        next: IConfigurationRegistration
    ): IConfigurationRegistration {
        const merged: IConfigurationRegistration = {};

        if (previous?.defaults !== undefined || next.defaults !== undefined) {
            merged.defaults = next.defaults === undefined
                ? cloneValue(previous?.defaults ?? {})
                : previous?.defaults === undefined
                    ? cloneValue(next.defaults)
                    : utils.deepMerge(cloneValue(previous.defaults), cloneValue(next.defaults));
        }

        const nodes = mergeNodeRegistrations(previous?.nodes, next.nodes);
        if (nodes) {
            merged.nodes = nodes;
        }

        return merged;
    }

    private deriveDefaultsFromNodes(
        moduleName: string,
        nodes?: ICocosConfigurationNode[]
    ): Record<string, any> {
        const defaults: Record<string, any> = {};
        if (!nodes?.length) {
            return defaults;
        }

        for (const node of nodes) {
            for (const [key, schema] of Object.entries(node.properties)) {
                const relativeKey = key.startsWith(`${moduleName}.`)
                    ? key.slice(moduleName.length + 1)
                    : key;
                if (!relativeKey) {
                    continue;
                }

                const defaultValue = getDefaultValueFromPropertySchema(schema);
                if (defaultValue === undefined) {
                    continue;
                }

                utils.setByDotPath(defaults, relativeKey, defaultValue);
            }
        }

        return defaults;
    }
}

export const configurationRegistry = new ConfigurationRegistry();
