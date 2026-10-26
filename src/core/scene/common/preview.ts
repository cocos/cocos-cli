export interface IPreviewInstance {
    onMouseDown(event: any): void;
    onMouseMove(event: any): void;
    onMouseUp(event: any): void;
    onMouseWheel(event: any): void;
    viewToggle(): void;
    is2DView(): boolean;
    resetCameraView(): void;
    hide(): void;
}

export interface IMaterialPreviewInstance extends IPreviewInstance {
    switchPrimitive(type: string): void;
    setLightEnable(enabled: boolean): void;
}

export interface ISpinePreviewInstance extends IPreviewInstance {
    play(): void;
    pause(): void;
    stop(): void;
    setSkinIndex(index: number): void;
    setAnimationIndex(index: number): void;
    close(): void;
}

export interface IPreviewService extends IMotionPreviewService {
    open(uuid: string): Promise<IPreviewInstance | null>;
    generateThumbnail(uuid: string, assetType: string, width?: number, height?: number): Promise<any>;
}

/**
 * 通用 Motion 预览描述（中立、可序列化）。
 * 由业务方（如 AnimationGraph 扩展）翻译自各自的资产数据后传入；
 * scene 侧只理解本结构，不理解任何业务资产类型。
 */
export type MotionPreviewDescNode =
    | { kind: 'clip'; clipUuid: string | null }
    | {
        kind: 'blend-1d';
        variable: string | null;
        value: number;
        children: { motion: MotionPreviewDescNode | null; threshold: number }[];
    }
    | {
        kind: 'blend-2d';
        variableX: string | null;
        valueX: number;
        variableY: string | null;
        valueY: number;
        algorithm?: number;
        children: { motion: MotionPreviewDescNode | null; threshold: { x: number; y: number } }[];
    }
    | {
        kind: 'blend-direct';
        children: { motion: MotionPreviewDescNode | null; weight: number }[];
    };

export interface MotionPreviewVariable {
    name: string;
    value: number | null;
}

export interface MotionPreviewDesc {
    motion: MotionPreviewDescNode | null;
    variables: MotionPreviewVariable[];
}

/**
 * 通用 Motion 预览子能力（scene-process Preview 服务按同名方法透传）。
 * 入参均为中立描述，不携带业务资产寻址信息。
 */
export interface IMotionPreviewService {
    showMotion(desc: MotionPreviewDesc): Promise<boolean>;
    hideMotion(): Promise<void>;
    setMotionModel(uuid: string): Promise<void>;
    setMotionTime(time: number): Promise<void>;
    playMotion(): Promise<void>;
    pauseMotion(): Promise<void>;
    stopMotion(): Promise<void>;
    setMotionVariable(name: string, value: number): Promise<void>;
    setMotionParameter(axis: 'value' | 'x' | 'y', value: number): Promise<void>;
    getMotionTimelineStats(): Promise<{ timeLineLength: number } | null>;
    isMotionActive(): Promise<boolean>;
    queryMotionImage(info: { width: number; height: number }): Promise<unknown>;
    onMotionMouseDown(action: { x: number; y: number; button: number }): Promise<void>;
    onMotionMouseMove(action: { movementX: number; movementY: number }): Promise<void>;
    onMotionMouseUp(action: { x: number; y: number }): Promise<void>;
    onMotionMouseWheel(action: { wheelDeltaY: number; wheelDeltaX: number }): Promise<void>;
}

export type IPublicPreviewService = Pick<IPreviewService,
    'open' | 'generateThumbnail'
    | 'showMotion' | 'hideMotion'
    | 'setMotionModel' | 'setMotionTime'
    | 'playMotion' | 'pauseMotion' | 'stopMotion'
    | 'setMotionVariable' | 'isMotionActive'
    | 'setMotionParameter'
    | 'getMotionTimelineStats'
    | 'queryMotionImage'
    | 'onMotionMouseDown' | 'onMotionMouseMove'
    | 'onMotionMouseUp' | 'onMotionMouseWheel'
>;

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface IPreviewEvents {
}
