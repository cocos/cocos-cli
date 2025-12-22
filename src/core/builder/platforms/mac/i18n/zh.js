'use strict';

module.exports = {
    options: {
        render_back_end: '渲染后端',
        targetVersion: '目标版本',
        executable_name: '可执行文件名',
        package_name: '应用 ID 名称',
        package_name_hint: '请输入应用 ID，如 com.example.demo',
        skipUpdateXcodeProject: '跳过 Xcode 工程的更新',
        targetVersionDefault: '默认值: 10.14',
    },
    make: {
        label: '生成',
    },
    run: {
        label: '运行',
    },
    error: {
        m1_with_physic_x: '原生 PhysX 暂时不支持苹果 ARM 架构',
        targetVersionError: '版本号不合法，示例：10.14',
        packageNameRuleMessage:
            '包名仅支持包含字母数字字符（A–Z、a–z 和 0–9）、连字符 (-) 和句点 (.)，通常使用反向 DNS 格式，例如：com.cocos.name',
    },
};
