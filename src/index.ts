import { startMcpServer } from './mcp/start-server.js';
import { serverService } from './server/server.js';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

const PROVIDER_ID = 'cocos-cli-mcp-provider';

export async function activate(context: vscode.ExtensionContext, port?: number) {
    // 创建事件发射器，用于通知 MCP 服务器定义变化
    const onDidChangeMcpServerDefinitionsEmitter = new vscode.EventEmitter<void>();

    const provider: vscode.McpServerDefinitionProvider = {
        onDidChangeMcpServerDefinitions: onDidChangeMcpServerDefinitionsEmitter.event,

        provideMcpServerDefinitions: async (token) => {
            const folder = getCurrentProjectFolder();
            if (!folder) {
                vscode.window.showWarningMessage('没有打开 cocos 项目');
                return [];
            }

            // 检查是否为 Cocos 工程
            const isCocosProject = await checkIsCocosProject(folder);
            if (!isCocosProject) {
                return []; // 不启动 MCP 服务器，也不返回任何定义
            }

            try {
                // 启动 MCP 服务器
                await startMcpServer(folder, port);

                // 返回 MCP 服务器定义
                return [
                    new vscode.McpHttpServerDefinition(
                        'Cocos CLI MCP Server',
                        vscode.Uri.parse(`http://localhost:${serverService.port}/mcp`)
                    )
                ];
            } catch (error) {
                console.error('启动 MCP 服务器失败:', error);
                return [];
            }
        },

        resolveMcpServerDefinition: async (definition, token) => {
            // 可以在这里做额外检查 / 用户交互 / 获取 token 等
            // 如果一切正常，直接返回 definition 即可
            return definition;
        }
    };

    // 注册 MCP 服务器定义提供者
    const disposable = vscode.lm.registerMcpServerDefinitionProvider(PROVIDER_ID, provider);
    context.subscriptions.push(disposable);

    // 监听工作区变化，当工作区变化时通知 MCP 服务器定义可能发生变化
    context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders(() => {
            onDidChangeMcpServerDefinitionsEmitter.fire();
        })
    );
}

export function deactivate() { }

/**
 * 检查当前文件夹是否为 Cocos 工程
 * @param folderPath 文件夹路径
 * @returns 是否为 Cocos 工程
 */
async function checkIsCocosProject(folderPath: string): Promise<boolean> {
    try {
        const packageJsonPath = path.join(folderPath, 'package.json');

        // 检查 package.json 是否存在
        if (!fs.existsSync(packageJsonPath)) {
            vscode.window.showErrorMessage('当前不是 Cocos 工程');
            return false;
        }

        // 读取并解析 package.json
        const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf8');
        const packageJson = JSON.parse(packageJsonContent);

        // 检查是否有 creator 字段
        if (!packageJson.creator) {
            vscode.window.showErrorMessage('当前不是 Cocos 工程');
            return false;
        }

        return true;
    } catch (error) {
        vscode.window.showErrorMessage('当前不是 Cocos 工程');
        return false;
    }
}

/**
 * 获取当前打开的项目文件夹路径
 * @returns 项目文件夹路径
 */
function getCurrentProjectFolder(): string | undefined {
    // 获取当前工作区的第一个文件夹（项目根目录）
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        return undefined; // 没有打开任何工作区
    }

    // 如果有多个工作区文件夹，优先返回当前活动文件所在的工作区
    const editor = vscode.window.activeTextEditor;
    if (editor) {
        const currentFileUri = editor.document.uri;
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(currentFileUri);
        if (workspaceFolder) {
            return workspaceFolder.uri.fsPath;
        }
    }

    // 否则返回第一个工作区文件夹
    return workspaceFolders[0].uri.fsPath;
}

