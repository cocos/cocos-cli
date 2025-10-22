import * as Sentry from '@sentry/node';
import { newConsole } from './console';

/**
 * Sentry 配置选项
 */
export interface SentryConfig {
    /** Sentry DSN */
    dsn?: string;
    /** 环境名称 */
    environment?: string;
    /** 发布版本 */
    release?: string;
    /** 是否启用调试模式 */
    debug?: boolean;
    /** 采样率 (0.0 - 1.0) */
    tracesSampleRate?: number;
    /** 用户信息 */
    user?: {
        id?: string;
        username?: string;
        email?: string;
    };
    /** 标签 */
    tags?: Record<string, string>;
    /** 额外上下文 */
    extra?: Record<string, any>;
}

/**
 * Sentry 初始化器
 */
class SentryInitializer {
    private static initialized = false;

    /**
     * 初始化 Sentry
     * @param config Sentry 配置
     */
    public static init(): void {
        if (this.initialized) {
            return;
        }

        const sentryConfig = {
            dsn: 'https://4d4b6f03b83b47a4aad50674eedd087e@sentry.cocos.org/12',
            // dsn: 'https://d1228c9c9d49468a9f6795d0f8f66df3@sentry.cocos.org/11',
            environment: 'development',
            release: require('../../../package.json').version,
            debug: false,
            tracesSampleRate: 0.2,
            sampleRate: 0.5,
            user: {
                id: 'cli-alpha-test',
            },
        };

        // 如果没有 DSN，跳过初始化
        if (!sentryConfig.dsn) {
            return;
        }

        try {
            Sentry.init({
                ...sentryConfig,
                beforeSend(event) {
                    // 过滤敏感信息
                    if (event.request?.cookies) {
                        delete event.request.cookies;
                    }
                    if (event.request?.headers) {
                        const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key'];
                        sensitiveHeaders.forEach(header => {
                            delete event.request!.headers![header];
                        });
                    }
                    return event;
                },
            });

            // // 设置用户信息
            // if (config.user) {
            //     Sentry.setUser(config.user);
            // }

            // // 设置标签
            // if (config.tags) {
            //     Sentry.setTags(config.tags);
            // }

            // // 设置额外上下文
            // if (config.extra) {
            //     Sentry.setContext('extra', config.extra);
            // }

            // 设置全局上下文
            Sentry.setContext('app', {
                name: 'cocos-cli',
                version: process.env.npm_package_version || '1.0.0',
                node_version: process.version,
                platform: process.platform,
                arch: process.arch,
            });

            setupGlobalErrorHandlers();

            this.initialized = true;
        } catch (error) {
        }
    }

    /**
     * 捕获异常
     * @param error 错误对象
     * @param context 额外上下文
     */
    public static captureException(error: Error, context?: Record<string, any>): void {
        if (!this.initialized) {
            return;
        }

        try {
            if (context) {
                Sentry.withScope(scope => {
                    Object.entries(context).forEach(([key, value]) => {
                        scope.setContext(key, value);
                    });
                    Sentry.captureException(error);
                });
            } else {
                Sentry.captureException(error);
            }
        } catch (e) {
        }
    }

    /**
     * 获取是否已初始化
     */
    public static get isInitialized(): boolean {
        return this.initialized;
    }
}

/**
 * 全局错误处理器
 */
function setupGlobalErrorHandlers(): void {
    // 捕获未处理的异常
    process.on('uncaughtException', (error) => {
        newConsole.error(`[Global] 未捕获的异常: ${error instanceof Error ? error.message : String(error)}`);
        SentryInitializer.captureException(error, {
            type: 'uncaughtException',
            timestamp: new Date().toISOString(),
        });
    });

    // 捕获未处理的 Promise 拒绝
    process.on('unhandledRejection', (reason, promise) => {
        newConsole.error(`[Global] 未处理的 Promise 拒绝: ${reason instanceof Error ? reason.message : String(reason)}`);
        SentryInitializer.captureException(
            reason instanceof Error ? reason : new Error(String(reason)),
            {
                type: 'unhandledRejection',
                promise: promise.toString(),
                timestamp: new Date().toISOString(),
            }
        );
    });
}

/**
 * 便捷的初始化函数
 */
export function initSentry(): void {
    try {
        SentryInitializer.init();
    } catch (error) {
    }
}

/**
 * 便捷的异常捕获函数
 * @param error 错误对象
 * @param context 额外上下文
 */
export function captureException(error: Error, context?: Record<string, any>): void {
    SentryInitializer.captureException(error, context);
}
