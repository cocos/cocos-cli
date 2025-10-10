import { sceneManager, nodeManager } from '../scene-process'

/**
 * 请求选项接口
 */
export interface IRequestOptions {
    /** 请求超时时间（毫秒） */
    timeout?: number;
}

export class Ipc {
    /**
     * 管理器映射表，存储不同通道的管理器实例
     */
    private manager: Record<string, any> = {};

    /**
     * 初始化 IPC 连接
     */
    init(): void {
        this.manager['scene'] = sceneManager;
        this.manager['node'] = nodeManager;
    }

    /**
     * 发送消息到其他进程
     * @param channel 通道名称 (如: 'scene', 'node')
     * @param methodName 方法名称
     * @param args 参数
     * @returns 结果
     */
    async send(channel: string, methodName: string, ...args: any[]) {
        if (!this.manager[channel]) {
            throw new Error(`通道 "${channel}" 未定义`);
        }
        const method = this.manager[channel][methodName];
        if (!method) {
            throw new Error(`方法 "${methodName}" 在通道 "${channel}" 中不存在`);
        }
        await method.apply(this.manager[channel], ...args);
    }

    /**
     * 发送请求到其他进程（带错误处理）
     * @param channel 通道名称 (如: 'scene', 'node')
     * @param methodName 方法名称
     * @param args 参数
     * @param options 请求选项
     * @returns 请求结果
     */
    async request<T = any>(
        channel: string, 
        methodName: string, 
        args: any[] = [], 
        options: IRequestOptions = {}
    ): Promise<T | null> {
        const { timeout = 5000 } = options;

        try {
            // 检查通道和方法是否存在
            if (!this.manager[channel]) {
                throw new Error(`通道 "${channel}" 未定义`);
            }
            
            const method = this.manager[channel][methodName];
            if (!method) {
                throw new Error(`方法 "${methodName}" 在通道 "${channel}" 中不存在`);
            }

            // 创建超时 Promise
            const timeoutPromise = new Promise<never>((_, reject) => {
                setTimeout(() => reject(new Error(`请求超时: ${timeout}ms`)), timeout);
            });

            // 执行方法调用
            return await Promise.race([
                method.apply(this.manager[channel], ...args),
                timeoutPromise
            ]);
        } catch (error) {
            console.error(error);
            return null;
        }
    }
}

export const ipc = new Ipc();
