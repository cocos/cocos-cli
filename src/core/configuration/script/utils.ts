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
 * 通过点号分隔的路径删除嵌套对象的值
 * @param target 目标对象
 * @param dotPath 点号分隔的路径
 * @returns 是否成功删除
 */
export function removeByDotPath(target: any, dotPath: string): boolean {
    if (!target || !dotPath) {
        return false;
    }
    
    const keys = dotPath.split('.');
    const lastKey = keys.pop()!;
    let current = target;
    
    // 遍历到倒数第二层
    for (const key of keys) {
        if (current === undefined || current === null || typeof current !== 'object') {
            return false;
        }
        current = current[key];
    }
    
    // 检查最后一层是否存在
    if (current === undefined || current === null || typeof current !== 'object') {
        return false;
    }
    
    // 删除属性
    if (lastKey in current) {
        delete current[lastKey];
        return true;
    }
    
    return false;
}

/**
 * 深度合并两个值
 * @param target 目标值
 * @param source 源值
 * @returns 合并后的值
 */
export function deepMerge(target: any, source: any): any {
    // 如果源值为 null 或 undefined，返回目标值
    if (source === null || source === undefined) {
        return target;
    }
    
    // 如果目标值为 null 或 undefined，返回源值
    if (target === null || target === undefined) {
        return source;
    }
    
    // 检查是否为非对象类型（包括数组）
    const isSourcePrimitive = typeof source !== 'object' || Array.isArray(source);
    const isTargetPrimitive = typeof target !== 'object' || Array.isArray(target);
    
    // 如果任一值为非对象类型，返回源值（覆盖）
    if (isSourcePrimitive || isTargetPrimitive) {
        return source;
    }
    
    // 两个都是普通对象，进行深度合并
    const result = { ...target };
    
    for (const key in source) {
        if (source.hasOwnProperty(key)) {
            const sourceValue = source[key];
            const targetValue = result[key];
            
            // 递归合并：只有当两个值都是普通对象时才进行深度合并
            if (typeof sourceValue === 'object' && sourceValue !== null && !Array.isArray(sourceValue) &&
                typeof targetValue === 'object' && targetValue !== null && !Array.isArray(targetValue)) {
                result[key] = deepMerge(targetValue, sourceValue);
            } else {
                result[key] = sourceValue;
            }
        }
    }
    
    return result;
}
