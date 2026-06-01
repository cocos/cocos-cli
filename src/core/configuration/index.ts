import { IBaseConfiguration } from './script/config';
import { ConfigurationEventName, ConfigurationScope, MessageType } from './script/interface';
import { configurationRegistry } from './script/registry';
import { configurationManager } from './script/manager';

export * from './migration';

export {
    ConfigurationEventName,
    MessageType,
    ConfigurationScope,
    IBaseConfiguration,
    configurationRegistry,
    configurationManager,
};

export type { AnyArgs, EventEmitterMethods, IConfiguration, TypedEventEmitter } from './script/interface';
export { ICocosConfigurationNode, ICocosConfigurationPropertySchema } from './script/metadata';
