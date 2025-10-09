import { sceneManager, nodeManager } from '../scene-process'

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
     * @param data 要发送的数据
     * @returns 发送结果
     */
    async send(channel: string, methodName: string, ...args: any[]): Promise<any> {
        if (!this.manager[channel]) {
            throw new Error(`通道 "${channel}" 未定义`);
        }
        const method = this.manager[channel][methodName];
        if (!method) {
            throw new Error(`方法 "${methodName}" 在通道 "${channel}" 中不存在`);
        }
        return method(...args);
    }
}

export const ipc = new Ipc();