import * as fs from 'fs';
import * as path from 'path';

const dtsRoot = path.resolve(__dirname, '../packages/cocos-cli-types');

const dtsFiles = [
    'index.d.ts',
    'assets.d.ts',
    'base.d.ts',
    'builder.d.ts',
    'cli.d.ts',
    'configuration.d.ts',
    'engine.d.ts',
    'project.d.ts',
    'scripting.d.ts',
];

describe('DTS API compatibility', () => {
    for (const file of dtsFiles) {
        it(`${file} should match snapshot`, () => {
            const filePath = path.join(dtsRoot, file);
            if (!fs.existsSync(filePath)) {
                throw new Error(
                    `${file} not found. Run "npm run build" first to generate .d.ts files.`,
                );
            }
            const content = fs.readFileSync(filePath, 'utf-8');
            expect(content).toMatchSnapshot();
        });
    }
});
