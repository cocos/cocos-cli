import { IBuildScriptParam, IInternalBuildOptions, InternalBuildResult, Platform } from "../protected";

export interface ICMakeConfig {
    // 引擎模块
    USE_AUDIO?: boolean;
    USE_VIDEO?: boolean;
    USE_WEBVIEW?: boolean;
    // 任务调度系统配置，配置为布尔值的属性，会在生成时修改为 set(XXX ON) 的形式
    USE_JOB_SYSTEM_TBB?: boolean;
    USE_JOB_SYSTEM_TASKFLOW?: boolean;
    // 是否勾选竖屏
    USE_PORTRAIT?: boolean;

    // 渲染后端
    CC_USE_METAL?: boolean;
    CC_USE_VUKAN?: boolean;
    CC_USE_GLES3: boolean;
    CC_USE_GLES2: boolean;

    // 引擎路径
    COCOS_X_PATH?: string;

    // app名称
    APP_NAME?: string;

    // xxteakey
    XXTEAKEY: string;

    // // ios 和 mac 的bundle id设置
    // MACOSX_BUNDLE_GUI_IDENTIFIER?: string;

    // // ios 开发者
    // DEVELOPMENT_TEAM?: string;
    // TARGET_IOS_VERSION?: string;

    // // mac
    // TARGET_OSX_VERSION ?: string;

    // // android
    // CC_ENABLE_SWAPPY?: boolean;

    // 其他属性
    [propName: string]: any;

    // 以服务器端模式运行
    USE_SERVER_MODE: string;
}

export class CocosParams<T> {
    platformParams: T;
    public debug: boolean;
    public projectName: string;
    public cmakePath: string;
    public platform: string;
    public platformName: string;
    public executableName: string;

    /**
     * engine root
     */
    public enginePath: string;
    /**
     * native engine root
     */
    public nativeEnginePath: string;
    /**
     * project path
     */
    public projDir: string;
    /**
     * build/[platform]
     */
    public buildDir: string;
    /**
     * @zh 构建资源路径
     * @en /build/[platform]/data
     */
    public buildAssetsDir: string;
    /**
     * @zh 是否加密脚本
     * @en is encrypted
     */
    encrypted?: boolean;
    /**
     * @zh 是否压缩脚本
     * @en is compress script
     */
    compressZip?: boolean;
    /**
     * @zh 加密密钥
     * @en encrypt Key
     */
    xxteaKey?: string;
    /**
     * @zh 是否为模拟器
     * @en is simulator
     */
    simulator?: boolean;


    public cMakeConfig: ICMakeConfig = {
        CC_USE_GLES3: false,
        CC_USE_GLES2: true,
        USE_SERVER_MODE: 'set(USE_SERVER_MODE OFF)',
        NET_MODE: 'set(NET_MODE 0)',
        XXTEAKEY: '',
        CC_ENABLE_SWAPPY: false,
    }

    constructor(params: CocosParams<T>) {
        this.buildAssetsDir = params.buildAssetsDir;
        this.projectName = params.projectName;
        this.debug = params.debug;
        this.cmakePath = params.cmakePath;
        this.platform = params.platform;
        this.platformName = params.platformName;
        this.enginePath = params.enginePath;
        this.nativeEnginePath = params.nativeEnginePath;
        this.projDir = params.projDir;
        this.buildDir = params.buildDir;
        this.xxteaKey = params.xxteaKey;
        this.encrypted = params.encrypted;
        this.compressZip = params.compressZip;
        this.executableName = params.executableName;
        Object.assign(this.cMakeConfig, params.cMakeConfig);
        this.platformParams = params.platformParams;
    }
}
declare enum NetMode {
    client = 0,
    hostServer = 1,
    listenServer = 2,
}

export interface ICustomBuildScriptParam extends IBuildScriptParam {
    experimentalHotReload: boolean;
}

export interface IOptions {
    template: string;
    engine?: string;
    runAfterMake: boolean;
    encrypted: boolean;// 是否加密脚本
    compressZip: boolean;// 是否压缩脚本
    xxteaKey?: string;// xxtea 加密的 key 值
    params?: CocosParams<Object>; // console 需要的参数
    JobSystem: 'none' | 'tbb' | 'taskFlow';
    serverMode: boolean;
    netMode: NetMode;
    hotModuleReload: boolean; // 是否开启模块热重载

    projectDistPath: string;

    cocosParams: CocosParams<any>;
    buildScriptParam: ICustomBuildScriptParam;
}
export interface ITaskOption extends IInternalBuildOptions<Platform> {
    packages: any;
    buildScriptParam: ICustomBuildScriptParam;
    cocosParams: CocosParams<any>;
}
export interface IBuildCache extends InternalBuildResult {
    userFrameWorks: boolean; // 是否使用用户的配置数据
}
