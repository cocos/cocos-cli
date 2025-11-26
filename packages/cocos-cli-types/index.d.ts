import { Mat4 } from 'cc';
import { Vec2 } from 'cc';
import { Vec3 } from 'cc';
import { Vec4 } from 'cc';
import { z } from 'zod';

declare class AssetsApi {
    /**
     * 删除资源
     */
    deleteAsset(dbPath: TDirOrDbPath): Promise<CommonResultType<TDbDirResult>>;
    /**
     * 刷新资源目录
     */
    refresh(dir: TDirOrDbPath): Promise<CommonResultType<TRefreshDirResult>>;
    /**
     * 查询资源信息
     */
    queryAssetInfo(urlOrUUIDOrPath: TUrlOrUUIDOrPath, dataKeys?: TDataKeys): Promise<CommonResultType<TAssetInfoResult>>;
    /**
     * 查询资源元数据
     */
    queryAssetMeta(urlOrUUIDOrPath: TUrlOrUUIDOrPath): Promise<CommonResultType<TAssetMetaResult>>;
    /**
     * 查询可创建资源映射表
     */
    queryCreateMap(): Promise<CommonResultType<TCreateMapResult>>;
    /**
     * 批量查询资源信息
     */
    queryAssetInfos(options?: TQueryAssetsOption): Promise<CommonResultType<TAssetInfosResult>>;
    /**
     * 查询所有资源数据库信息
     */
    queryAssetDBInfos(): Promise<CommonResultType<TAssetDBInfosResult>>;
    /**
     * 按类型创建资源
     */
    createAssetByType(ccType: TSupportCreateType, dirOrUrl: TDirOrDbPath, baseName: TBaseName, options?: TCreateAssetByTypeOptions): Promise<CommonResultType<TCreatedAssetResult>>;
    createAsset(options: TCreateAssetOptions): Promise<CommonResultType<TCreatedAssetResult>>;
    /**
     * 导入资源
     */
    importAsset(source: TDirOrDbPath, target: TDirOrDbPath, options?: TAssetOperationOption): Promise<CommonResultType<TImportedAssetResult>>;
    /**
     * 重新导入资源
     */
    reimportAsset(pathOrUrlOrUUID: TUrlOrUUIDOrPath): Promise<CommonResultType<TReimportResult>>;
    /**
     * 保存资源
     */
    saveAsset(pathOrUrlOrUUID: TUrlOrUUIDOrPath, data: TAssetData): Promise<CommonResultType<TSaveAssetResult>>;
    /**
     * 查询资源 UUID
     */
    queryUUID(urlOrPath: TUrlOrUUIDOrPath): Promise<CommonResultType<TUUIDResult>>;
    /**
     * 查询资源路径
     */
    queryPath(urlOrUuid: TUrlOrUUIDOrPath): Promise<CommonResultType<TPathResult>>;
    /**
     * 查询资源 URL
     */
    queryUrl(uuidOrPath: TUrlOrUUIDOrPath): Promise<CommonResultType<TUrlResult>>;
    /**
     * 查询资源依赖
     */
    queryAssetDependencies(uuidOrUrl: TUrlOrUUIDOrPath, type?: TQueryAssetType): Promise<CommonResultType<string[]>>;
    /**
     * 查询资源使用者
     */
    queryAssetUsers(uuidOrUrl: TUrlOrUUIDOrPath, type?: TQueryAssetType): Promise<CommonResultType<string[]>>;
    /**
     * 查询排序后的插件脚本
     */
    querySortedPlugins(filterOptions?: TFilterPluginOptions): Promise<CommonResultType<TPluginScriptInfo[]>>;
    /**
     * 重命名资源
     */
    renameAsset(source: TDirOrDbPath, target: TDirOrDbPath, options?: TAssetRenameOptions): Promise<CommonResultType<TAssetInfoResult>>;
    /**
     * 移动资源
     */
    moveAsset(source: TDirOrDbPath, target: TDirOrDbPath, options?: TAssetMoveOptions): Promise<CommonResultType<TAssetInfoResult>>;
    /**
     * 更新默认用户数据
     */
    updateDefaultUserData(handler: TUserDataHandler, path: TUpdateAssetUserDataPath, value: TUpdateAssetUserDataValue): Promise<CommonResultType<null>>;
    /**
     * 查询资源用户数据配置
     */
    queryAssetUserDataConfig(urlOrUuidOrPath: TUrlOrUUIDOrPath): Promise<CommonResultType<any>>;
    /**
     * 更新资源用户数据
     */
    updateAssetUserData(urlOrUuidOrPath: TUrlOrUUIDOrPath, path: TUpdateAssetUserDataPath, value: TUpdateAssetUserDataValue): Promise<CommonResultType<TUpdateAssetUserDataResult>>;
    /**
     * 查询资源配置映射表
     */
    queryAssetConfigMap(): Promise<CommonResultType<TAssetConfigMapResult>>;
}

declare class BuilderApi {
    build(platform: TPlatform, options?: TBuildOption): Promise<CommonResultType<{
        code: number;
        reason?: string | undefined;
        dest?: string | undefined;
        custom?: {
            previewUrl?: string | undefined;
            nativePrjDir?: string | undefined;
        } | undefined;
    } | null>>;
    queryDefaultBuildConfig(platform: TPlatform): Promise<CommonResultType<{
        platform: "web-desktop";
        packages: {
            'web-desktop': {
                useWebGPU: boolean;
                resolution: {
                    designHeight: number;
                    designWidth: number;
                };
            };
        };
        name?: string | undefined;
        debug?: boolean | undefined;
        useCacheConfig?: {
            engine?: boolean | undefined;
            serializeData?: boolean | undefined;
            textureCompress?: boolean | undefined;
            autoAtlas?: boolean | undefined;
        } | undefined;
        outputName?: string | undefined;
        buildPath?: string | undefined;
        scenes?: {
            url: string;
            uuid: string;
        }[] | undefined;
        skipCompressTexture?: boolean | undefined;
        packAutoAtlas?: boolean | undefined;
        sourceMaps?: boolean | "inline" | undefined;
        experimentalEraseModules?: boolean | undefined;
        bundleCommonChunk?: boolean | undefined;
        startScene?: string | undefined;
        mangleProperties?: boolean | undefined;
        inlineEnum?: boolean | undefined;
        md5Cache?: boolean | undefined;
        polyfills?: {
            targets?: string | undefined;
            asyncFunctions?: boolean | undefined;
            coreJs?: boolean | undefined;
        } | undefined;
        buildScriptTargets?: string | undefined;
        mainBundleCompressionType?: "none" | "merge_dep" | "merge_all_json" | "subpackage" | "zip" | undefined;
        mainBundleIsRemote?: boolean | undefined;
        server?: string | undefined;
        startSceneAssetBundle?: boolean | undefined;
        moveRemoteBundleScript?: boolean | undefined;
        useSplashScreen?: boolean | undefined;
        nextStages?: ("make" | "run")[] | undefined;
        nativeCodeBundleMode?: "wasm" | "asmjs" | "both" | undefined;
        bundleConfigs?: {
            name: string;
            root: string;
            output?: boolean | undefined;
            dest?: string | undefined;
            priority?: number | undefined;
            compressionType?: "none" | "merge_dep" | "merge_all_json" | "subpackage" | "zip" | undefined;
            isRemote?: boolean | undefined;
            scriptDest?: string | undefined;
        }[] | undefined;
    } | {
        platform: "web-mobile";
        packages: {
            'web-mobile': {
                useWebGPU: boolean;
                orientation: "auto" | "landscape" | "portrait";
                embedWebDebugger: boolean;
            };
        };
        name?: string | undefined;
        debug?: boolean | undefined;
        useCacheConfig?: {
            engine?: boolean | undefined;
            serializeData?: boolean | undefined;
            textureCompress?: boolean | undefined;
            autoAtlas?: boolean | undefined;
        } | undefined;
        outputName?: string | undefined;
        buildPath?: string | undefined;
        scenes?: {
            url: string;
            uuid: string;
        }[] | undefined;
        skipCompressTexture?: boolean | undefined;
        packAutoAtlas?: boolean | undefined;
        sourceMaps?: boolean | "inline" | undefined;
        experimentalEraseModules?: boolean | undefined;
        bundleCommonChunk?: boolean | undefined;
        startScene?: string | undefined;
        mangleProperties?: boolean | undefined;
        inlineEnum?: boolean | undefined;
        md5Cache?: boolean | undefined;
        polyfills?: {
            targets?: string | undefined;
            asyncFunctions?: boolean | undefined;
            coreJs?: boolean | undefined;
        } | undefined;
        buildScriptTargets?: string | undefined;
        mainBundleCompressionType?: "none" | "merge_dep" | "merge_all_json" | "subpackage" | "zip" | undefined;
        mainBundleIsRemote?: boolean | undefined;
        server?: string | undefined;
        startSceneAssetBundle?: boolean | undefined;
        moveRemoteBundleScript?: boolean | undefined;
        useSplashScreen?: boolean | undefined;
        nextStages?: ("make" | "run")[] | undefined;
        nativeCodeBundleMode?: "wasm" | "asmjs" | "both" | undefined;
        bundleConfigs?: {
            name: string;
            root: string;
            output?: boolean | undefined;
            dest?: string | undefined;
            priority?: number | undefined;
            compressionType?: "none" | "merge_dep" | "merge_all_json" | "subpackage" | "zip" | undefined;
            isRemote?: boolean | undefined;
            scriptDest?: string | undefined;
        }[] | undefined;
    } | null>>;
    make(platform: TPlatformCanMake, dest: TBuildDest): Promise<CommonResultType<{
        code: number;
        reason?: string | undefined;
        dest?: string | undefined;
        custom?: {
            nativePrjDir?: string | undefined;
            executableFile?: string | undefined;
        } | undefined;
    } | null>>;
    run(platform: TPlatform, dest: TBuildDest): Promise<CommonResultType<IRunResultData>>;
}

declare const enum BuildExitCode {
    PARAM_ERROR = 32,
    BUILD_FAILED = 34,
    BUILD_SUCCESS = 0,
    BUILD_BUSY = 37,
    UNKNOWN_ERROR = 50
}

export declare class CocosAPI {
    scene: SceneApi;
    engine: EngineApi;
    project: ProjectApi;
    assets: AssetsApi;
    builder: BuilderApi;
    configuration: ConfigurationApi;
    system: SystemApi;
    static create(): Promise<CocosAPI>;
    private constructor();
    /**
     * 初始化 API 实例，主要是为了实现按需加载
     */
    private _init;
    /**
     * 启动 MCP 服务器
     * @param projectPath
     * @param port
     */
    startupMcpServer(projectPath: TProjectPath_2, port?: TPort): void;
    /**
     * 启动工程
     */
    startup(projectPath: TProjectPath_2, port?: TPort): Promise<void>;
    /**
     * 命令行创建入口
     * 创建一个项目
     * @param projectPath
     * @param type
     */
    static createProject(projectPath: TProjectPath_2, type: TProjectType): Promise<boolean>;
    /**
     * 命令行构建入口
     * @param platform
     * @param options
     */
    static buildProject(projectPath: string, platform: TPlatform, options: TBuildOption): Promise<IBuildResultData>;
    /**
     * 命令行打包入口
     * @param platform
     * @param dest
     */
    static makeProject(platform: TPlatformCanMake, dest: TBuildDest): Promise<IBuildResultData>;
    /**
     * 命令行运行入口
     * @param platform
     * @param dest
     */
    static runProject(platform: TPlatform, dest: TBuildDest): Promise<IBuildResultData>;
}

declare const COMMON_STATUS: {
    readonly SUCCESS: 200;
    readonly FAIL: 500;
};

declare type CommonResultType<T> = {
    code: CommonStatus;
    data?: T;
    reason?: string;
};

declare type CommonStatus = typeof COMMON_STATUS[keyof typeof COMMON_STATUS];

declare class ComponentApi {
    /**
     * 添加组件
     */
    addComponent(addComponentInfo: TAddComponentInfo): Promise<CommonResultType<TComponentResult>>;
    /**
     * 移除组件
     */
    removeComponent(component: TRemoveComponentOptions): Promise<CommonResultType<boolean>>;
    /**
     * 查询组件
     */
    queryComponent(component: TQueryComponentOptions): Promise<CommonResultType<TComponentResult | null>>;
    /**
     * 设置组件属性
     */
    setProperty(setPropertyOptions?: TSetPropertyOptions): Promise<CommonResultType<boolean>>;
    /**
     * 查询所有组件
     */
    queryAllComponent(): Promise<CommonResultType<TQueryAllComponentResult>>;
}

declare class ConfigurationApi {
    migrateFromProject(projectPath: TProjectPath): Promise<CommonResultType<TMigrateResult>>;
    reload(): Promise<CommonResultType<TReloadResult>>;
}

declare class EngineApi {
}

declare class FileEditorApi {
    insertTextAtLine(param: TInsertTextAtLineInfo): Promise<CommonResultType<TFileEditorResult>>;
    eraseLinesInRange(param: TEraseLinesInRangeInfo): Promise<CommonResultType<TFileEditorResult>>;
    replaceTextInFile(param: TReplaceTextInFileInfo): Promise<CommonResultType<TFileEditorResult>>;
    queryFileText(param: TQueryFileTextInfo): Promise<CommonResultType<TFileQueryTextResult>>;
}

declare type IBuildResultData = IBuildResultSuccess | IBuildResultFailed;

declare interface IBuildResultFailed {
    code: Exclude<BuildExitCode, BuildExitCode.BUILD_SUCCESS>;
    reason?: string;
}

declare interface IBuildResultSuccess {
    code: BuildExitCode.BUILD_SUCCESS;
    dest: string;
    custom: Record<string, any>;
}

/**
 * 代表组件属性信息
 */
declare interface IComponent extends IComponentIdentifier {
    properties: {
        [key: string]: IPropertyValueType;
    };
    prefab: ICompPrefabInfo | null;
}

/**
 * 代表一个组件
 */
declare interface IComponentIdentifier {
    cid: string;
    path: string;
    uuid: string;
    name: string;
    type: string;
    enabled: boolean;
}

declare interface ICompPrefabInfo {
    fileId: string;
}

declare type IConsoleType = 'log' | 'warn' | 'error' | 'debug' | 'info' | 'success' | 'ready' | 'start';

declare interface IMountedChildrenInfo {
    targetInfo: ITargetInfo | null;
    nodes: INodeIdentifier[];
}

declare interface IMountedComponentsInfo {
    targetInfo: ITargetInfo | null;
    components: IComponentIdentifier[];
}

declare interface INode extends INodeIdentifier {
    properties: INodeProperties;
    components?: IComponentIdentifier[];
    children?: INode[];
    prefab: IPrefabInfo | null;
}

declare interface INodeIdentifier {
    nodeId: string;
    path: string;
    name: string;
}

declare interface INodeProperties {
    position: IVec3;
    rotation: IQuat;
    eulerAngles: IVec3;
    scale: IVec3;
    mobility: MobilityMode;
    layer: number;
    active: boolean;
}

declare interface IPrefab {
    name: string;
    uuid: string;
    data: INodeIdentifier;
    optimizationPolicy: OptimizationPolicy;
    persistent: boolean;
}

declare interface IPrefabInfo {
    /** 关联的预制体资源信息 */
    asset?: IPrefab;
    root?: INodeIdentifier;
    instance?: IPrefabInstance;
    fileId: string;
    targetOverrides: ITargetOverrideInfo[];
    nestedPrefabInstanceRoots: INodeIdentifier[];
}

declare interface IPrefabInstance {
    fileId: string;
    prefabRootNode?: INodeIdentifier;
    mountedChildren: IMountedChildrenInfo[];
    mountedComponents: IMountedComponentsInfo[];
    propertyOverrides: IPropertyOverrideInfo[];
    removedComponents: ITargetInfo[];
}

declare interface IProperty {
    value: { [key: string]: IPropertyValueType } | IPropertyValueType;
    type?: string;
    readonly?: boolean;
    name?: string;
    path?: string; // 数据的搜索路径，这个是由使用方填充的
    isArray?: boolean;
    userData?: { [key: string]: any }; // 用户透传的数据
}

declare interface IPropertyOverrideInfo {
    targetInfo: ITargetInfo | null;
    propertyPath: string[];
    value: any;
}

declare type IPropertyValueType = IProperty | IProperty[] | null | undefined | number | boolean | string | Vec4 | Vec3 | Vec2 | Mat4 | Array<unknown>

declare interface IQuat {
    x: number;
    y: number;
    z: number;
    w: number;
}

declare type IRunResultData = z.infer<typeof SchemaBuildResult>;

declare interface ITargetInfo {
    localID: string[];
}

declare interface ITargetOverrideInfo {
    source: IComponentIdentifier | INodeIdentifier | null;
    sourceInfo: ITargetInfo | null;
    propertyPath: string[];
    target: INodeIdentifier | null;
    targetInfo: ITargetInfo | null;
}

declare interface IVec3 {
    x: number;
    y: number;
    z: number;
}

declare type JsonValue = string | number | boolean | null | JsonValue[] | {
    [key: string]: JsonValue;
};

declare enum MobilityMode {
    /**
     * @en Static node
     * @zh 静态节点
     */
    Static = 0,
    /**
     * @en Stationary node
     * @zh 固定节点
     */
    Stationary = 1,
    /**
     * @en Movable node
     * @zh 可移动节点
     */
    Movable = 2
}

declare class NodeApi {
    /**
     * 创建节点
     */
    createNodeByType(options: TCreateNodeByTypeOptions): Promise<CommonResultType<TNodeDetail>>;
    /**
     * 创建节点
     */
    createNodeByAsset(options: TCreateNodeByAssetOptions): Promise<CommonResultType<TNodeDetail>>;
    /**
     * 删除节点
     */
    deleteNode(options: TDeleteNodeOptions): Promise<CommonResultType<TNodeDeleteResult>>;
    /**
     * 更新节点
     */
    updateNode(options: TUpdateNodeOptions): Promise<CommonResultType<TNodeUpdateResult>>;
    /**
     * 查询节点
     */
    queryNode(options: TQueryNodeOptions): Promise<CommonResultType<TNodeDetail>>;
}

declare enum OptimizationPolicy {
    AUTO = 0,
    SINGLE_INSTANCE = 0,
    MULTI_INSTANCE = 1
}

declare class PrefabApi {
    createPrefabFromNode(options: TCreatePrefabFromNodeOptions): Promise<CommonResultType<TNode>>;
    applyPrefabChanges(options: TApplyPrefabChangesOptions): Promise<CommonResultType<TApplyPrefabChangesResult>>;
    revertToPrefab(options: TRevertToPrefabOptions): Promise<CommonResultType<TRevertToPrefabResult>>;
    unpackPrefabInstance(options: TUnpackPrefabInstanceOptions): Promise<CommonResultType<TNode>>;
    isPrefabInstance(options: TIsPrefabInstanceOptions): Promise<CommonResultType<TIsPrefabInstanceResult>>;
    getPrefabInfo(options: TGetPrefabInfoParams): Promise<CommonResultType<TGetPrefabResult>>;
}

declare class ProjectApi {
    open(projectPath: string): Promise<CommonResultType<boolean>>;
    close(): Promise<{
        code: 500 | 200;
        data: boolean;
    }>;
}

declare class SceneApi {
    component: ComponentApi;
    node: NodeApi;
    prefab: PrefabApi;
    constructor();
    queryCurrent(): Promise<CommonResultType<TCurrentResult>>;
    open(dbURLOrUUID: TAssetUrlOrUUID): Promise<CommonResultType<TOpenResult>>;
    close(): Promise<CommonResultType<TCloseResult>>;
    save(): Promise<CommonResultType<TSaveResult>>;
    createScene(options: TCreateOptions): Promise<CommonResultType<TCreateResult>>;
    reloadScene(): Promise<CommonResultType<TReload>>;
}

declare const SchemaAddComponentInfo: z.ZodObject<{
    nodePath: z.ZodString;
    component: z.ZodString;
}, "strip", z.ZodTypeAny, {
    component: string;
    nodePath: string;
}, {
    component: string;
    nodePath: string;
}>;

declare const SchemaApplyPrefabChangesOptions: z.ZodObject<{
    nodePath: z.ZodString;
}, "strip", z.ZodTypeAny, {
    nodePath: string;
}, {
    nodePath: string;
}>;

declare const SchemaApplyPrefabChangesResult: z.ZodBoolean;

declare const SchemaAssetConfigMapResult: z.ZodRecord<z.ZodString, z.ZodObject<{
    displayName: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    docURL: z.ZodOptional<z.ZodString>;
    userDataConfig: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<any, z.ZodTypeDef, any>>>;
    iconInfo: z.ZodOptional<z.ZodObject<{
        type: z.ZodEnum<["icon", "image"]>;
        value: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        type: "image" | "icon";
        value: string;
    }, {
        type: "image" | "icon";
        value: string;
    }>>;
}, "strip", z.ZodTypeAny, {
    displayName?: string | undefined;
    description?: string | undefined;
    docURL?: string | undefined;
    userDataConfig?: Record<string, any> | undefined;
    iconInfo?: {
        type: "image" | "icon";
        value: string;
    } | undefined;
}, {
    displayName?: string | undefined;
    description?: string | undefined;
    docURL?: string | undefined;
    userDataConfig?: Record<string, any> | undefined;
    iconInfo?: {
        type: "image" | "icon";
        value: string;
    } | undefined;
}>>;

declare const SchemaAssetData: z.ZodString;

declare const SchemaAssetDBInfosResult: z.ZodArray<z.ZodObject<{
    name: z.ZodString;
    target: z.ZodString;
    library: z.ZodString;
    temp: z.ZodString;
    state: z.ZodEnum<["none", "start", "startup", "refresh"]>;
    visible: z.ZodBoolean;
    preImportExtList: z.ZodArray<z.ZodString, "many">;
    readonly: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    name: string;
    library: string;
    visible: boolean;
    target: string;
    temp: string;
    state: "none" | "start" | "startup" | "refresh";
    preImportExtList: string[];
    readonly?: boolean | undefined;
}, {
    name: string;
    library: string;
    visible: boolean;
    target: string;
    temp: string;
    state: "none" | "start" | "startup" | "refresh";
    preImportExtList: string[];
    readonly?: boolean | undefined;
}>, "many">;

declare const SchemaAssetInfoResult: z.ZodNullable<z.ZodType<any, z.ZodTypeDef, any>>;

declare const SchemaAssetInfosResult: z.ZodArray<z.ZodType<any, z.ZodTypeDef, any>, "many">;

declare const SchemaAssetMetaResult: z.ZodNullable<z.ZodType<any, z.ZodTypeDef, any>>;

declare const SchemaAssetMoveOptions: z.ZodOptional<z.ZodObject<{
    overwrite: z.ZodOptional<z.ZodBoolean>;
    rename: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    overwrite?: boolean | undefined;
    rename?: boolean | undefined;
}, {
    overwrite?: boolean | undefined;
    rename?: boolean | undefined;
}>>;

declare const SchemaAssetOperationOption: z.ZodOptional<z.ZodObject<{
    overwrite: z.ZodOptional<z.ZodBoolean>;
    rename: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    overwrite?: boolean | undefined;
    rename?: boolean | undefined;
}, {
    overwrite?: boolean | undefined;
    rename?: boolean | undefined;
}>>;

declare const SchemaAssetRenameOptions: z.ZodOptional<z.ZodObject<{
    overwrite: z.ZodOptional<z.ZodBoolean>;
    rename: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    overwrite?: boolean | undefined;
    rename?: boolean | undefined;
}, {
    overwrite?: boolean | undefined;
    rename?: boolean | undefined;
}>>;

declare const SchemaAssetUrlOrUUID: z.ZodString;

declare const SchemaBaseName: z.ZodString;

declare const SchemaBuildDest: z.ZodString;

declare const SchemaBuildOption: z.ZodOptional<z.ZodUnion<[z.ZodObject<{
    configPath: z.ZodOptional<z.ZodString>;
    skipCheck: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    taskId: z.ZodOptional<z.ZodString>;
    taskName: z.ZodOptional<z.ZodString>;
} & {
    name: z.ZodOptional<z.ZodString>;
    outputName: z.ZodOptional<z.ZodString>;
    buildPath: z.ZodOptional<z.ZodString>;
    scenes: z.ZodOptional<z.ZodArray<z.ZodObject<{
        url: z.ZodString;
        uuid: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        url: string;
        uuid: string;
    }, {
        url: string;
        uuid: string;
    }>, "many">>;
    startScene: z.ZodOptional<z.ZodString>;
    debug: z.ZodOptional<z.ZodBoolean>;
    md5Cache: z.ZodOptional<z.ZodBoolean>;
    polyfills: z.ZodOptional<z.ZodObject<{
        asyncFunctions: z.ZodOptional<z.ZodBoolean>;
        coreJs: z.ZodOptional<z.ZodBoolean>;
        targets: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        targets?: string | undefined;
        asyncFunctions?: boolean | undefined;
        coreJs?: boolean | undefined;
    }, {
        targets?: string | undefined;
        asyncFunctions?: boolean | undefined;
        coreJs?: boolean | undefined;
    }>>;
    buildScriptTargets: z.ZodOptional<z.ZodString>;
    mainBundleCompressionType: z.ZodOptional<z.ZodEnum<["none", "merge_dep", "merge_all_json", "subpackage", "zip"]>>;
    mainBundleIsRemote: z.ZodOptional<z.ZodBoolean>;
    server: z.ZodOptional<z.ZodString>;
    startSceneAssetBundle: z.ZodOptional<z.ZodBoolean>;
    bundleConfigs: z.ZodOptional<z.ZodArray<z.ZodObject<{
        root: z.ZodString;
        priority: z.ZodOptional<z.ZodNumber>;
        compressionType: z.ZodOptional<z.ZodDefault<z.ZodEnum<["none", "merge_dep", "merge_all_json", "subpackage", "zip"]>>>;
        isRemote: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
        output: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
        name: z.ZodString;
        dest: z.ZodOptional<z.ZodString>;
        scriptDest: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        root: string;
        output?: boolean | undefined;
        dest?: string | undefined;
        priority?: number | undefined;
        compressionType?: "none" | "merge_dep" | "merge_all_json" | "subpackage" | "zip" | undefined;
        isRemote?: boolean | undefined;
        scriptDest?: string | undefined;
    }, {
        name: string;
        root: string;
        output?: boolean | undefined;
        dest?: string | undefined;
        priority?: number | undefined;
        compressionType?: "none" | "merge_dep" | "merge_all_json" | "subpackage" | "zip" | undefined;
        isRemote?: boolean | undefined;
        scriptDest?: string | undefined;
    }>, "many">>;
    moveRemoteBundleScript: z.ZodOptional<z.ZodBoolean>;
    nativeCodeBundleMode: z.ZodOptional<z.ZodEnum<["wasm", "asmjs", "both"]>>;
    sourceMaps: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodLiteral<"inline">]>>;
    experimentalEraseModules: z.ZodOptional<z.ZodBoolean>;
    bundleCommonChunk: z.ZodOptional<z.ZodBoolean>;
    mangleProperties: z.ZodOptional<z.ZodBoolean>;
    inlineEnum: z.ZodOptional<z.ZodBoolean>;
    skipCompressTexture: z.ZodOptional<z.ZodBoolean>;
    packAutoAtlas: z.ZodOptional<z.ZodBoolean>;
    useSplashScreen: z.ZodOptional<z.ZodBoolean>;
    nextStages: z.ZodOptional<z.ZodArray<z.ZodEnum<["make", "run"]>, "many">>;
    useCacheConfig: z.ZodOptional<z.ZodOptional<z.ZodObject<{
        engine: z.ZodOptional<z.ZodBoolean>;
        textureCompress: z.ZodOptional<z.ZodBoolean>;
        autoAtlas: z.ZodOptional<z.ZodBoolean>;
        serializeData: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        engine?: boolean | undefined;
        serializeData?: boolean | undefined;
        textureCompress?: boolean | undefined;
        autoAtlas?: boolean | undefined;
    }, {
        engine?: boolean | undefined;
        serializeData?: boolean | undefined;
        textureCompress?: boolean | undefined;
        autoAtlas?: boolean | undefined;
    }>>>;
} & {
    platform: z.ZodOptional<z.ZodLiteral<"web-desktop">>;
    packages: z.ZodOptional<z.ZodObject<{
        'web-desktop': z.ZodObject<{
            useWebGPU: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
            resolution: z.ZodOptional<z.ZodObject<{
                designHeight: z.ZodNumber;
                designWidth: z.ZodNumber;
            }, "strip", z.ZodTypeAny, {
                designHeight: number;
                designWidth: number;
            }, {
                designHeight: number;
                designWidth: number;
            }>>;
        }, "strip", z.ZodTypeAny, {
            useWebGPU?: boolean | undefined;
            resolution?: {
                designHeight: number;
                designWidth: number;
            } | undefined;
        }, {
            useWebGPU?: boolean | undefined;
            resolution?: {
                designHeight: number;
                designWidth: number;
            } | undefined;
        }>;
    }, "strip", z.ZodTypeAny, {
        'web-desktop': {
            useWebGPU?: boolean | undefined;
            resolution?: {
                designHeight: number;
                designWidth: number;
            } | undefined;
        };
    }, {
        'web-desktop': {
            useWebGPU?: boolean | undefined;
            resolution?: {
                designHeight: number;
                designWidth: number;
            } | undefined;
        };
    }>>;
}, "strip", z.ZodTypeAny, {
    taskId?: string | undefined;
    name?: string | undefined;
    debug?: boolean | undefined;
    useCacheConfig?: {
        engine?: boolean | undefined;
        serializeData?: boolean | undefined;
        textureCompress?: boolean | undefined;
        autoAtlas?: boolean | undefined;
    } | undefined;
    taskName?: string | undefined;
    outputName?: string | undefined;
    buildPath?: string | undefined;
    platform?: "web-desktop" | undefined;
    scenes?: {
        url: string;
        uuid: string;
    }[] | undefined;
    skipCompressTexture?: boolean | undefined;
    packAutoAtlas?: boolean | undefined;
    sourceMaps?: boolean | "inline" | undefined;
    experimentalEraseModules?: boolean | undefined;
    bundleCommonChunk?: boolean | undefined;
    startScene?: string | undefined;
    mangleProperties?: boolean | undefined;
    inlineEnum?: boolean | undefined;
    md5Cache?: boolean | undefined;
    polyfills?: {
        targets?: string | undefined;
        asyncFunctions?: boolean | undefined;
        coreJs?: boolean | undefined;
    } | undefined;
    buildScriptTargets?: string | undefined;
    mainBundleCompressionType?: "none" | "merge_dep" | "merge_all_json" | "subpackage" | "zip" | undefined;
    mainBundleIsRemote?: boolean | undefined;
    server?: string | undefined;
    startSceneAssetBundle?: boolean | undefined;
    moveRemoteBundleScript?: boolean | undefined;
    useSplashScreen?: boolean | undefined;
    nextStages?: ("make" | "run")[] | undefined;
    packages?: {
        'web-desktop': {
            useWebGPU?: boolean | undefined;
            resolution?: {
                designHeight: number;
                designWidth: number;
            } | undefined;
        };
    } | undefined;
    nativeCodeBundleMode?: "wasm" | "asmjs" | "both" | undefined;
    bundleConfigs?: {
        name: string;
        root: string;
        output?: boolean | undefined;
        dest?: string | undefined;
        priority?: number | undefined;
        compressionType?: "none" | "merge_dep" | "merge_all_json" | "subpackage" | "zip" | undefined;
        isRemote?: boolean | undefined;
        scriptDest?: string | undefined;
    }[] | undefined;
    skipCheck?: boolean | undefined;
    configPath?: string | undefined;
}, {
    taskId?: string | undefined;
    name?: string | undefined;
    debug?: boolean | undefined;
    useCacheConfig?: {
        engine?: boolean | undefined;
        serializeData?: boolean | undefined;
        textureCompress?: boolean | undefined;
        autoAtlas?: boolean | undefined;
    } | undefined;
    taskName?: string | undefined;
    outputName?: string | undefined;
    buildPath?: string | undefined;
    platform?: "web-desktop" | undefined;
    scenes?: {
        url: string;
        uuid: string;
    }[] | undefined;
    skipCompressTexture?: boolean | undefined;
    packAutoAtlas?: boolean | undefined;
    sourceMaps?: boolean | "inline" | undefined;
    experimentalEraseModules?: boolean | undefined;
    bundleCommonChunk?: boolean | undefined;
    startScene?: string | undefined;
    mangleProperties?: boolean | undefined;
    inlineEnum?: boolean | undefined;
    md5Cache?: boolean | undefined;
    polyfills?: {
        targets?: string | undefined;
        asyncFunctions?: boolean | undefined;
        coreJs?: boolean | undefined;
    } | undefined;
    buildScriptTargets?: string | undefined;
    mainBundleCompressionType?: "none" | "merge_dep" | "merge_all_json" | "subpackage" | "zip" | undefined;
    mainBundleIsRemote?: boolean | undefined;
    server?: string | undefined;
    startSceneAssetBundle?: boolean | undefined;
    moveRemoteBundleScript?: boolean | undefined;
    useSplashScreen?: boolean | undefined;
    nextStages?: ("make" | "run")[] | undefined;
    packages?: {
        'web-desktop': {
            useWebGPU?: boolean | undefined;
            resolution?: {
                designHeight: number;
                designWidth: number;
            } | undefined;
        };
    } | undefined;
    nativeCodeBundleMode?: "wasm" | "asmjs" | "both" | undefined;
    bundleConfigs?: {
        name: string;
        root: string;
        output?: boolean | undefined;
        dest?: string | undefined;
        priority?: number | undefined;
        compressionType?: "none" | "merge_dep" | "merge_all_json" | "subpackage" | "zip" | undefined;
        isRemote?: boolean | undefined;
        scriptDest?: string | undefined;
    }[] | undefined;
    skipCheck?: boolean | undefined;
    configPath?: string | undefined;
}>, z.ZodObject<{
    configPath: z.ZodOptional<z.ZodString>;
    skipCheck: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
    taskId: z.ZodOptional<z.ZodString>;
    taskName: z.ZodOptional<z.ZodString>;
} & {
    name: z.ZodOptional<z.ZodString>;
    outputName: z.ZodOptional<z.ZodString>;
    buildPath: z.ZodOptional<z.ZodString>;
    scenes: z.ZodOptional<z.ZodArray<z.ZodObject<{
        url: z.ZodString;
        uuid: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        url: string;
        uuid: string;
    }, {
        url: string;
        uuid: string;
    }>, "many">>;
    startScene: z.ZodOptional<z.ZodString>;
    debug: z.ZodOptional<z.ZodBoolean>;
    md5Cache: z.ZodOptional<z.ZodBoolean>;
    polyfills: z.ZodOptional<z.ZodObject<{
        asyncFunctions: z.ZodOptional<z.ZodBoolean>;
        coreJs: z.ZodOptional<z.ZodBoolean>;
        targets: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        targets?: string | undefined;
        asyncFunctions?: boolean | undefined;
        coreJs?: boolean | undefined;
    }, {
        targets?: string | undefined;
        asyncFunctions?: boolean | undefined;
        coreJs?: boolean | undefined;
    }>>;
    buildScriptTargets: z.ZodOptional<z.ZodString>;
    mainBundleCompressionType: z.ZodOptional<z.ZodEnum<["none", "merge_dep", "merge_all_json", "subpackage", "zip"]>>;
    mainBundleIsRemote: z.ZodOptional<z.ZodBoolean>;
    server: z.ZodOptional<z.ZodString>;
    startSceneAssetBundle: z.ZodOptional<z.ZodBoolean>;
    bundleConfigs: z.ZodOptional<z.ZodArray<z.ZodObject<{
        root: z.ZodString;
        priority: z.ZodOptional<z.ZodNumber>;
        compressionType: z.ZodOptional<z.ZodDefault<z.ZodEnum<["none", "merge_dep", "merge_all_json", "subpackage", "zip"]>>>;
        isRemote: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
        output: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
        name: z.ZodString;
        dest: z.ZodOptional<z.ZodString>;
        scriptDest: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        root: string;
        output?: boolean | undefined;
        dest?: string | undefined;
        priority?: number | undefined;
        compressionType?: "none" | "merge_dep" | "merge_all_json" | "subpackage" | "zip" | undefined;
        isRemote?: boolean | undefined;
        scriptDest?: string | undefined;
    }, {
        name: string;
        root: string;
        output?: boolean | undefined;
        dest?: string | undefined;
        priority?: number | undefined;
        compressionType?: "none" | "merge_dep" | "merge_all_json" | "subpackage" | "zip" | undefined;
        isRemote?: boolean | undefined;
        scriptDest?: string | undefined;
    }>, "many">>;
    moveRemoteBundleScript: z.ZodOptional<z.ZodBoolean>;
    nativeCodeBundleMode: z.ZodOptional<z.ZodEnum<["wasm", "asmjs", "both"]>>;
    sourceMaps: z.ZodOptional<z.ZodUnion<[z.ZodBoolean, z.ZodLiteral<"inline">]>>;
    experimentalEraseModules: z.ZodOptional<z.ZodBoolean>;
    bundleCommonChunk: z.ZodOptional<z.ZodBoolean>;
    mangleProperties: z.ZodOptional<z.ZodBoolean>;
    inlineEnum: z.ZodOptional<z.ZodBoolean>;
    skipCompressTexture: z.ZodOptional<z.ZodBoolean>;
    packAutoAtlas: z.ZodOptional<z.ZodBoolean>;
    useSplashScreen: z.ZodOptional<z.ZodBoolean>;
    nextStages: z.ZodOptional<z.ZodArray<z.ZodEnum<["make", "run"]>, "many">>;
    useCacheConfig: z.ZodOptional<z.ZodOptional<z.ZodObject<{
        engine: z.ZodOptional<z.ZodBoolean>;
        textureCompress: z.ZodOptional<z.ZodBoolean>;
        autoAtlas: z.ZodOptional<z.ZodBoolean>;
        serializeData: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        engine?: boolean | undefined;
        serializeData?: boolean | undefined;
        textureCompress?: boolean | undefined;
        autoAtlas?: boolean | undefined;
    }, {
        engine?: boolean | undefined;
        serializeData?: boolean | undefined;
        textureCompress?: boolean | undefined;
        autoAtlas?: boolean | undefined;
    }>>>;
} & {
    platform: z.ZodOptional<z.ZodLiteral<"web-mobile">>;
    packages: z.ZodOptional<z.ZodObject<{
        'web-mobile': z.ZodObject<{
            useWebGPU: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
            orientation: z.ZodOptional<z.ZodDefault<z.ZodEnum<["portrait", "landscape", "auto"]>>>;
            embedWebDebugger: z.ZodOptional<z.ZodDefault<z.ZodBoolean>>;
        }, "strip", z.ZodTypeAny, {
            useWebGPU?: boolean | undefined;
            orientation?: "auto" | "landscape" | "portrait" | undefined;
            embedWebDebugger?: boolean | undefined;
        }, {
            useWebGPU?: boolean | undefined;
            orientation?: "auto" | "landscape" | "portrait" | undefined;
            embedWebDebugger?: boolean | undefined;
        }>;
    }, "strip", z.ZodTypeAny, {
        'web-mobile': {
            useWebGPU?: boolean | undefined;
            orientation?: "auto" | "landscape" | "portrait" | undefined;
            embedWebDebugger?: boolean | undefined;
        };
    }, {
        'web-mobile': {
            useWebGPU?: boolean | undefined;
            orientation?: "auto" | "landscape" | "portrait" | undefined;
            embedWebDebugger?: boolean | undefined;
        };
    }>>;
}, "strip", z.ZodTypeAny, {
    taskId?: string | undefined;
    name?: string | undefined;
    debug?: boolean | undefined;
    useCacheConfig?: {
        engine?: boolean | undefined;
        serializeData?: boolean | undefined;
        textureCompress?: boolean | undefined;
        autoAtlas?: boolean | undefined;
    } | undefined;
    taskName?: string | undefined;
    outputName?: string | undefined;
    buildPath?: string | undefined;
    platform?: "web-mobile" | undefined;
    scenes?: {
        url: string;
        uuid: string;
    }[] | undefined;
    skipCompressTexture?: boolean | undefined;
    packAutoAtlas?: boolean | undefined;
    sourceMaps?: boolean | "inline" | undefined;
    experimentalEraseModules?: boolean | undefined;
    bundleCommonChunk?: boolean | undefined;
    startScene?: string | undefined;
    mangleProperties?: boolean | undefined;
    inlineEnum?: boolean | undefined;
    md5Cache?: boolean | undefined;
    polyfills?: {
        targets?: string | undefined;
        asyncFunctions?: boolean | undefined;
        coreJs?: boolean | undefined;
    } | undefined;
    buildScriptTargets?: string | undefined;
    mainBundleCompressionType?: "none" | "merge_dep" | "merge_all_json" | "subpackage" | "zip" | undefined;
    mainBundleIsRemote?: boolean | undefined;
    server?: string | undefined;
    startSceneAssetBundle?: boolean | undefined;
    moveRemoteBundleScript?: boolean | undefined;
    useSplashScreen?: boolean | undefined;
    nextStages?: ("make" | "run")[] | undefined;
    packages?: {
        'web-mobile': {
            useWebGPU?: boolean | undefined;
            orientation?: "auto" | "landscape" | "portrait" | undefined;
            embedWebDebugger?: boolean | undefined;
        };
    } | undefined;
    nativeCodeBundleMode?: "wasm" | "asmjs" | "both" | undefined;
    bundleConfigs?: {
        name: string;
        root: string;
        output?: boolean | undefined;
        dest?: string | undefined;
        priority?: number | undefined;
        compressionType?: "none" | "merge_dep" | "merge_all_json" | "subpackage" | "zip" | undefined;
        isRemote?: boolean | undefined;
        scriptDest?: string | undefined;
    }[] | undefined;
    skipCheck?: boolean | undefined;
    configPath?: string | undefined;
}, {
    taskId?: string | undefined;
    name?: string | undefined;
    debug?: boolean | undefined;
    useCacheConfig?: {
        engine?: boolean | undefined;
        serializeData?: boolean | undefined;
        textureCompress?: boolean | undefined;
        autoAtlas?: boolean | undefined;
    } | undefined;
    taskName?: string | undefined;
    outputName?: string | undefined;
    buildPath?: string | undefined;
    platform?: "web-mobile" | undefined;
    scenes?: {
        url: string;
        uuid: string;
    }[] | undefined;
    skipCompressTexture?: boolean | undefined;
    packAutoAtlas?: boolean | undefined;
    sourceMaps?: boolean | "inline" | undefined;
    experimentalEraseModules?: boolean | undefined;
    bundleCommonChunk?: boolean | undefined;
    startScene?: string | undefined;
    mangleProperties?: boolean | undefined;
    inlineEnum?: boolean | undefined;
    md5Cache?: boolean | undefined;
    polyfills?: {
        targets?: string | undefined;
        asyncFunctions?: boolean | undefined;
        coreJs?: boolean | undefined;
    } | undefined;
    buildScriptTargets?: string | undefined;
    mainBundleCompressionType?: "none" | "merge_dep" | "merge_all_json" | "subpackage" | "zip" | undefined;
    mainBundleIsRemote?: boolean | undefined;
    server?: string | undefined;
    startSceneAssetBundle?: boolean | undefined;
    moveRemoteBundleScript?: boolean | undefined;
    useSplashScreen?: boolean | undefined;
    nextStages?: ("make" | "run")[] | undefined;
    packages?: {
        'web-mobile': {
            useWebGPU?: boolean | undefined;
            orientation?: "auto" | "landscape" | "portrait" | undefined;
            embedWebDebugger?: boolean | undefined;
        };
    } | undefined;
    nativeCodeBundleMode?: "wasm" | "asmjs" | "both" | undefined;
    bundleConfigs?: {
        name: string;
        root: string;
        output?: boolean | undefined;
        dest?: string | undefined;
        priority?: number | undefined;
        compressionType?: "none" | "merge_dep" | "merge_all_json" | "subpackage" | "zip" | undefined;
        isRemote?: boolean | undefined;
        scriptDest?: string | undefined;
    }[] | undefined;
    skipCheck?: boolean | undefined;
    configPath?: string | undefined;
}>]>>;

declare const SchemaBuildResult: z.ZodNullable<z.ZodObject<{
    code: z.ZodNumber;
    dest: z.ZodOptional<z.ZodString>;
    reason: z.ZodOptional<z.ZodString>;
} & {
    custom: z.ZodOptional<z.ZodObject<{
        nativePrjDir: z.ZodOptional<z.ZodString>;
        previewUrl: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        previewUrl?: string | undefined;
        nativePrjDir?: string | undefined;
    }, {
        previewUrl?: string | undefined;
        nativePrjDir?: string | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    code: number;
    reason?: string | undefined;
    dest?: string | undefined;
    custom?: {
        previewUrl?: string | undefined;
        nativePrjDir?: string | undefined;
    } | undefined;
}, {
    code: number;
    reason?: string | undefined;
    dest?: string | undefined;
    custom?: {
        previewUrl?: string | undefined;
        nativePrjDir?: string | undefined;
    } | undefined;
}>>;

declare const SchemaCloseResult: z.ZodBoolean;

declare const SchemaComponentResult: z.ZodUnion<[z.ZodType<IComponent, z.ZodTypeDef, IComponent>, z.ZodNull]>;

declare const SchemaCreateAssetByTypeOptions: z.ZodOptional<z.ZodObject<{
    overwrite: z.ZodOptional<z.ZodBoolean>;
    rename: z.ZodOptional<z.ZodBoolean>;
    templateName: z.ZodOptional<z.ZodString>;
    content: z.ZodOptional<z.ZodString>;
    uuid: z.ZodOptional<z.ZodString>;
    userData: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<JsonValue, z.ZodTypeDef, JsonValue>>>;
}, "strip", z.ZodTypeAny, {
    uuid?: string | undefined;
    templateName?: string | undefined;
    overwrite?: boolean | undefined;
    content?: string | undefined;
    userData?: Record<string, JsonValue> | undefined;
    rename?: boolean | undefined;
}, {
    uuid?: string | undefined;
    templateName?: string | undefined;
    overwrite?: boolean | undefined;
    content?: string | undefined;
    userData?: Record<string, JsonValue> | undefined;
    rename?: boolean | undefined;
}>>;

declare const SchemaCreateAssetOptions: z.ZodObject<{
    overwrite: z.ZodOptional<z.ZodBoolean>;
    rename: z.ZodOptional<z.ZodBoolean>;
    content: z.ZodOptional<z.ZodString>;
    target: z.ZodString;
    template: z.ZodOptional<z.ZodString>;
    uuid: z.ZodOptional<z.ZodString>;
    userData: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<JsonValue, z.ZodTypeDef, JsonValue>>>;
    customOptions: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodType<JsonValue, z.ZodTypeDef, JsonValue>>>;
}, "strip", z.ZodTypeAny, {
    target: string;
    uuid?: string | undefined;
    overwrite?: boolean | undefined;
    content?: string | undefined;
    template?: string | undefined;
    userData?: Record<string, JsonValue> | undefined;
    rename?: boolean | undefined;
    customOptions?: Record<string, JsonValue> | undefined;
}, {
    target: string;
    uuid?: string | undefined;
    overwrite?: boolean | undefined;
    content?: string | undefined;
    template?: string | undefined;
    userData?: Record<string, JsonValue> | undefined;
    rename?: boolean | undefined;
    customOptions?: Record<string, JsonValue> | undefined;
}>;

declare const SchemaCreatedAssetResult: z.ZodNullable<z.ZodType<any, z.ZodTypeDef, any>>;

declare const SchemaCreateMapResult: z.ZodArray<z.ZodType<any, z.ZodTypeDef, any>, "many">;

declare const SchemaCreateOptions: z.ZodObject<{
    baseName: z.ZodString;
    templateType: z.ZodOptional<z.ZodEnum<["2d", "3d", "quality"]>>;
    dbURL: z.ZodString;
}, "strip", z.ZodTypeAny, {
    dbURL: string;
    baseName: string;
    templateType?: "quality" | "3d" | "2d" | undefined;
}, {
    dbURL: string;
    baseName: string;
    templateType?: "quality" | "3d" | "2d" | undefined;
}>;

declare const SchemaCreatePrefabFromNodeOptions: z.ZodObject<{
    /** 要转换为预制体的源节点路径 */
    nodePath: z.ZodString;
    /** 预制体资源保存 URL */
    dbURL: z.ZodString;
    /** 是否强制覆盖现有资源 */
    overwrite: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    dbURL: string;
    nodePath: string;
    overwrite?: boolean | undefined;
}, {
    dbURL: string;
    nodePath: string;
    overwrite?: boolean | undefined;
}>;

declare const SchemaCreateResult: z.ZodObject<{
    assetName: z.ZodString;
    assetUuid: z.ZodString;
    assetUrl: z.ZodString;
    assetType: z.ZodString;
}, "strip", z.ZodTypeAny, {
    assetUuid: string;
    assetType: string;
    assetName: string;
    assetUrl: string;
}, {
    assetUuid: string;
    assetType: string;
    assetName: string;
    assetUrl: string;
}>;

declare const SchemaCurrentResult: z.ZodNullable<z.ZodUnion<[z.ZodObject<{
    assetName: z.ZodString;
    assetUuid: z.ZodString;
    assetUrl: z.ZodString;
    assetType: z.ZodString;
} & {
    name: z.ZodString;
    prefab: z.ZodUnion<[z.ZodObject<{
        asset: z.ZodOptional<z.ZodObject<{
            data: z.ZodObject<{
                nodeId: z.ZodString;
                path: z.ZodString;
                name: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                name: string;
                path: string;
                nodeId: string;
            }, {
                name: string;
                path: string;
                nodeId: string;
            }>;
            optimizationPolicy: z.ZodNativeEnum<OptimizationPolicy>;
            persistent: z.ZodBoolean;
        }, "strip", z.ZodTypeAny, {
            data: {
                name: string;
                path: string;
                nodeId: string;
            };
            persistent: boolean;
            optimizationPolicy: OptimizationPolicy;
        }, {
            data: {
                name: string;
                path: string;
                nodeId: string;
            };
            persistent: boolean;
            optimizationPolicy: OptimizationPolicy;
        }>>;
        root: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            nodeId: z.ZodString;
            path: z.ZodString;
            name: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            name: string;
            path: string;
            nodeId: string;
        }, {
            name: string;
            path: string;
            nodeId: string;
        }>>>;
        instance: z.ZodOptional<z.ZodObject<{
            fileId: z.ZodString;
            prefabRootNode: z.ZodOptional<z.ZodObject<{
                nodeId: z.ZodString;
                path: z.ZodString;
                name: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                name: string;
                path: string;
                nodeId: string;
            }, {
                name: string;
                path: string;
                nodeId: string;
            }>>;
            mountedChildren: z.ZodDefault<z.ZodArray<z.ZodType<IMountedChildrenInfo, z.ZodTypeDef, IMountedChildrenInfo>, "many">>;
            mountedComponents: z.ZodDefault<z.ZodArray<z.ZodObject<{
                targetInfo: z.ZodNullable<z.ZodObject<{
                    localID: z.ZodArray<z.ZodString, "many">;
                }, "strip", z.ZodTypeAny, {
                    localID: string[];
                }, {
                    localID: string[];
                }>>;
                components: z.ZodArray<z.ZodObject<{
                    cid: z.ZodString;
                    path: z.ZodString;
                    uuid: z.ZodString;
                    name: z.ZodString;
                    type: z.ZodString;
                    enabled: z.ZodBoolean;
                }, "strip", z.ZodTypeAny, {
                    name: string;
                    uuid: string;
                    type: string;
                    path: string;
                    enabled: boolean;
                    cid: string;
                }, {
                    name: string;
                    uuid: string;
                    type: string;
                    path: string;
                    enabled: boolean;
                    cid: string;
                }>, "many">;
            }, "strip", z.ZodTypeAny, {
                components: {
                    name: string;
                    uuid: string;
                    type: string;
                    path: string;
                    enabled: boolean;
                    cid: string;
                }[];
                targetInfo: {
                    localID: string[];
                } | null;
            }, {
                components: {
                    name: string;
                    uuid: string;
                    type: string;
                    path: string;
                    enabled: boolean;
                    cid: string;
                }[];
                targetInfo: {
                    localID: string[];
                } | null;
            }>, "many">>;
            propertyOverrides: z.ZodDefault<z.ZodArray<z.ZodObject<{
                targetInfo: z.ZodNullable<z.ZodObject<{
                    localID: z.ZodArray<z.ZodString, "many">;
                }, "strip", z.ZodTypeAny, {
                    localID: string[];
                }, {
                    localID: string[];
                }>>;
                propertyPath: z.ZodArray<z.ZodString, "many">;
                value: z.ZodAny;
            }, "strip", z.ZodTypeAny, {
                targetInfo: {
                    localID: string[];
                } | null;
                propertyPath: string[];
                value?: any;
            }, {
                targetInfo: {
                    localID: string[];
                } | null;
                propertyPath: string[];
                value?: any;
            }>, "many">>;
            removedComponents: z.ZodDefault<z.ZodArray<z.ZodObject<{
                localID: z.ZodArray<z.ZodString, "many">;
            }, "strip", z.ZodTypeAny, {
                localID: string[];
            }, {
                localID: string[];
            }>, "many">>;
        }, "strip", z.ZodTypeAny, {
            fileId: string;
            mountedChildren: IMountedChildrenInfo[];
            mountedComponents: {
                components: {
                    name: string;
                    uuid: string;
                    type: string;
                    path: string;
                    enabled: boolean;
                    cid: string;
                }[];
                targetInfo: {
                    localID: string[];
                } | null;
            }[];
            propertyOverrides: {
                targetInfo: {
                    localID: string[];
                } | null;
                propertyPath: string[];
                value?: any;
            }[];
            removedComponents: {
                localID: string[];
            }[];
            prefabRootNode?: {
                name: string;
                path: string;
                nodeId: string;
            } | undefined;
        }, {
            fileId: string;
            prefabRootNode?: {
                name: string;
                path: string;
                nodeId: string;
            } | undefined;
            mountedChildren?: IMountedChildrenInfo[] | undefined;
            mountedComponents?: {
                components: {
                    name: string;
                    uuid: string;
                    type: string;
                    path: string;
                    enabled: boolean;
                    cid: string;
                }[];
                targetInfo: {
                    localID: string[];
                } | null;
            }[] | undefined;
            propertyOverrides?: {
                targetInfo: {
                    localID: string[];
                } | null;
                propertyPath: string[];
                value?: any;
            }[] | undefined;
            removedComponents?: {
                localID: string[];
            }[] | undefined;
        }>>;
        fileId: z.ZodString;
        targetOverrides: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodObject<{
            source: z.ZodUnion<[z.ZodObject<{
                cid: z.ZodString;
                path: z.ZodString;
                uuid: z.ZodString;
                name: z.ZodString;
                type: z.ZodString;
                enabled: z.ZodBoolean;
            }, "strip", z.ZodTypeAny, {
                name: string;
                uuid: string;
                type: string;
                path: string;
                enabled: boolean;
                cid: string;
            }, {
                name: string;
                uuid: string;
                type: string;
                path: string;
                enabled: boolean;
                cid: string;
            }>, z.ZodObject<{
                nodeId: z.ZodString;
                path: z.ZodString;
                name: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                name: string;
                path: string;
                nodeId: string;
            }, {
                name: string;
                path: string;
                nodeId: string;
            }>, z.ZodNull]>;
            sourceInfo: z.ZodNullable<z.ZodObject<{
                localID: z.ZodArray<z.ZodString, "many">;
            }, "strip", z.ZodTypeAny, {
                localID: string[];
            }, {
                localID: string[];
            }>>;
            propertyPath: z.ZodArray<z.ZodString, "many">;
            target: z.ZodNullable<z.ZodObject<{
                nodeId: z.ZodString;
                path: z.ZodString;
                name: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                name: string;
                path: string;
                nodeId: string;
            }, {
                name: string;
                path: string;
                nodeId: string;
            }>>;
            targetInfo: z.ZodNullable<z.ZodObject<{
                localID: z.ZodArray<z.ZodString, "many">;
            }, "strip", z.ZodTypeAny, {
                localID: string[];
            }, {
                localID: string[];
            }>>;
        }, "strip", z.ZodTypeAny, {
            source: {
                name: string;
                path: string;
                nodeId: string;
            } | {
                name: string;
                uuid: string;
                type: string;
                path: string;
                enabled: boolean;
                cid: string;
            } | null;
            target: {
                name: string;
                path: string;
                nodeId: string;
            } | null;
            targetInfo: {
                localID: string[];
            } | null;
            propertyPath: string[];
            sourceInfo: {
                localID: string[];
            } | null;
        }, {
            source: {
                name: string;
                path: string;
                nodeId: string;
            } | {
                name: string;
                uuid: string;
                type: string;
                path: string;
                enabled: boolean;
                cid: string;
            } | null;
            target: {
                name: string;
                path: string;
                nodeId: string;
            } | null;
            targetInfo: {
                localID: string[];
            } | null;
            propertyPath: string[];
            sourceInfo: {
                localID: string[];
            } | null;
        }>, "many">>>;
        nestedPrefabInstanceRoots: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodObject<{
            nodeId: z.ZodString;
            path: z.ZodString;
            name: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            name: string;
            path: string;
            nodeId: string;
        }, {
            name: string;
            path: string;
            nodeId: string;
        }>, "many">>>;
    }, "strip", z.ZodTypeAny, {
        fileId: string;
        targetOverrides: {
            source: {
                name: string;
                path: string;
                nodeId: string;
            } | {
                name: string;
                uuid: string;
                type: string;
                path: string;
                enabled: boolean;
                cid: string;
            } | null;
            target: {
                name: string;
                path: string;
                nodeId: string;
            } | null;
            targetInfo: {
                localID: string[];
            } | null;
            propertyPath: string[];
            sourceInfo: {
                localID: string[];
            } | null;
        }[];
        nestedPrefabInstanceRoots: {
            name: string;
            path: string;
            nodeId: string;
        }[];
        root?: {
            name: string;
            path: string;
            nodeId: string;
        } | null | undefined;
        asset?: {
            data: {
                name: string;
                path: string;
                nodeId: string;
            };
            persistent: boolean;
            optimizationPolicy: OptimizationPolicy;
        } | undefined;
        instance?: {
            fileId: string;
            mountedChildren: IMountedChildrenInfo[];
            mountedComponents: {
                components: {
                    name: string;
                    uuid: string;
                    type: string;
                    path: string;
                    enabled: boolean;
                    cid: string;
                }[];
                targetInfo: {
                    localID: string[];
                } | null;
            }[];
            propertyOverrides: {
                targetInfo: {
                    localID: string[];
                } | null;
                propertyPath: string[];
                value?: any;
            }[];
            removedComponents: {
                localID: string[];
            }[];
            prefabRootNode?: {
                name: string;
                path: string;
                nodeId: string;
            } | undefined;
        } | undefined;
    }, {
        fileId: string;
        root?: {
            name: string;
            path: string;
            nodeId: string;
        } | null | undefined;
        asset?: {
            data: {
                name: string;
                path: string;
                nodeId: string;
            };
            persistent: boolean;
            optimizationPolicy: OptimizationPolicy;
        } | undefined;
        instance?: {
            fileId: string;
            prefabRootNode?: {
                name: string;
                path: string;
                nodeId: string;
            } | undefined;
            mountedChildren?: IMountedChildrenInfo[] | undefined;
            mountedComponents?: {
                components: {
                    name: string;
                    uuid: string;
                    type: string;
                    path: string;
                    enabled: boolean;
                    cid: string;
                }[];
                targetInfo: {
                    localID: string[];
                } | null;
            }[] | undefined;
            propertyOverrides?: {
                targetInfo: {
                    localID: string[];
                } | null;
                propertyPath: string[];
                value?: any;
            }[] | undefined;
            removedComponents?: {
                localID: string[];
            }[] | undefined;
        } | undefined;
        targetOverrides?: {
            source: {
                name: string;
                path: string;
                nodeId: string;
            } | {
                name: string;
                uuid: string;
                type: string;
                path: string;
                enabled: boolean;
                cid: string;
            } | null;
            target: {
                name: string;
                path: string;
                nodeId: string;
            } | null;
            targetInfo: {
                localID: string[];
            } | null;
            propertyPath: string[];
            sourceInfo: {
                localID: string[];
            } | null;
        }[] | undefined;
        nestedPrefabInstanceRoots?: {
            name: string;
            path: string;
            nodeId: string;
        }[] | undefined;
    }>, z.ZodNull, z.ZodUndefined]>;
    children: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodLazy<z.ZodType<INode, z.ZodTypeDef, INode>>, "many">>>;
    components: z.ZodDefault<z.ZodArray<z.ZodObject<{
        cid: z.ZodString;
        path: z.ZodString;
        uuid: z.ZodString;
        name: z.ZodString;
        type: z.ZodString;
        enabled: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        name: string;
        uuid: string;
        type: string;
        path: string;
        enabled: boolean;
        cid: string;
    }, {
        name: string;
        uuid: string;
        type: string;
        path: string;
        enabled: boolean;
        cid: string;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    name: string;
    assetUuid: string;
    assetType: string;
    components: {
        name: string;
        uuid: string;
        type: string;
        path: string;
        enabled: boolean;
        cid: string;
    }[];
    children: INode[];
    assetName: string;
    assetUrl: string;
    prefab?: {
        fileId: string;
        targetOverrides: {
            source: {
                name: string;
                path: string;
                nodeId: string;
            } | {
                name: string;
                uuid: string;
                type: string;
                path: string;
                enabled: boolean;
                cid: string;
            } | null;
            target: {
                name: string;
                path: string;
                nodeId: string;
            } | null;
            targetInfo: {
                localID: string[];
            } | null;
            propertyPath: string[];
            sourceInfo: {
                localID: string[];
            } | null;
        }[];
        nestedPrefabInstanceRoots: {
            name: string;
            path: string;
            nodeId: string;
        }[];
        root?: {
            name: string;
            path: string;
            nodeId: string;
        } | null | undefined;
        asset?: {
            data: {
                name: string;
                path: string;
                nodeId: string;
            };
            persistent: boolean;
            optimizationPolicy: OptimizationPolicy;
        } | undefined;
        instance?: {
            fileId: string;
            mountedChildren: IMountedChildrenInfo[];
            mountedComponents: {
                components: {
                    name: string;
                    uuid: string;
                    type: string;
                    path: string;
                    enabled: boolean;
                    cid: string;
                }[];
                targetInfo: {
                    localID: string[];
                } | null;
            }[];
            propertyOverrides: {
                targetInfo: {
                    localID: string[];
                } | null;
                propertyPath: string[];
                value?: any;
            }[];
            removedComponents: {
                localID: string[];
            }[];
            prefabRootNode?: {
                name: string;
                path: string;
                nodeId: string;
            } | undefined;
        } | undefined;
    } | null | undefined;
}, {
    name: string;
    assetUuid: string;
    assetType: string;
    assetName: string;
    assetUrl: string;
    prefab?: {
        fileId: string;
        root?: {
            name: string;
            path: string;
            nodeId: string;
        } | null | undefined;
        asset?: {
            data: {
                name: string;
                path: string;
                nodeId: string;
            };
            persistent: boolean;
            optimizationPolicy: OptimizationPolicy;
        } | undefined;
        instance?: {
            fileId: string;
            prefabRootNode?: {
                name: string;
                path: string;
                nodeId: string;
            } | undefined;
            mountedChildren?: IMountedChildrenInfo[] | undefined;
            mountedComponents?: {
                components: {
                    name: string;
                    uuid: string;
                    type: string;
                    path: string;
                    enabled: boolean;
                    cid: string;
                }[];
                targetInfo: {
                    localID: string[];
                } | null;
            }[] | undefined;
            propertyOverrides?: {
                targetInfo: {
                    localID: string[];
                } | null;
                propertyPath: string[];
                value?: any;
            }[] | undefined;
            removedComponents?: {
                localID: string[];
            }[] | undefined;
        } | undefined;
        targetOverrides?: {
            source: {
                name: string;
                path: string;
                nodeId: string;
            } | {
                name: string;
                uuid: string;
                type: string;
                path: string;
                enabled: boolean;
                cid: string;
            } | null;
            target: {
                name: string;
                path: string;
                nodeId: string;
            } | null;
            targetInfo: {
                localID: string[];
            } | null;
            propertyPath: string[];
            sourceInfo: {
                localID: string[];
            } | null;
        }[] | undefined;
        nestedPrefabInstanceRoots?: {
            name: string;
            path: string;
            nodeId: string;
        }[] | undefined;
    } | null | undefined;
    components?: {
        name: string;
        uuid: string;
        type: string;
        path: string;
        enabled: boolean;
        cid: string;
    }[] | undefined;
    children?: INode[] | undefined;
}>, z.ZodType<INode, z.ZodTypeDef, INode>]>>;

declare const SchemaDataKeys: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;

declare const SchemaDbDirResult: z.ZodObject<{
    dbPath: z.ZodString;
}, "strip", z.ZodTypeAny, {
    dbPath: string;
}, {
    dbPath: string;
}>;

declare const SchemaDirOrDbPath: z.ZodString;

declare const SchemaEraseLinesInRangeInfo: z.ZodObject<{
    dbURL: z.ZodString;
    fileType: z.ZodEnum<["js", "ts", "jsx", "tsx", "json", "txt", "md", "xml", "html", "css"]>;
    startLine: z.ZodDefault<z.ZodNumber>;
    endLine: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    dbURL: string;
    startLine: number;
    fileType: "json" | "html" | "jsx" | "js" | "ts" | "tsx" | "txt" | "md" | "xml" | "css";
    endLine: number;
}, {
    dbURL: string;
    fileType: "json" | "html" | "jsx" | "js" | "ts" | "tsx" | "txt" | "md" | "xml" | "css";
    startLine?: number | undefined;
    endLine?: number | undefined;
}>;

declare const SchemaFileEditorResult: z.ZodBoolean;

declare const SchemaFileQueryTextResult: z.ZodString;

declare const SchemaFilterPluginOptions: z.ZodOptional<z.ZodObject<{
    loadPluginInEditor: z.ZodOptional<z.ZodBoolean>;
    loadPluginInWeb: z.ZodOptional<z.ZodBoolean>;
    loadPluginInNative: z.ZodOptional<z.ZodBoolean>;
    loadPluginInMiniGame: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    loadPluginInEditor?: boolean | undefined;
    loadPluginInWeb?: boolean | undefined;
    loadPluginInNative?: boolean | undefined;
    loadPluginInMiniGame?: boolean | undefined;
}, {
    loadPluginInEditor?: boolean | undefined;
    loadPluginInWeb?: boolean | undefined;
    loadPluginInNative?: boolean | undefined;
    loadPluginInMiniGame?: boolean | undefined;
}>>;

declare const SchemaGetPrefabInfoOptions: z.ZodObject<{
    nodePath: z.ZodString;
}, "strip", z.ZodTypeAny, {
    nodePath: string;
}, {
    nodePath: string;
}>;

declare const SchemaGetPrefabResult: z.ZodUnion<[z.ZodObject<{
    asset: z.ZodOptional<z.ZodObject<{
        data: z.ZodObject<{
            nodeId: z.ZodString;
            path: z.ZodString;
            name: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            name: string;
            path: string;
            nodeId: string;
        }, {
            name: string;
            path: string;
            nodeId: string;
        }>;
        optimizationPolicy: z.ZodNativeEnum<OptimizationPolicy>;
        persistent: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        data: {
            name: string;
            path: string;
            nodeId: string;
        };
        persistent: boolean;
        optimizationPolicy: OptimizationPolicy;
    }, {
        data: {
            name: string;
            path: string;
            nodeId: string;
        };
        persistent: boolean;
        optimizationPolicy: OptimizationPolicy;
    }>>;
    root: z.ZodOptional<z.ZodNullable<z.ZodObject<{
        nodeId: z.ZodString;
        path: z.ZodString;
        name: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        name: string;
        path: string;
        nodeId: string;
    }, {
        name: string;
        path: string;
        nodeId: string;
    }>>>;
    instance: z.ZodOptional<z.ZodObject<{
        fileId: z.ZodString;
        prefabRootNode: z.ZodOptional<z.ZodObject<{
            nodeId: z.ZodString;
            path: z.ZodString;
            name: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            name: string;
            path: string;
            nodeId: string;
        }, {
            name: string;
            path: string;
            nodeId: string;
        }>>;
        mountedChildren: z.ZodDefault<z.ZodArray<z.ZodType<IMountedChildrenInfo, z.ZodTypeDef, IMountedChildrenInfo>, "many">>;
        mountedComponents: z.ZodDefault<z.ZodArray<z.ZodObject<{
            targetInfo: z.ZodNullable<z.ZodObject<{
                localID: z.ZodArray<z.ZodString, "many">;
            }, "strip", z.ZodTypeAny, {
                localID: string[];
            }, {
                localID: string[];
            }>>;
            components: z.ZodArray<z.ZodObject<{
                cid: z.ZodString;
                path: z.ZodString;
                uuid: z.ZodString;
                name: z.ZodString;
                type: z.ZodString;
                enabled: z.ZodBoolean;
            }, "strip", z.ZodTypeAny, {
                name: string;
                uuid: string;
                type: string;
                path: string;
                enabled: boolean;
                cid: string;
            }, {
                name: string;
                uuid: string;
                type: string;
                path: string;
                enabled: boolean;
                cid: string;
            }>, "many">;
        }, "strip", z.ZodTypeAny, {
            components: {
                name: string;
                uuid: string;
                type: string;
                path: string;
                enabled: boolean;
                cid: string;
            }[];
            targetInfo: {
                localID: string[];
            } | null;
        }, {
            components: {
                name: string;
                uuid: string;
                type: string;
                path: string;
                enabled: boolean;
                cid: string;
            }[];
            targetInfo: {
                localID: string[];
            } | null;
        }>, "many">>;
        propertyOverrides: z.ZodDefault<z.ZodArray<z.ZodObject<{
            targetInfo: z.ZodNullable<z.ZodObject<{
                localID: z.ZodArray<z.ZodString, "many">;
            }, "strip", z.ZodTypeAny, {
                localID: string[];
            }, {
                localID: string[];
            }>>;
            propertyPath: z.ZodArray<z.ZodString, "many">;
            value: z.ZodAny;
        }, "strip", z.ZodTypeAny, {
            targetInfo: {
                localID: string[];
            } | null;
            propertyPath: string[];
            value?: any;
        }, {
            targetInfo: {
                localID: string[];
            } | null;
            propertyPath: string[];
            value?: any;
        }>, "many">>;
        removedComponents: z.ZodDefault<z.ZodArray<z.ZodObject<{
            localID: z.ZodArray<z.ZodString, "many">;
        }, "strip", z.ZodTypeAny, {
            localID: string[];
        }, {
            localID: string[];
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        fileId: string;
        mountedChildren: IMountedChildrenInfo[];
        mountedComponents: {
            components: {
                name: string;
                uuid: string;
                type: string;
                path: string;
                enabled: boolean;
                cid: string;
            }[];
            targetInfo: {
                localID: string[];
            } | null;
        }[];
        propertyOverrides: {
            targetInfo: {
                localID: string[];
            } | null;
            propertyPath: string[];
            value?: any;
        }[];
        removedComponents: {
            localID: string[];
        }[];
        prefabRootNode?: {
            name: string;
            path: string;
            nodeId: string;
        } | undefined;
    }, {
        fileId: string;
        prefabRootNode?: {
            name: string;
            path: string;
            nodeId: string;
        } | undefined;
        mountedChildren?: IMountedChildrenInfo[] | undefined;
        mountedComponents?: {
            components: {
                name: string;
                uuid: string;
                type: string;
                path: string;
                enabled: boolean;
                cid: string;
            }[];
            targetInfo: {
                localID: string[];
            } | null;
        }[] | undefined;
        propertyOverrides?: {
            targetInfo: {
                localID: string[];
            } | null;
            propertyPath: string[];
            value?: any;
        }[] | undefined;
        removedComponents?: {
            localID: string[];
        }[] | undefined;
    }>>;
    fileId: z.ZodString;
    targetOverrides: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodObject<{
        source: z.ZodUnion<[z.ZodObject<{
            cid: z.ZodString;
            path: z.ZodString;
            uuid: z.ZodString;
            name: z.ZodString;
            type: z.ZodString;
            enabled: z.ZodBoolean;
        }, "strip", z.ZodTypeAny, {
            name: string;
            uuid: string;
            type: string;
            path: string;
            enabled: boolean;
            cid: string;
        }, {
            name: string;
            uuid: string;
            type: string;
            path: string;
            enabled: boolean;
            cid: string;
        }>, z.ZodObject<{
            nodeId: z.ZodString;
            path: z.ZodString;
            name: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            name: string;
            path: string;
            nodeId: string;
        }, {
            name: string;
            path: string;
            nodeId: string;
        }>, z.ZodNull]>;
        sourceInfo: z.ZodNullable<z.ZodObject<{
            localID: z.ZodArray<z.ZodString, "many">;
        }, "strip", z.ZodTypeAny, {
            localID: string[];
        }, {
            localID: string[];
        }>>;
        propertyPath: z.ZodArray<z.ZodString, "many">;
        target: z.ZodNullable<z.ZodObject<{
            nodeId: z.ZodString;
            path: z.ZodString;
            name: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            name: string;
            path: string;
            nodeId: string;
        }, {
            name: string;
            path: string;
            nodeId: string;
        }>>;
        targetInfo: z.ZodNullable<z.ZodObject<{
            localID: z.ZodArray<z.ZodString, "many">;
        }, "strip", z.ZodTypeAny, {
            localID: string[];
        }, {
            localID: string[];
        }>>;
    }, "strip", z.ZodTypeAny, {
        source: {
            name: string;
            path: string;
            nodeId: string;
        } | {
            name: string;
            uuid: string;
            type: string;
            path: string;
            enabled: boolean;
            cid: string;
        } | null;
        target: {
            name: string;
            path: string;
            nodeId: string;
        } | null;
        targetInfo: {
            localID: string[];
        } | null;
        propertyPath: string[];
        sourceInfo: {
            localID: string[];
        } | null;
    }, {
        source: {
            name: string;
            path: string;
            nodeId: string;
        } | {
            name: string;
            uuid: string;
            type: string;
            path: string;
            enabled: boolean;
            cid: string;
        } | null;
        target: {
            name: string;
            path: string;
            nodeId: string;
        } | null;
        targetInfo: {
            localID: string[];
        } | null;
        propertyPath: string[];
        sourceInfo: {
            localID: string[];
        } | null;
    }>, "many">>>;
    nestedPrefabInstanceRoots: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodObject<{
        nodeId: z.ZodString;
        path: z.ZodString;
        name: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        name: string;
        path: string;
        nodeId: string;
    }, {
        name: string;
        path: string;
        nodeId: string;
    }>, "many">>>;
}, "strip", z.ZodTypeAny, {
    fileId: string;
    targetOverrides: {
        source: {
            name: string;
            path: string;
            nodeId: string;
        } | {
            name: string;
            uuid: string;
            type: string;
            path: string;
            enabled: boolean;
            cid: string;
        } | null;
        target: {
            name: string;
            path: string;
            nodeId: string;
        } | null;
        targetInfo: {
            localID: string[];
        } | null;
        propertyPath: string[];
        sourceInfo: {
            localID: string[];
        } | null;
    }[];
    nestedPrefabInstanceRoots: {
        name: string;
        path: string;
        nodeId: string;
    }[];
    root?: {
        name: string;
        path: string;
        nodeId: string;
    } | null | undefined;
    asset?: {
        data: {
            name: string;
            path: string;
            nodeId: string;
        };
        persistent: boolean;
        optimizationPolicy: OptimizationPolicy;
    } | undefined;
    instance?: {
        fileId: string;
        mountedChildren: IMountedChildrenInfo[];
        mountedComponents: {
            components: {
                name: string;
                uuid: string;
                type: string;
                path: string;
                enabled: boolean;
                cid: string;
            }[];
            targetInfo: {
                localID: string[];
            } | null;
        }[];
        propertyOverrides: {
            targetInfo: {
                localID: string[];
            } | null;
            propertyPath: string[];
            value?: any;
        }[];
        removedComponents: {
            localID: string[];
        }[];
        prefabRootNode?: {
            name: string;
            path: string;
            nodeId: string;
        } | undefined;
    } | undefined;
}, {
    fileId: string;
    root?: {
        name: string;
        path: string;
        nodeId: string;
    } | null | undefined;
    asset?: {
        data: {
            name: string;
            path: string;
            nodeId: string;
        };
        persistent: boolean;
        optimizationPolicy: OptimizationPolicy;
    } | undefined;
    instance?: {
        fileId: string;
        prefabRootNode?: {
            name: string;
            path: string;
            nodeId: string;
        } | undefined;
        mountedChildren?: IMountedChildrenInfo[] | undefined;
        mountedComponents?: {
            components: {
                name: string;
                uuid: string;
                type: string;
                path: string;
                enabled: boolean;
                cid: string;
            }[];
            targetInfo: {
                localID: string[];
            } | null;
        }[] | undefined;
        propertyOverrides?: {
            targetInfo: {
                localID: string[];
            } | null;
            propertyPath: string[];
            value?: any;
        }[] | undefined;
        removedComponents?: {
            localID: string[];
        }[] | undefined;
    } | undefined;
    targetOverrides?: {
        source: {
            name: string;
            path: string;
            nodeId: string;
        } | {
            name: string;
            uuid: string;
            type: string;
            path: string;
            enabled: boolean;
            cid: string;
        } | null;
        target: {
            name: string;
            path: string;
            nodeId: string;
        } | null;
        targetInfo: {
            localID: string[];
        } | null;
        propertyPath: string[];
        sourceInfo: {
            localID: string[];
        } | null;
    }[] | undefined;
    nestedPrefabInstanceRoots?: {
        name: string;
        path: string;
        nodeId: string;
    }[] | undefined;
}>, z.ZodNull]>;

declare const SchemaImportedAssetResult: z.ZodArray<z.ZodType<any, z.ZodTypeDef, any>, "many">;

declare const SchemaInsertTextAtLineInfo: z.ZodObject<{
    dbURL: z.ZodString;
    fileType: z.ZodEnum<["js", "ts", "jsx", "tsx", "json", "txt", "md", "xml", "html", "css"]>;
    lineNumber: z.ZodDefault<z.ZodNumber>;
    text: z.ZodString;
}, "strip", z.ZodTypeAny, {
    text: string;
    dbURL: string;
    fileType: "json" | "html" | "jsx" | "js" | "ts" | "tsx" | "txt" | "md" | "xml" | "css";
    lineNumber: number;
}, {
    text: string;
    dbURL: string;
    fileType: "json" | "html" | "jsx" | "js" | "ts" | "tsx" | "txt" | "md" | "xml" | "css";
    lineNumber?: number | undefined;
}>;

declare const SchemaIsPrefabInstanceOptions: z.ZodObject<{
    nodePath: z.ZodString;
}, "strip", z.ZodTypeAny, {
    nodePath: string;
}, {
    nodePath: string;
}>;

declare const SchemaIsPrefabInstanceResult: z.ZodBoolean;

declare const SchemaMigrateResult: z.ZodRecord<z.ZodString, z.ZodAny>;

declare const SchemaNode: z.ZodType<INode>;

declare const SchemaNodeCreateByAsset: z.ZodObject<{
    path: z.ZodString;
    name: z.ZodOptional<z.ZodString>;
    workMode: z.ZodOptional<z.ZodEnum<["2d", "3d"]>>;
    keepWorldTransform: z.ZodOptional<z.ZodBoolean>;
    position: z.ZodOptional<z.ZodObject<{
        x: z.ZodNumber;
        y: z.ZodNumber;
        z: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        x: number;
        y: number;
        z: number;
    }, {
        x: number;
        y: number;
        z: number;
    }>>;
    canvasRequired: z.ZodOptional<z.ZodBoolean>;
} & {
    dbURL: z.ZodString;
}, "strip", z.ZodTypeAny, {
    path: string;
    dbURL: string;
    name?: string | undefined;
    position?: {
        x: number;
        y: number;
        z: number;
    } | undefined;
    keepWorldTransform?: boolean | undefined;
    workMode?: "3d" | "2d" | undefined;
    canvasRequired?: boolean | undefined;
}, {
    path: string;
    dbURL: string;
    name?: string | undefined;
    position?: {
        x: number;
        y: number;
        z: number;
    } | undefined;
    keepWorldTransform?: boolean | undefined;
    workMode?: "3d" | "2d" | undefined;
    canvasRequired?: boolean | undefined;
}>;

declare const SchemaNodeCreateByType: z.ZodObject<{
    path: z.ZodString;
    name: z.ZodOptional<z.ZodString>;
    workMode: z.ZodOptional<z.ZodEnum<["2d", "3d"]>>;
    keepWorldTransform: z.ZodOptional<z.ZodBoolean>;
    position: z.ZodOptional<z.ZodObject<{
        x: z.ZodNumber;
        y: z.ZodNumber;
        z: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        x: number;
        y: number;
        z: number;
    }, {
        x: number;
        y: number;
        z: number;
    }>>;
    canvasRequired: z.ZodOptional<z.ZodBoolean>;
} & {
    nodeType: z.ZodEnum<[string, ...string[]]>;
}, "strip", z.ZodTypeAny, {
    path: string;
    nodeType: string;
    name?: string | undefined;
    position?: {
        x: number;
        y: number;
        z: number;
    } | undefined;
    keepWorldTransform?: boolean | undefined;
    workMode?: "3d" | "2d" | undefined;
    canvasRequired?: boolean | undefined;
}, {
    path: string;
    nodeType: string;
    name?: string | undefined;
    position?: {
        x: number;
        y: number;
        z: number;
    } | undefined;
    keepWorldTransform?: boolean | undefined;
    workMode?: "3d" | "2d" | undefined;
    canvasRequired?: boolean | undefined;
}>;

declare const SchemaNodeDelete: z.ZodObject<{
    path: z.ZodString;
    keepWorldTransform: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    path: string;
    keepWorldTransform?: boolean | undefined;
}, {
    path: string;
    keepWorldTransform?: boolean | undefined;
}>;

declare const SchemaNodeDeleteResult: z.ZodObject<{
    path: z.ZodString;
}, "strip", z.ZodTypeAny, {
    path: string;
}, {
    path: string;
}>;

declare const SchemaNodeQuery: z.ZodObject<{
    path: z.ZodString;
    queryChildren: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    path: string;
    queryChildren: boolean;
}, {
    path: string;
    queryChildren?: boolean | undefined;
}>;

declare const SchemaNodeQueryResult: z.ZodType<INode>;

declare const SchemaNodeUpdate: z.ZodObject<{
    path: z.ZodString;
    name: z.ZodOptional<z.ZodString>;
    properties: z.ZodOptional<z.ZodObject<{
        position: z.ZodOptional<z.ZodObject<{
            x: z.ZodNumber;
            y: z.ZodNumber;
            z: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            x: number;
            y: number;
            z: number;
        }, {
            x: number;
            y: number;
            z: number;
        }>>;
        rotation: z.ZodOptional<z.ZodObject<{
            x: z.ZodNumber;
            y: z.ZodNumber;
            z: z.ZodNumber;
            w: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            x: number;
            y: number;
            z: number;
            w: number;
        }, {
            x: number;
            y: number;
            z: number;
            w: number;
        }>>;
        eulerAngles: z.ZodOptional<z.ZodObject<{
            x: z.ZodNumber;
            y: z.ZodNumber;
            z: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            x: number;
            y: number;
            z: number;
        }, {
            x: number;
            y: number;
            z: number;
        }>>;
        scale: z.ZodOptional<z.ZodObject<{
            x: z.ZodNumber;
            y: z.ZodNumber;
            z: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            x: number;
            y: number;
            z: number;
        }, {
            x: number;
            y: number;
            z: number;
        }>>;
        mobility: z.ZodOptional<z.ZodNumber>;
        layer: z.ZodOptional<z.ZodNumber>;
        active: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        layer?: number | undefined;
        rotation?: {
            x: number;
            y: number;
            z: number;
            w: number;
        } | undefined;
        scale?: {
            x: number;
            y: number;
            z: number;
        } | undefined;
        position?: {
            x: number;
            y: number;
            z: number;
        } | undefined;
        active?: boolean | undefined;
        eulerAngles?: {
            x: number;
            y: number;
            z: number;
        } | undefined;
        mobility?: number | undefined;
    }, {
        layer?: number | undefined;
        rotation?: {
            x: number;
            y: number;
            z: number;
            w: number;
        } | undefined;
        scale?: {
            x: number;
            y: number;
            z: number;
        } | undefined;
        position?: {
            x: number;
            y: number;
            z: number;
        } | undefined;
        active?: boolean | undefined;
        eulerAngles?: {
            x: number;
            y: number;
            z: number;
        } | undefined;
        mobility?: number | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    path: string;
    name?: string | undefined;
    properties?: {
        layer?: number | undefined;
        rotation?: {
            x: number;
            y: number;
            z: number;
            w: number;
        } | undefined;
        scale?: {
            x: number;
            y: number;
            z: number;
        } | undefined;
        position?: {
            x: number;
            y: number;
            z: number;
        } | undefined;
        active?: boolean | undefined;
        eulerAngles?: {
            x: number;
            y: number;
            z: number;
        } | undefined;
        mobility?: number | undefined;
    } | undefined;
}, {
    path: string;
    name?: string | undefined;
    properties?: {
        layer?: number | undefined;
        rotation?: {
            x: number;
            y: number;
            z: number;
            w: number;
        } | undefined;
        scale?: {
            x: number;
            y: number;
            z: number;
        } | undefined;
        position?: {
            x: number;
            y: number;
            z: number;
        } | undefined;
        active?: boolean | undefined;
        eulerAngles?: {
            x: number;
            y: number;
            z: number;
        } | undefined;
        mobility?: number | undefined;
    } | undefined;
}>;

declare const SchemaNodeUpdateResult: z.ZodObject<{
    path: z.ZodString;
}, "strip", z.ZodTypeAny, {
    path: string;
}, {
    path: string;
}>;

declare const SchemaOpenResult: z.ZodUnion<[z.ZodObject<{
    assetName: z.ZodString;
    assetUuid: z.ZodString;
    assetUrl: z.ZodString;
    assetType: z.ZodString;
} & {
    name: z.ZodString;
    prefab: z.ZodUnion<[z.ZodObject<{
        asset: z.ZodOptional<z.ZodObject<{
            data: z.ZodObject<{
                nodeId: z.ZodString;
                path: z.ZodString;
                name: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                name: string;
                path: string;
                nodeId: string;
            }, {
                name: string;
                path: string;
                nodeId: string;
            }>;
            optimizationPolicy: z.ZodNativeEnum<OptimizationPolicy>;
            persistent: z.ZodBoolean;
        }, "strip", z.ZodTypeAny, {
            data: {
                name: string;
                path: string;
                nodeId: string;
            };
            persistent: boolean;
            optimizationPolicy: OptimizationPolicy;
        }, {
            data: {
                name: string;
                path: string;
                nodeId: string;
            };
            persistent: boolean;
            optimizationPolicy: OptimizationPolicy;
        }>>;
        root: z.ZodOptional<z.ZodNullable<z.ZodObject<{
            nodeId: z.ZodString;
            path: z.ZodString;
            name: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            name: string;
            path: string;
            nodeId: string;
        }, {
            name: string;
            path: string;
            nodeId: string;
        }>>>;
        instance: z.ZodOptional<z.ZodObject<{
            fileId: z.ZodString;
            prefabRootNode: z.ZodOptional<z.ZodObject<{
                nodeId: z.ZodString;
                path: z.ZodString;
                name: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                name: string;
                path: string;
                nodeId: string;
            }, {
                name: string;
                path: string;
                nodeId: string;
            }>>;
            mountedChildren: z.ZodDefault<z.ZodArray<z.ZodType<IMountedChildrenInfo, z.ZodTypeDef, IMountedChildrenInfo>, "many">>;
            mountedComponents: z.ZodDefault<z.ZodArray<z.ZodObject<{
                targetInfo: z.ZodNullable<z.ZodObject<{
                    localID: z.ZodArray<z.ZodString, "many">;
                }, "strip", z.ZodTypeAny, {
                    localID: string[];
                }, {
                    localID: string[];
                }>>;
                components: z.ZodArray<z.ZodObject<{
                    cid: z.ZodString;
                    path: z.ZodString;
                    uuid: z.ZodString;
                    name: z.ZodString;
                    type: z.ZodString;
                    enabled: z.ZodBoolean;
                }, "strip", z.ZodTypeAny, {
                    name: string;
                    uuid: string;
                    type: string;
                    path: string;
                    enabled: boolean;
                    cid: string;
                }, {
                    name: string;
                    uuid: string;
                    type: string;
                    path: string;
                    enabled: boolean;
                    cid: string;
                }>, "many">;
            }, "strip", z.ZodTypeAny, {
                components: {
                    name: string;
                    uuid: string;
                    type: string;
                    path: string;
                    enabled: boolean;
                    cid: string;
                }[];
                targetInfo: {
                    localID: string[];
                } | null;
            }, {
                components: {
                    name: string;
                    uuid: string;
                    type: string;
                    path: string;
                    enabled: boolean;
                    cid: string;
                }[];
                targetInfo: {
                    localID: string[];
                } | null;
            }>, "many">>;
            propertyOverrides: z.ZodDefault<z.ZodArray<z.ZodObject<{
                targetInfo: z.ZodNullable<z.ZodObject<{
                    localID: z.ZodArray<z.ZodString, "many">;
                }, "strip", z.ZodTypeAny, {
                    localID: string[];
                }, {
                    localID: string[];
                }>>;
                propertyPath: z.ZodArray<z.ZodString, "many">;
                value: z.ZodAny;
            }, "strip", z.ZodTypeAny, {
                targetInfo: {
                    localID: string[];
                } | null;
                propertyPath: string[];
                value?: any;
            }, {
                targetInfo: {
                    localID: string[];
                } | null;
                propertyPath: string[];
                value?: any;
            }>, "many">>;
            removedComponents: z.ZodDefault<z.ZodArray<z.ZodObject<{
                localID: z.ZodArray<z.ZodString, "many">;
            }, "strip", z.ZodTypeAny, {
                localID: string[];
            }, {
                localID: string[];
            }>, "many">>;
        }, "strip", z.ZodTypeAny, {
            fileId: string;
            mountedChildren: IMountedChildrenInfo[];
            mountedComponents: {
                components: {
                    name: string;
                    uuid: string;
                    type: string;
                    path: string;
                    enabled: boolean;
                    cid: string;
                }[];
                targetInfo: {
                    localID: string[];
                } | null;
            }[];
            propertyOverrides: {
                targetInfo: {
                    localID: string[];
                } | null;
                propertyPath: string[];
                value?: any;
            }[];
            removedComponents: {
                localID: string[];
            }[];
            prefabRootNode?: {
                name: string;
                path: string;
                nodeId: string;
            } | undefined;
        }, {
            fileId: string;
            prefabRootNode?: {
                name: string;
                path: string;
                nodeId: string;
            } | undefined;
            mountedChildren?: IMountedChildrenInfo[] | undefined;
            mountedComponents?: {
                components: {
                    name: string;
                    uuid: string;
                    type: string;
                    path: string;
                    enabled: boolean;
                    cid: string;
                }[];
                targetInfo: {
                    localID: string[];
                } | null;
            }[] | undefined;
            propertyOverrides?: {
                targetInfo: {
                    localID: string[];
                } | null;
                propertyPath: string[];
                value?: any;
            }[] | undefined;
            removedComponents?: {
                localID: string[];
            }[] | undefined;
        }>>;
        fileId: z.ZodString;
        targetOverrides: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodObject<{
            source: z.ZodUnion<[z.ZodObject<{
                cid: z.ZodString;
                path: z.ZodString;
                uuid: z.ZodString;
                name: z.ZodString;
                type: z.ZodString;
                enabled: z.ZodBoolean;
            }, "strip", z.ZodTypeAny, {
                name: string;
                uuid: string;
                type: string;
                path: string;
                enabled: boolean;
                cid: string;
            }, {
                name: string;
                uuid: string;
                type: string;
                path: string;
                enabled: boolean;
                cid: string;
            }>, z.ZodObject<{
                nodeId: z.ZodString;
                path: z.ZodString;
                name: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                name: string;
                path: string;
                nodeId: string;
            }, {
                name: string;
                path: string;
                nodeId: string;
            }>, z.ZodNull]>;
            sourceInfo: z.ZodNullable<z.ZodObject<{
                localID: z.ZodArray<z.ZodString, "many">;
            }, "strip", z.ZodTypeAny, {
                localID: string[];
            }, {
                localID: string[];
            }>>;
            propertyPath: z.ZodArray<z.ZodString, "many">;
            target: z.ZodNullable<z.ZodObject<{
                nodeId: z.ZodString;
                path: z.ZodString;
                name: z.ZodString;
            }, "strip", z.ZodTypeAny, {
                name: string;
                path: string;
                nodeId: string;
            }, {
                name: string;
                path: string;
                nodeId: string;
            }>>;
            targetInfo: z.ZodNullable<z.ZodObject<{
                localID: z.ZodArray<z.ZodString, "many">;
            }, "strip", z.ZodTypeAny, {
                localID: string[];
            }, {
                localID: string[];
            }>>;
        }, "strip", z.ZodTypeAny, {
            source: {
                name: string;
                path: string;
                nodeId: string;
            } | {
                name: string;
                uuid: string;
                type: string;
                path: string;
                enabled: boolean;
                cid: string;
            } | null;
            target: {
                name: string;
                path: string;
                nodeId: string;
            } | null;
            targetInfo: {
                localID: string[];
            } | null;
            propertyPath: string[];
            sourceInfo: {
                localID: string[];
            } | null;
        }, {
            source: {
                name: string;
                path: string;
                nodeId: string;
            } | {
                name: string;
                uuid: string;
                type: string;
                path: string;
                enabled: boolean;
                cid: string;
            } | null;
            target: {
                name: string;
                path: string;
                nodeId: string;
            } | null;
            targetInfo: {
                localID: string[];
            } | null;
            propertyPath: string[];
            sourceInfo: {
                localID: string[];
            } | null;
        }>, "many">>>;
        nestedPrefabInstanceRoots: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodObject<{
            nodeId: z.ZodString;
            path: z.ZodString;
            name: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            name: string;
            path: string;
            nodeId: string;
        }, {
            name: string;
            path: string;
            nodeId: string;
        }>, "many">>>;
    }, "strip", z.ZodTypeAny, {
        fileId: string;
        targetOverrides: {
            source: {
                name: string;
                path: string;
                nodeId: string;
            } | {
                name: string;
                uuid: string;
                type: string;
                path: string;
                enabled: boolean;
                cid: string;
            } | null;
            target: {
                name: string;
                path: string;
                nodeId: string;
            } | null;
            targetInfo: {
                localID: string[];
            } | null;
            propertyPath: string[];
            sourceInfo: {
                localID: string[];
            } | null;
        }[];
        nestedPrefabInstanceRoots: {
            name: string;
            path: string;
            nodeId: string;
        }[];
        root?: {
            name: string;
            path: string;
            nodeId: string;
        } | null | undefined;
        asset?: {
            data: {
                name: string;
                path: string;
                nodeId: string;
            };
            persistent: boolean;
            optimizationPolicy: OptimizationPolicy;
        } | undefined;
        instance?: {
            fileId: string;
            mountedChildren: IMountedChildrenInfo[];
            mountedComponents: {
                components: {
                    name: string;
                    uuid: string;
                    type: string;
                    path: string;
                    enabled: boolean;
                    cid: string;
                }[];
                targetInfo: {
                    localID: string[];
                } | null;
            }[];
            propertyOverrides: {
                targetInfo: {
                    localID: string[];
                } | null;
                propertyPath: string[];
                value?: any;
            }[];
            removedComponents: {
                localID: string[];
            }[];
            prefabRootNode?: {
                name: string;
                path: string;
                nodeId: string;
            } | undefined;
        } | undefined;
    }, {
        fileId: string;
        root?: {
            name: string;
            path: string;
            nodeId: string;
        } | null | undefined;
        asset?: {
            data: {
                name: string;
                path: string;
                nodeId: string;
            };
            persistent: boolean;
            optimizationPolicy: OptimizationPolicy;
        } | undefined;
        instance?: {
            fileId: string;
            prefabRootNode?: {
                name: string;
                path: string;
                nodeId: string;
            } | undefined;
            mountedChildren?: IMountedChildrenInfo[] | undefined;
            mountedComponents?: {
                components: {
                    name: string;
                    uuid: string;
                    type: string;
                    path: string;
                    enabled: boolean;
                    cid: string;
                }[];
                targetInfo: {
                    localID: string[];
                } | null;
            }[] | undefined;
            propertyOverrides?: {
                targetInfo: {
                    localID: string[];
                } | null;
                propertyPath: string[];
                value?: any;
            }[] | undefined;
            removedComponents?: {
                localID: string[];
            }[] | undefined;
        } | undefined;
        targetOverrides?: {
            source: {
                name: string;
                path: string;
                nodeId: string;
            } | {
                name: string;
                uuid: string;
                type: string;
                path: string;
                enabled: boolean;
                cid: string;
            } | null;
            target: {
                name: string;
                path: string;
                nodeId: string;
            } | null;
            targetInfo: {
                localID: string[];
            } | null;
            propertyPath: string[];
            sourceInfo: {
                localID: string[];
            } | null;
        }[] | undefined;
        nestedPrefabInstanceRoots?: {
            name: string;
            path: string;
            nodeId: string;
        }[] | undefined;
    }>, z.ZodNull, z.ZodUndefined]>;
    children: z.ZodDefault<z.ZodOptional<z.ZodArray<z.ZodLazy<z.ZodType<INode, z.ZodTypeDef, INode>>, "many">>>;
    components: z.ZodDefault<z.ZodArray<z.ZodObject<{
        cid: z.ZodString;
        path: z.ZodString;
        uuid: z.ZodString;
        name: z.ZodString;
        type: z.ZodString;
        enabled: z.ZodBoolean;
    }, "strip", z.ZodTypeAny, {
        name: string;
        uuid: string;
        type: string;
        path: string;
        enabled: boolean;
        cid: string;
    }, {
        name: string;
        uuid: string;
        type: string;
        path: string;
        enabled: boolean;
        cid: string;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    name: string;
    assetUuid: string;
    assetType: string;
    components: {
        name: string;
        uuid: string;
        type: string;
        path: string;
        enabled: boolean;
        cid: string;
    }[];
    children: INode[];
    assetName: string;
    assetUrl: string;
    prefab?: {
        fileId: string;
        targetOverrides: {
            source: {
                name: string;
                path: string;
                nodeId: string;
            } | {
                name: string;
                uuid: string;
                type: string;
                path: string;
                enabled: boolean;
                cid: string;
            } | null;
            target: {
                name: string;
                path: string;
                nodeId: string;
            } | null;
            targetInfo: {
                localID: string[];
            } | null;
            propertyPath: string[];
            sourceInfo: {
                localID: string[];
            } | null;
        }[];
        nestedPrefabInstanceRoots: {
            name: string;
            path: string;
            nodeId: string;
        }[];
        root?: {
            name: string;
            path: string;
            nodeId: string;
        } | null | undefined;
        asset?: {
            data: {
                name: string;
                path: string;
                nodeId: string;
            };
            persistent: boolean;
            optimizationPolicy: OptimizationPolicy;
        } | undefined;
        instance?: {
            fileId: string;
            mountedChildren: IMountedChildrenInfo[];
            mountedComponents: {
                components: {
                    name: string;
                    uuid: string;
                    type: string;
                    path: string;
                    enabled: boolean;
                    cid: string;
                }[];
                targetInfo: {
                    localID: string[];
                } | null;
            }[];
            propertyOverrides: {
                targetInfo: {
                    localID: string[];
                } | null;
                propertyPath: string[];
                value?: any;
            }[];
            removedComponents: {
                localID: string[];
            }[];
            prefabRootNode?: {
                name: string;
                path: string;
                nodeId: string;
            } | undefined;
        } | undefined;
    } | null | undefined;
}, {
    name: string;
    assetUuid: string;
    assetType: string;
    assetName: string;
    assetUrl: string;
    prefab?: {
        fileId: string;
        root?: {
            name: string;
            path: string;
            nodeId: string;
        } | null | undefined;
        asset?: {
            data: {
                name: string;
                path: string;
                nodeId: string;
            };
            persistent: boolean;
            optimizationPolicy: OptimizationPolicy;
        } | undefined;
        instance?: {
            fileId: string;
            prefabRootNode?: {
                name: string;
                path: string;
                nodeId: string;
            } | undefined;
            mountedChildren?: IMountedChildrenInfo[] | undefined;
            mountedComponents?: {
                components: {
                    name: string;
                    uuid: string;
                    type: string;
                    path: string;
                    enabled: boolean;
                    cid: string;
                }[];
                targetInfo: {
                    localID: string[];
                } | null;
            }[] | undefined;
            propertyOverrides?: {
                targetInfo: {
                    localID: string[];
                } | null;
                propertyPath: string[];
                value?: any;
            }[] | undefined;
            removedComponents?: {
                localID: string[];
            }[] | undefined;
        } | undefined;
        targetOverrides?: {
            source: {
                name: string;
                path: string;
                nodeId: string;
            } | {
                name: string;
                uuid: string;
                type: string;
                path: string;
                enabled: boolean;
                cid: string;
            } | null;
            target: {
                name: string;
                path: string;
                nodeId: string;
            } | null;
            targetInfo: {
                localID: string[];
            } | null;
            propertyPath: string[];
            sourceInfo: {
                localID: string[];
            } | null;
        }[] | undefined;
        nestedPrefabInstanceRoots?: {
            name: string;
            path: string;
            nodeId: string;
        }[] | undefined;
    } | null | undefined;
    components?: {
        name: string;
        uuid: string;
        type: string;
        path: string;
        enabled: boolean;
        cid: string;
    }[] | undefined;
    children?: INode[] | undefined;
}>, z.ZodType<INode, z.ZodTypeDef, INode>]>;

declare const SchemaPathResult: z.ZodNullable<z.ZodString>;

declare const SchemaPlatform: z.ZodEnum<["web-desktop", "web-mobile", "windows"]>;

declare const SchemaPlatformCanMake: z.ZodEnum<["windows"]>;

declare const SchemaPluginScriptInfo: z.ZodObject<{
    uuid: z.ZodString;
    file: z.ZodString;
    url: z.ZodString;
}, "strip", z.ZodTypeAny, {
    url: string;
    file: string;
    uuid: string;
}, {
    url: string;
    file: string;
    uuid: string;
}>;

declare const SchemaPort: z.ZodOptional<z.ZodNumber>;

declare const SchemaProjectPath: z.ZodString;

declare const SchemaProjectPath_2: z.ZodString;

declare const SchemaProjectType: z.ZodEnum<["2d", "3d"]>;

declare const SchemaQueryAllComponentResult: z.ZodArray<z.ZodString, "many">;

declare const SchemaQueryAssetsOption: z.ZodOptional<z.ZodObject<{
    ccType: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodString, "many">]>>;
    isBundle: z.ZodOptional<z.ZodBoolean>;
    importer: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodString, "many">]>>;
    pattern: z.ZodOptional<z.ZodString>;
    extname: z.ZodOptional<z.ZodUnion<[z.ZodString, z.ZodArray<z.ZodString, "many">]>>;
}, "strip", z.ZodTypeAny, {
    importer?: string | string[] | undefined;
    isBundle?: boolean | undefined;
    pattern?: string | undefined;
    ccType?: string | string[] | undefined;
    extname?: string | string[] | undefined;
}, {
    importer?: string | string[] | undefined;
    isBundle?: boolean | undefined;
    pattern?: string | undefined;
    ccType?: string | string[] | undefined;
    extname?: string | string[] | undefined;
}>>;

declare const SchemaQueryAssetType: z.ZodEnum<["asset", "script", "all"]>;

declare const SchemaQueryComponent: z.ZodObject<{
    path: z.ZodString;
}, "strip", z.ZodTypeAny, {
    path: string;
}, {
    path: string;
}>;

declare const SchemaQueryFileTextInfo: z.ZodObject<{
    dbURL: z.ZodString;
    fileType: z.ZodEnum<["js", "ts", "jsx", "tsx", "json", "txt", "md", "xml", "html", "css"]>;
    startLine: z.ZodDefault<z.ZodNumber>;
    lineCount: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    dbURL: string;
    startLine: number;
    fileType: "json" | "html" | "jsx" | "js" | "ts" | "tsx" | "txt" | "md" | "xml" | "css";
    lineCount: number;
}, {
    dbURL: string;
    fileType: "json" | "html" | "jsx" | "js" | "ts" | "tsx" | "txt" | "md" | "xml" | "css";
    startLine?: number | undefined;
    lineCount?: number | undefined;
}>;

declare const SchemaQueryLogParamInfo: z.ZodObject<{
    number: z.ZodDefault<z.ZodNumber>;
    logLevel: z.ZodOptional<z.ZodEnum<[IConsoleType, ...IConsoleType[]]>>;
}, "strip", z.ZodTypeAny, {
    number: number;
    logLevel?: IConsoleType | undefined;
}, {
    number?: number | undefined;
    logLevel?: IConsoleType | undefined;
}>;

declare const SchemaQueryLogResult: z.ZodArray<z.ZodString, "many">;

declare const SchemaRefreshDirResult: z.ZodNull;

declare const SchemaReload: z.ZodBoolean;

declare const SchemaReloadResult: z.ZodObject<{
    success: z.ZodBoolean;
    message: z.ZodString;
}, "strip", z.ZodTypeAny, {
    success: boolean;
    message: string;
}, {
    success: boolean;
    message: string;
}>;

declare const SchemaRemoveComponent: z.ZodObject<{
    path: z.ZodString;
}, "strip", z.ZodTypeAny, {
    path: string;
}, {
    path: string;
}>;

declare const SchemaReplaceTextInFileInfo: z.ZodObject<{
    dbURL: z.ZodString;
    fileType: z.ZodEnum<["js", "ts", "jsx", "tsx", "json", "txt", "md", "xml", "html", "css"]>;
    targetText: z.ZodString;
    replacementText: z.ZodString;
    regex: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    dbURL: string;
    regex: boolean;
    fileType: "json" | "html" | "jsx" | "js" | "ts" | "tsx" | "txt" | "md" | "xml" | "css";
    targetText: string;
    replacementText: string;
}, {
    dbURL: string;
    regex: boolean;
    fileType: "json" | "html" | "jsx" | "js" | "ts" | "tsx" | "txt" | "md" | "xml" | "css";
    targetText: string;
    replacementText: string;
}>;

declare const SchemaRevertToPrefabOptions: z.ZodObject<{
    nodePath: z.ZodString;
}, "strip", z.ZodTypeAny, {
    nodePath: string;
}, {
    nodePath: string;
}>;

declare const SchemaRevertToPrefabResult: z.ZodBoolean;

declare const SchemaSaveAssetResult: z.ZodNullable<z.ZodType<any, z.ZodTypeDef, any>>;

declare const SchemaSaveResult: z.ZodNullable<z.ZodType<any, z.ZodTypeDef, any>>;

declare const SchemaSetPropertyOptions: z.ZodObject<{
    componentPath: z.ZodString;
    properties: z.ZodRecord<z.ZodString, z.ZodUnion<[z.ZodRecord<z.ZodString, z.ZodAny>, z.ZodArray<z.ZodUnknown, "many">, z.ZodString, z.ZodNumber, z.ZodBoolean, z.ZodNull, z.ZodAny]>>;
}, "strip", z.ZodTypeAny, {
    properties: Record<string, any>;
    componentPath: string;
}, {
    properties: Record<string, any>;
    componentPath: string;
}>;

declare const SchemaSupportCreateType: z.ZodEnum<z.Writeable<any>>;

declare const SchemaUnpackPrefabInstanceOptions: z.ZodObject<{
    /** 要解耦的预制体实例节点 */
    nodePath: z.ZodString;
    /** 递归解耦所有子预制体 */
    recursive: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    nodePath: string;
    recursive?: boolean | undefined;
}, {
    nodePath: string;
    recursive?: boolean | undefined;
}>;

declare const SchemaUpdateAssetUserDataPath: z.ZodString;

declare const SchemaUpdateAssetUserDataResult: z.ZodAny;

declare const SchemaUpdateAssetUserDataValue: z.ZodAny;

declare const SchemaUrlOrUUIDOrPath: z.ZodString;

declare const SchemaUrlResult: z.ZodNullable<z.ZodString>;

declare const SchemaUserDataHandler: z.ZodString;

declare const SchemaUUIDResult: z.ZodNullable<z.ZodString>;

declare class SystemApi {
    fileEditor: FileEditorApi;
    constructor();
    /**
     * 查询 cli 日志信息
     */
    queryLogs(queryParam: TQueryLogParamInfo): Promise<CommonResultType<TQueryLogResult>>;
}

declare type TAddComponentInfo = z.infer<typeof SchemaAddComponentInfo>;

declare type TApplyPrefabChangesOptions = z.infer<typeof SchemaApplyPrefabChangesOptions>;

declare type TApplyPrefabChangesResult = z.infer<typeof SchemaApplyPrefabChangesResult>;

declare type TAssetConfigMapResult = z.infer<typeof SchemaAssetConfigMapResult>;

declare type TAssetData = z.infer<typeof SchemaAssetData>;

declare type TAssetDBInfosResult = z.infer<typeof SchemaAssetDBInfosResult>;

declare type TAssetInfoResult = z.infer<typeof SchemaAssetInfoResult>;

declare type TAssetInfosResult = z.infer<typeof SchemaAssetInfosResult>;

declare type TAssetMetaResult = z.infer<typeof SchemaAssetMetaResult>;

declare type TAssetMoveOptions = z.infer<typeof SchemaAssetMoveOptions>;

declare type TAssetOperationOption = z.infer<typeof SchemaAssetOperationOption> | undefined;

declare type TAssetRenameOptions = z.infer<typeof SchemaAssetRenameOptions>;

declare type TAssetUrlOrUUID = z.infer<typeof SchemaAssetUrlOrUUID>;

declare type TBaseName = z.infer<typeof SchemaBaseName>;

declare type TBuildDest = z.infer<typeof SchemaBuildDest>;

declare type TBuildOption = z.infer<typeof SchemaBuildOption>;

declare type TCloseResult = z.infer<typeof SchemaCloseResult>;

declare type TComponentResult = z.infer<typeof SchemaComponentResult>;

declare type TCreateAssetByTypeOptions = z.infer<typeof SchemaCreateAssetByTypeOptions>;

declare type TCreateAssetOptions = z.infer<typeof SchemaCreateAssetOptions>;

declare type TCreatedAssetResult = z.infer<typeof SchemaCreatedAssetResult>;

declare type TCreateMapResult = z.infer<typeof SchemaCreateMapResult>;

declare type TCreateNodeByAssetOptions = z.infer<typeof SchemaNodeCreateByAsset>;

declare type TCreateNodeByTypeOptions = z.infer<typeof SchemaNodeCreateByType>;

declare type TCreateOptions = z.infer<typeof SchemaCreateOptions>;

declare type TCreatePrefabFromNodeOptions = z.infer<typeof SchemaCreatePrefabFromNodeOptions>;

declare type TCreateResult = z.infer<typeof SchemaCreateResult>;

declare type TCurrentResult = z.infer<typeof SchemaCurrentResult>;

declare type TDataKeys = z.infer<typeof SchemaDataKeys>;

declare type TDbDirResult = z.infer<typeof SchemaDbDirResult>;

declare type TDeleteNodeOptions = z.infer<typeof SchemaNodeDelete>;

declare type TDirOrDbPath = z.infer<typeof SchemaDirOrDbPath>;

declare type TEraseLinesInRangeInfo = z.infer<typeof SchemaEraseLinesInRangeInfo>;

declare type TFileEditorResult = z.infer<typeof SchemaFileEditorResult>;

declare type TFileQueryTextResult = z.infer<typeof SchemaFileQueryTextResult>;

declare type TFilterPluginOptions = z.infer<typeof SchemaFilterPluginOptions>;

declare type TGetPrefabInfoParams = z.infer<typeof SchemaGetPrefabInfoOptions>;

declare type TGetPrefabResult = z.infer<typeof SchemaGetPrefabResult>;

declare type TImportedAssetResult = z.infer<typeof SchemaImportedAssetResult>;

declare type TInsertTextAtLineInfo = z.infer<typeof SchemaInsertTextAtLineInfo>;

declare type TIsPrefabInstanceOptions = z.infer<typeof SchemaIsPrefabInstanceOptions>;

declare type TIsPrefabInstanceResult = z.infer<typeof SchemaIsPrefabInstanceResult>;

declare type TMigrateResult = z.infer<typeof SchemaMigrateResult>;

declare type TNode = z.infer<typeof SchemaNode>;

declare type TNodeDeleteResult = z.infer<typeof SchemaNodeDeleteResult>;

declare type TNodeDetail = z.infer<typeof SchemaNodeQueryResult>;

declare type TNodeUpdateResult = z.infer<typeof SchemaNodeUpdateResult>;

declare type TOpenResult = z.infer<typeof SchemaOpenResult>;

declare type TPathResult = z.infer<typeof SchemaPathResult>;

declare type TPlatform = z.infer<typeof SchemaPlatform>;

declare type TPlatformCanMake = z.infer<typeof SchemaPlatformCanMake>;

declare type TPluginScriptInfo = z.infer<typeof SchemaPluginScriptInfo>;

declare type TPort = z.infer<typeof SchemaPort>;

declare type TProjectPath = z.infer<typeof SchemaProjectPath>;

declare type TProjectPath_2 = z.infer<typeof SchemaProjectPath_2>;

declare type TProjectType = z.infer<typeof SchemaProjectType>;

declare type TQueryAllComponentResult = z.infer<typeof SchemaQueryAllComponentResult>;

declare type TQueryAssetsOption = z.infer<typeof SchemaQueryAssetsOption> | undefined;

declare type TQueryAssetType = z.infer<typeof SchemaQueryAssetType>;

declare type TQueryComponentOptions = z.infer<typeof SchemaQueryComponent>;

declare type TQueryFileTextInfo = z.infer<typeof SchemaQueryFileTextInfo>;

declare type TQueryLogParamInfo = z.infer<typeof SchemaQueryLogParamInfo>;

declare type TQueryLogResult = z.infer<typeof SchemaQueryLogResult>;

declare type TQueryNodeOptions = z.infer<typeof SchemaNodeQuery>;

declare type TRefreshDirResult = z.infer<typeof SchemaRefreshDirResult>;

declare type TReimportResult = z.infer<typeof SchemaAssetInfoResult>;

declare type TReload = z.infer<typeof SchemaReload>;

declare type TReloadResult = z.infer<typeof SchemaReloadResult>;

declare type TRemoveComponentOptions = z.infer<typeof SchemaRemoveComponent>;

declare type TReplaceTextInFileInfo = z.infer<typeof SchemaReplaceTextInFileInfo>;

declare type TRevertToPrefabOptions = z.infer<typeof SchemaRevertToPrefabOptions>;

declare type TRevertToPrefabResult = z.infer<typeof SchemaRevertToPrefabResult>;

declare type TSaveAssetResult = z.infer<typeof SchemaSaveAssetResult>;

declare type TSaveResult = z.infer<typeof SchemaSaveResult>;

declare type TSetPropertyOptions = z.infer<typeof SchemaSetPropertyOptions>;

declare type TSupportCreateType = z.infer<typeof SchemaSupportCreateType>;

declare type TUnpackPrefabInstanceOptions = z.infer<typeof SchemaUnpackPrefabInstanceOptions>;

declare type TUpdateAssetUserDataPath = z.infer<typeof SchemaUpdateAssetUserDataPath>;

declare type TUpdateAssetUserDataResult = z.infer<typeof SchemaUpdateAssetUserDataResult>;

declare type TUpdateAssetUserDataValue = z.infer<typeof SchemaUpdateAssetUserDataValue>;

declare type TUpdateNodeOptions = z.infer<typeof SchemaNodeUpdate>;

declare type TUrlOrUUIDOrPath = z.infer<typeof SchemaUrlOrUUIDOrPath>;

declare type TUrlResult = z.infer<typeof SchemaUrlResult>;

declare type TUserDataHandler = z.infer<typeof SchemaUserDataHandler>;

declare type TUUIDResult = z.infer<typeof SchemaUUIDResult>;

export { }
