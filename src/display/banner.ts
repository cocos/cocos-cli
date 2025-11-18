import figlet from 'figlet';
import gradient from 'gradient-string';
import chalk from 'chalk';

/**
 * 创建现代风格的 banner（参考 Gemini CLI 设计）
 */
export function createBanner(): string {
    // 使用像素化风格的字体
    const asciiArt = figlet.textSync('Cocos CLI', {
        font: 'ANSI Shadow',
        horizontalLayout: 'fitted',
        verticalLayout: 'default',
        width: 100,
        whitespaceBreak: true
    });

    // 创建蓝色到紫色的渐变效果（类似 Gemini CLI）
    const gradientText = gradient(['#00BFFF', '#4169E1', '#8A2BE2', '#FF1493']).multiline(asciiArt);

    // 版本信息
    const version = chalk.gray('v1.0.0-alpha.2');
    const description = chalk.blue('🚀 专为 Cocos Engine 开发设计的强大命令行界面工具');

    // 添加像素化装饰元素
    const pixelDots = chalk.blue('█'.repeat(15)) + chalk.magenta('█'.repeat(15));

    return `
${gradientText}
${pixelDots}
${chalk.gray('─'.repeat(80))}
${description}
${chalk.gray('─'.repeat(80))}
${version}
`;
}

/**
 * 创建简洁的 banner（类似 Gemini CLI 风格）
 */
export function createSimpleBanner(): string {
    // 使用像素化风格的字体
    const asciiArt = figlet.textSync('Cocos CLI', {
        font: 'ANSI Shadow',
        horizontalLayout: 'fitted',
        verticalLayout: 'default',
        width: 80,
        whitespaceBreak: true
    });

    // 蓝色到紫色的渐变
    const gradientText = gradient(['#00BFFF', '#4169E1', '#8A2BE2']).multiline(asciiArt);
    const version = chalk.gray('v1.0.0-alpha.2');
    const description = chalk.blue('🚀 专为 Cocos Engine 开发设计的强大命令行界面工具');

    // 像素化装饰
    const pixelDots = chalk.blue('█'.repeat(10)) + chalk.magenta('█'.repeat(10));

    return `
${gradientText}
${pixelDots}
${chalk.gray('─'.repeat(60))}
${description}
${chalk.gray('─'.repeat(60))}
${version}
`;
}

/**
 * 创建极简 banner（适合小屏幕）
 */
export function createMinimalBanner(): string {
    // 使用小一点的像素化字体
    const asciiArt = figlet.textSync('Cocos CLI', {
        font: 'ANSI Shadow',
        horizontalLayout: 'fitted',
        verticalLayout: 'default',
        width: 60,
        whitespaceBreak: true
    });

    const gradientText = gradient(['#00BFFF', '#8A2BE2']).multiline(asciiArt);
    const version = chalk.gray('v1.0.0-alpha.2');
    const description = chalk.blue('🚀 专为 Cocos Engine 开发设计的强大命令行界面工具');

    return `
${gradientText}
${chalk.blue('█'.repeat(8))}${chalk.magenta('█'.repeat(8))}
${chalk.gray('─'.repeat(40))}
${description}
${chalk.gray('─'.repeat(40))}
${version}
`;
}

/**
 * 创建欢迎消息
 */
export function createWelcomeMessage(): string {
    return chalk.cyan(`
🎉 欢迎使用 Cocos CLI！
📖 输入 'cocos --help' 查看可用命令
🚀 输入 'cocos <command> --help' 查看具体命令帮助
`);
}

/**
 * 创建启动消息（类似 Gemini CLI）
 */
export function createStartupMessage(): string {
    // 使用像素化风格的字体
    const asciiArt = figlet.textSync('Cocos CLI', {
        font: 'ANSI Shadow',
        horizontalLayout: 'fitted',
        verticalLayout: 'default',
        width: 90,
        whitespaceBreak: true
    });

    // 蓝色到紫色的渐变
    const gradientText = gradient(['#00BFFF', '#4169E1', '#8A2BE2', '#FF1493']).multiline(asciiArt);
    const version = chalk.gray('v1.0.0-alpha.2');
    const description = chalk.cyan('🚀 专为 Cocos Engine 开发设计的强大命令行界面工具');

    // 像素化装饰
    const pixelDots = chalk.blue('█'.repeat(12)) + chalk.magenta('█'.repeat(12));

    // 提示信息
    const tips = [
        '🏗️ 构建项目：cocos build --project <path>',
        '📂 创建项目：cocos create --project <path>',
        'ℹ️ 查看信息：cocos info --project <path>',
        '❓ 获取帮助：cocos --help'
    ];

    return `
${gradientText}
${pixelDots}
${chalk.gray('─'.repeat(70))}
${description}
${chalk.gray('─'.repeat(70))}
${chalk.cyan('✨ 准备就绪！选择以下操作开始使用：')}
${chalk.gray('─'.repeat(70))}
${tips.map(tip => chalk.white(tip)).join('\n')}
${chalk.gray('─'.repeat(70))}
${version}
`;
}

/**
 * 创建状态栏（类似 Gemini CLI 底部状态栏）
 */
export function createStatusBar(projectPath?: string, mode: string = 'interactive'): string {
    const currentDir = projectPath || process.cwd();
    const dirName = currentDir.split('/').pop() || 'cocos-cli';
    const modeText = mode === 'interactive' ? 'interactive' : 'non-interactive';

    return `
${chalk.gray('─'.repeat(70))}
${chalk.white(`~/code/${dirName}`)} ${chalk.gray('(' + modeText + ')')} ${chalk.gray('cocos-cli v1.0.0-alpha.2')}
`;
}
