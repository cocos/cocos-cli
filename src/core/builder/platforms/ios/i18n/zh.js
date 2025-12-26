'use strict';

module.exports = {
    options: {
        render_back_end: '渲染后端',
        developerTeam: '开发者',
        targetVersion: '目标版本',
        customOption: '自定义',
        queryAgain: '重新查询',
        executable_name: '可执行文件名',
        package_name: '应用 ID 名称',
        package_name_hint: '请输入应用 ID，如 com.example.demo',

        orientation: '屏幕方向',
        landscape_left: '左横屏',
        landscape_left_tips: '屏幕横置，Home 键在屏幕左侧',
        landscape_right: '右横屏',
        landscape_right_tips: '屏幕横置，Home 键在屏幕右侧',
        portrait: '竖屏',
        portrait_tips: '屏幕竖置，Home 键在屏幕底侧',
        skipUpdateXcodeProject: '跳过 Xcode 工程的更新',

        os_target: '目标平台',
        iphone_os: 'iPhone OS 应用',
        ios_simulator: 'iOS Simulator 应用',
    },
    make: {
        label: '生成',
    },

    run: {
        label: '运行',
    },

    tips: {
        targetVersionDefault: '默认值: 12.0',
        version_style_error: '版本号格式错误，请输入正确的版本号格式，例如 12.0',
        targetVersionError: '不支持 iOS 11.0 以下版本',
        targetVersionErrorWithTaskFlow: '开启 TaskFlow 后, 最低版本要求为 12.0',
        developerTeamListError: '未查询到开发者信息，可通过自定义选项手动填写',
        at_least_one: '请至少选择一项',
        not_empty: '不能为空',
        packageNameRuleMessage:
            '包名仅支持包含字母数字字符（A–Z、a–z 和 0–9）、连字符 (-) 和句点 (.)，通常使用反向 DNS 格式，例如：com.cocos.name',
    },
};
