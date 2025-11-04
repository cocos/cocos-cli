import { cliRunner } from '../helpers/cli-runner';
import {
    createTestProject,
    checkPathExists,
    validateBuildOutput,
    delay,
    E2E_TIMEOUTS
} from '../helpers/test-utils';
import { TestProject } from '../helpers/project-manager';
import { resolve, join } from 'path';

describe('cocos build command', () => {
    let testProject: TestProject;

    beforeAll(async () => {
        const fixtureProject = resolve(__dirname, '../../tests/fixtures/projects/asset-operation');
        testProject = await createTestProject(fixtureProject);
    });

    afterAll(async () => {
        await testProject.cleanup();
    });

    describe('web-desktop platform', () => {
        test('should build web-desktop project successfully', async () => {
            const result = await cliRunner.build({
                project: testProject.path,
                platform: 'web-desktop',
            });

            // 验证构建成功
            expect(result.exitCode).toBe(0);

            // 验证构建输出目录存在
            const buildPath = join(testProject.path, 'build', 'web-desktop-test');
            const buildExists = await checkPathExists(buildPath);
            expect(buildExists).toBe(true);

            // 等待文件系统同步
            await delay(1000);

            // 验证构建产物
            const validation = await validateBuildOutput(buildPath);
            if (!validation.valid) {
                console.warn('Missing build files:', validation.missingFiles);
            }
        }, E2E_TIMEOUTS.BUILD_OPERATION);

        // test('should build with custom config file', async () => {
        //     // 创建自定义配置文件
        //     const configPath = join(testProject.path, 'build-config.json');
        //     writeJSONSync(configPath, {
        //         platform: 'web-desktop',
        //         dest: join(testProject.path, 'custom-build'),
        //     });

        //     const result = await cliRunner.run([
        //         'build',
        //         '--project', testProject.path,
        //         '--build-config', configPath,
        //     ]);

        //     expect(result.exitCode).toBe(0);

        //     // 验证自定义构建输出目录
        //     const buildExists = await checkPathExists(join(testProject.path, 'custom-build', 'web-desktop'));
        //     expect(buildExists).toBe(true);
        // }, E2E_TIMEOUTS.BUILD_OPERATION);

        // test('should use platform from command line to override config', async () => {
        //     // 创建配置文件（指定 web-mobile）
        //     const configPath = join(testProject.path, 'build-config-override.json');
        //     writeJSONSync(configPath, {
        //         platform: 'web-mobile',
        //     });

        //     // 命令行指定 web-desktop，应该覆盖配置文件
        //     const result = await cliRunner.run([
        //         'build',
        //         '--project', testProject.path,
        //         '--platform', 'web-desktop',
        //         '--build-config', configPath,
        //     ]);

        //     expect(result.exitCode).toBe(0);

        //     // 应该构建的是 web-desktop 而不是 web-mobile
        //     const buildPath = join(testProject.path, 'build', 'web-desktop');
        //     const buildExists = await checkPathExists(buildPath);
        //     expect(buildExists).toBe(true);
        // }, E2E_TIMEOUTS.BUILD_OPERATION);
    });

    describe('web-mobile platform', () => {
        test('should build web-mobile project successfully', async () => {
            const result = await cliRunner.build({
                project: testProject.path,
                platform: 'web-mobile',
            });

            expect(result.exitCode).toBe(0);

            const buildPath = join(testProject.path, 'build', 'web-mobile-test');
            const buildExists = await checkPathExists(buildPath);
            expect(buildExists).toBe(true);
        }, E2E_TIMEOUTS.BUILD_OPERATION);
    });

    describe('build config file', () => {
        test('should fail when config file does not exist', async () => {
            const result = await cliRunner.run([
                'build',
                '--project', testProject.path,
                '--build-config', '/non-existent/config.json',
            ]);

            expect(result.exitCode).not.toBe(0);
            expect(result.stderr || result.stdout).toMatch(/not exist/i);
        });
    });

    describe('error handling', () => {
        test('should fail with invalid platform', async () => {
            const result = await cliRunner.run([
                'build',
                '--project', testProject.path,
                '--platform', 'invalid-platform',
            ]);

            expect(result.exitCode).not.toBe(0);
        });

        test('should fail with invalid project path', async () => {
            const result = await cliRunner.run([
                'build',
                '--project', '/invalid/path/that/does/not/exist',
                '--platform', 'web-desktop',
            ]);

            // 应该返回非 0 的退出码
            expect(result.exitCode).not.toBe(0);
            // 错误信息应该提到路径问题
            expect(result.stderr || result.stdout).toMatch(/project|path|not found|does not exist/i);
        });

        test('should fail when required options are missing', async () => {
            const result = await cliRunner.run(['build']);

            // 应该返回非 0 的退出码
            expect(result.exitCode).not.toBe(0);
            // Commander.js 会输出 required option 的错误信息
            const output = result.stderr || result.stdout;
            expect(output).toMatch(/required|option.*--project/i);
        });
    });
});
