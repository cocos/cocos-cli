import { spawn, exec, execSync } from "child_process";
import os, { platform, tmpdir } from "os";
import fs from "fs";
import path from "path";
import { get as httpGet } from "http";
import WebSocket from "ws";

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
                        console.warn(`未找到可用的调试目标，端口: ${port}`);
                        resolve();
                        return;
                    }

                    const wsUrl = target.webSocketDebuggerUrl;
                    if (!wsUrl) {
                        console.warn(`调试目标没有 WebSocket URL`);
                        resolve();
                        return;
                    }

                    // 连接到 WebSocket
                    const ws = new WebSocket(wsUrl);
                    let messageId = 1;

                    ws.on('open', () => {
                        console.log(`🔗 已连接到浏览器调试端口 ${port}`);

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

                                // 根据日志级别输出到 console
                                switch (level) {
                                    case 'error':
                                        console.error(logMessage);
                                        break;
                                    case 'warning':
                                        console.warn(logMessage);
                                        break;
                                    case 'info':
                                    case 'verbose':
                                    default:
                                        console.log(logMessage);
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
                                        console.error(consoleMessage);
                                        break;
                                    case 'warning':
                                        console.warn(consoleMessage);
                                        break;
                                    case 'info':
                                        console.info(consoleMessage);
                                        break;
                                    case 'debug':
                                        console.debug(consoleMessage);
                                        break;
                                    default:
                                        console.log(consoleMessage);
                                        break;
                                }
                            }
                        } catch (error) {
                            // 忽略解析错误，避免影响其他功能
                        }
                    });

                    ws.on('error', (error) => {
                        console.warn(`WebSocket 连接错误: ${error.message}`);
                        resolve(); // 不 reject，允许继续执行
                    });

                    ws.on('close', () => {
                        console.log(`🔌 浏览器调试连接已关闭`);
                    });

                    // 连接成功
                    resolve();
                } catch (error: any) {
                    console.warn(`解析调试目标列表失败: ${error.message}`);
                    resolve(); // 不 reject，允许继续执行
                }
            });
        }).on('error', async (error) => {
            // 如果无法连接到调试端口，可能是浏览器还没启动，尝试重试
            if (retries > 0) {
                console.debug(`无法连接到调试端口 ${port}，${retries} 次重试后重试...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                await connectToChromeDevTools(port, targetUrl, retries - 1, retryDelay);
            } else {
                console.debug(`无法连接到调试端口 ${port}: ${error.message}`);
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
        port = 9222
    } = options;

    if (remoteDebuggingMode) {
        // 如果未提供浏览器路径，自动查找
        const resolvedBrowserPath = browserPath ?? getDefaultBrowserPath();

        if (resolvedBrowserPath) {
            openDebuggingBrowser(url, resolvedBrowserPath, port, completedCallback);
            return;
        } else {
            console.warn(`⚠️ 未找到指定的浏览器，回退到默认浏览器`);
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

/**
 * 获取系统默认浏览器的可执行文件路径
 * 
 * 该函数会根据当前操作系统平台，使用不同的方法检测系统默认浏览器：
 * - Windows: 通过查询注册表获取默认 HTTP 协议处理程序
 * - macOS: 通过系统设置获取默认浏览器的 Bundle ID，然后查找对应的应用程序路径
 * - Linux: 通过 xdg-settings 或 xdg-mime 获取默认浏览器，然后从 desktop 文件中解析可执行路径
 * 
 * @returns 返回默认浏览器的可执行文件路径，如果无法检测到则返回 undefined
 */
function getDefaultBrowserPath(): string | undefined {
    try {
        const platform = os.platform();

        if (platform === "win32") {
            // Windows: 通过查询注册表获取默认 HTTP 协议处理程序
            // 注册表路径: HKEY_CLASSES_ROOT\HTTP\shell\open\command
            // 该路径存储了系统默认用于打开 HTTP 链接的命令
            const regQuery = execSync(
                'reg query "HKEY_CLASSES_ROOT\\HTTP\\shell\\open\\command" /ve',
                { encoding: "utf8" }
            );
            // 从注册表查询结果中提取浏览器可执行文件路径（通常在引号中）
            const match = regQuery.match(/"([^"]+)"/);
            if (match && fs.existsSync(match[1])) {
                return match[1];
            }
        } else if (platform === "darwin") {
            // macOS: 通过系统设置获取默认浏览器的 Bundle ID，然后查找应用程序路径
            // 1. 读取 LaunchServices 的 LSHandlers 配置，查找 HTTP 协议的处理程序
            // 2. 提取 Bundle ID（例如: com.google.Chrome）
            // 3. 使用 mdfind 根据 Bundle ID 查找应用程序的安装路径
            // 4. 构建可执行文件路径: <AppPath>/Contents/MacOS/<AppName>
            const bundleId = execSync(
                'defaults read com.apple.LaunchServices/com.apple.launchservices.secure LSHandlers | grep -A 1 "http" | grep LSHandlerRoleAll | awk \'{print $3}\'',
                { encoding: "utf8" }
            ).trim();

            if (bundleId) {
                // 使用 mdfind 根据 Bundle ID 查找应用程序路径
                const appPath = execSync(`mdfind "kMDItemCFBundleIdentifier == '${bundleId}'"`, {
                    encoding: "utf8",
                }).split("\n")[0];
                if (appPath && fs.existsSync(appPath)) {
                    // macOS 应用程序的可执行文件位于: <AppPath>/Contents/MacOS/<AppName>
                    return path.join(appPath, "Contents", "MacOS", path.basename(appPath, ".app"));
                }
            }
        } else if (platform === "linux") {
            // Linux: 通过 xdg-settings 或 xdg-mime 获取默认浏览器
            // 1. 首先尝试使用 xdg-settings 获取默认浏览器
            // 2. 如果失败，则使用 xdg-mime 查询 HTTP 协议的处理程序
            // 3. 从 desktop 文件中读取 Exec 字段，获取可执行文件路径
            let browserDesktop = "";
            try {
                // 方法1: 使用 xdg-settings 获取默认浏览器
                browserDesktop = execSync("xdg-settings get default-web-browser", {
                    encoding: "utf8",
                }).trim();
            } catch {
                // 方法2: 如果 xdg-settings 失败，使用 xdg-mime 查询 HTTP 协议处理程序
                browserDesktop = execSync(
                    "xdg-mime query default x-scheme-handler/http",
                    { encoding: "utf8" }
                ).trim();
            }

            if (browserDesktop) {
                // desktop 文件通常位于 /usr/share/applications/ 目录
                const desktopFilePath = `/usr/share/applications/${browserDesktop}`;
                if (fs.existsSync(desktopFilePath)) {
                    // 读取 desktop 文件内容
                    const desktopFileContent = fs.readFileSync(desktopFilePath, "utf8");
                    // 查找 Exec= 行，该行包含可执行文件路径
                    const execLine = desktopFileContent
                        .split("\n")
                        .find((line) => line.startsWith("Exec="));
                    if (execLine) {
                        // 提取可执行文件路径（移除 Exec= 前缀和可能的参数）
                        const execPath = execLine.replace("Exec=", "").split(" ")[0];
                        if (fs.existsSync(execPath)) {
                            return execPath;
                        }
                    }
                }
            }
        }
    } catch (err) {
        // 检测失败时记录错误，但不抛出异常，返回 undefined
        console.error("Error detecting default browser path");
    }

    return undefined;
}