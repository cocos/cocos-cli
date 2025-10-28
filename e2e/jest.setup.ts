/**
 * Jest 测试环境配置
 * 在每个测试文件执行前运行
 */

import { jest, expect } from '@jest/globals';

// Jest 超时时间已在 jest.config.e2e.ts 中配置为 10 分钟
// 这里不需要再次设置

// 自定义匹配器（如果需要）
expect.extend({
    toBeValidBuildResult(received: any) {
        const pass =
            received &&
            typeof received.code === 'number' &&
            (received.code === 0 || typeof received.reason === 'string');

        if (pass) {
            return {
                message: () => `expected ${JSON.stringify(received)} not to be a valid build result`,
                pass: true,
            };
        } else {
            return {
                message: () => `expected ${JSON.stringify(received)} to be a valid build result with code and optional reason`,
                pass: false,
            };
        }
    },
});

// 扩展 Jest 类型定义
declare module '@jest/expect' {
    interface Matchers<R> {
        toBeValidBuildResult(): R;
    }
}

