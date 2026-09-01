'use strict';

module.exports = {
    title: 'Web Desktop',
    options: {
        resolution: 'Preview Resolution',
        preview_url: 'Preview URL',
        app_id: 'APPID',
        app_id_hint: 'Create an application from OpenPaaS Open platform',
        version_name: 'Version Name',
        version_name_hint: 'OpenPaaS package version',
        upload_env: 'Upload Environment',
        upload_env_hint: 'Select the OpenPaaS upload API environment',
        access_token: 'Access Token',
        access_token_hint: 'Token used by the OpenPaaS upload stage',
        code_version: 'Code Version',
        code_version_hint: 'Code version returned by OpenPaaS',
        bridge_link: 'Bridge Link',
        bridge_link_hint: 'Bridge script CDN link returned by OpenPaaS',
        encrypt_key: 'Encrypt Key',
        encrypt_key_hint: 'Enter the encrypt key',

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
        encrypt_key_error: 'Encrypt key must be a 16 bytes string (32 characters).',
    },
    service: {
        game: 'OpenPaaS Game',
        game_hint: 'Select a game fetched from OpenPaaS or enter the APPID manually',
        game_placeholder: 'Select a game',
        refresh_games: 'Refresh',
        loading_games: 'Loading games...',
        loading_context: 'Fetching package context...',
        no_games: 'No games available',
        context_ready: 'Package context is ready',
        code_version: 'Code version: {codeVersion}',
    },
    run: {
        label: 'Run',
    },
    publish: {
        label: 'Publish',
        description: 'Click to publish and your game and claim more earnings.',
    },
    publishStage: {
        label: 'Release',
        description: 'Release the uploaded package to make it publicly available.',
    },
};
