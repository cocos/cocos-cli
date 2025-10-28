/**
 * 自定义 Jest Reporter - 打印测试报告路径
 * 
 * 在测试运行结束后，打印 HTML 测试报告的生成位置
 */

const { readdirSync, statSync } = require('fs');
const { join, resolve } = require('path');
const chalk = require('chalk');

class ReportPrinterReporter {
    constructor(globalConfig, options) {
        this._globalConfig = globalConfig;
        this._options = options || {};
    }

    /**
     * 在所有测试完成后调用
     */
    onRunComplete(_contexts, _results) {
        // 延迟执行，确保在所有其他输出之后
        setTimeout(() => {
            try {
                // 查找最新生成的测试报告
                const reportsDir = resolve(__dirname, '../reports');
                const reportPath = this.findLatestReport(reportsDir);

                if (reportPath) {
                    console.log('\n' + chalk.blue('='.repeat(60)));
                    console.log(chalk.blue('📊 测试报告已生成'));
                    console.log(chalk.blue('='.repeat(60)));
                    console.log(chalk.green('\n✅ HTML 测试报告路径:'));
                    console.log(chalk.cyan(`   ${reportPath}\n`));
                    
                    // 提供打开报告的提示
                    console.log(chalk.yellow('💡 快速打开报告:'));
                    if (process.platform === 'win32') {
                        console.log(chalk.white(`   start ${reportPath}`));
                    } else if (process.platform === 'darwin') {
                        console.log(chalk.white(`   open ${reportPath}`));
                    } else {
                        console.log(chalk.white(`   xdg-open ${reportPath}`));
                    }
                    console.log(chalk.blue('='.repeat(60)));
                    
                    // 在最后一行单独打印报告地址
                    console.log(chalk.cyan(`\n📊 报告地址: ${reportPath}`));
                }
            } catch {
                // 静默失败，不影响测试结果
                console.log(chalk.yellow('\n⚠️  无法定位测试报告文件'));
            }
        }, 100); // 延迟 100ms，确保在其他输出之后
    }

    /**
     * 查找最新的测试报告文件
     */
    findLatestReport(dir) {
        try {
            const files = readdirSync(dir);
            const reportFiles = files
                .filter(file => file.startsWith('test-report-') && file.endsWith('.html'))
                .map(file => {
                    const filePath = join(dir, file);
                    const stats = statSync(filePath);
                    return {
                        path: filePath,
                        mtime: stats.mtime.getTime()
                    };
                })
                .sort((a, b) => b.mtime - a.mtime); // 按修改时间降序排序

            if (reportFiles.length > 0) {
                return reportFiles[0].path;
            }
        } catch {
            // 目录不存在或其他错误
        }
        return null;
    }
}

module.exports = ReportPrinterReporter;

