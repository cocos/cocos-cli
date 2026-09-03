'use strict';

module.exports = {
    title: 'Web Mobile',
    options: {
        web_debugger: 'VConsole',
        preview_url: 'Preview URL',
        preview_qrcode: 'Preview QRCode',
        orientation: 'Orientation',
        landscape: 'Landscape',
        portrait: 'Portrait',
        auto: 'Auto',
        async_functions: 'Async Functions',
        async_functions_tips: 'Whether the polyfills for async functions need to be included',
        core_js: 'core-js/core-js',
        core_js_tips: 'If enabled, core-js polyfills are included. The default options of core-js-builder will be used to build the core-js. / 开启后将包含 core-js polyfills。',
    },
    tips: {
        overwriteTemplate: 'Do you want to overwrite the source file {file} ?',
        overwrite: 'Overwrite',
        cancel: 'Cancel',
        webgpu: 'Use WEBGPU as a rendering backend.',
        web_debugger: 'Similar to devtools mini version, used to help debug.',
        webGPUServer: `You can't use local HTTP server to preview on your phone when WebGPU is enabled, please try to build your own HTTPS server to access it. Refer to Environment:`,
    },
    run: {
        label: 'Run',
    },
};
