/** 惰性获取 dump 工具，避免与 dump 模块的循环依赖（运行时按需加载）。 */
export function getDumpUtil(): typeof import('../dump/index').default {
    return require('../dump/index').default;
}
