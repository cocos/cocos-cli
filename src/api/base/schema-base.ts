import z from 'zod';

// ===== HTTP 状态码常量定义 =====

// 成功状态码 (2xx)
export const HTTP_STATUS = {
    // 2xx Success
    OK: 200,                    // 请求成功
    CREATED: 201,               // 资源创建成功
    ACCEPTED: 202,              // 请求已接受，但处理未完成
    NO_CONTENT: 204,            // 请求成功，但无内容返回

    // 3xx Redirection
    NOT_MODIFIED: 304,          // 资源未修改

    // 4xx Client Error
    BAD_REQUEST: 400,           // 请求参数错误
    UNAUTHORIZED: 401,          // 未授权
    FORBIDDEN: 403,             // 禁止访问
    NOT_FOUND: 404,             // 资源不存在
    METHOD_NOT_ALLOWED: 405,    // 方法不允许
    CONFLICT: 409,              // 资源冲突
    UNPROCESSABLE_ENTITY: 422,  // 请求格式正确，但语义错误
    TOO_MANY_REQUESTS: 429,     // 请求过于频繁

    // 5xx Server Error
    INTERNAL_SERVER_ERROR: 500, // 服务器内部错误
    NOT_IMPLEMENTED: 501,       // 功能未实现
    BAD_GATEWAY: 502,           // 网关错误
    SERVICE_UNAVAILABLE: 503,   // 服务不可用
    GATEWAY_TIMEOUT: 504,       // 网关超时
} as const;

export const COMMON_STATUS = {
    SUCCESS: HTTP_STATUS.OK,
    FAIL: HTTP_STATUS.INTERNAL_SERVER_ERROR,
} as const;

// 导出状态码的类型
export type HttpStatusCode = typeof HTTP_STATUS[keyof typeof HTTP_STATUS];
export type CommonStatus = typeof COMMON_STATUS[keyof typeof COMMON_STATUS];

// 创建 Zod 枚举类型来限制 code 字段的值
export const HttpStatusCodeSchema = z.union([
    z.literal(HTTP_STATUS.OK),
    // z.literal(HTTP_STATUS.CREATED),
    // z.literal(HTTP_STATUS.ACCEPTED),
    // z.literal(HTTP_STATUS.NO_CONTENT),
    // z.literal(HTTP_STATUS.NOT_MODIFIED),
    // z.literal(HTTP_STATUS.BAD_REQUEST),
    // z.literal(HTTP_STATUS.UNAUTHORIZED),
    // z.literal(HTTP_STATUS.FORBIDDEN),
    // z.literal(HTTP_STATUS.NOT_FOUND),
    // z.literal(HTTP_STATUS.METHOD_NOT_ALLOWED),
    // z.literal(HTTP_STATUS.CONFLICT),
    // z.literal(HTTP_STATUS.UNPROCESSABLE_ENTITY),
    // z.literal(HTTP_STATUS.TOO_MANY_REQUESTS),
    z.literal(HTTP_STATUS.INTERNAL_SERVER_ERROR),
    // z.literal(HTTP_STATUS.NOT_IMPLEMENTED),
    // z.literal(HTTP_STATUS.BAD_GATEWAY),
    // z.literal(HTTP_STATUS.SERVICE_UNAVAILABLE),
    // z.literal(HTTP_STATUS.GATEWAY_TIMEOUT),
]);

// ===== CommonResult 定义 =====

export function createCommonResult<T extends z.ZodTypeAny>(dataSchema: T) {
    return z.object({
        code: HttpStatusCodeSchema.describe('200 表示成功，其他值表示失败'),
        data: z.union([dataSchema, z.undefined()]).describe('当成功的时候，data 字段返回的是结果'),
        reason: z.union([z.string(), z.undefined()]).describe('当失败的时候 reason 的字段提示错误信息'),
    });
}

// 类型推导辅助
export type CommonResultType<T> = {
    code: CommonStatus;
    data?: T;
    reason?: string;//当失败的时候，需要带上 reason 的字段提示错误信息
};

/**
 * 项目路径
 */
export const ProjectPathSchema = z.string().min(1).describe('Cocos Creator 项目的绝对路径，必须指向包含 project.json 文件的项目根目录');
