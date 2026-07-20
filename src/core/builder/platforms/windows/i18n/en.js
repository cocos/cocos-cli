'use strict';

module.exports = {
    title: 'Windows',
    default_sdk_version: 'Default SDK version: ',
    options: {
        render_back_end: 'Render BackEnd',
        targetPlatform: 'Target Platform',
        executable_name: 'Executable Name',
        refresh: 'Query Again',
        cmakeGenerators: 'CMake Generator',
        JobSystem: 'Job System',
        none: 'None',
    },
    encrypt: {
        title: 'Encrypt JS',
        encrypt_key: 'JS Encryption Key',
        compress_zip: 'Zip Compress',
        disable_tips: 'In debug mode, the Encrypt JS is invalid',
    },
    tips: {
        at_least_one: 'Please Choose At Least One',
        loading: 'Loading...',
        not_empty: 'Can not be empty!',
        visualStudioEmpty: 'No available Visual Studio generator found. Please install Visual Studio or check the CMake environment.',
        JobSystemTaskFlow: 'TaskFlow will use C++17 to support compile',
        JobSystemOther: 'Will use C++17(default C++14) to support compile',
    },
    make: {
        label: 'Make',
    },
    run: {
        label: 'Run',
    },
};
