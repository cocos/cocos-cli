'use strict';

module.exports = {
    title: 'Web 桌面端',
    options: {
        resolution: '预览分辨率',
        preview_url: '预览地址',

        async_functions: '异步函数',
        async_functions_tips: '是否需要包含异步函数 polyfills',

        design_width: '设计宽度',
        design_height: '设计高度',

    },
    tips: {
        overwriteTemplate: '模板文件已存在，是否替换源文件 {file} ？',
        overwrite: '替换',
        cancel: '取消',
        webgpu: '是否使用 WEBGPU 渲染后端',
        resolution: '游戏视图分辨率',
    },
    run: {
        label: '运行',
    },
};
