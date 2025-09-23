/**
 * 配置管理工具函数
 */

/**
 * 通过点号分隔的路径获取嵌套对象的值
 * @param source 源对象
 * @param dotPath 点号分隔的路径，如 'builder.platforms.web-mobile'
 * @returns 找到的值，如果路径不存在返回 undefined
 */
export function getByDotPath(source: any, dotPath: string): any {
    if (!source || !dotPath) {
        return undefined;
    }
    
    const keys = dotPath.split('.');
    let current = source;
    
    for (const key of keys) {
        if (current === undefined || current === null || typeof current !== 'object') {
            return undefined;
        }
        current = current[key];
    }
    
    // 如果路径存在但值为 undefined，返回 undefined
    // 如果路径存在且值为 null，返回 null
    return current;
}

/**
 * 通过点号分隔的路径设置嵌套对象的值
 * @param target 目标对象
 * @param dotPath 点号分隔的路径
 * @param value 要设置的值
 */
export function setByDotPath(target: any, dotPath: string, value: any): void {
    if (!target || !dotPath) {
        return;
    }
    
    const keys = dotPath.split('.');
    const lastKey = keys.pop()!;
    let current = target;
    
    // 创建嵌套路径
    for (const key of keys) {
        if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
            current[key] = {};
        }
        current = current[key];
    }
    
    // 设置最终值
    current[lastKey] = value;
}

/**
 * 验证配置键名是否有效
 * @param key 配置键名
 * @returns 是否有效
 */
export function isValidConfigKey(key: string): boolean {
    return typeof key === 'string' && key.trim().length > 0;
}

/**
 * 验证配置值是否为对象类型
 * @param value 配置值
 * @returns 是否为有效对象
 */
export function isValidConfigValue(value: any): boolean {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * 深度合并两个对象
 * @param target 目标对象
 * @param source 源对象
 * @returns 合并后的对象
 */
export function deepMerge(target: Record<string, any>, source: Record<string, any>): Record<string, any> {
    const result = { ...target };
    
    for (const key in source) {
        if (source.hasOwnProperty(key)) {
            if (isValidConfigValue(source[key]) && isValidConfigValue(result[key])) {
                result[key] = deepMerge(result[key], source[key]);
            } else {
                result[key] = source[key];
            }
        }
    }
    
    return result;
}

/**
 * 检查对象是否为空
 * @param obj 要检查的对象
 * @returns 是否为空
 */
export function isEmptyObject(obj: any): boolean {
    if (!obj || typeof obj !== 'object') {
        return true;
    }
    
    // 数组不是空对象
    if (Array.isArray(obj)) {
        return false;
    }
    
    return Object.keys(obj).length === 0;
}

/**
 * 安全地获取对象的属性值
 * @param obj 源对象
 * @param path 属性路径（点号分隔）
 * @param defaultValue 默认值
 * @returns 属性值或默认值
 */
export function safeGet(obj: any, path: string, defaultValue: any = undefined): any {
    const value = getByDotPath(obj, path);
    return value !== undefined ? value : defaultValue;
}

/**
 * 安全地设置对象的属性值
 * @param obj 目标对象
 * @param path 属性路径（点号分隔）
 * @param value 要设置的值
 * @returns 是否设置成功
 */
export function safeSet(obj: any, path: string, value: any): boolean {
    if (!obj || !path) {
        return false;
    }
    
    try {
        setByDotPath(obj, path, value);
        return true;
    } catch (error) {
        return false;
    }
}

