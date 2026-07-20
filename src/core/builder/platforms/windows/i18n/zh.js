'use strict';

module.exports = {
    title: 'Windows',
    default_sdk_version: '默认 SDK 版本: ',
    options: {
        render_back_end: '渲染后端',
        targetPlatform: '生成平台',
        executable_name: '可执行文件名',
        refresh: '重新查询',
        cmakeGenerators: 'CMake Generator',
        JobSystem: 'Job System',
        none: 'None',
    },
    encrypt: {
        title: '加密 JS',
        encrypt_key: 'JS 加密密钥',
        compress_zip: 'Zip 压缩',
        disable_tips: 'Debug 模式下, JS 加密不生效',
    },
    tips: {
        at_least_one: '请至少选择一项',
        loading: '加载中...',
        not_empty: '不能为空!',
        visualStudioEmpty: '未找到可用的 Visual Studio 生成器, 请安装 Visual Studio 或检查 CMake 环境。',
        JobSystemTaskFlow: 'TaskFlow 需要 C++17 支持',
        JobSystemOther: '将使用 C++17(默认 C++14)支持编译',
    },
    make: {
        label: '生成',
    },
    run: {
        label: '运行',
    },
};
