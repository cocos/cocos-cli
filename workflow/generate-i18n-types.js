// scripts/generate-i18n-types.js
const fs = require('fs');
const path = require('path');
const { glob } = require('glob');

function generateI18nTypes() {
  const localesPath = path.join(__dirname, '../src/i18n/locales');
  const defaultLocale = 'en';
  const outputPath = path.join(__dirname, '../src/i18n/types/generated.d.ts');
  
  const localeFiles = glob.sync(`${localesPath}/${defaultLocale}/*.json`);
  
  let typeDefinition = `// Auto-generated i18n types for Node.js - DO NOT EDIT MANUALLY
// Generated at: ${new Date().toISOString()}

export interface I18nResources {\n`;

  for (const filePath of localeFiles) {
    const namespace = path.basename(filePath, '.json');
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    typeDefinition += `  ${namespace}: {\n`;
    typeDefinition += generateTypeForObject(content, 4);
    typeDefinition += `  };\n`;
  }
  
  typeDefinition += `}

// 为 Node.js 环境提供的类型扩展
declare module 'i18next' {
  interface TFunction {
    (key: I18nKeys, options?: any): string;
  }
}

// 工具类型
export type I18nKeys = FlattenKeys<I18nResources>;

type FlattenKeys<T extends Record<string, any>, Prefix extends string = ''> = {
  [K in keyof T]: T[K] extends Record<string, any>
    ? FlattenKeys<T[K], \`\${Prefix}\${K & string}.\`>
    : \`\${Prefix}\${K & string}\`
}[keyof T];
`;

  fs.writeFileSync(outputPath, typeDefinition);
  console.log('🎉 Node.js i18n 类型定义已生成!');
}