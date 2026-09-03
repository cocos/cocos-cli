'use strict';

module.exports = {
    title: 'Web 桌面端',
    options: {
        resolution: '预览分辨率',
        preview_url: '预览地址',
        app_id: 'APPID',
        app_id_hint: '从 OpenPaaS 开放平台创建应用获取',
        version_name: '版本名称',
        version_name_hint: 'OpenPaaS 包版本',
        upload_env: '上传环境',
        upload_env_hint: '选择 OpenPaaS 上传 API 环境',
        access_token: '访问令牌',
        access_token_hint: 'OpenPaaS 上传阶段使用的访问令牌',
        code_version: '代码版本',
        code_version_hint: 'OpenPaaS 返回的代码版本',
        bridge_link: 'Bridge 链接',
        bridge_link_hint: 'OpenPaaS 返回的 Bridge 脚本 CDN 链接',
        encrypt_key: '加密密钥',
        encrypt_key_hint: '请输入加密密钥',

        async_functions: '异步函数',
        async_functions_tips: '是否需要包含异步函数 polyfills',

        design_width: '设计宽度',
        design_height: '设计高度',
    },
    tips: {
        overwriteTemplate: '模板文件已存在，是否替换源文件 {file}？',
        overwrite: '替换',
        cancel: '取消',
        webgpu: '是否使用 WEBGPU 渲染后端',
        resolution: '游戏视图分辨率',
        encrypt_key_error: '加密密钥必须是 16 bytes 字符串（32 个字符）。',
    },
    service: {
        game: 'OpenPaaS 游戏',
        game_hint: '选择从 OpenPaaS 拉取的游戏，或手动输入 APPID',
        game_placeholder: '选择游戏',
        refresh_games: '刷新',
        loading_games: '正在加载游戏列表...',
        loading_context: '正在拉取包上下文...',
        no_games: '暂无可用游戏',
        context_ready: '包上下文已就绪',
        code_version: '代码版本：{codeVersion}',
    },
    run: {
        label: '运行',
    },
    publish: {
        label: '发布',
        description: '点击发布游戏并获取更多收益。',
    },
    publishStage: {
        label: '正式发布',
        description: '将已上传的包正式发布上线。',
    },
};
