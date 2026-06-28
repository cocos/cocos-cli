import type { IServiceEvents } from '../scene-process/service/core';
import type { INodeTreeItem } from './node';

/** 动画编辑器当前所处的场景模式。 */
export type AnimationMode = 'general' | 'prefab' | 'animation' | 'preview' | 'unknown';
/** 当前编辑器类型。 */
export type AnimationEditorType = 'scene' | 'prefab' | 'unknown';
/** 当前 clip 的播放状态。 */
export type AnimationPlayState = 'stop' | 'playing' | 'pause';
/** changePlayState 支持的播放控制操作。 */
export type AnimationPlayOperation = 'play' | 'pause' | 'resume' | 'stop';
/** animation 事件来源，用于 UI 判断是否需要刷新状态、时间轴或 clip 数据。 */
export type AnimationEventReason =
    | 'enter'
    | 'exit'
    | 'set-time'
    | 'play-state'
    | 'change-clip'
    | 'operation'
    | 'undo-redo'
    | 'asset-refresh';

/**
 * Animation API 中可通过 RPC 传递的值。
 * 用于事件参数、关键帧值、属性采样值等不固定结构的数据。
 */
export type IAnimationValue = string | number | boolean | null | undefined | IAnimationValue[] | {
    [key: string]: IAnimationValue;
};

/**
 * 可编辑属性的类型描述，value 为 Cocos 类型名，例如 `cc.Vec3`、`cc.Boolean`。
 */
export interface IAnimationPropertyType {
    value: string;
    extends?: string[];
}

/**
 * 曲线关键帧的属性值 dump。
 */
export interface IAnimationKeyValueDump {
    value: IAnimationValue;
    default?: IAnimationValue;
    extends?: string[];
    readonly?: boolean;
    type?: string;
    visible?: boolean;
}

/**
 * 曲线关键帧的插值和切线信息。
 */
export interface IAnimationCurveKeyData {
    inTangent?: number;
    inTangentWeight?: number;
    outTangent?: number;
    outTangentWeight?: number;
    interpMode?: number;
    tangentWeightMode?: number;
    tangentMode?: number;
    easingMethod?: number;
    broken?: boolean;
}

/**
 * 普通属性曲线中的关键帧。frame 使用 clip 的采样帧号，不是秒。
 */
export interface IAnimationCurveKeyDump extends IAnimationCurveKeyData {
    frame: number;
    dump: IAnimationKeyValueDump;
    imgUrl?: string;
}

/**
 * 分量曲线 dump。用于表达 Vec/Color/Size 等复合属性的真实 per-channel keyframe。
 */
export interface IAnimationCurveChannelDump {
    /** 分量 key，例如 `x`、`y`、`z`、`r`、`width`。 */
    key: string;
    displayName?: string;
    type?: IAnimationPropertyType;
    keyframes: IAnimationCurveKeyDump[];
}

/**
 * queryClip 返回的普通属性曲线 dump。
 */
export interface IAnimationCurveDump {
    /** 相对动画 root 的节点路径。 */
    nodePath: string;
    /** 属性 key，例如 `position` 或 `cc.Sprite.color`。 */
    key: string;
    /** 曲线关键帧；没有可编辑关键帧时可能为 null。 */
    keyframes: IAnimationCurveKeyDump[] | null;
    /** 复合属性的真实分量曲线；旧 UI 可继续使用上面的聚合 keyframes。 */
    channels?: IAnimationCurveChannelDump[];
    category?: string;
    type?: IAnimationPropertyType;
    displayName?: string;
    name?: string;
    comp?: string;
    menuName?: string;
    preExtrap?: number;
    postExtrap?: number;
    isCurveSupport?: boolean;
    parentPropKey?: string;
    partKeys?: string[];
}

/**
 * 定位动画目标节点。
 * 传 rootPath/rootUuid 时直接使用该节点；传 nodePath/nodeUuid 时会向上查找最近的动画 root。
 */
export interface IAnimationTargetOptions {
    /** 目标节点路径。 */
    nodePath?: string;
    /** 目标节点 uuid。 */
    nodeUuid?: string;
    /** 动画 root 节点路径。 */
    rootPath?: string;
    /** 动画 root 节点 uuid。 */
    rootUuid?: string;
}

/**
 * 进入动画编辑 session。
 */
export interface IAnimationEnterOptions {
    /** 动画 root 节点路径。未传时从当前选择推导。 */
    rootPath?: string;
    /** 动画 root 节点 uuid。 */
    rootUuid?: string;
    /** 要编辑的 clip uuid。未传时使用 root 上的默认 clip。 */
    clipUuid?: string;
    /** 退出时是否恢复进入前的 selection，默认 true。 */
    restoreSelectionOnExit?: boolean;
}

/**
 * 退出动画编辑 session。
 */
export interface IAnimationExitOptions {
    /** 退出前是否保存当前 clip。 */
    save?: boolean;
    /** 是否恢复进入前的 selection，默认使用 enter 时的 restoreSelectionOnExit。 */
    restoreSelection?: boolean;
    /** 是否恢复进入动画编辑前采样过的场景状态，默认 true。 */
    restoreSampledSceneState?: boolean;
}

/**
 * 查询当前编辑时间时的 clip 选择。
 */
export interface IAnimationTimeOptions {
    /** clip uuid；未传时使用当前 session 的编辑 clip。 */
    clipUuid?: string;
}

/**
 * 查询 clip dump。
 */
export interface IAnimationQueryClipOptions extends IAnimationTargetOptions {
    /** clip uuid；未传时使用当前 session 或 root 的默认 clip。 */
    clipUuid?: string;
}

/**
 * 查询某一帧的属性采样值。
 */
export interface IAnimationQueryPropertyValueAtFrameOptions {
    /** clip uuid；必须是当前编辑 clip。 */
    clipUuid?: string;
    /** 目标节点路径；未传时使用当前动画 root。 */
    nodePath?: string;
    /** 目标节点 uuid。 */
    nodeUuid?: string;
    /** 属性 key，例如 `position` 或 `cc.Label.string`。 */
    propKey: string;
    /** 要采样的帧号，不是秒。 */
    frame: number;
}

/**
 * 设置当前编辑时间。
 */
export interface IAnimationSetTimeOptions {
    /** 编辑时间，单位为秒。 */
    time: number;
}

/**
 * 控制当前 clip 播放状态。
 */
export interface IAnimationPlayStateOptions {
    /** 播放控制操作。 */
    operate: AnimationPlayOperation;
    /** clip uuid；未传时使用当前 session 的编辑 clip。 */
    clipUuid?: string;
}

/**
 * 切换当前动画编辑 clip。
 */
export interface IAnimationEditClipOptions {
    /** 要切换到的 clip uuid，必须属于当前动画 root。 */
    clipUuid: string;
}

/**
 * 动画 root 查询结果。
 */
export interface IAnimationRootResult {
    rootUuid: string;
    rootPath: string;
}

/**
 * 动画 root 上可编辑的 clip 菜单项。
 */
export interface IAnimationClipMenuItem {
    uuid: string;
    name: string;
}

/**
 * 动画事件。frame 使用采样帧号；保存骨骼 meta 时会按引擎格式写回。
 */
export interface IAnimationEventDump {
    frame: number;
    func: string;
    params: IAnimationValue[];
}

/**
 * Embedded player 中可播放的资源引用。
 */
export type IAnimationEmbeddedPlayable =
    | { type: 'animation-clip'; clip?: string; path?: string }
    | { type: 'particle-system'; path?: string };

/**
 * Embedded player dump。begin/end 使用采样帧号，不是秒。
 */
export interface IAnimationEmbeddedPlayerDump {
    begin: number;
    end: number;
    reconciledSpeed: boolean;
    playable?: IAnimationEmbeddedPlayable;
    group: string;
    displayName?: string;
}

/**
 * Embedded player 分组轨道。
 */
export interface IAnimationEmbeddedPlayerGroup {
    key: string;
    name: string;
    type: string;
}

/**
 * 辅助曲线关键帧。frame 使用采样帧号，value 当前为 RealCurve 数值。
 */
export interface IAnimationAuxiliaryKeyDump extends IAnimationCurveKeyData {
    frame: number;
    value: number;
}

/**
 * 辅助曲线 dump。
 */
export interface IAnimationAuxiliaryCurveDump {
    keyframes: IAnimationAuxiliaryKeyDump[];
    preExtrap: number;
    postExtrap: number;
}

/**
 * queryClip 返回的完整 clip 编辑数据。
 */
export interface IAnimationClipDump {
    name: string;
    /** clip 时长，单位为秒。 */
    duration: number;
    /** 每秒采样帧数。 */
    sample: number;
    /** 播放速度倍率。 */
    speed: number;
    /** Cocos AnimationClip.wrapMode 数值。 */
    wrapMode: number;
    /** 普通属性曲线。 */
    curves: IAnimationCurveDump[];
    /** 动画事件，frame 使用采样帧号。 */
    events: IAnimationEventDump[];
    /** Embedded player 列表，begin/end 使用采样帧号。 */
    embeddedPlayers: IAnimationEmbeddedPlayerDump[];
    /** Embedded player 分组轨道。 */
    embeddedPlayerGroups: IAnimationEmbeddedPlayerGroup[];
    /** 辅助曲线，以曲线名索引。 */
    auxiliaryCurves: Record<string, IAnimationAuxiliaryCurveDump>;
    /** 当前编辑时间，单位为秒。 */
    time: number;
    /** 当前 clip 是否被锁定。 */
    isLock: boolean;
    /** 是否来自骨骼动画资源。 */
    isSkeleton: boolean;
    /** 当前骨骼动画是否使用 baked animation。 */
    useBakedAnimation: boolean;
}

/**
 * 动画 root 和 clip 列表信息。
 */
export interface IAnimationClipsInfo extends IAnimationRootResult {
    clipsMenu: IAnimationClipMenuItem[];
    /** 默认或当前可编辑 clip uuid。 */
    defaultClip: string;
}

/**
 * 打开动画编辑器需要的一次性 root 信息。
 */
export interface IAnimationRootInfo extends IAnimationClipsInfo {
    /** 动画 root 的节点树 dump，对齐 Node service queryNodeTree 返回结构。 */
    nodeTreeDump: INodeTreeItem | null;
    /** 默认或当前可编辑 clip 的 dump。 */
    clipDump: IAnimationClipDump | null;
    /** 当前编辑时间，单位为秒。 */
    time: number;
    /** 当前播放状态。 */
    state: AnimationPlayState;
    /** 当前动画 root 是否使用 baked animation。 */
    useBakedAnimation: boolean;
}

/**
 * 当前动画编辑 session 状态。
 */
export interface IAnimationStateInfo {
    /** 是否已经进入动画编辑 session。 */
    active: boolean;
    /** 当前编辑器类型。 */
    editorType: AnimationEditorType;
    /** 当前场景模式。 */
    mode: AnimationMode;
    /** 当前动画 root uuid；未进入 session 时为空字符串。 */
    rootUuid: string;
    /** 当前动画 root path；未进入 session 时为空字符串。 */
    rootPath: string;
    /** 当前编辑 clip uuid；未进入 session 时为空字符串。 */
    clipUuid: string;
    /** 当前编辑时间，单位为秒。 */
    time: number;
    /** 当前播放状态。 */
    playState: AnimationPlayState;
    /** 当前 selection paths。 */
    selection: string[];
    /** 退出 session 时默认是否恢复进入前的 selection。 */
    restoreSelectionOnExit: boolean;
}

export interface IAnimationStateChangedEvent {
    reason: AnimationEventReason;
    state: IAnimationStateInfo;
}

export interface IAnimationClipEvent {
    reason: AnimationEventReason;
    rootUuid: string;
    rootPath: string;
    clipUuid: string;
}

export interface IAnimationTimeChangedEvent extends IAnimationClipEvent {
    time: number;
    playState: AnimationPlayState;
}

export interface IAnimationEvents {
    'animation:state-changed': [event: IAnimationStateChangedEvent];
    'animation:time-changed': [event: IAnimationTimeChangedEvent];
    'animation:clip-changed': [event: IAnimationClipEvent];
}

/**
 * 可创建或编辑动画曲线的属性信息。
 */
export interface IAnimationPropertyInfo {
    name: string;
    key: string;
    displayName: string;
    type: IAnimationPropertyType;
    menuName: string;
    comp?: string;
    category?: string;
}

/**
 * applyOperation 使用的 typed operation。
 *
 * 所有 operation 都必须携带当前编辑的 clipUuid；clipUuid 不匹配时会返回 failure。
 * frame、frames、offset、dstFrame 都使用采样帧号；setTime/queryTime 的 time 才使用秒。
 * 支持的类型分为 clip 基础属性、普通属性曲线、事件、embedded player 和辅助曲线五类。
 *
 * @example
 * ```ts
 * await service.applyOperation({
 *   operations: [
 *     { type: 'changeSample', clipUuid, sample: 60 },
 *     { type: 'addEvent', clipUuid, frame: 30, func: 'onHalf', params: ['value'] },
 *   ],
 * });
 * ```
 *
 * @example
 * ```ts
 * await service.applyOperation({
 *   operations: [
 *     { type: 'addEmbeddedPlayerGroup', clipUuid, group: { key: 'fx', name: 'FX', type: 'particle-system' } },
 *     { type: 'addAuxiliaryCurve', clipUuid, name: 'BlendWeight' },
 *     { type: 'createAuxKey', clipUuid, name: 'BlendWeight', frame: 0, value: 1 },
 *   ],
 * });
 * ```
 */
export type IAnimationOperation =
    | { type: 'changeSample'; clipUuid: string; sample: number }
    | { type: 'changeSpeed'; clipUuid: string; speed: number }
    | { type: 'changeWrapMode'; clipUuid: string; wrapMode: number }
    | { type: 'addPropertyCurve'; clipUuid: string; nodePath?: string; nodeUuid?: string; propKey: string; value?: IAnimationValue }
    | { type: 'createPropertyKey'; clipUuid: string; nodePath?: string; nodeUuid?: string; propKey: string; frame: number; value?: IAnimationValue; channel?: string; keyData?: IAnimationCurveKeyData; curveData?: IAnimationCurveKeyData }
    | { type: 'updatePropertyKey'; clipUuid: string; nodePath?: string; nodeUuid?: string; propKey: string; frame: number; value?: IAnimationValue; channel?: string; keyData?: IAnimationCurveKeyData; curveData?: IAnimationCurveKeyData }
    | { type: 'removePropertyKey'; clipUuid: string; nodePath?: string; nodeUuid?: string; propKey: string; frames: number[]; channel?: string }
    | { type: 'removePropertyKeys'; clipUuid: string; nodePath?: string; nodeUuid?: string; propKey: string; frames: number[]; channel?: string }
    | { type: 'movePropertyKeys'; clipUuid: string; nodePath?: string; nodeUuid?: string; propKey: string; frames: number[]; offset: number; channel?: string }
    | { type: 'copyPropertyKeysTo'; clipUuid: string; nodePath?: string; nodeUuid?: string; propKey: string; frames: number[]; dstFrame: number; channel?: string }
    | { type: 'setPropertyCurveExtrapolation'; clipUuid: string; nodePath?: string; nodeUuid?: string; propKey: string; preExtrap?: number; postExtrap?: number }
    | { type: 'addEvent'; clipUuid: string; frame: number; func: string; params?: IAnimationValue[] }
    | { type: 'deleteEvent'; clipUuid: string; frames: number[] }
    | { type: 'updateEvent'; clipUuid: string; frames: number[]; events: IAnimationEventDump[] }
    | { type: 'moveEvents'; clipUuid: string; frames: number[]; offset: number }
    | { type: 'copyEventsTo'; clipUuid: string; frames: number[]; dstFrame: number }
    | { type: 'addEmbeddedPlayer'; clipUuid: string; embeddedPlayer: IAnimationEmbeddedPlayerDump }
    | { type: 'deleteEmbeddedPlayer'; clipUuid: string; embeddedPlayer: IAnimationEmbeddedPlayerDump }
    | { type: 'updateEmbeddedPlayer'; clipUuid: string; embeddedPlayer: IAnimationEmbeddedPlayerDump; newEmbeddedPlayer: IAnimationEmbeddedPlayerDump }
    | { type: 'clearEmbeddedPlayer'; clipUuid: string; group?: string }
    | { type: 'addEmbeddedPlayerGroup'; clipUuid: string; group: IAnimationEmbeddedPlayerGroup }
    | { type: 'removeEmbeddedPlayerGroup'; clipUuid: string; key: string }
    | { type: 'clearEmbeddedPlayerGroup'; clipUuid: string; key: string }
    | { type: 'addAuxiliaryCurve'; clipUuid: string; name: string }
    | { type: 'removeAuxiliaryCurve'; clipUuid: string; name: string }
    | { type: 'renameAuxiliaryCurve'; clipUuid: string; name: string; newName: string }
    | { type: 'createAuxKey'; clipUuid: string; name: string; frame: number; value: number }
    | { type: 'removeAuxKey'; clipUuid: string; name: string; frame: number }
    | { type: 'moveAuxKeys'; clipUuid: string; name: string; frames: number[]; offset: number }
    | { type: 'copyAuxKey'; clipUuid: string; name: string; frame: number; dstFrame: number };

/**
 * 批量执行动画编辑操作。
 */
export interface IAnimationOperationOptions {
    /** 按顺序执行；任一操作失败时停止并返回 failure。 */
    operations: IAnimationOperation[];
    /** 是否记录 undo/dirty；默认 true，显式传 false 时仅修改当前 clip，不写入 undo 栈。 */
    recordUndo?: boolean;
}

/**
 * applyOperation 的执行结果。
 */
export interface IAnimationOperationResult {
    state: 'success' | 'failure';
    result: boolean;
    reason?: string;
}

/**
 * Scene-process 内部 Animation service。
 *
 * 这个服务只在 scene-process 暴露，不走 MCP/API/main-process proxy。
 * 调用顺序通常是：enter -> queryClip/queryProperties -> setTime/applyOperation -> save -> exit。
 */
export interface IAnimationService extends IServiceEvents {
    /**
     * 进入动画编辑 session，并采样到 0 秒。
     */
    enter(options: IAnimationEnterOptions): Promise<IAnimationStateInfo>;
    /**
     * 退出动画编辑 session，可选择保存并恢复进入前的场景采样状态。
     */
    exit(options: IAnimationExitOptions): Promise<IAnimationStateInfo>;
    /**
     * 查询当前动画编辑 session 状态；未进入 session 时 active 为 false。
     */
    queryState(): Promise<IAnimationStateInfo>;
    /**
     * 查询目标节点所属的动画 root。
     */
    queryRoot(options: IAnimationTargetOptions): Promise<IAnimationRootResult>;
    /**
     * 查询动画 root、节点树、默认 clip dump、时间和播放状态。
     */
    queryRootInfo(options: IAnimationTargetOptions): Promise<IAnimationRootInfo>;
    /**
     * 查询指定 clip 的编辑 dump。
     */
    queryClip(options: IAnimationQueryClipOptions): Promise<IAnimationClipDump>;
    /**
     * 查询动画 root 上的可编辑 clip 列表。
     */
    queryClips(options: IAnimationTargetOptions): Promise<IAnimationClipsInfo>;
    /**
     * 查询目标节点上可创建动画曲线的属性。
     */
    queryProperties(options: IAnimationTargetOptions): Promise<IAnimationPropertyInfo[]>;
    /**
     * 查询当前编辑时间，单位为秒。
     */
    queryTime(options: IAnimationTimeOptions): Promise<number>;
    /**
     * 在指定帧采样属性值；采样后会恢复原编辑时间。
     */
    queryPropertyValueAtFrame(options: IAnimationQueryPropertyValueAtFrameOptions): Promise<IAnimationValue>;
    /**
     * 设置当前编辑时间并采样场景，time 单位为秒。
     */
    setTime(options: IAnimationSetTimeOptions): Promise<boolean>;
    /**
     * 控制当前 clip 播放状态。
     */
    changePlayState(options: IAnimationPlayStateOptions): Promise<boolean>;
    /**
     * 切换当前编辑 clip，并重置编辑时间到 0 秒。
     */
    changeEditClip(options: IAnimationEditClipOptions): Promise<boolean>;
    /**
     * 批量执行 typed animation operation。
     */
    applyOperation(options: IAnimationOperationOptions): Promise<IAnimationOperationResult>;
    /**
     * 保存当前编辑 clip。普通 .anim 写 asset；骨骼动画写回 asset meta。
     */
    save(): Promise<boolean>;
}

/**
 * 去掉事件能力后的公开 service 形态。
 */
export type IPublicAnimationService = Omit<IAnimationService, keyof IServiceEvents>;
