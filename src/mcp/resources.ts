import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname, basename } from 'path';

export interface ResourceInfo {
    uri: string;
    name: string;
    title: string;
    description: string;
    filePath?: string;
    content?: string;
    mimeType: string;
}

export class ResourceManager {
    private docsPath: string;

    constructor(docsPath: string) {
        this.docsPath = docsPath;
    }

    /**
     * 加载所有文档资源
     */
    public loadAllResources(): ResourceInfo[] {
        const resources: ResourceInfo[] = [];
        const registeredUris = new Set<string>();

        // 添加 Cocos 官方文档链接
        this.addCocosOfficialDocs(resources);
        // 加载本地文档资源
        this.loadDocsFromLanguageDirectories(resources, registeredUris);

        return resources;
    }

    /**
     * 只读取 zh 和 en 目录下的文档文件
     */
    private loadDocsFromLanguageDirectories(resources: ResourceInfo[], registeredUris: Set<string>): void {
        try {
            resources.push({
                uri: 'cli://docs/readme',
                name: 'Readme',
                title: 'Readme',
                description: 'Cocos CLI Readme',
                filePath: join(process.cwd(), 'README.md'), // 存储完整文件路径
                mimeType: 'text/markdown'
            });
            const items = readdirSync(this.docsPath);

            for (const item of items) {
                const fullPath = join(this.docsPath, item);
                const stat = statSync(fullPath);

                // 只处理 zh 和 en 目录
                if (stat.isDirectory() && (item === 'zh' || item === 'en')) {
                    this.loadDocsFromDirectory(fullPath, item, resources, registeredUris);
                }
            }
        } catch (error) {
            console.warn(`Failed to read docs directory ${this.docsPath}:`, error);
        }
    }

    /**
     * 递归读取目录下的所有文档文件
     */
    private loadDocsFromDirectory(dirPath: string, language: string, resources: ResourceInfo[], registeredUris: Set<string>): void {
        try {
            const items = readdirSync(dirPath);

            for (const item of items) {
                const fullPath = join(dirPath, item);
                const stat = statSync(fullPath);

                if (stat.isDirectory()) {
                    // 递归处理子目录
                    this.loadDocsFromDirectory(fullPath, language, resources, registeredUris);
                } else if (stat.isFile() && extname(item) === '.md') {
                    // 处理 Markdown 文件
                    try {
                        const fileName = basename(item, '.md');

                        // 只读取文件的前几行来提取标题，避免读取整个文件
                        const fileContent = readFileSync(fullPath, 'utf-8');
                        const firstLines = fileContent.split('\n').slice(0, 10).join('\n');
                        const titleMatch = firstLines.match(/^#\s+(.+)$/m);
                        const title = titleMatch ? titleMatch[1].replace(/^[\u{1F3AE}\u{1F680}\u{1F4DA}\u{1F6E0}\u{1F4CB}\u{1F4E6}\u{2705}\u{1F3D7}\u{26A1}\u{1F4C2}\u{2139}\u{1F3A8}\u{1F50C}\u{2699}\u{1F6AB}\u{1F41B}\u{1F527}\u{274C}\u{26A0}\u{1F4C1}\u{1F3AF}\u{2753}\u{1F4D6}\u{1F4C4}\u{2728}]/gu, '').trim() : fileName;

                        // 生成描述
                        const description = `Cocos CLI ${title} - ${language}`;

                        // 生成相对路径（不包含语言前缀）
                        const relativePath = fullPath.replace(join(process.cwd(), 'docs', language), '').replace(/^[\\/]/, '');
                        const cleanPath = relativePath.replace(/\.md$/, '');
                        const uri = `cli://docs/${cleanPath}`;

                        // 检查 URI 是否已经注册，避免重复
                        if (!registeredUris.has(uri)) {
                            registeredUris.add(uri);
                            resources.push({
                                uri: uri,
                                name: title,
                                title: title,
                                description: description,
                                filePath: fullPath, // 存储完整文件路径
                                mimeType: 'text/markdown'
                            });
                        }
                    } catch (error) {
                        console.warn(`Failed to process file ${fullPath}:`, error);
                    }
                }
            }
        } catch (error) {
            console.warn(`Failed to read directory ${dirPath}:`, error);
        }
    }

    /**
     * 添加 Cocos 官方文档链接
     */
    private addCocosOfficialDocs(resources: ResourceInfo[]): void {
        resources.push(
            {
                uri: 'cocos://docs/api',
                name: 'Cocos Creator API 文档',
                title: 'Cocos Creator 引擎 API 参考',
                description: 'Cocos Creator 引擎的完整 API 参考文档',
                content: `# Cocos Creator 引擎 API 文档

这是 Cocos Creator 引擎的完整 API 参考文档。

## 在线文档
访问官方 API 文档：https://docs.cocos.com/creator/3.8/api/zh/

## 主要内容
- 核心类库 (cc)
- 组件系统
- 节点系统
- 渲染系统
- 物理系统
- 动画系统
- 音频系统
- 网络系统
- 资源管理

## 快速链接
- [API 参考](https://docs.cocos.com/creator/3.8/api/zh/)
- [引擎源码](https://github.com/cocos/cocos-engine)
- [社区论坛](https://forum.cocos.org/)`,
                mimeType: 'text/markdown'
            }
        );
    }

    /**
     * 检测客户端语言偏好
     */
    public detectClientLanguage(extra: any): string {
        // 从请求头中获取语言信息
        const acceptLanguage = extra?.request?.headers?.['accept-language'] || '';

        // 解析 Accept-Language 头
        if (acceptLanguage) {
            const languages = acceptLanguage.split(',').map((lang: string) => {
                const [code, qValue] = lang.trim().split(';q=');
                return {
                    code: code.split('-')[0], // 只取主要语言代码
                    quality: qValue ? parseFloat(qValue) : 1.0
                };
            });

            // 按质量排序
            languages.sort((a: { code: string; quality: number }, b: { code: string; quality: number }) => b.quality - a.quality);

            // 检查是否支持中文
            for (const lang of languages) {
                if (lang.code === 'zh') {
                    return 'zh';
                }
            }
        }

        // 默认返回中文
        return 'zh';
    }

    /**
     * 根据语言偏好获取对应的文件路径
     */
    public getLanguageSpecificPath(originalPath: string, preferredLanguage: string): string {
        // 如果原始路径已经包含语言目录，替换为偏好语言
        const docsPath = join(process.cwd(), 'docs');
        const relativePath = originalPath.replace(docsPath, '').replace(/^[\\/]/, '');

        // 移除现有的语言前缀
        const cleanPath = relativePath.replace(/^(zh|en)[\\/]/, '');

        // 构建新的语言特定路径
        const newPath = join(docsPath, preferredLanguage, cleanPath);

        // 检查文件是否存在，如果不存在则回退到英文
        try {
            statSync(newPath);
            return newPath;
        } catch {
            // 回退到英文版本
            const fallbackPath = join(docsPath, 'en', cleanPath);
            try {
                statSync(fallbackPath);
                return fallbackPath;
            } catch {
                // 如果英文版本也不存在，返回原始路径
                return originalPath;
            }
        }
    }

    /**
     * 动态读取文件内容
     */
    public readFileContent(resource: ResourceInfo, preferredLanguage: string): string {
        let textContent = resource.content;

        if (resource.filePath && !textContent) {
            try {
                // 根据语言偏好选择对应的文件
                const languageSpecificPath = this.getLanguageSpecificPath(resource.filePath, preferredLanguage);
                textContent = readFileSync(languageSpecificPath, 'utf-8');
            } catch (error) {
                console.warn(`Failed to read file ${resource.filePath}:`, error);
                textContent = `# ${resource.title}\n\n文件读取失败: ${resource.filePath}`;
            }
        }

        return textContent || `# ${resource.title}\n\n内容不可用`;
    }
}
