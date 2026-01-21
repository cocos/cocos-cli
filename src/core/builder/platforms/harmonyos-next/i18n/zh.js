'use strict';

module.exports = {
    // ！专用名词，不要翻译
    title: 'HarmonyOS Next',
    options: {
        package_name: '应用 ID 名称',
        package_name_hint: '请输入应用 ID，如 com.example.demo',

        orientation: '屏幕方向',
        full_screen: '是否全屏',
        landscape: '横屏',
        landscape_left: '左横屏',
        landscape_right: '右横屏',
        portrait: '竖屏',
        
        device_types: '设备类型',
        device_phone: '手机',
        device_tablet: '平板',
        device_pc_2in1: 'PC/2合1',
        device_tv: '智慧屏',
        device_wearable: '智能手表',
        device_car: '车机',
        device_default: '默认设备',

        render_back_end: '渲染后端',
        use_aot_optimization: '引擎 AOT 优化',
        js_engine: 'JavaScript 引擎',
        use_gamepad: '游戏手柄',
    },
    label: {
        harmonyosnext_ndk: 'HarmonyOS Next NDK',
        harmonyosnext_sdk: 'HarmonyOS Next SDK',
    },
    jsEngine: {
        v8: 'V8',
        ark: 'Ark',
        jsvm: 'JSVM',
    },
    tips: {
        device_pc_2in1: '即PC设备，主要交互方式以多窗口、多任务及键盘鼠标操作为主，充分发挥设备的生产力属性。所有“2in1”均代表“PC/2in1”。',
        device_wearable: '系统能力较丰富的手表，具备电话功能。',
        device_default: '配置为default类型的应用，虽然可以正常编译构建，但是不支持发布上架。建议使用phone替代。',
        not_empty: '不能为空！',
        at_least_one: '请至少选择一项',
        package_name_error: '请输入正确的应用 ID：必须为以点号.分隔的字符串，且至少包含三段，每段中仅允许使用英文字母、数字、下划线_.首段以英文字母开头，非首段以数字或英文字母开头，每一段以数字或者英文字母结尾',
        package_name_length: '长度为7~128个字符',
        package_name_contains_sensitive_words: '包名不可包含敏感词：oh、ohos、harmony、harmonyos、openharmony、system',
        ohos_sdk_error: '找不到 HarmonyOS Next SDK 路径，请到 偏好设置 -> 外部程序 中设置',
        set_ohos_sdk: '设置 HarmonyOS Next SDK',
        apilevel_empty: '获取 apiLevel 失败，请点击旁边的 \'设置 HarmonyOS Next SDK\' 按钮到 \'偏好设置 -> 外部程序\' 中检查 \'HarmonyOS Next NDK/SDK\' 路径配置',
        use_aot_optimization: '开启该选项时，构建引擎将会保留类型信息，以进一步采用 AOT 优化。',
    },
    make: {
        label: '生成',
    },
    run: {
        label: '运行',
    },
    customIcon: {
        label: '使用 DevEco Studio 打开原生工程',
        ideNotFound: `请先在 偏好设置 - 程序管理器 内配置 DevEco Studio 路径`,
        confirm: '确定',
    },
};
