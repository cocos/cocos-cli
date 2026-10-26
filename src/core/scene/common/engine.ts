import type { IServiceEvents } from '../scene-process/service/core';

export interface ICustomLayerConfig {
    name: string;
    value: number;
}

export interface IEngineEvents {
    'engine:update': [];
    'engine:ticked': [];
}

export interface IPublicEngineService extends Omit<IEngineService,
    'initCustomLayer' |
    'pause' | 
    'resume' |
    'stopTick' |
    'enterAnimationMode' |
    'exitAnimationMode' |
    keyof IServiceEvents
> {}

export interface IEngineService extends IServiceEvents {
    /**
     * 初始化引擎服务，目前是暂时引擎 mainLoop
     */
    init(): Promise<void>;

    /**
     * 让引擎执行一帧
     */
    repaintInEditMode(): Promise<void>;

    pause(): void;
    resume(): void;
    /**
     * 停止编辑器 tick 循环（PreviewPlay.stop 等销毁路径使用；不改变 _paused 语义的轻量收敛）。
     */
    stopTick(): void;
    /**
     * 初始化自定义 Layer 配置
     */
    initCustomLayer(layers?: ICustomLayerConfig[]): Promise<void>;

    enterAnimationMode(): void;

    exitAnimationMode(): void;
}
