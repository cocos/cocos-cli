import Profile from '../../profile';
import { readJSON, writeJSON } from 'fs-extra';
import { join } from 'path';
import { defaultConfigMap } from '../configs';

jest.mock('fs-extra');

const mockReadJSON = readJSON as unknown as jest.MockedFunction<(file: string) => Promise<any>>;
const mockWriteJSON = writeJSON as unknown as jest.MockedFunction<(
    file: string,
    data: any,
    options?: any
) => Promise<void>>;

describe('Profile', () => {
    const projectPath = '/mock/project';
    const settingsPath = join(projectPath, 'settings', 'v2', 'packages');
    const pkgName = 'com.example.demo';
    const pkgPath = join(settingsPath, `${pkgName}.json`);

    beforeEach(() => {
        jest.clearAllMocks();
        Profile.init(projectPath);
    });

    test('init should set settings path', async () => {
        mockReadJSON.mockResolvedValue({ a: 1 });
        mockWriteJSON.mockResolvedValue(undefined);

        const ok = await Profile.setProject(pkgName, 'b.c', 2);
        expect(ok).toBe(true);
        expect(mockReadJSON).toHaveBeenCalledWith(pkgPath);
        expect(mockWriteJSON).toHaveBeenCalled();
    });

    test('getProject should return full json when no key', async () => {
        const data = { x: 1, y: { z: 2 } };
        mockReadJSON.mockResolvedValue(data);

        const res = await Profile.getProject<typeof data>(pkgName);
        expect(res).toEqual(data);
        expect(mockReadJSON).toHaveBeenCalledWith(pkgPath);
    });

    test('getProject should return nested value by dot key', async () => {
        mockReadJSON.mockResolvedValue({ a: { b: { c: 3 } } });

        const res = await Profile.getProject<number>(pkgName, 'a.b.c');
        expect(res).toBe(3);
    });

    test('getProject should return null for non-existing path', async () => {
        mockReadJSON.mockResolvedValue({ a: { } });

        const res = await Profile.getProject(pkgName, 'a.b.c');
        expect(res).toBeNull();
    });

    test('setProject should create intermediate objects and persist full json', async () => {
        const json: any = { exist: 1 };
        mockReadJSON.mockResolvedValue(json);
        mockWriteJSON.mockResolvedValue(undefined);

        const ok = await Profile.setProject(pkgName, 'm.n.o', 9);

        expect(ok).toBe(true);
        expect(mockWriteJSON).toHaveBeenCalledWith(pkgPath, json);
        expect(json.m.n.o).toBe(9);
    });

    test('setProject should return false on error', async () => {
        mockReadJSON.mockRejectedValue(new Error('read error'));

        const ok = await Profile.setProject(pkgName, 'a', 1);
        expect(ok).toBe(false);
    });

    test('getProject should return default value when file not exists', async () => {
        mockReadJSON.mockRejectedValue(new Error('ENOENT'));
        
        // Mock a package name that has default configuration
        const packageWithDefault = 'asset-db';
        const defaultConfig = defaultConfigMap[packageWithDefault];
        
        const res = await Profile.getProject(packageWithDefault);
        expect(res).toEqual(defaultConfig);
    });

    test('getProject should return default nested value when key not found in project config', async () => {
        const projectConfig = { a: { b: 1 } };
        const defaultConfig = { a: { b: 2, c: 3 } };
        
        mockReadJSON.mockResolvedValue(projectConfig);
        
        // Mock default configuration
        const originalDefault = defaultConfigMap[pkgName];
        defaultConfigMap[pkgName] = defaultConfig;
        
        try {
            const res = await Profile.getProject(pkgName, 'a.c');
            expect(res).toBe(3);
        } finally {
            // Restore original default configuration
            defaultConfigMap[pkgName] = originalDefault;
        }
    });

    test('getProject should return project value when both project and default have the key', async () => {
        const projectConfig = { a: { b: 1 } };
        const defaultConfig = { a: { b: 2 } };
        
        mockReadJSON.mockResolvedValue(projectConfig);
        
        // Mock default configuration
        const originalDefault = defaultConfigMap[pkgName];
        defaultConfigMap[pkgName] = defaultConfig;
        
        try {
            const res = await Profile.getProject(pkgName, 'a.b');
            expect(res).toBe(1); // Should return project config value, not default value
        } finally {
            // Restore original default configuration
            defaultConfigMap[pkgName] = originalDefault;
        }
    });

    test('getProject should return null when no default config available', async () => {
        mockReadJSON.mockRejectedValue(new Error('ENOENT'));
        
        // Use a package name that has no default configuration
        const packageWithoutDefault = 'non-existent-package';
        
        const res = await Profile.getProject(packageWithoutDefault);
        expect(res).toBeNull();
    });

    test('getProject should return null when key not found in both project and default', async () => {
        const projectConfig = { a: { b: 1 } };
        const defaultConfig = { a: { b: 2 } };
        
        mockReadJSON.mockResolvedValue(projectConfig);
        
        // Mock default configuration
        const originalDefault = defaultConfigMap[pkgName];
        defaultConfigMap[pkgName] = defaultConfig;
        
        try {
            const res = await Profile.getProject(pkgName, 'a.c');
            expect(res).toBeNull();
        } finally {
            // Restore original default configuration
            defaultConfigMap[pkgName] = originalDefault;
        }
    });
});
