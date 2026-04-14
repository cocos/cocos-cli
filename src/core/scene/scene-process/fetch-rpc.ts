/**
 * 基于 fetch 的 RPC 客户端
 * 替代 ProcessRPC，将 module.method(args) 调用转为 HTTP POST 请求
 */
export class FetchRPC<TModules extends Record<string, any>> {
    private baseURL: string;
    private defaultTimeout: number;
    private disposed = false;

    constructor(baseURL: string, options?: { timeout?: number }) {
        // 确保 baseURL 不以 / 结尾
        this.baseURL = baseURL.replace(/\/+$/, '');
        this.defaultTimeout = options?.timeout ?? 30000;
    }

    /**
     * 远程方法调用（请求-响应）
     * 签名与 ProcessRPC.request 保持一致
     */
    async request<K extends keyof TModules, M extends keyof TModules[K]>(
        module: K,
        method: M,
        args?: any[],
        options?: { timeout?: number }
    ): Promise<any> {
        if (this.disposed) {
            throw new Error('[FetchRPC] Instance has been disposed');
        }

        const timeout = options?.timeout ?? this.defaultTimeout;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);

        try {
            const response = await fetch(`${this.baseURL}/scene/rpc`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    module: module as string,
                    method: method as string,
                    args: args || [],
                }),
                signal: controller.signal,
            });

            if (!response.ok) {
                throw new Error(
                    `[FetchRPC] HTTP ${response.status}: ${module as string}.${method as string}`
                );
            }

            const data = await response.json();

            if (data.error) {
                throw new Error(data.error);
            }

            return data.result;
        } catch (err: any) {
            if (err.name === 'AbortError') {
                throw new Error(
                    `[FetchRPC] Request timeout: ${module as string}.${method as string}`
                );
            }
            throw err;
        } finally {
            clearTimeout(timer);
        }
    }

    /**
     * 是否已连接（fetch 模式下始终返回 true，除非 disposed）
     */
    isConnect(): boolean {
        return !this.disposed;
    }

    /**
     * 清理
     */
    dispose(): void {
        this.disposed = true;
    }
}
