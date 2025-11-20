'use strict';

module.exports = {
    title: 'Web Desktop',
    options: {
        resolution: 'Preview Resolution',
        preview_url: 'Preview URL',

        async_functions: 'Async Functions',
        async_functions_tips: 'Whether the polyfills for async functions need to be included',

        design_width: 'Design Width',
        design_height: 'Design Height',

    },
    tips: {
        overwriteTemplate: 'Do you want to overwrite the source file {file} ?',
        overwrite: 'Overwrite',
        cancel: 'Cancel',
        webgpu: 'Use WEBGPU as a rendering backend.',
        resolution: 'Game view resolution',
    },
    run: {
        label: 'Run',
    },
};
