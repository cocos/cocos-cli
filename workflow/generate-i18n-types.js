// scripts/generate-i18n-types.js
const fs = require('fs');
const path = require('path');
const { glob } = require('glob');

// 检查键名是否需要引号
function needsQuotes(key) {
  // 包含中划线、点号或其他特殊字符的键名需要引号
  return /[-\.\s]/.test(key) || /^\d/.test(key);
}

// 格式化键名
function formatKey(key) {
  return needsQuotes(key) ? `'${key}'` : key;
}

// 生成对象类型定义的递归函数
function generateTypeForObject(obj, indent = 0) {
  const spaces = ' '.repeat(indent);
  let result = '';
  
  for (const [key, value] of Object.entries(obj)) {
    const formattedKey = formatKey(key);
    
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // 嵌套对象
      result += `${spaces}${formattedKey}: {\n`;
      result += generateTypeForObject(value, indent + 2);
      result += `${spaces}};\n`;
    } else {
      // 字符串值，支持插值参数
      const paramMatches = String(value).match(/\{([^}]+)\}/g);
      if (paramMatches && paramMatches.length > 0) {
        const params = paramMatches.map(match => match.slice(1, -1)).filter((param, index, arr) => arr.indexOf(param) === index);
        result += `${spaces}${formattedKey}: string; // 参数: {${params.join(', ')}}\n`;
      } else {
        result += `${spaces}${formattedKey}: string;\n`;
      }
    }
  }
  
  return result;
}

// 生成扁平化的键类型
function generateFlattenKeys(obj, prefix = '') {
  let keys = [];
  
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      keys = keys.concat(generateFlattenKeys(value, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  
  return keys;
}

function generateI18nTypes() {
  const localesPath = path.join(__dirname, '../static/i18n');
  const defaultLocale = 'zh';
  const outputDir = path.join(__dirname, '../src/i18n/types');
  const outputPath = path.join(outputDir, 'generated.d.ts');
  
  // 确保输出目录存在
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const localeFiles = glob.sync(`${localesPath}/${defaultLocale}/*.json`);
  
  if (localeFiles.length === 0) {
    console.warn('⚠️  未找到任何语言文件，跳过类型生成');
    return;
  }
  
  let typeDefinition = `// Auto-generated i18n types for Node.js - DO NOT EDIT MANUALLY
// Generated at: ${new Date().toISOString()}

export interface I18nResources {\n`;

  let allKeys = [];
  
  for (const filePath of localeFiles) {
    const namespace = path.basename(filePath, '.json');
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    typeDefinition += `  ${namespace}: {\n`;
    typeDefinition += generateTypeForObject(content, 4);
    typeDefinition += `  };\n`;
    
    // 收集所有键用于生成联合类型
    const namespaceKeys = generateFlattenKeys(content, namespace);
    allKeys = allKeys.concat(namespaceKeys);
  }
  
  typeDefinition += `}

// 扁平化的键类型
export type I18nKeys = ${allKeys.map(key => `'${key}'`).join(' | ')};

// 为 i18next 提供的类型扩展
declare module 'i18next' {
  interface TFunction {
    (key: I18nKeys, options?: any): string;
  }
}

// 为 i18n 实例提供的类型扩展
declare module 'i18next' {
  interface i18n {
    t: TFunction;
  }
}

// 导出 i18n 实例类型
export interface I18nInstance {
  t: (key: I18nKeys, options?: any) => string;
}

// 工具类型：提取插值参数
export type ExtractParams<T extends string> = T extends \`\${string}{\${infer P}}\${string}\`
  ? P | ExtractParams<T extends \`\${string}{\${P}}\${infer Rest}\` ? Rest : never>
  : never;

// 工具类型：获取键对应的参数类型
export type GetKeyParams<K extends I18nKeys> = K extends keyof I18nResources
  ? ExtractParams<I18nResources[K]>
  : never;
`;

  fs.writeFileSync(outputPath, typeDefinition);
  console.log(`🎉 Node.js i18n 类型定义已生成! 共生成 ${allKeys.length} 个翻译键`);
  console.log(`📁 输出文件: ${outputPath}`);
}

// 如果直接运行此脚本，则执行生成
if (require.main === module) {
  generateI18nTypes();
}

module.exports = { generateI18nTypes };