/**
 * 交互模式配置管理器
 */
export class InteractiveConfig {
    private static instance: InteractiveConfig;
    private interactiveMode: boolean = true;

    private constructor() { }

    /**
     * 获取单例实例
     */
    static getInstance(): InteractiveConfig {
        if (!InteractiveConfig.instance) {
            InteractiveConfig.instance = new InteractiveConfig();
        }
        return InteractiveConfig.instance;
    }

    /**
     * 设置交互模式
     */
    setInteractiveMode(enabled: boolean): void {
        this.interactiveMode = enabled;
    }

    /**
     * 检查是否启用交互模式
     */
    isInteractiveEnabled(): boolean {
        return this.interactiveMode;
    }

    /**
     * 检查是否应该显示 banner
     */
    shouldDisplayBanner(): boolean {
        return this.interactiveMode;
    }

    /**
     * 检查是否应该使用交互式组件
     */
    shouldUseInteractive(): boolean {
        return this.interactiveMode;
    }

    /**
     * 检查是否应该使用加载动画
     */
    shouldUseSpinner(): boolean {
        return this.interactiveMode;
    }

    /**
     * 检查是否应该使用进度条
     */
    shouldUseProgressBar(): boolean {
        return this.interactiveMode;
    }
}

// 导出单例实例
export const config = InteractiveConfig.getInstance();
