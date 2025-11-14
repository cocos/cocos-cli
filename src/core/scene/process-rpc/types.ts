/**
 * RPC 类型定义
 */

/**
 * RPC 请求消息
 */
export interface RpcRequest {
    id: number;
    type: 'request';
    module: string;
    method: string;
    args: any[];
}

/**
 * RPC 响应消息
 */
export interface RpcResponse {
    id: number;
    type: 'response';
    result?: any;
    error?: string;
}

/**
 * RPC 单向发送消息
 */
export interface RpcSend {
    type: 'send';
    module: string;
    method: string;
    args: any[];
}

/**
 * RPC 消息联合类型
 */
export type RpcMessage = RpcRequest | RpcResponse | RpcSend;

/**
 * 请求选项
 */
export interface RequestOptions {
    /** 超时时间（毫秒） */
    timeout?: number;
}

/**
 * ProcessRPC 配置选项
 */
export interface ProcessRPCConfig {
    /** pending 消息队列最大长度，默认 1000 */
    maxPendingMessages?: number;
    /** 并发请求最大数量，默认 10000 */
    maxCallbacks?: number;
    /** 默认请求超时时间（毫秒），默认 30000 (30秒)，设为 0 表示无限制 */
    defaultTimeout?: number;
    /** 每次 flush 处理的最大消息数量，默认 50，防止长时间阻塞事件循环 */
    flushBatchSize?: number;
    /** 消息发送失败后的最大重试次数，默认 3 次（总时长约 0.7秒） */
    maxFlushRetries?: number;
    /** 单向消息错误处理器 */
    onSendError?: (error: Error, module: string, method: string) => void;
}

/**
 * 待处理的消息
 */
export interface PendingMessage {
    type: 'request' | 'send';
    data: RpcRequest | RpcSend;
    /** 超时开始时间 */
    timeoutStartTime?: number;
    /** 超时时长 */
    timeoutDuration?: number;
}

/**
 * 回调条目
 */
export interface CallbackEntry {
    cb: (msg: RpcResponse) => void;
    timer?: NodeJS.Timeout;
}

