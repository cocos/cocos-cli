import * as fs from 'fs';
import * as path from 'path';

const rootDir = path.resolve(__dirname, '..');

function readJson(relativePath: string) {
    return JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), 'utf8'));
}

function readText(relativePath: string) {
    return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

describe('CI regression guards', () => {
    it('keeps @cocos/asset-db as a private workspace with a consistent version', () => {
        const packageJson = readJson('package.json');
        const packageLock = readJson('package-lock.json');
        const assetDbPackage = readJson('packages/asset-db/package.json');
        const expectedVersion = packageJson.dependencies['@cocos/asset-db'];

        expect(packageJson.workspaces).toEqual(['packages/asset-db']);
        expect(packageLock.packages[''].workspaces).toEqual(['packages/asset-db']);
        expect(packageLock.packages[''].dependencies['@cocos/asset-db']).toBe(expectedVersion);
        expect(packageLock.packages['node_modules/@cocos/asset-db']).toEqual({
            resolved: 'packages/asset-db',
            link: true,
        });
        expect(packageLock.packages['packages/asset-db'].version).toBe(expectedVersion);
        expect(assetDbPackage.version).toBe(expectedVersion);
        expect(assetDbPackage.private).toBe(true);
        expect(assetDbPackage.scripts.publish).toBeUndefined();
        expect(assetDbPackage.scripts['publish:npm']).toBeUndefined();
    });

    it('does not allow Jest to resolve .d.ts files as runtime modules', () => {
        const jestConfig = readText('jest.config.ts');

        expect(jestConfig).not.toContain("'d.ts'");
    });

    it('uses npm ci in setup-env so CI installs the lockfile exactly', () => {
        const setupEnvAction = readText('.github/actions/setup-env/action.yml');

        expect(setupEnvAction).toMatch(/^\s*run:\s*npm ci\s*$/m);
        expect(setupEnvAction).not.toMatch(/^\s*run:\s*npm i\s*$/m);
    });

    it('excludes AssetDB development files and nested dependencies from releases', () => {
        const vscodeIgnore = readText('.vscodeignore');

        for (const pattern of [
            'packages/asset-db/source/**',
            'packages/asset-db/test/**',
            'packages/asset-db/scripts/**',
            'packages/asset-db/node_modules/**',
            'packages/asset-db/tsconfig*.json',
            'packages/asset-db/.gitignore',
        ]) {
            expect(vscodeIgnore).toContain(pattern);
        }
    });
});
