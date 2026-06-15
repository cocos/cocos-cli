import type { Component } from 'cc';

export interface ISceneViewService {
    init(): void;
    initFromConfig(): Promise<void>;
    saveConfig(): Promise<void>;
    setSceneLightOn(enable: boolean): void;
    querySceneLightOn(): boolean;
    onEditorOpened(): void;
    onEditorClosed(): void;
    onComponentAdded(comp: Component): void;
    onComponentRemoved(comp: Component): void;
}

export type IPublicSceneViewService = Pick<ISceneViewService,
    'setSceneLightOn' | 'querySceneLightOn'
>;

export interface ISceneViewEvents {
    'scene-view:light-changed': [isOn: boolean];
    'scene-view:visibility-changed': [visible: boolean];
}
