export interface IIpcRequestOptions {
    /** 请求超时时间（毫秒） */
    timeout?: number;
}

/**
 * 发送给场景进程的消息类型
 */
export type TIpcRequest = {
    id?: string;
    channel: string;
    methodName: string;
    params: any[],
};

/**
 * 场景进程返回的数据类型
 */
export type TIpcResponse = {
    id?: string;
    reply?: boolean;
    error?: string;
    channel: string;
    data?: any;
}
