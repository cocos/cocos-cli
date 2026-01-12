'use strict';

module.exports = {
    // ！专用名词，不要翻译
    title: 'HarmonyOS',
    options: {
        package_name: '应用 ID 名称',
        package_name_hint: '请输入应用 ID，如 com.example.demo',

        orientation: '屏幕方向',
        full_screen: '是否全屏',
        landscape: '横屏',
        landscape_left: '左横屏',
        landscape_right: '右横屏',
        portrait: '竖屏',

        render_back_end: '渲染后端',
    },
    tips: {
        not_empty: '不能为空！',
        at_least_one: '请至少选择一项',
        package_name_error: '请输入正确的应用 ID：必须至少包含两段（一个或多个圆点），每段必须以字母开头, 包名中只能包含数字、字母和下划线。',
        ohos_sdk_error: '找不到 HarmonyOS NDK/SDK 路径，请到 偏好设置 -> 外部程序 中设置',
        set_ohos_sdk: '设置 HarmonyOS SDK',
        apilevel_empty: '获取 apiLevel 失败，请点击旁边的 \'设置 HarmonyOS SDK\' 按钮到 \'偏好设置 -> 外部程序\' 中检查 \'HarmonyOS NDK/SDK\' 路径配置',
    },
    make: {
        label: '生成',
    },
    run: {
        label: '运行',
    },
    program: {
        ohosNDK: 'HarmonyOS NDK',
        ohosSDK: 'HarmonyOS SDK',
    },
};
