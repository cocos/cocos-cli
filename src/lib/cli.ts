import type { IServiceManager } from '../core/scene/scene-process/service/interfaces';
import type { GlobalEventManager } from '../core/scene/scene-process/service/core/global-events';

export interface ICLI {
    Scene: IServiceManager;
    SceneEvents: GlobalEventManager;
}

export type { IServiceManager, GlobalEventManager };
