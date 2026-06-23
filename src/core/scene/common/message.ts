import type { IEditorEvents } from './editor';
import type { INodeEvents } from './node';
import type { IComponentEvents } from './component';
import type { IScriptEvents } from './script';
import type { IAssetEvents } from './asset';
import type { ISelectionEvents } from './selection';
import type { IGizmoEvents } from './gizmo';
import type { ICameraEvents } from './camera';
import type { ISceneViewEvents } from './scene-view';
import type { IUndoEvents } from './undo';

/**
 * messageManager 不在已有接口中的补充事件
 */
export interface ISceneEvents {
    'scene:dimension-changed': [is2D: boolean];
}

/**
 * messageManager 支持的全量事件类型
 *
 * 组合所有已有的事件接口，开发者调用 messageManager.on() 时
 * 可以获得事件名自动补全和参数类型推导。
 */
export interface IMessageManagerEvents extends
    IEditorEvents,
    INodeEvents,
    IComponentEvents,
    IScriptEvents,
    Omit<IAssetEvents, 'asset-refresh'>,
    ISelectionEvents,
    IGizmoEvents,
    ICameraEvents,
    ISceneViewEvents,
    IUndoEvents,
    ISceneEvents {}
