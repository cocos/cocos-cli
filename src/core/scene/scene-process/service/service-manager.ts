import { getServiceAll, IServiceEvents, ServiceEvents } from './core';
import { IEditorEvents, INodeEvents, IComponentEvents, IScriptEvents, IAssetEvents, ISelectionEvents } from '../../common';

type AllEvents = IEditorEvents & INodeEvents & IComponentEvents & IScriptEvents & IAssetEvents & ISelectionEvents;

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
    'component:before-add-component': 'onBeforeComponentAdded',
    // Script 事件
    'script:execution-finished': 'onScriptExecutionFinished',

    // Selection 事件
    'selection:select': 'onSelectionSelect',
    'selection:unselect': 'onSelectionUnselect',
    'selection:clear': 'onSelectionClear',
} as const;

type ServiceEventType = typeof SERVICE_EVENTS_MAP[keyof typeof SERVICE_EVENTS_MAP];

export class ServiceManager {
    private initialized = false;
    private eventHandlers = new Map<string, (...args: any[]) => void>();
    private serverUrl: string = '';

    initialize(serverUrl: string) {
        if (this.initialized) return;
        this.initialized = true;
        this.serverUrl = serverUrl;
        this.unregisterAutoForwardEvents();
        this.registerAutoForwardEvents();
    }

    getServerUrl() {
        return this.serverUrl;
    }

    /**
     * Camera/Gizmo 依赖的编辑器内置 effect UUID
     */
    private static readonly EDITOR_EFFECT_UUIDS = [
        'ba35f02e-a81c-464c-bfc5-c788328da667', // internal/editor/grid
        'cb2c332a-fa5e-4235-a129-f011634bb7ad', // internal/editor/grid-2d
        '4736e978-c8fa-449f-9cf6-fe0158ded9d7', // internal/editor/grid-stroke
        '9d6c6bde-2fe2-44ee-883b-909608948b04', // internal/editor/gizmo
        'e4e4cb19-8dd2-450d-ad20-1a818263b8d3', // internal/editor/light
        '084eba38-5336-4444-8c8c-aebb75d5c627', // internal/editor/box-height-light
    ];

    /**
     * 遍历所有已注册的 Service，依次调用 init()（跳过 Engine，它需要单独初始化）
     */
    async initAllServices() {
        await this.loadEditorEffects();
        for (const service of getServiceAll()) {
            const name = service.constructor.name;
            if (name === 'EngineService') continue;
            if (typeof service.init === 'function') {
                try {
                    service.init();
                } catch (e) {
                    console.warn(`[ServiceManager] init failed on ${name}:`, e);
                }
            }
        }
    }

    private loadEditorEffects(): Promise<void> {
        return new Promise((resolve) => {
            try {
                cc.assetManager.loadAny(ServiceManager.EDITOR_EFFECT_UUIDS, (err: any) => {
                    if (err) {
                        console.warn('[ServiceManager] Failed to load editor effects:', err);
                    }
                    resolve();
                });
            } catch (e) {
                console.warn('[ServiceManager] loadEditorEffects error:', e);
                resolve();
            }
        });
    }

    private registerAutoForwardEvents() {
        Object.entries(SERVICE_EVENTS_MAP).forEach(([eventType, methodName]) => {
            const handler = (...args: any[]) => {
                for (const service of getServiceAll()) {
                    if (methodName in service && typeof service[methodName] === 'function') {
                        try {
                            service[methodName].apply(service, args);
                        } catch (e) {
                            console.warn(`[ServiceManager] ${methodName} failed on ${service.constructor.name}:`, e);
                        }
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
