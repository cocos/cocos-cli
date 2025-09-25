import { URL } from 'url';

/**
 * 模块 `'cce:/internal/x/prerequisite-imports'` 的 URL。
 */
export const prerequisiteImportsModURL = 'cce:/internal/x/prerequisite-imports';

/**
 * 生成模块 `'cce:/internal/x/prerequisite-imports'`。
 * 这个模块用于导入所有需要加载的项目模块。
 * @param prerequisiteImports 需要导入的项目模块。必须是 URL。
 */
export function makePrerequisiteImportsMod(prerequisiteImports: string[]) {
    return `
// Auto generated represents the prerequisite imports of project modules.

${prerequisiteImports.map((specifier) => `import ${createStringLiteralCode(specifier)};`).join('\n')}

export { }; // To make sure this module can by recognized as ES2015 module even no imports.
    `;
}

/**
 * 生成模块 `'cce:/internal/x/prerequisite-imports'`。
 * 这个模块用于导入所有需要加载的项目模块。
 * 与 `makePrerequisiteImportsMod` 不同，这样生成的模块会尝试导入每个项目模块，即使它们其中的一个或多个发生了异常。
 * @param prerequisiteImports 需要导入的项目模块。必须是 URL。
 */
export function makeTentativePrerequisiteImports(prerequisiteImports: string[]) {
    return `
// Auto generated represents the prerequisite imports of project modules.

await (async () => {
    const requests = [${prerequisiteImports.map(specifier => `() => import(${createStringLiteralCode(specifier)})`).join(', ')}];
    for (const request of requests) {
        try {
            await request();
        } catch (_err) {
            // The error should have been caught by executor.
        }
    }
})();
    `;
}

/**
 * 创建一个合法的 JavaScript 字符串。它能正确地处理引号，比如：
 * - double"quote -> "double\"quote"
 */
function createStringLiteralCode(value: string) {
    // 巧妙地利用 `JSON.stringify`，因为它会自动处理引号！
    return JSON.stringify(value);
}
