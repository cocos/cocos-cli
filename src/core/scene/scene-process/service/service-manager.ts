import { getServiceAll, IServiceEvents, ServiceEvents } from './core';
import { IEditorEvents, INodeEvents, IComponentEvents, IScriptEvents, IAssetEvents } from '../../common';

type AllEvents = IEditorEvents & INodeEvents & IComponentEvents & IScriptEvents & IAssetEvents;

// 排除事件
type FilteredEvents = Exclude<keyof AllEvents, 'asset-refresh'>;

type EventMap = {
    [K in FilteredEvents]: keyof IServiceEvents;
};

// 定义事件分组映射
const SERVICE_EVENTS_MAP: EventMap = {
    // Editor 事件
    'editor:open': 'onEditorOpened',
    'editor:close': 'onEditorClosed',
    'editor:reload': 'onEditorReload',
    'editor:save': 'onEditorSaved',

    // Node 事件
    'node:add': 'onAddNode',
    'node:remove': 'onRemoveNode',
    'node:before-remove': 'onBeforeRemoveNode',
    'node:before-add': 'onBeforeAddNode',
    'node:before-change': 'onNodeBeforeChanged',
    'node:change': 'onNodeChanged',
    'node:added': 'onNodeAdded',
    'node:removed': 'onNodeRemoved',

    // Asset 事件
    'asset:change': 'onAssetChanged',
    'asset:deleted': 'onAssetDeleted',

    // Component 事件
    'component:add': 'onAddComponent',
    'component:remove': 'onRemoveComponent',
    'component:added': 'onComponentAdded',
    'component:removed': 'onComponentRemoved',
    'component:before-remove': 'onBeforeRemoveComponent',
    'component:set-property': 'onSetPropertyComponent',

    // Script 事件
    'script:execution-finished': 'onScriptExecutionFinished',
} as const;

type ServiceEventType = typeof SERVICE_EVENTS_MAP[keyof typeof SERVICE_EVENTS_MAP];

export class ServiceManager {
    private initialized = false;
    private eventHandlers = new Map<string, (...args: any[]) => void>();

    initialize() {
        if (this.initialized) return;
        this.initialized = true;
        this.unregisterAutoForwardEvents();
        this.registerAutoForwardEvents();
    }

    private registerAutoForwardEvents() {
        Object.entries(SERVICE_EVENTS_MAP).forEach(([eventType, methodName]) => {
            const handler = (...args: any[]) => {
                for (const service of getServiceAll()) {
                    if (methodName in service && typeof service[methodName] === 'function') {
                        service[methodName].apply(service, args);
                    }
                }
            };

            ServiceEvents.on(eventType as ServiceEventType, handler);
            this.eventHandlers.set(eventType as ServiceEventType, handler);
        });
    }

    private unregisterAutoForwardEvents() {
        this.eventHandlers.forEach((handler, eventType) => {
            ServiceEvents.off(eventType, handler);
        });
        this.eventHandlers.clear();
    }
}

export const serviceManager = new ServiceManager();
