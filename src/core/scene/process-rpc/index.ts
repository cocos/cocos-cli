/**
 * ProcessRPC 模块
 * 提供进程间 RPC 通信功能
 */

// 主类
export { ProcessRPC } from './process-rpc';

// 类型定义
export type { 
    ProcessRPCConfig, 
    RequestOptions,
    RpcRequest,
    RpcResponse,
    RpcSend,
    RpcMessage
} from './types';
