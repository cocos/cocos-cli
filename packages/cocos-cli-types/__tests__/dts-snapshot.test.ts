import * as fs from 'fs';
import * as path from 'path';

const dtsRoot = path.resolve(__dirname, '..');

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

function stripComments(content: string): string {
    return content
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '')
        .replace(/^\s*\n/gm, '');
}

describe('DTS API compatibility', () => {
    for (const file of dtsFiles) {
        it(`${file} should match snapshot`, () => {
            const filePath = path.join(dtsRoot, file);
            if (!fs.existsSync(filePath)) {
                throw new Error(
                    `${file} not found. Run "npm run build" first to generate .d.ts files.`,
                );
            }
            const content = stripComments(fs.readFileSync(filePath, 'utf-8'));
            expect(content).toMatchSnapshot();
        });
    }
});
