import { getServiceAll, IServiceEvents, ServiceEvents } from './core';
import { InternalServiceEvents } from './core/internal-events';
import { IEditorEvents, INodeEvents, IComponentEvents, IScriptEvents, IAssetEvents, ISelectionEvents } from '../../common';
import { messageManager } from './message';

type AllEvents = IEditorEvents & INodeEvents & IComponentEvents & IScriptEvents & IAssetEvents & ISelectionEvents;

// 排除事件
type FilteredEvents = Exclude<keyof AllEvents, 'asset-refresh'>;

type EventMap = {
    [K in FilteredEvents]: keyof IServiceEvents;
};

// 仅需 messageManager 转发、无服务方法扇出的事件
const MESSAGE_ONLY_EVENTS = [
    'dirty:changed',
    'gizmo:coordinate-changed',
    'gizmo:pivot-changed',
    'gizmo:view-mode-changed',
    'gizmo:tool-changed',
    'scene:dimension-changed',
    'camera:mode-change',
    'camera:projection-changed',
    'camera:fov-changed',
    'scene-view:visibility-changed',
    'scene-view:light-changed',
] as const;

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
    'component:set-property': 'onSetPropertyComponent',
    'component:before-add-component': 'onBeforeAddComponent',
    'component:before-remove-component': 'onBeforeRemoveComponent',
    // Script 事件
    'script:execution-finished': 'onScriptExecutionFinished',

    // Selection 事件
    'selection:select': 'onSelectionSelect',
    'selection:unselect': 'onSelectionUnselect',
    'selection:clear': 'onSelectionClear',
} as const;

const INTERNAL_SERVICE_EVENTS_MAP = {
    [InternalServiceEvents.EditorReloadClose]: 'onEditorClosed',
    [InternalServiceEvents.EditorReloadOpen]: 'onEditorOpened',
    [InternalServiceEvents.EditorDisposed]: 'onEditorDisposed',
} as const;

// 内部生命周期包含 onEditorDisposed，但它只在场景进程内使用，
// 不放进 IServiceEvents，避免变成对外服务类型的一部分。
type ServiceMethodName = keyof IServiceEvents | 'onEditorDisposed';

// 服务是动态注册的，这里只给自动转发逻辑一个本地宽类型，
// 不强迫所有内部生命周期钩子进入公共服务类型。
type AutoForwardService = {
    constructor: { name: string };
} & Partial<Record<ServiceMethodName, (...args: any[]) => void>>;

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
        // 公开编辑器生命周期保持原有行为，会继续发给外部监听方。
        Object.entries(SERVICE_EVENTS_MAP).forEach(([eventType, methodName]) => {
            this.registerAutoForwardEvent(eventType, methodName);
        });
        // 重载不是公开的关闭/打开；这里只用内部事件复用服务内容卸载/挂载钩子，
        // 让服务暂停监听并重新绑定引擎重建后的对象，同时不广播 editor:close/open。
        Object.entries(INTERNAL_SERVICE_EVENTS_MAP).forEach(([eventType, methodName]) => {
            this.registerAutoForwardEvent(eventType, methodName, false);
        });
        // 仅需 messageManager 转发的事件（无服务方法扇出）
        this.registerMessageOnlyForwardEvents();
    }

    private registerAutoForwardEvent(eventType: string, methodName: ServiceMethodName, broadcastToMessage = true) {
        const isNodeChange = eventType === 'node:change';
        const handler = (...args: any[]) => {
            for (const service of getServiceAll() as AutoForwardService[]) {
                const serviceHandler = service[methodName];
                if (typeof serviceHandler === 'function') {
                    try {
                        serviceHandler.apply(service, args);
                    } catch (e) {
                        console.warn(`[ServiceManager] ${methodName} failed on ${service.constructor.name}:`, e);
                    }
                }
            }
            if (!broadcastToMessage) return;
            if (isNodeChange) {
                messageManager.broadcastNodeChangeMsg(...args);
            } else {
                messageManager.broadcast(eventType, ...args);
            }
        };

        ServiceEvents.on(eventType, handler);
        this.eventHandlers.set(eventType, handler);
    }

    private registerMessageOnlyForwardEvents() {
        for (const eventType of MESSAGE_ONLY_EVENTS) {
            const handler = (...args: any[]) => {
                messageManager.broadcast(eventType, ...args);
            };
            ServiceEvents.on(eventType, handler);
            this.eventHandlers.set(eventType, handler);
        }
    }

    private unregisterAutoForwardEvents() {
        this.eventHandlers.forEach((handler, eventType) => {
            ServiceEvents.off(eventType, handler);
        });
        this.eventHandlers.clear();
    }
}

export const serviceManager = new ServiceManager();
