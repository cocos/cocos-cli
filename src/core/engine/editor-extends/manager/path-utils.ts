/**
 * 生成唯一名称：无重复时返回原名，有重复时添加 _001, _002, ... 后缀
 * @param baseName - 基础名称
 * @param existingCount - 已存在的同名数量（0 表示无重复）
 */
export function formatUniqueName(baseName: string, existingCount: number): string {
    if (existingCount <= 0) {
        return baseName;
    }
    return `${baseName}_${String(existingCount).padStart(3, '0')}`;
}
