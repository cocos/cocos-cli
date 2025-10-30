import { project, Project } from '../../project/script';
import { ProjectInfo } from '../@types/public';
import { safeOutputJSON } from '../utils';
import { existsSync, readJSON } from 'fs-extra';
import { join } from 'path';
import { v4 } from 'node-uuid';

// Mock dependencies
jest.mock('fs-extra');
jest.mock('node-uuid');
jest.mock('../utils');

const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
const mockReadJSON = readJSON as unknown as jest.MockedFunction<(file: string) => Promise<any>>;
const mockSafeOutputJSON = safeOutputJSON as jest.MockedFunction<typeof safeOutputJSON>;
const mockV4 = v4 as jest.MockedFunction<typeof v4>;

describe('Project', () => {
    const mockProjectPath = '/test/project';
    const mockPackageJsonPath = join(mockProjectPath, 'package.json');


    const mockProjectInfo: ProjectInfo = {
        name: 'test-project',
        type: '3d',
        version: '4.0.0',
        uuid: 'test-uuid-123',
        creator: {
            version: '4.0.0',
            dependencies: {}
        }
    };

    beforeEach(() => {
        jest.clearAllMocks();
        mockV4.mockReturnValue('test-uuid-123' as any);
        mockSafeOutputJSON.mockResolvedValue(true);
    });

    describe('create method', () => {
        test('should create project successfully', async () => {
            mockExistsSync.mockImplementation(() => false);
            const ok = await Project.create(mockProjectPath, '3d');
            expect(ok).toBe(true);
            expect(mockSafeOutputJSON).toHaveBeenCalled();
        });

        test('should return false if project already exists', async () => {
            mockExistsSync.mockImplementation((path) => {
                if (path === mockProjectPath) return true;
                return path === join(mockProjectPath, 'package.json');

            });

            const ok = await Project.create(mockProjectPath, '3d');
            expect(ok).toBe(false);
        });
    });

    describe('open method', () => {
        beforeEach(() => {
            mockExistsSync.mockReset();
        });

        test('should throw error when project path exists but package.json does not', async () => {
            mockExistsSync.mockImplementation((path) => {
                if (path === mockProjectPath) return true;
                if (path === mockPackageJsonPath) return false;
                return false;
            });

            await expect(project.open(mockProjectPath)).rejects.toThrow();
        });

        test('should load project info when project path and package.json exist', async () => {
            mockExistsSync.mockImplementation((path) => {
                if (path === mockProjectPath) return true;
                return path === mockPackageJsonPath;

            });
            mockReadJSON.mockResolvedValue(mockProjectInfo);

            const result = await project.open(mockProjectPath);

            expect(result).toBe(true);
            expect(mockReadJSON).toHaveBeenCalledWith(mockPackageJsonPath);
            expect(project.getInfo()).toEqual(mockProjectInfo);
        });

        test('should throw error when package.json data is invalid', async () => {
            mockExistsSync.mockImplementation((path) => {
                if (path === mockProjectPath) return true;
                return path === mockPackageJsonPath;

            });
            mockReadJSON.mockResolvedValue({ invalid: 'data' });

            await expect(project.open(mockProjectPath)).rejects.toThrow();
        });
    });

    describe('close method', () => {

        beforeEach(async () => {
            mockExistsSync.mockReset();
            mockExistsSync.mockImplementation(() => false);
            await Project.create(mockProjectPath);
            await project.updateInfo(mockProjectInfo);
        });

        test('should save current project info when closing project', async () => {
            const result = await project.close();

            expect(result).toBe(true);
            expect(mockSafeOutputJSON).toHaveBeenCalledWith(mockPackageJsonPath, mockProjectInfo);
        });

        test('should return false when saving fails on close', async () => {
            mockSafeOutputJSON.mockResolvedValue(false);

            const result = await project.close();

            expect(result).toBe(false);
        });
    });

    describe('getInfo method', () => {

        beforeEach(async () => {
            mockExistsSync.mockReset();
            mockExistsSync.mockImplementation(() => false);
            await Project.create(mockProjectPath);
            mockExistsSync.mockImplementation((path) => path === mockProjectPath || path === mockPackageJsonPath);
            mockReadJSON.mockResolvedValue(mockProjectInfo);
            await project.open(mockProjectPath);
        });

        test('should return full project info when called without key', () => {
            const result = project.getInfo();

            expect(result).toEqual(mockProjectInfo);
        });

        test('should return value when called with valid key path', () => {
            const result = project.getInfo('name');

            expect(result).toBe('test-project');
        });

        test('should return nested value when called with nested key path', () => {
            const result = project.getInfo('creator.version');

            expect(result).toBe('4.0.0');
        });

        test('should return null when called with non-existing key path', () => {
            const result = project.getInfo('nonexistent.key');

            expect(result).toBe(null);
        });

        test('should return undefined when called with empty key string', () => {
            const result = project.getInfo('');

            expect(result).toBe(undefined);
        });
    });

    describe('updateInfo method', () => {

        beforeEach(async () => {
            mockExistsSync.mockReset();
            mockExistsSync.mockImplementation(() => false);
            await Project.create(mockProjectPath);
            mockExistsSync.mockImplementation((path) => path === mockProjectPath || path === mockPackageJsonPath);
            mockReadJSON.mockResolvedValue(mockProjectInfo);
            await project.open(mockProjectPath);
        });

        test('should update successfully with full ProjectInfo object', async () => {
            const newInfo: ProjectInfo = {
                ...mockProjectInfo,
                name: 'updated-project',
                version: '4.1.0'
            };

            const result = await project.updateInfo(newInfo);

            expect(result).toBe(true);
            expect(mockSafeOutputJSON).toHaveBeenCalledWith(mockPackageJsonPath, newInfo);
        });

        test('should update successfully with key-value pair', async () => {
            const result = await project.updateInfo('name', 'updated-name');

            expect(result).toBe(true);
            expect(project.getInfo('name')).toBe('updated-name');
            expect(mockSafeOutputJSON).toHaveBeenCalled();
        });

        test('should update successfully with nested key-value pair', async () => {
            const result = await project.updateInfo('creator.version', '4.1.0');

            expect(result).toBe(true);
            expect(project.getInfo('creator.version')).toBe('4.1.0');
            expect(mockSafeOutputJSON).toHaveBeenCalled();
        });

        test('should create intermediate objects for non-existing nested path', async () => {
            const result = await project.updateInfo('new.nested.property', 'test-value');

            expect(result).toBe(true);
            expect(project.getInfo('new.nested.property')).toBe('test-value');
            expect(mockSafeOutputJSON).toHaveBeenCalled();
        });

        test('should return false when saving fails', async () => {
            mockSafeOutputJSON.mockResolvedValue(false);

            const result = await project.updateInfo<string>('name.x.x.x', 'updated-name');

            expect(result).toBe(false);
        });

        test('should return false when an exception occurs during update', async () => {
            mockSafeOutputJSON.mockRejectedValue(new Error('Write failed'));

            const result = await project.updateInfo<string>('name', 'updated-name');

            expect(result).toBe(false);
        });
    });

    describe('Edge cases and error handling', () => {
        test('getInfo should return null if encountering null during key traversal', () => {

            const result = project.getInfo('nested.property');

            expect(result).toBe(null);
        });

        test('getInfo should return null if encountering undefined during key traversal', () => {

            const result = project.getInfo('nested.property');

            expect(result).toBe(null);
        });

        test('updateInfo should create intermediate objects for deep nested path', async () => {

            const result = await project.updateInfo('a.b.c.d', 'deep-value');

            expect(result).toBe(true);
            expect(project.getInfo('a.b.c.d')).toBe('deep-value');
            expect(project.getInfo('a')).toEqual({
                b: {
                    c: {
                        d: 'deep-value'
                    }
                }
            });
        });
    });
});