import { z } from 'zod';

const cleanStringWithMethods = (str: string): string => {
    // 先去除两端空白
    let result = str.trim();

    // 使用 split 和 filter 移除控制字符
    result = result.split('')
        .filter(char => {
            const code = char.charCodeAt(0);
            return !(
                (code >= 0x0000 && code <= 0x001F) || // C0控制字符
                (code >= 0x007F && code <= 0x009F) || // C1控制字符
                (code >= 0x200B && code <= 0x200F) || // 零宽空格等
                (code >= 0x2028 && code <= 0x202F) || // 段落分隔符等
                (code >= 0x205F && code <= 0x2060)    // 其他不可见字符
            );
        })
        .join('');

    return result;
};

const cleanBasicString = (value: string): string => {
    return cleanStringWithMethods(value);
};

// 移除所有空白字符（用于 UUID 清理）
const removeWhitespace = (str: string): string => {
    return str.replace(/\s/g, '');
};

// ==================== 1. URL Schema (db:// 协议) ====================
export const SchemaUrl = z.string()
    .min(1, 'URL 不能为空')
    .describe('db:// 协议格式的 URL')
    .transform((value, ctx) => {
        const cleaned = cleanBasicString(value);

        // 必须以 db:// 开头
        if (!cleaned.startsWith('db://')) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'URL 必须以 db:// 开头',
            });
            return z.NEVER;
        }

        // db:// 后必须有内容
        if (cleaned === 'db://') {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'db:// 后必须包含有效路径',
            });
            return z.NEVER;
        }

        // 验证路径部分（去除协议部分）
        const path = cleaned.substring(5);

        // 路径不能为空
        if (path.length === 0) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'URL 路径不能为空',
            });
            return z.NEVER;
        }

        // 路径只能包含合法字符
        // 允许：字母、数字、下划线、连字符、点、斜杠
        if (!/^[a-zA-Z0-9_\-./]+$/.test(path)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'URL 路径包含非法字符',
            });
            return z.NEVER;
        }

        return cleaned;
    });

// ==================== 2. UUID Schema ====================
export const SchemaUUID = z.string()
    .min(1, 'UUID 不能为空')
    .describe('UUID 格式字符串')
    .transform((value, ctx) => {
        // 先去除所有空白字符，再移除连字符，然后转为小写
        const cleaned = removeWhitespace(value).replace(/-/g, '').toLowerCase();

        // 必须是 32 位十六进制字符
        if (!/^[0-9a-f]{32}$/.test(cleaned)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: '无效的 UUID 格式',
            });
            return z.NEVER;
        }

        // 格式化为标准 UUID 格式：8-4-4-4-12
        return `${cleaned.slice(0, 8)}-${cleaned.slice(8, 12)}-${cleaned.slice(12, 16)}-${cleaned.slice(16, 20)}-${cleaned.slice(20, 32)}`;
    });

// ==================== 3. Path Schema ====================
export const SchemaPath = z.string()
    .min(1, '路径不能为空')
    .describe('文件路径')
    .transform((value, ctx) => {
        // 先去除两端空白
        const trimmed = value.trim();

        // 验证不是 db:// 协议
        if (trimmed.startsWith('db://')) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: '路径不能以 db:// 开头，请使用 URL Schema',
            });
            return z.NEVER;
        }

        // 验证不是 UUID
        const potentialUuid = removeWhitespace(trimmed).replace(/-/g, '').toLowerCase();
        if (/^[0-9a-f]{32}$/.test(potentialUuid)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: '路径不能是 UUID 格式，请使用 UUID Schema',
            });
            return z.NEVER;
        }

        // 去除控制字符（但保留普通空格）
        const withoutControlChars = trimmed.split('')
            .filter(char => {
                const code = char.charCodeAt(0);
                return !(
                    (code >= 0x0000 && code <= 0x001F) || // C0控制字符
                    code === 0x007F ||                    // DEL字符
                    (code >= 0x0080 && code <= 0x009F) || // C1控制字符
                    (code >= 0x2028 && code <= 0x202F)    // 段落分隔符等
                );
            }).join('');

        // 路径不能只包含分隔符
        const withoutSeparators = withoutControlChars.replace(/[\\/]/g, '');
        if (withoutSeparators.length === 0) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: '路径不能只包含分隔符',
            });
            return z.NEVER;
        }

        return withoutControlChars;
    });

// ==================== 组合 Schema ====================

export const SchemaUrlOrUUIDOrPath = z.string()
    .min(1, 'Value cannot be empty')
    .transform((value, ctx) => {
        const cleaned = value.trim();

        // Attempt to parse sequentially：URL -> UUID -> Path
        try {
            // 1. URL
            if (cleaned.startsWith('db://')) {
                return SchemaUrl.parse(cleaned);
            }

            // 2. UUID
            const potentialUuid = removeWhitespace(cleaned).replace(/-/g, '').toLowerCase();
            if (/^[0-9a-f]{32}$/.test(potentialUuid)) {
                return SchemaUUID.parse(cleaned);
            }

            // 3. Path
            return SchemaPath.parse(cleaned);
        } catch (error) {
            if (error instanceof z.ZodError) {
                error.errors.forEach((err) => {
                    ctx.addIssue(err);
                });
                return z.NEVER;
            }
            throw error;
        }
    }).describe('Asset URL, UUID or file path'); // 资源的 URL、UUID 或文件路径

// PATH 或 UUID
export const SchemaUUIDOrPath = z.string()
    .min(1, 'Value cannot be empty')
    .transform((value, ctx) => {
        const cleaned = value.trim();
        // Attempt to parse sequentially：UUID -> Path
        try {
            // 1. UUID
            const potentialUuid = removeWhitespace(cleaned).replace(/-/g, '').toLowerCase();
            if (/^[0-9a-f]{32}$/.test(potentialUuid)) {
                return SchemaUUID.parse(cleaned);
            }

            // 2. Path
            return SchemaPath.parse(cleaned);
        } catch (error) {
            if (error instanceof z.ZodError) {
                error.errors.forEach((err) => {
                    ctx.addIssue(err);
                });
                return z.NEVER;
            }
            throw error;
        }
    }).describe('Use UUID or file path');


export const SchemaUrlOrPath = z.string()
    .min(1, 'Value cannot be empty')
    .transform((value, ctx) => {
        const cleaned = value.trim();

        // Attempt to parse sequentially：URL -> Path
        try {
            // 1. URL
            if (cleaned.startsWith('db://')) {
                return SchemaUrl.parse(cleaned);
            }

            // 2. Path
            return SchemaPath.parse(cleaned);
        } catch (error) {
            if (error instanceof z.ZodError) {
                error.errors.forEach((err) => {
                    ctx.addIssue(err);
                });
                return z.NEVER;
            }
            throw error;
        }
    }).describe('Use Url or file path');


export const SchemaUrlOrUUID = z.string()
    .min(1, 'Value cannot be empty')
    .transform((value, ctx) => {
        const cleaned = value.trim();

        // Attempt to parse sequentially：URL -> UUID
        try {
            // 1. URL
            if (cleaned.startsWith('db://')) {
                return SchemaUrl.parse(cleaned);
            }

            // 2. UUID
            const potentialUuid = removeWhitespace(cleaned).replace(/-/g, '').toLowerCase();
            if (/^[0-9a-f]{32}$/.test(potentialUuid)) {
                return SchemaUUID.parse(cleaned);
            }

            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Invalid parameter. Only db:// URLs and UUIDs are supported for the path.',
            });
            return z.NEVER;
        } catch (error) {
            if (error instanceof z.ZodError) {
                error.errors.forEach((err) => {
                    ctx.addIssue(err);
                });
                return z.NEVER;
            }
            throw error;
        }
    }).describe('Use db:// protocol format or UUID'); // 使用 db:// 协议格式或者 UUID

export const SchemaSceneIdentifier = z.object({
    assetName: z.string().describe('Scene or Prefab asset name'), // 场景/预制体资源名称
    assetUuid: z.string().describe('Scene or Prefab asset unique identifier UUID'), // 场景/预制体资源唯一标识符 UUID
    assetUrl: z.string().describe('Scene or Prefab asset uses db:// protocol format'), // 场景/预制体资源使用 db:// 协议格式
    assetType: z.string().describe('Scene or Prefab asset type'), // 场景/预制体资源类型
}).describe('Scene or Prefab basic information'); // 场景/预制体基础信息

// Current component information 当前组件信息
export const SchemaComponentIdentifier = z.object({
    cid: z.string().describe('Component identifier'), // 组件标识符
    path: z.string().describe('Return component path, including node path'), // 返回组件的路径，包含节点路径
    uuid: z.string().describe('Component UUID'), // 组件的uuid
    name: z.string().describe('Component name'), // 组件名称
    type: z.string().describe('Component type'), // 组件类型
    enabled: z.boolean().describe('Whether the component is enabled'), // 组件是否使能
}).describe('Component basic information'); // 组件的基本信息

export const SchemaNodeIdentifier = z.object({
    nodeId: z.string().describe('Node ID'), // 节点的 id
    path: z.string().describe('Parent node path, full node path is parent path + node name; root node path is "/"'), // 父节点路径，完整节点路径为父路径+节点名；根节点路径为 "/"
    name: z.string().describe('Node name'), // 节点名称
}).describe('Node identifier'); // 节点标识符
