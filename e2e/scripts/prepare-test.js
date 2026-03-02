#!/usr/bin/env node
/**
 * E2E 测试前置脚本
 * 
 * 功能：
 * 1. 检查是否有自定义 CLI 路径（通过环境变量或命令行参数）
 * 2. 决定是否需要生成 MCP types（只有使用默认 CLI 路径时才生成）
 * 3. 将 CLI 路径设置到环境变量中，供 globalSetup 使用
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// 解析命令行参数
const args = process.argv.slice(2);

const cliIndex = args.indexOf('--cli');
const skipMcpTypesIndex = args.indexOf('--skip-mcp-types');
const preserveIndex = args.indexOf('--preserve');

// 检测 --preserve 参数，自动设置 E2E_DEBUG 环境变量（跨平台兼容）
if (preserveIndex !== -1) {
    process.env.E2E_DEBUG = 'true';
    console.log('🔍 检测到 --preserve 参数，启用调试模式');
}

// 1. 检查是否需要跳过 MCP types 生成（仅通过 --skip-mcp-types 参数）
const shouldSkipMcpTypes = skipMcpTypesIndex !== -1;
if (shouldSkipMcpTypes) {
    console.log(`📋 检测到 --skip-mcp-types 参数，跳过 MCP types 生成`);
}

// 2. 检查 CLI 路径
let cliPath = process.env.E2E_CLI_PATH;
const defaultCliPath = path.resolve(__dirname, '../../dist/cli.js');

if (cliPath) {
    // 从环境变量读取
    console.log(`📋 使用环境变量中的 CLI 路径: ${cliPath}`);
} else if (cliIndex !== -1 && cliIndex + 1 < args.length) {
    // 从命令行参数读取
    const argPath = args[cliIndex + 1];
    if (argPath && !argPath.startsWith('--')) {
        cliPath = path.isAbsolute(argPath)
            ? argPath
            : path.resolve(process.cwd(), argPath);
        console.log(`📋 检测到 --cli 参数: ${argPath}`);
        
        // 验证路径是否存在
        if (fs.existsSync(cliPath)) {
            // 设置环境变量供 globalSetup 使用
            process.env.E2E_CLI_PATH = cliPath;
        } else {
            console.error(`❌ 错误: CLI 文件不存在: ${cliPath}`);
            process.exit(1);
        }
    } else {
        console.error(`❌ 错误: --cli 参数后缺少路径值`);
        process.exit(1);
    }
} else {
    // 没有指定 CLI 路径，使用默认路径
    cliPath = defaultCliPath;
    console.log(`📋 未指定 CLI 路径，使用默认路径: ${defaultCliPath}`);
}

// 3. 决定是否生成 MCP types（默认全部生成，除非明确指定 --skip-mcp-types）
if (!shouldSkipMcpTypes) {
    // 默认生成 MCP types
    console.log(`📋 生成 MCP types...`);
    
    // 在 Windows 上使用 npm.cmd 以确保能够正确执行
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

    const maxRetries = 3;
    let attempt = 0;

    function runGenerateTypes() {
        attempt++;
        if (attempt > 1) {
            console.log(`🔄 重试生成 MCP types (第 ${attempt} 次尝试)...`);
        }

        const generateTypes = spawn(npmCmd, ['run', 'generate:mcp-types'], {
            stdio: 'inherit',
            shell: true,
            env: { ...process.env }, // 传递环境变量
        });

        generateTypes.on('error', (err) => {
            console.error(`❌ 启动 MCP types 生成失败: ${err.message}`);
            process.exit(1);
        });

        // 添加超时保护（120秒）
        const timeout = setTimeout(() => {
            console.error('❌ MCP types 生成超时（120秒），强制终止');
            generateTypes.kill('SIGKILL');
            handleFailure();
        }, 120000);

        generateTypes.on('close', (code) => {
            clearTimeout(timeout);
            if (code !== 0) {
                console.error(`❌ MCP types 生成失败，退出码: ${code}`);
                handleFailure();
            } else {
                // 成功，继续执行 Jest
                runJest();
            }
        });

        function handleFailure() {
            if (attempt < maxRetries) {
                console.log(`⏳ 3秒后进行第 ${attempt + 1} 次尝试...`);
                setTimeout(runGenerateTypes, 3000);
            } else {
                console.error(`❌ 已达到最大重试次数 (${maxRetries})，放弃生成`);
                process.exit(1);
            }
        }
    }

    runGenerateTypes();
} else {
    // 跳过生成，直接运行 Jest
    console.log(`⏭️  跳过 MCP types 生成（--skip-mcp-types 参数）`);
    runJest();
}

function runJest() {
    // 检查是否是调试模式
    const isDebugMode = process.env.E2E_DEBUG === 'true' || args.includes('--preserve');
    
    // 构建 Jest 命令参数（移除 --cli 和 --skip-mcp-types 参数）
    const jestArgs = args.filter((arg, index) => {
        // 移除 --cli 及其值
        if (index === cliIndex || index === cliIndex + 1) {
            return false;
        }
        // 移除 --skip-mcp-types
        if (index === skipMcpTypesIndex) {
            return false;
        }
        // 保留其他参数（如 --preserve, --verbose, --no-cache, --testPathPattern 等）
        return true;
    });
    
    // 调试模式下添加额外的 Jest 调试参数
    if (isDebugMode) {
        // 如果没有 --verbose，添加它
        if (!jestArgs.includes('--verbose')) {
            jestArgs.push('--verbose');
        }
        // 如果没有 --no-cache，添加它（确保不使用缓存）
        if (!jestArgs.includes('--no-cache')) {
            jestArgs.push('--no-cache');
        }
        // 添加 --detectOpenHandles 以检测未关闭的句柄
        if (!jestArgs.includes('--detectOpenHandles')) {
            jestArgs.push('--detectOpenHandles');
        }
        // 添加 --runInBand 确保串行执行（调试时更容易跟踪）
        if (!jestArgs.includes('--runInBand')) {
            jestArgs.push('--runInBand');
        }
    }
    
    // 添加 Jest 配置
    jestArgs.unshift('--config', 'e2e/jest.config.e2e.ts');
    
    console.log(`🚀 启动 Jest: npx jest ${jestArgs.join(' ')}`);
    if (process.env.E2E_CLI_PATH) {
        console.log(`   环境变量 E2E_CLI_PATH: ${process.env.E2E_CLI_PATH}`);
    }
    if (isDebugMode) {
        console.log(`   🔍 调试模式已启用`);
        console.log(`   - 详细日志输出`);
        console.log(`   - 禁用缓存`);
        console.log(`   - 检测未关闭的句柄`);
    }
    
    // 使用 npx jest 以确保在 CI 中能找到 jest 命令
    const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
    
    const jest = spawn(npxCmd, ['jest', ...jestArgs], {
        stdio: 'inherit',
        shell: true,
        env: { ...process.env }, // 传递环境变量（包括 E2E_CLI_PATH 和 E2E_DEBUG）
    });
    
    jest.on('error', (err) => {
        console.error(`❌ 启动 Jest 失败: ${err.message}`);
        process.exit(1);
    });
    
    jest.on('close', (code) => {
        if (code !== 0) {
            console.log(`⚠️ Jest 退出，退出码: ${code}`);
        }
        process.exit(code);
    });
}

