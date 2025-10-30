#!/usr/bin/env node
/**
 * 生成随机的测试报告页脚消息
 * 根据测试结果（通过/失败）随机选择一条鼓励或建议
 * 
 * 用法：
 *   node .github/scripts/generate-footer.js pass
 *   node .github/scripts/generate-footer.js fail
 */

/**
 * 测试通过时的鼓励语 🎉
 */
const PASS_MESSAGES = [
    '🔧 编译器给你点了赞 👍',
    '💻 电脑表示：这代码我看行！',
    '📡 信号满格，代码质量5G速度',
    '🎯 精准命中需求，测试毫无压力',
    '🔍 Code Review 可以提前下班了',
    '💾 内存表示：这代码真省心',
    '☕ 测试通过，咖啡可以更香了',
    '📚 学神附体，测试题全对',
    '🏆 完美通过！这就是高质量代码！',
    '🎄 圣诞老人说代码写得不错',
    '🎉 哎呦，不错哦！',
];

/**
 * 测试失败时的建议语 💡
 */
const FAIL_MESSAGES = [
    '💡 请修复失败项后再合并',
    '📝 发现问题，请检查并修复后再提交',
    '⚠️ 请先解决测试失败的问题',
    '🔧 需要修复失败的测试用例',
    '🐞 发现野生 bug N 只，需要驯服',
    '🔧 编译器发出了抗议的声音',
    '📉 质量曲线跳水，需要救生员',
    '🎯 需求瞄准了，但代码打偏了',
    '🔍 Code Review 表示需要加班了',
    '🚧 施工中：代码需要重新铺路',
    '🎬 代码演技需要进修一下',
];

/**
 * 主函数
 */
function main() {
    const status = process.argv[2];
    
    if (!status || (status !== 'pass' && status !== 'fail')) {
        console.error('❌ Usage: node generate-footer.js <pass|fail>');
        console.error('   Example: node generate-footer.js pass');
        process.exit(1);
    }
    
    // 选择对应的消息列表
    const messages = status === 'pass' ? PASS_MESSAGES : FAIL_MESSAGES;
    
    // 随机选择一条消息
    const randomIndex = Math.floor(Math.random() * messages.length);
    const message = messages[randomIndex];
    
    // 输出消息
    console.log(message);
    
    // 如果在 GitHub Actions 环境中，也输出到 GITHUB_OUTPUT
    if (process.env.GITHUB_OUTPUT) {
        const fs = require('fs');
        fs.appendFileSync(process.env.GITHUB_OUTPUT, `footer=${message}\n`, 'utf-8');
    }
}

// 运行
if (require.main === module) {
    main();
}

module.exports = {
    PASS_MESSAGES,
    FAIL_MESSAGES,
};

