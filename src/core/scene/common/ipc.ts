
export enum IpcPost {
    /** 主进程 → 场景进程（Main 主动发送，Scene 被动接收） */
    MainToScene = 1,
    /** 场景进程 → 主进程（Scene 主动发送，Main 被动接收） */
    SceneToMain = 2,

}

/**
 * Ipc request 参数
 */
export interface IIpcRequestOptions {
    /** 请求超时时间（毫秒） */
    timeout?: number;
}

/**
 * IPC 消息类型（用于 send 和 request）
 */
export interface IIpcMessage {
    /**
     * 消息 ID (目前只有 request 需要)
     */
    id?: string;
    /**
     * 消息（方法名或事件名）
     */
    channel: string;
    /**
     * 方法名
     */
    method: string;
    /**
     * 参数
     */
    params: any[];
    /**
     * 是否需要回复
     * - true: 请求模式，需要等待响应
     * - false: 发送模式，不需要响应
     */
    reply: boolean;
}

/**
 * 接收到信息的基础数据格式
 */
export interface IBaseIpcResponse {
    /**
     * 端口，只有端口一直在需要进行操作
     */
    port: number;
}

/**
 * 接收到消息返回数据格式
 */
export interface IIpcReplyResponse extends IBaseIpcResponse {
    id: string;
    reply: boolean;
    result: any;
    error: string;
}

/**
 * 接收到其他进程请求使用当前进程某个模块的数据格式
 */
export interface IIpcUseModuleResponse extends IBaseIpcResponse {
    id: string;
    channel: string;
    method: string;
    params: any[];
    reply: boolean;
}

/**
 * 消息返回数据格式
 */
export interface IIpcReply {
    id: string;
    reply: true;
    result: any;
    error: string;
}

/**
 * 校验是否是 接收到其他进程请求使用当前进程某个模块的数据格式
 * @param msg
 */
export function isIpcUseModuleResponse(msg: any): msg is IIpcUseModuleResponse {
    return msg && typeof msg === 'object' && 
           msg.id !== undefined && msg.port !== undefined &&
           (msg.channel !== undefined || msg.method !== undefined);
}

