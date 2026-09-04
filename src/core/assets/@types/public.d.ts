import { AssetHandlerType, ISupportCreateType, AssetUserDataMap, IAssetType } from './asset-types';
import type { IProperty } from '../../scene/@types/public';
import type { ICocosConfigurationPropertySchema } from '../../configuration/script/metadata';
export type { IProperty } from '../../scene/@types/public';
export type {
    IAssetDeleteOptions,
    IAssetFileSystemProvider,
    IAssetOperationContext,
    IAssetOperationKind,
    IAssetOperationOrigin,
    IAssetRenameOptions,
    IAssetWriteFileOptions,
} from '@cocos/asset-db';

export interface IAssetMeta<T extends ISupportCreateType | 'unknown' = 'unknown'> {
    ver: string;
    importer: AssetHandlerType;
    imported: boolean;
    uuid: string;
    files: string[];
    subMetas: {
        [index: string]: IAssetMeta<'unknown'>;
    };
    userData: AssetUserDataMap[T extends keyof AssetUserDataMap ? T : 'unknown'];
    displayName?: string;
    id?: string;
    name?: string;
}

export type SerializedAssetDump = Record<string, IProperty> | IProperty;
export type SerializedAssetPatch = SerializedAssetDump | Partial<Record<string, IProperty | unknown>>;

export interface SerializedAssetQueryResult {
    uuid: string;
    url: string;
    type: string;
    importer: string;
    dump: SerializedAssetDump;
}

export interface AnimationGraphExpectedVersion {
    documentId: string;
    revision: number;
}

export interface AnimationGraphVersion extends AnimationGraphExpectedVersion {
    persistedRevision: number;
    dirty: boolean;
    externallyModified: boolean;
}

export type AnimationGraphStateMachineContext =
    | { kind: 'layer-state-machine'; layerIndex: number; stateMachinePath: number[] }
    | { kind: 'pose-node-state-machine'; poseGraph: AnimationGraphPoseGraphContext; nodeId: number }
    | { kind: 'sub-state-machine'; stateMachine: AnimationGraphStateMachineContext; stateIndex: number };

export type AnimationGraphPoseGraphContext =
    | { kind: 'state-pose-graph'; stateMachine: AnimationGraphStateMachineContext; stateIndex: number }
    | { kind: 'layer-stash'; layerIndex: number; stashName: string };

export type AnimationGraphStateMachineAddress =
    | { layerIndex: number; stateMachinePath: number[] }
    | { stateMachine: AnimationGraphStateMachineContext };

export type AnimationGraphStateAddress = AnimationGraphStateMachineAddress & { stateIndex: number };

export type AnimationGraphPoseGraphAddress =
    | { layerIndex: number; stateMachinePath: number[]; stateIndex: number }
    | { poseGraph: AnimationGraphPoseGraphContext };

export type AnimationGraphPoseNodeAddress = AnimationGraphPoseGraphAddress & { nodeId: number };

export type AnimationGraphMotionAddress =
    | (AnimationGraphStateAddress & { level: number[] })
    | ({ poseGraph: AnimationGraphPoseGraphContext; nodeId: number; level: number[] });

export type AnimationGraphTarget =
    | { kind: 'layer'; layerIndex: number }
    | ({ kind: 'state' } & AnimationGraphStateAddress)
    | ({ kind: 'transition'; transitionIndex: number } & AnimationGraphStateMachineAddress)
    | ({ kind: 'motion' } & AnimationGraphMotionAddress)
    | ({ kind: 'pose-node' } & AnimationGraphPoseNodeAddress)
    | ({ kind: 'pose-input'; inputId: string } & AnimationGraphPoseNodeAddress)
    | ({ kind: 'state-component'; componentIndex: number } & AnimationGraphStateAddress);

export interface AnimationGraphComponentView {
    index: number;
    type: string;
}

export interface AnimationGraphMotionView {
    level: number[];
    target: Extract<AnimationGraphTarget, { kind: 'motion' }>;
    type: 'clip' | 'blend-1d' | 'blend-2d' | 'blend-direct' | 'unknown';
    name: string;
    clipUuid?: string | null;
    variable?: string;
    value?: number;
    variableX?: string;
    valueX?: number;
    variableY?: string;
    valueY?: number;
    threshold?: number | { x: number; y: number };
    weight?: { value: number; variable: string };
    children?: AnimationGraphMotionView[];
    editorData?: Record<string, unknown>;
}

export interface AnimationGraphPoseInputView {
    id: string;
    displayName: string;
    type: number;
    deletable: boolean;
    insertPoint: boolean;
    connected: boolean;
    producerNodeId?: number;
    producerOutputId?: number;
    value?: IProperty;
}

export interface AnimationGraphPoseNodeEnterInfo {
    type: 'state-machine' | 'animation-blend' | 'stash';
    stashName?: string;
}

export interface AnimationGraphPoseNodeView {
    id: number;
    type: string;
    title: string;
    outputTypes: number[];
    inputs: AnimationGraphPoseInputView[];
    inputInsertInfos: Record<string, { displayName: string }>;
    stateMachine?: AnimationGraphStateMachineView;
    motion?: AnimationGraphMotionView | null;
    enterInfo?: AnimationGraphPoseNodeEnterInfo;
    editorData?: Record<string, unknown>;
}

export interface AnimationGraphPoseGraphAddNodeInfo {
    typeId: string;
    args: unknown;
    menu: string;
}

export interface AnimationGraphPoseGraphAssetDragHandlerView {
    displayName: string;
}

export interface AnimationGraphPoseGraphAssetDragHandlersView {
    handlers: Record<string, AnimationGraphPoseGraphAssetDragHandlerView>;
}

export interface AnimationGraphPoseView {
    context: AnimationGraphPoseGraphContext;
    rootOutputNodeId: number;
    nodes: AnimationGraphPoseNodeView[];
    addNodeInfos: AnimationGraphPoseGraphAddNodeInfo[];
    assetDragHandlersMap: Record<string, AnimationGraphPoseGraphAssetDragHandlersView>;
}

export interface AnimationGraphPoseGraphAssetDragHandlerInfo {
    id: string;
    displayName: string;
}

export interface AnimationGraphPoseGraphAssetDragHandlersEntry {
    assetType: string;
    handlers: AnimationGraphPoseGraphAssetDragHandlerInfo[];
}

export interface AnimationGraphStateView {
    index: number;
    type: 'entry' | 'exit' | 'any' | 'motion' | 'empty' | 'sub-state-machine' | 'procedural-pose' | 'unknown';
    name: string;
    incomingTransitionIndices: number[];
    outgoingTransitionIndices: number[];
    components: AnimationGraphComponentView[];
    speed?: number;
    speedMultiplier?: string;
    speedMultiplierEnabled?: boolean;
    motion?: AnimationGraphMotionView | null;
    stateMachine?: AnimationGraphStateMachineView;
    poseGraph?: AnimationGraphPoseView;
    editorData?: Record<string, unknown>;
}

export interface AnimationGraphTransitionView {
    index: number;
    type: 'animation' | 'empty-state' | 'procedural-pose' | 'transition';
    fromStateIndex: number;
    toStateIndex: number;
    priority: number;
    conditions: AnimationGraphTransitionConditionView[];
    duration?: number;
    relativeDuration?: boolean;
    exitConditionEnabled?: boolean;
    exitCondition?: number;
    destinationStart?: number;
    relativeDestinationStart?: boolean;
    startEvent?: string;
    endEvent?: string;
    editorData?: Record<string, unknown>;
}

export type AnimationGraphTransitionConditionView =
    | {
        index: number;
        type: 'BinaryCondition';
        operator: number;
        lhs: number;
        lhsBinding: Record<string, unknown>;
        bindingClass: string;
        rhs: number;
        isRhsInteger: boolean;
    }
    | {
        index: number;
        type: 'UnaryCondition';
        operator: number;
        operand: string;
    }
    | {
        index: number;
        type: 'TriggerCondition';
        trigger: string;
    }
    | {
        index: number;
        type: 'Unknown';
        className: string;
    };

export interface AnimationGraphStateMachineView {
    context: AnimationGraphStateMachineContext;
    path: number[];
    allowEmptyStates: boolean;
    states: AnimationGraphStateView[];
    transitions: AnimationGraphTransitionView[];
    editorData?: Record<string, unknown>;
}

export interface AnimationGraphLayerView {
    index: number;
    name: string;
    weight: number;
    additive: boolean;
    maskUuid: string | null;
    stashes: string[];
    stashPoseGraphs: Array<{ name: string; poseGraph: AnimationGraphPoseView; referenceCount?: number }>;
    stateMachine: AnimationGraphStateMachineView;
}

export interface AnimationGraphVariableView {
    name: string;
    type: number;
    value: IProperty;
    resetMode?: number;
}

export interface AnimationGraphViewDump {
    layers: AnimationGraphLayerView[];
    variables: AnimationGraphVariableView[];
}

export interface AnimationGraphSnapshot extends AnimationGraphVersion {
    uuid: string;
    url: string;
    graph: AnimationGraphViewDump;
}

export interface AnimationGraphInspectorPropertyCapabilities {
    set: boolean;
    reset: boolean;
    create: boolean;
}

export interface AnimationGraphInspectorSnapshot extends AnimationGraphVersion {
    uuid: string;
    target: AnimationGraphTarget;
    dump: IProperty;
    propertyCapabilities?: Record<string, AnimationGraphInspectorPropertyCapabilities>;
}

export interface AnimationGraphInspectorPropertyOperationRequest {
    target: AnimationGraphTarget;
    path: string;
    expected: AnimationGraphExpectedVersion;
    sourceId?: string;
}

export interface SetAnimationGraphInspectorPropertyRequest extends AnimationGraphInspectorPropertyOperationRequest {
    patch: IProperty | unknown;
}

export type AnimationGraphStateType = 'motion' | 'empty' | 'sub-state-machine' | 'procedural-pose';
export type AnimationGraphMotionType = 'clip' | 'blend-1d' | 'blend-2d' | 'blend-direct';
export type AnimationGraphTransitionConditionType = 'binary' | 'unary' | 'trigger';

export type AnimationGraphCommand =
    | { type: 'add-layer'; name?: string }
    | { type: 'remove-layer'; layerIndex: number }
    | { type: 'move-layer'; layerIndex: number; newIndex: number }
    | ({ type: 'add-state'; stateType: AnimationGraphStateType; name?: string; motionType?: AnimationGraphMotionType; clipUuid?: string; editorData?: Record<string, unknown> } & AnimationGraphStateMachineAddress)
    | ({ type: 'remove-state' } & AnimationGraphStateAddress)
    | ({ type: 'duplicate-state'; includeTransitions?: boolean; editorData?: Record<string, unknown> } & AnimationGraphStateAddress)
    | ({ type: 'set-state-editor-data'; editorData: Record<string, unknown> } & AnimationGraphStateAddress)
    | ({ type: 'add-transition'; fromStateIndex: number; toStateIndex: number } & AnimationGraphStateMachineAddress)
    | ({ type: 'remove-transition'; transitionIndex: number; allBetween?: boolean } & AnimationGraphStateMachineAddress)
    | ({ type: 'move-transition'; transitionIndex: number; offset: number } & AnimationGraphStateMachineAddress)
    | { type: 'add-transition-condition'; target: Extract<AnimationGraphTarget, { kind: 'transition' }>; conditionType: AnimationGraphTransitionConditionType }
    | { type: 'remove-transition-condition'; target: Extract<AnimationGraphTarget, { kind: 'transition' }>; conditionIndex: number }
    | { type: 'set-transition-condition-property'; target: Extract<AnimationGraphTarget, { kind: 'transition' }>; conditionIndex: number; path: string; value: unknown }
    | { type: 'set-transition-condition-binding-class'; target: Extract<AnimationGraphTarget, { kind: 'transition' }>; conditionIndex: number; bindingClass: string }
    | ({ type: 'set-transition-event-binding'; transitionIndex: number; which: 'start' | 'end'; methodName: string } & AnimationGraphStateMachineAddress)
    | ({ type: 'set-motion'; motionType: AnimationGraphMotionType | 'none'; clipUuid?: string } & (AnimationGraphStateAddress | { poseGraph: AnimationGraphPoseGraphContext; nodeId: number }))
    | { type: 'add-motion-child'; target: Extract<AnimationGraphTarget, { kind: 'motion' }>; motionType: AnimationGraphMotionType; clipUuid?: string }
    | { type: 'remove-motion'; target: Extract<AnimationGraphTarget, { kind: 'motion' }> }
    | { type: 'set-motion-editor-data'; target: Extract<AnimationGraphTarget, { kind: 'motion' }>; editorData: Record<string, unknown> }
    | { type: 'set-motion-threshold'; target: Extract<AnimationGraphTarget, { kind: 'motion' }>; childIndex: number; threshold: number | { x: number; y: number } }
    | { type: 'set-direct-blend-weight'; target: Extract<AnimationGraphTarget, { kind: 'motion' }>; childIndex: number; value?: number; variable?: string }
    | ({ type: 'add-state-component'; componentType: string } & AnimationGraphStateAddress)
    | ({ type: 'remove-state-component'; componentIndex: number } & AnimationGraphStateAddress)
    | ({ type: 'add-pose-node'; nodeType: string; createArg?: unknown; editorData?: Record<string, unknown> } & AnimationGraphPoseGraphAddress)
    | ({ type: 'create-pose-node-on-asset-drag'; assetUuid: string; handlerId: string; editorData?: Record<string, unknown> } & AnimationGraphPoseGraphAddress)
    | { type: 'remove-pose-node'; target: Extract<AnimationGraphTarget, { kind: 'pose-node' }> }
    | ({ type: 'duplicate-pose-nodes'; nodeIds: number[] } & AnimationGraphPoseGraphAddress)
    | { type: 'set-pose-node-editor-data'; target: Extract<AnimationGraphTarget, { kind: 'pose-node' }>; editorData: Record<string, unknown> }
    | ({ type: 'connect-pose-nodes'; producerNodeId: number; producerOutputId: number; consumerNodeId: number; consumerInputId: string } & AnimationGraphPoseGraphAddress)
    | { type: 'disconnect-pose-input'; target: Extract<AnimationGraphTarget, { kind: 'pose-input' }> }
    | { type: 'insert-pose-input'; target: Extract<AnimationGraphTarget, { kind: 'pose-node' }>; insertId: string }
    | { type: 'delete-pose-input'; target: Extract<AnimationGraphTarget, { kind: 'pose-input' }> }
    | { type: 'add-variable'; name: string; variableType: number; initialValue?: unknown }
    | { type: 'set-variable-value'; name: string; patch: IProperty | unknown }
    | { type: 'set-trigger-reset-mode'; name: string; resetMode: number }
    | { type: 'remove-variable'; name: string }
    | { type: 'rename-variable'; name: string; newName: string }
    | { type: 'add-stash'; layerIndex: number; name: string }
    | { type: 'remove-stash'; layerIndex: number; name: string }
    | { type: 'rename-stash'; layerIndex: number; name: string; newName: string }
    | { type: 'stash-pose-graph'; poseGraph: AnimationGraphPoseGraphContext; layerIndex: number; stashName?: string; editorData?: Record<string, unknown> };

export interface ExecuteAnimationGraphCommandRequest {
    command: AnimationGraphCommand;
    expected: AnimationGraphExpectedVersion;
    sourceId?: string;
}

export interface ReloadAnimationGraphOptions {
    expected?: AnimationGraphExpectedVersion;
    discardDirty?: boolean;
}

export interface AnimationGraphChangedEvent {
    uuid: string;
    reason: 'inspector' | 'structure' | 'save' | 'reload' | 'external';
    version: AnimationGraphVersion;
    sourceId?: string;
    changedPaths?: string[];
}

export type AnimationGraphEditErrorCode =
    | 'VERSION_CONFLICT'
    | 'DOCUMENT_RELOADED'
    | 'SOURCE_CHANGED'
    | 'TARGET_NOT_FOUND'
    | 'UNSUPPORTED_TARGET'
    | 'UNSUPPORTED_PROPERTY_OPERATION'
    | 'INVALID_PROPERTY_PATCH'
    | 'READONLY_PROPERTY'
    | 'NAME_CONFLICT'
    | 'DIRTY_DOCUMENT';

export interface MaterialEffectInfo {
    uuid: string;
    name: string;
    hideInEditor?: boolean;
    assetPath: string;
}

export interface MaterialPassDump {
    index: number;
    name?: string;
    phase?: string;
    switch?: IProperty;
    propertyIndex: IProperty;
    props: IProperty[];
    defines: IProperty[];
    states: IProperty;
}

export interface MaterialTechniqueDump {
    name?: string;
    passes: MaterialPassDump[];
}

export interface MaterialDump {
    effect: string;
    technique: number;
    data: MaterialTechniqueDump[];
}

export type AssetPropertySchemaMap = Record<string, ICocosConfigurationPropertySchema>;

// 如果使用了 datakeys 过滤，请使用此接口定义
export interface IAssetInfo {
    name: string; // 资源名字
    source: string; // url 地址
    loadUrl: string; // loader 加载的层级地址
    url: string; // loader 加载地址会去掉扩展名，这个参数不去掉
    file: string; // 绝对路径
    uuid: string; // 资源的唯一 ID
    importer: AssetHandlerType; // 使用的导入器名字
    imported: boolean; // 是否结束导入过程
    invalid: boolean; // 是否导入成功
    type: IAssetType; // 类型
    isDirectory: boolean; // 是否是文件夹
    library: { [key: string]: string }; // 导入资源的 map

    // dataKeys 作用范围
    isBundle?: boolean; // 是否是文件夹
    displayName?: string; // 资源用于显示的名字
    readonly?: boolean; // 是否只读
    visible?: boolean; // 是否显示
    subAssets?: { [key: string]: IAssetInfo }; // 子资源 map
    // 虚拟资源可以实例化成实体的话，会带上这个扩展名
    instantiation?: string;
    redirect?: IRedirectInfo; // 跳转指向资源
    meta?: IAssetMeta,
    parent?: {
        source: string;
        library: { [key: string]: string };
        uuid: string;
    };
    extends?: string[]; // 资源的继承链信息
    mtime?: number; // 资源文件的 mtime
    depends?: string[]; // 依赖的资源 uuid 信息
    dependeds?: string[]; // 被依赖的资源 uuid 信息
    temp?: string; // 资源临时文件目录
}

export interface AssetOperationOption {
    // 是否强制覆盖已经存在的文件，默认 false，传递后会直接覆盖文件，未传递时有冲突会直接抛异常
    overwrite?: boolean;
    // 是否自动重命名冲突文件，默认 false ，传递后会以内部规则自动重命名冲突文件，新的文件名可以在返回值中获取
    rename?: boolean;
}

export interface DeleteAssetOptions {
    useTrash?: boolean;
}

export interface AnimationMaskDump {
    version: 1;
    assetUuid: string;
    joints: AnimationMaskJoint[];
}

export interface AnimationMaskJoint {
    path: string;
    enabled: boolean;
    children?: AnimationMaskJoint[];
}

export interface AnimationMaskChange {
    path: string;
    enabled: boolean;
    recursive?: boolean;
}

// Basic information about the resource
// 资源的基础信息
export interface AssetInfo extends IAssetInfo {
    // Asset name
    // 资源名字
    name: string;
    // Asset display name
    // 资源用于显示的名字
    displayName: string;
    // URL
    source: string;
    // loader 加载的层级地址
    path: string;
    // loader 加载地址会去掉扩展名，这个参数不去掉
    url: string;
    // 绝对路径
    file: string;
    // 资源的唯一 ID
    uuid: string;
    // 使用的导入器名字
    importer: string;
    // 类型
    type: IAssetType;
    // 是否是文件夹
    isDirectory: boolean;
    // 导入资源的 map
    library: { [key: string]: string };
    // 子资源 map
    subAssets: { [key: string]: AssetInfo };
    // 是否显示
    visible: boolean;
    // 是否只读
    readonly: boolean;

    // 虚拟资源可以实例化成实体的话，会带上这个扩展名
    instantiation?: string;
    // 跳转指向资源
    redirect?: IRedirectInfo;
    // 继承类型
    extends?: string[];
    // 是否导入完成
    imported: boolean;
    // 是否导入失败
    invalid: boolean;
}

export interface IRedirectInfo {
    // 跳转资源的类型
    type: string;
    // 跳转资源的 uuid
    uuid: string;
}

export interface QueryAssetsOption {
    ccType?: string | string[], // 'cc.ImageAsset' 这类，多个用数组
    isBundle?: boolean, // 筛选 asset bundle 信息，搜索子包只能与 pattern 选项共存
    importer?: string | string[], // 导入名称，多个用数组
    pattern?: string, // 路径匹配，globs 格式
    extname?: string | string[], // 扩展名匹配，多个用数组

    // 筛选一些符合 userData 配置的资源
    userData?: Record<string, boolean | string | number>;

    /**
     * @deprecated use ccType instead
     */
    type?: string;
}

export interface AssetOperationOption {
    // 是否强制覆盖已经存在的文件，默认 false
    overwrite?: boolean;
    // 是否自动重命名冲突文件，默认 false
    rename?: boolean;
}

export interface CreateAssetByTypeOptions extends AssetOperationOption {
    /**
     * 指定的模板名称，默认为 default
     */
    templateName?: string;

    /**
     * 资源内容，当 content 与 template 都传递时，优先使用 content 创建文件
     */
    content?: string | Buffer | JSON;
}

export interface AssetDBOptions {
    name: string;
    target: string;
    library: string;
    temp: string;
    interval: number;
    /**
     * 0: 忽略错误
     * 1: 仅仅打印错误
     * 2: 打印错误、警告
     * 3: 打印错误、警告、日志
     * 4: 打印错误、警告、日志、调试信息
     */
    level: number;
    ignoreFiles: string[];
    preImportExtList?: string[];
    readonly: boolean;
    visible: boolean;
    ignoreGlob?: string;
}

export interface ExecuteAssetDBScriptMethodOptions {
    name: string;
    method: string;
    args?: any[];
}

export * from './asset-types';
