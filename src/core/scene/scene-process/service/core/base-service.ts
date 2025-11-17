import type { Node, Component } from 'cc';
import { ServiceEvents } from './global-events';
import type { IChangeNodeOptions } from '../../../common';

export interface IServiceEvents {
    // Editor events
    onEditorOpened?(): void;
    onEditorReload?(): void;
    onEditorClosed?(): void;
    onEditorSaved?(): void;

    // Node events
    onNodeBeforeChanged?(node: Node): void;
    onBeforeRemoveNode?(node: Node): void;
    onBeforeAddNode?(node: Node): void;
    onNodeChanged?(node: Node, opts: IChangeNodeOptions): void;
    onBeforeNodeAdded?(node: Node): void;
    onAddNode?(node: Node): void;
    onRemoveNode?(node: Node): void;
    onNodeAdded?(node: Node): void;
    onNodeRemoved?(node: Node): void;

    // Component events
    onAddComponent?(comp: Component): void;
    onRemoveComponent?(comp: Component): void;
    onSetPropertyComponent?(comp: Component): void;
    onComponentAdded?(comp: Component): void;
    onComponentRemoved?(comp: Component): void;
    onBeforeRemoveComponent?(comp: Component): void;

    // Asset events
    onAssetDeleted?(uuid: string): void;
    onAssetChanged?(uuid: string): void;
    onAssetRefreshed?(uuid: string): void;

    // Script events
    onScriptExecutionFinished?(): void;
}

export class BaseService<TEvents extends Record<string, any>> {
    /**
     * 触发事件
     * @param event 事件名称
     * @param args 事件参数（根据事件类型自动推断）
     */
    protected emit<K extends keyof TEvents>(
        event: K,
        ...args: TEvents[K]
    ) {
        ServiceEvents.emit(event as string, ...args);
    }

    /**
     * 跨进程广播事件
     */
    broadcast<K extends keyof TEvents>(
        event: K,
        ...args: TEvents[K]
    ): void {
        ServiceEvents.broadcast(event as string, ...args);
    }

    /**
     * 监听事件
     * @param event 事件名称
     * @param listener 事件监听器
     */
    protected on<K extends keyof TEvents>(
        event: K,
        listener: TEvents[K] extends void 
            ? () => void 
            : (payload: TEvents[K]) => void
    ) {
        ServiceEvents.on(event as string, listener);
    }

    /**
     * 一次性监听事件
     * @param event 事件名称
     * @param listener 事件监听器
     */
    protected once<K extends keyof TEvents>(
        event: K,
        listener: TEvents[K] extends void 
            ? () => void 
            : (payload: TEvents[K]) => void
    ) {
        ServiceEvents.once(event as string, listener);
    }

    /**
     * 移除事件监听器
     * @param event 事件名称
     * @param listener 事件监听器
     */
    protected off<K extends keyof TEvents>(
        event: K,
        listener: TEvents[K] extends void 
            ? () => void 
            : (payload: TEvents[K]) => void
    ) {
        ServiceEvents.off(event as string, listener);
    }

    /**
     * 清除事件监听器
     * @param event 事件名称，如果不提供则清除所有
     */
    protected clear(event?: keyof TEvents) {
        ServiceEvents.clear(event as string);
    }
}
