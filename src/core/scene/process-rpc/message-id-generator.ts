/**
 * 消息 ID 生成器
 * 负责生成唯一的消息 ID
 */
export class MessageIdGenerator {
    private msgId = 0;
    private readonly MAX_MSG_ID = Number.MAX_SAFE_INTEGER - 1;
    private readonly MAX_ATTEMPTS = 100;

    /**
     * 检查 ID 是否已被使用
     */
    constructor(private hasId: (id: number) => boolean) {}

    /**
     * 生成唯一消息 ID
     * @returns 唯一的消息 ID
     * @throws 如果无法生成唯一 ID
     */
    generate(): number {
        const startId = this.msgId;
        
        // 有限次重试
        for (let attempts = 0; attempts < this.MAX_ATTEMPTS; attempts++) {
            this.msgId = (this.msgId >= this.MAX_MSG_ID) ? 1 : this.msgId + 1;
            
            // 快速路径：大多数情况下 ID 不冲突
            if (!this.hasId(this.msgId)) {
                return this.msgId;
            }
            
            // 检查是否循环了一圈
            if (this.msgId === startId) {
                break;
            }
        }
        
        throw new Error(`Unable to generate unique message ID after ${this.MAX_ATTEMPTS} attempts`);
    }

    /** 重置 ID 计数器 */
    reset(): void {
        this.msgId = 0;
    }
}

