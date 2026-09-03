'use strict';

module.exports = {
    title: 'Web 手机端',
    options: {
        web_debugger: 'VConsole',
        preview_url: '预览地址',
        preview_qrcode: '预览二维码',
        orientation: '设备方向',
        landscape: '横屏',
        portrait: '竖屏',
        auto: '自动',
        async_functions: '异步函数',
        async_functions_tips: '是否需要包含异步函数 polyfills',
        core_js: 'core-js/core-js',
        core_js_tips: '开启后将包含 core-js polyfills。将使用 core-js-builder 的默认选项来生成 core-js。',
    },
    tips: {
        overwriteTemplate: '模板文件已存在，是否替换源文件 {file} ？',
        overwrite: '替换',
        cancel: '取消',
        webgpu: '是否使用 WEBGPU 渲染后端',
        web_debugger: ' 类似 DevTools 的迷你版，用于辅助手机端调试',
        webGPUServer: '启用 WebGPU 时无法使用本地 HTTP 服务器在手机上预览，请尝试自行搭建 HTTPS 服务器来访问。参考环境：',
    },
    run: {
        label: '运行',
    },
};
