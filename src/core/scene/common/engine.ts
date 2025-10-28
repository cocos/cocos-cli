
export interface IEngineEvents {
    'engine:update': void;
    'engine:ticked': void;
}

export interface IPublicEngineService extends IEngineService {}

export interface IEngineService {
    /**
     * 初始化引擎服务，目前是暂时引擎 mainLoop
     */
    init(): Promise<void>;

    /**
     * 让引擎执行一帧
     */
    repaintInEditMode(): Promise<void>;
}
