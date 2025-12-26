import { spawn, exec } from "child_process";
import { platform, tmpdir } from "os";
import fs from "fs";
import path from "path";
import { get as httpGet } from "http";
import WebSocket from "ws";
import { newConsole } from "../../../base/console";

/**
 * 浏览器类型枚举
 */
export enum BrowserType {
    Chrome = 'chrome',
    Edge = 'edge'
}

/**
 * openUrl 函数的选项类型
 */
export interface OpenUrlOptions {
    /** 是否启用远程调试模式，默认 false */
    remoteDebuggingMode?: boolean;
    /** 浏览器可执行文件路径，如果不提供则自动查找 */
    browserPath?: string;
    /** 远程调试端口，仅在 remoteDebuggingMode 为 true 时有效，默认 9222 */
    port?: number;
    /** 浏览器类型，仅在 remoteDebuggingMode 为 true 且未提供 browserPath 时有效，默认 BrowserType.Chrome */
    browserType?: BrowserType;
}

/**
 * 查找 Chrome 浏览器路径
 */
function findChromePath(): string | undefined {
    const currentPlatform = platform();
    const homeDir = process.env.HOME || process.env.USERPROFILE || "";

    if (currentPlatform === 'win32') {
        const chromePaths = [
            // Chrome (按优先级排序)
            path.join(homeDir, 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'),
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            // Chrome Canary
            path.join(homeDir, 'AppData\\Local\\Google\\Chrome SxS\\Application\\chrome.exe'),
            // Chromium
            path.join(homeDir, 'AppData\\Local\\Chromium\\Application\\chrome.exe'),
        ];

        for (const p of chromePaths) {
            if (fs.existsSync(p)) {
                return p;
            }
        }
    } else if (currentPlatform === 'darwin') {
        const chromePaths = [
            // Chrome (按优先级排序)
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            path.join(homeDir, 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
            // Chrome Canary
            '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
            path.join(homeDir, 'Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary'),
            // Chromium
            '/Applications/Chromium.app/Contents/MacOS/Chromium',
            path.join(homeDir, 'Applications/Chromium.app/Contents/MacOS/Chromium'),
        ];

        for (const p of chromePaths) {
            if (fs.existsSync(p)) {
                return p;
            }
        }
    } else if (currentPlatform === 'linux') {
        const chromePaths = [
            // Chrome (按优先级排序)
            '/usr/bin/google-chrome-stable',
            '/usr/bin/google-chrome',
            '/usr/bin/chromium-browser',
            '/usr/bin/chromium',
            // Snap packages
            '/snap/bin/chromium',
            '/snap/bin/google-chrome',
            // Flatpak
            '/var/lib/flatpak/exports/bin/com.google.Chrome',
            '/var/lib/flatpak/exports/bin/org.chromium.Chromium',
            // User-level installations
            path.join(homeDir, '.local/share/flatpak/exports/bin/com.google.Chrome'),
            path.join(homeDir, '.local/share/flatpak/exports/bin/org.chromium.Chromium'),
        ];

        for (const p of chromePaths) {
            if (fs.existsSync(p)) {
                return p;
            }
        }
    }

    // 最后检查环境变量
    return process.env.CHROME_PATH || process.env.CHROMIUM_PATH;
}

/**
 * 查找 Edge 浏览器路径
 */
function findEdgePath(): string | undefined {
    const currentPlatform = platform();
    const homeDir = process.env.HOME || process.env.USERPROFILE || "";

    if (currentPlatform === 'win32') {
        const edgePaths = [
            // Edge (按优先级排序)
            path.join(homeDir, 'AppData\\Local\\Microsoft\\Edge\\Application\\msedge.exe'),
            'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
            'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
            // Edge Beta/Dev
            path.join(homeDir, 'AppData\\Local\\Microsoft\\Edge Beta\\Application\\msedge.exe'),
            path.join(homeDir, 'AppData\\Local\\Microsoft\\Edge Dev\\Application\\msedge.exe'),
        ];

        for (const p of edgePaths) {
            if (fs.existsSync(p)) {
                return p;
            }
        }
    } else if (currentPlatform === 'darwin') {
        const edgePaths = [
            // Edge
            '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
            path.join(homeDir, 'Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'),
        ];

        for (const p of edgePaths) {
            if (fs.existsSync(p)) {
                return p;
            }
        }
    } else if (currentPlatform === 'linux') {
        const edgePaths = [
            '/usr/bin/microsoft-edge',
            '/usr/bin/microsoft-edge-stable',
            '/usr/bin/microsoft-edge-beta',
            '/usr/bin/microsoft-edge-dev',
            // Snap packages
            '/snap/bin/microsoft-edge',
            // Flatpak
            '/var/lib/flatpak/exports/bin/com.microsoft.Edge',
            path.join(homeDir, '.local/share/flatpak/exports/bin/com.microsoft.Edge'),
        ];

        for (const p of edgePaths) {
            if (fs.existsSync(p)) {
                return p;
            }
        }
    }

    // 检查环境变量
    return process.env.EDGE_PATH;
}

/**
 * 根据浏览器类型查找浏览器路径
 * @param browserType 浏览器类型，默认为 BrowserType.Chrome
 * @returns 浏览器可执行文件路径，如果未找到则返回 undefined
 */
function findBrowserPath(browserType: BrowserType = BrowserType.Chrome): string | undefined {
    return browserType === BrowserType.Edge ? findEdgePath() : findChromePath();
}

/**
 * 启动带调试端口的浏览器
 * @param url 要打开的 URL
 * @param browserPath 浏览器可执行文件路径
 * @param port 远程调试端口，默认 9222
 * @param completedCallback 浏览器启动完成后的回调函数
 */
function openDebuggingBrowser(url: string, browserPath: string, port: number, completedCallback?: () => void): void {
    console.log(`🚀 Launching browser with debugging at ${browserPath}...`);

    const args = [
        `--remote-debugging-port=${port}`,
        "--no-first-run",
        "--no-default-browser-check",
        url
    ];

    // 设置 user-data-dir 以避免与正常浏览器实例冲突
    const userDataDir = platform() === 'win32'
        ? path.join(process.env.TEMP || process.env.TMP || tmpdir(), "chrome-debug")
        : path.join(tmpdir(), "chrome-debug");
    args.push(`--user-data-dir=${userDataDir}`);

    try {
        const browserProcess = spawn(browserPath, args, {
            detached: true,
            stdio: 'ignore'
        });

        browserProcess.unref();
        console.log(`✅ Browser launched with debugging port ${port}`);
        console.log(`📡 Debugging URL: http://127.0.0.1:${port}`);

        // 浏览器启动后调用回调
        if (completedCallback) {
            completedCallback();
        }
    } catch (error: any) {
        console.error(`❌ Failed to launch browser: ${error.message}`);
        console.log("Falling back to default browser...");

        // 即使失败也调用回调
        if (completedCallback) {
            completedCallback();
        }
    }
}

/**
 * 使用系统默认命令打开浏览器
 * @param url 要打开的 URL
 * @param completedCallback 浏览器打开完成后的回调函数
 */
function openBrowser(url: string, completedCallback?: () => void): void {
    const currentPlatform = process.platform;

    let command: string | undefined;
    switch (currentPlatform) {
        case 'win32':
            command = `start ${url}`;
            break;
        case 'darwin':
            command = `open ${url}`;
            break;
        case 'linux':
            command = `xdg-open ${url}`;
            break;
        default:
            console.log(`请手动打开浏览器访问: ${url}`);
            if (completedCallback) {
                completedCallback();
            }
            return;
    }

    //@ts-expect-error
    //hack: when run on pink use simple browser instead of default browser
    if (process && process.addGlobalOpenUrl) {
        //@ts-expect-error
        process.addGlobalOpenUrl(url);
        if (completedCallback) {
            completedCallback();
        }
        return;
    }

    if (command) {
        exec(command, (error: any) => {
            if (error) {
                console.error('打开浏览器失败:', error.message);
                console.log(`请手动打开浏览器访问: ${url}`);
            } else {
                console.log(`正在浏览器中打开: ${url}`);
            }

            // 无论成功或失败都调用回调
            if (completedCallback) {
                completedCallback();
            }
        });
    } else if (completedCallback) {
        completedCallback();
    }
}

/**
 * 连接到 Chrome DevTools Protocol 并监听浏览器日志
 * @param port 远程调试端口，默认 9222
 * @param targetUrl 目标 URL，用于匹配正确的调试目标
 * @param retries 重试次数，默认 5 次
 * @param retryDelay 重试延迟（毫秒），默认 1000ms
 */
export async function connectToChromeDevTools(
    port: number = 9222,
    targetUrl?: string,
    retries: number = 5,
    retryDelay: number = 1000
): Promise<void> {
    return new Promise((resolve) => {
        // 获取调试目标列表
        const requestUrl = `http://127.0.0.1:${port}/json`;

        httpGet(requestUrl, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const targets = JSON.parse(data);

                    // 查找匹配的目标（优先匹配 URL）
                    let target = targets.find((t: any) =>
                        targetUrl && t.url && t.url.includes(targetUrl)
                    );

                    // 如果没有找到匹配的，使用第一个 page 类型的目标
                    if (!target) {
                        target = targets.find((t: any) => t.type === 'page');
                    }

                    if (!target) {
                        newConsole.warn(`未找到可用的调试目标，端口: ${port}`);
                        resolve();
                        return;
                    }

                    const wsUrl = target.webSocketDebuggerUrl;
                    if (!wsUrl) {
                        newConsole.warn(`调试目标没有 WebSocket URL`);
                        resolve();
                        return;
                    }

                    // 连接到 WebSocket
                    const ws = new WebSocket(wsUrl);
                    let messageId = 1;

                    ws.on('open', () => {
                        newConsole.log(`🔗 已连接到浏览器调试端口 ${port}`);

                        // 发送 Runtime.enable 命令
                        ws.send(JSON.stringify({
                            id: messageId++,
                            method: 'Runtime.enable',
                            params: {}
                        }));

                        // 发送 Log.enable 命令
                        ws.send(JSON.stringify({
                            id: messageId++,
                            method: 'Log.enable',
                            params: {}
                        }));

                        // 发送 Runtime.runIfWaitingForDebugger 命令（如果需要）
                        ws.send(JSON.stringify({
                            id: messageId++,
                            method: 'Runtime.runIfWaitingForDebugger',
                            params: {}
                        }));
                    });

                    ws.on('message', (data: WebSocket.Data) => {
                        try {
                            const message = JSON.parse(data.toString());

                            // 处理 Log.entryAdded 事件
                            if (message.method === 'Log.entryAdded') {
                                const entry = message.params.entry;
                                const level = entry.level || 'info';
                                const text = entry.text || '';

                                // 格式化日志消息
                                const logMessage = `[Browser ${level.toUpperCase()}] ${text}`;

                                // 根据日志级别输出到 newConsole
                                switch (level) {
                                    case 'error':
                                        newConsole.error(logMessage);
                                        break;
                                    case 'warning':
                                        newConsole.warn(logMessage);
                                        break;
                                    case 'info':
                                    case 'verbose':
                                    default:
                                        newConsole.log(logMessage);
                                        break;
                                }
                            }

                            // 处理 Runtime.consoleAPICalled 事件（console.log 等）
                            if (message.method === 'Runtime.consoleAPICalled') {
                                const params = message.params;
                                const type = params.type || 'log';
                                const args = params.args || [];

                                // 将参数转换为字符串
                                const messages = args.map((arg: any) => {
                                    if (arg.type === 'string') {
                                        return arg.value;
                                    } else if (arg.type === 'object') {
                                        return JSON.stringify(arg.value || arg.description || '');
                                    } else {
                                        return String(arg.value || arg.description || '');
                                    }
                                });

                                const consoleMessage = `[Browser Console.${type}] ${messages.join(' ')}`;

                                // 根据 console 类型输出
                                switch (type) {
                                    case 'error':
                                        newConsole.error(consoleMessage);
                                        break;
                                    case 'warning':
                                        newConsole.warn(consoleMessage);
                                        break;
                                    case 'info':
                                        newConsole.info(consoleMessage);
                                        break;
                                    case 'debug':
                                        newConsole.debug(consoleMessage);
                                        break;
                                    default:
                                        newConsole.log(consoleMessage);
                                        break;
                                }
                            }
                        } catch (error) {
                            // 忽略解析错误，避免影响其他功能
                        }
                    });

                    ws.on('error', (error) => {
                        newConsole.warn(`WebSocket 连接错误: ${error.message}`);
                        resolve(); // 不 reject，允许继续执行
                    });

                    ws.on('close', () => {
                        newConsole.log(`🔌 浏览器调试连接已关闭`);
                    });

                    // 连接成功
                    resolve();
                } catch (error: any) {
                    newConsole.warn(`解析调试目标列表失败: ${error.message}`);
                    resolve(); // 不 reject，允许继续执行
                }
            });
        }).on('error', async (error) => {
            // 如果无法连接到调试端口，可能是浏览器还没启动，尝试重试
            if (retries > 0) {
                newConsole.debug(`无法连接到调试端口 ${port}，${retries} 次重试后重试...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                await connectToChromeDevTools(port, targetUrl, retries - 1, retryDelay);
            } else {
                newConsole.debug(`无法连接到调试端口 ${port}: ${error.message}`);
            }
            resolve(); // 允许继续执行
        });
    });
}

/**
 * 打开 URL
 * @param url 要打开的 URL
 * @param options 选项
 * @param completedCallback 浏览器打开完成后的回调函数
 */
export function openUrl(url: string, options: OpenUrlOptions = {}, completedCallback?: () => void): void {
    const {
        remoteDebuggingMode = false,
        browserPath,
        port = 9222,
        browserType = BrowserType.Chrome
    } = options;

    if (remoteDebuggingMode) {
        // 如果未提供浏览器路径，则根据 browserType 自动查找
        const resolvedBrowserPath = browserPath ?? findBrowserPath(browserType);

        if (resolvedBrowserPath) {
            openDebuggingBrowser(url, resolvedBrowserPath, port, completedCallback);
            return;
        } else {
            console.warn(`⚠️ 未找到指定的浏览器 (${browserType})，回退到默认浏览器`);
        }
    }

    // 回退到默认浏览器打开方式
    openBrowser(url, completedCallback);
}

/**
 * 异步打开 URL，在浏览器打开完成时 resolve
 * @param url 要打开的 URL
 * @param options 选项
 * @returns Promise，在浏览器打开完成时 resolve
 */
export function openUrlAsync(url: string, options: OpenUrlOptions = {}): Promise<void> {
    return new Promise<void>((resolve) => {
        openUrl(url, options, () => {
            resolve();
        });
    });
}
