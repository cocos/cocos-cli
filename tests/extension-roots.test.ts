import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { resolveBuiltinExtensionsRoot, resolveExtensionRoots } from '../src/core/extension-roots';

const OVERRIDE_ENV = 'COCOS_CLI_DEV_BUILTIN_EXTENSIONS_ROOT';

function devEnv(override?: string): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { VSCODE_DEV: '1' };
    if (override !== undefined) {
        env[OVERRIDE_ENV] = override;
    }
    return env;
}

describe('extension roots', () => {
    let tempRoot: string;

    beforeEach(() => {
        tempRoot = mkdtempSync(join(tmpdir(), 'cocos-extension-roots-'));
    });

    afterEach(() => {
        rmSync(tempRoot, { recursive: true, force: true });
    });

    test('valid Dev override wins and is the only builtin root', () => {
        const resourcesPath = join(tempRoot, 'resources');
        const packagedRoot = join(resourcesPath, 'app', 'extensions');
        const overrideRoot = join(tempRoot, 'dev-extensions');
        const projectPath = join(tempRoot, 'project');
        mkdirSync(packagedRoot, { recursive: true });
        mkdirSync(overrideRoot, { recursive: true });

        expect(resolveBuiltinExtensionsRoot(resourcesPath, devEnv(overrideRoot))).toBe(overrideRoot);
        expect(resolveExtensionRoots(projectPath, devEnv(overrideRoot))).toEqual([
            { kind: 'project', path: join(projectPath, 'extensions') },
            { kind: 'builtin', path: overrideRoot },
        ]);
        expect(resolveExtensionRoots(projectPath, devEnv(overrideRoot)).some((root) => root.path === packagedRoot)).toBe(false);
    });

    test.each([
        ['empty', '', /must be a non-empty absolute directory path/],
        ['relative', 'relative/dev-extensions', /must be an absolute directory path/],
    ])('rejects %s Dev override', (_name, override, message) => {
        expect(() => resolveBuiltinExtensionsRoot(undefined, devEnv(override))).toThrow(message);
    });

    test('rejects a Dev override that points to a file', () => {
        const filePath = join(tempRoot, 'extensions.txt');
        writeFileSync(filePath, 'not a directory', 'utf8');

        expect(() => resolveBuiltinExtensionsRoot(undefined, devEnv(filePath))).toThrow(/must point to a directory/);
    });

    test('rejects a missing Dev override directory', () => {
        const missingPath = join(tempRoot, 'missing-extensions');

        expect(() => resolveBuiltinExtensionsRoot(undefined, devEnv(missingPath))).toThrow(/points to a missing directory/);
    });

    test('ignores an override outside Dev mode', () => {
        const resourcesPath = join(tempRoot, 'resources');
        const packagedRoot = join(resourcesPath, 'app', 'extensions');
        mkdirSync(packagedRoot, { recursive: true });

        expect(resolveBuiltinExtensionsRoot(resourcesPath, { [OVERRIDE_ENV]: 'relative/dev-extensions' })).toBe(packagedRoot);
    });

    test('preserves project-first ordering with the packaged default', () => {
        const resourcesPath = join(tempRoot, 'resources');
        const packagedRoot = join(resourcesPath, 'app', 'extensions');
        const projectPath = join(tempRoot, 'project');
        mkdirSync(packagedRoot, { recursive: true });

        const processObject = process as NodeJS.Process & { resourcesPath?: string };
        const previous = Object.getOwnPropertyDescriptor(processObject, 'resourcesPath');
        Object.defineProperty(processObject, 'resourcesPath', {
            configurable: true,
            value: resourcesPath,
            writable: true,
        });
        try {
            expect(resolveExtensionRoots(projectPath, devEnv())).toEqual([
                { kind: 'project', path: join(projectPath, 'extensions') },
                { kind: 'builtin', path: packagedRoot },
            ]);
        } finally {
            if (previous) {
                Object.defineProperty(processObject, 'resourcesPath', previous);
            } else {
                delete processObject.resourcesPath;
            }
        }
    });
});
