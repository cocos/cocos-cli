const { execSync } = require('child_process');
const { join } = require('path');

const input = join(__dirname, '../src/core/configuration/@types/cocos.config.d.ts');
const output = join(__dirname, '../dist/cocos.config.schema.json');
execSync(`npx --yes typescript-json-schema ${input} COCOS_CONFIG -o ${output} --noExtraProps --skipLibCheck`);
