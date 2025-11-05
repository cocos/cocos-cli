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

// 1. 检查是否需要跳过 MCP types 生成（通过参数）
let shouldSkipMcpTypes = skipMcpTypesIndex !== -1;
if (shouldSkipMcpTypes) {
    console.log(`📋 检测到 --skip-mcp-types 参数，跳过 MCP types 生成`);
}

// 2. 检查 CLI 路径
let cliPath = process.env.E2E_CLI_PATH;
const defaultCliPath = path.resolve(__dirname, '../../dist/cli.js');
const resolvedDefaultPath = path.resolve(defaultCliPath);

if (cliPath) {
    // 从环境变量读取
    const resolvedCliPath = path.resolve(cliPath);
    // 检查是否是默认路径
    if (resolvedCliPath !== resolvedDefaultPath) {
        shouldSkipMcpTypes = true; // 自定义路径，跳过生成
        console.log(`   路径与默认路径不同，跳过 MCP types 生成`);
    } else {
        console.log(`   路径为默认路径，将生成 MCP types`);
    }
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
            // 检查是否是默认路径
            const resolvedCliPath = path.resolve(cliPath);
            if (resolvedCliPath !== resolvedDefaultPath) {
                shouldSkipMcpTypes = true; // 自定义路径，跳过生成
                console.log(`   路径与默认路径不同，跳过 MCP types 生成`);
            } else {
                console.log(`   路径为默认路径，将生成 MCP types`);
            }
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

// 3. 决定是否生成 MCP types
if (!shouldSkipMcpTypes) {
    // 使用默认路径，需要生成 MCP types
    console.log(`📋 使用默认 CLI 路径，生成 MCP types...`);
    const generateTypes = spawn('npm', ['run', 'generate:mcp-types'], {
        stdio: 'inherit',
        shell: true,
        env: { ...process.env }, // 传递环境变量
    });
    
    generateTypes.on('close', (code) => {
        if (code !== 0) {
            console.error(`❌ MCP types 生成失败，退出码: ${code}`);
            process.exit(code);
        }
        // 继续执行 Jest
        runJest();
    });
} else {
    // 跳过生成，直接运行 Jest
    if (shouldSkipMcpTypes) {
        console.log(`⏭️  跳过 MCP types 生成（${cliPath ? '使用自定义 CLI 路径' : '--skip-mcp-types 参数'}）`);
    }
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
    
    console.log(`🚀 启动 Jest: jest ${jestArgs.join(' ')}`);
    if (process.env.E2E_CLI_PATH) {
        console.log(`   环境变量 E2E_CLI_PATH: ${process.env.E2E_CLI_PATH}`);
    }
    if (isDebugMode) {
        console.log(`   🔍 调试模式已启用`);
        console.log(`   - 详细日志输出`);
        console.log(`   - 禁用缓存`);
        console.log(`   - 检测未关闭的句柄`);
    }
    
    const jest = spawn('jest', jestArgs, {
        stdio: 'inherit',
        shell: true,
        env: { ...process.env }, // 传递环境变量（包括 E2E_CLI_PATH 和 E2E_DEBUG）
    });
    
    jest.on('close', (code) => {
        process.exit(code);
    });
    
    jest.on('error', (error) => {
        console.error(`❌ 启动 Jest 失败:`, error);
        process.exit(1);
    });
}

