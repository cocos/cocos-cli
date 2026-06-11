const { execFileSync } = require('child_process');
const { join } = require('path');

const input = join(__dirname, '../src/core/configuration/@types/cocos.config.d.ts');
const output = join(__dirname, '../dist/cocos.config.schema.json');
const tsconfig = join(__dirname, '../tsconfig.json');
const schemaCli = join(__dirname, '../node_modules/typescript-json-schema/bin/typescript-json-schema');

execFileSync(process.execPath, [
    schemaCli,
    tsconfig,
    'COCOS_CONFIG',
    '-o',
    output,
    '--noExtraProps',
    '--skipLibCheck',
    '--include',
    input,
], { stdio: 'inherit' });
console.log(`✅ Schema 文件已生成: ${output}`);
