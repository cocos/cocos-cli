'use strict';

module.exports = {
    title: 'Mac',
    options: {
        render_back_end: 'Render BackEnd',
        targetVersion: 'Target Version',
        executable_name: 'Executable Name',
        package_name: 'Bundle Identifier',
        package_name_hint:
            'The package name, usually arranged in the reverse order of the product\'s website URL, such as: com.mycompany.myproduct.',
        skipUpdateXcodeProject: 'Skip the update of Xcode project',
        targetVersionDefault: 'Default: 10.14',
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
        not_empty: 'Can not be empty!',
        JobSystemTaskFlow: 'TaskFlow will use C++17 to support compile',
        JobSystemOther: 'Will use C++17(default C++14) to support compile',
    },
    make: {
        label: 'Make',
    },
    run: {
        label: 'Run',
    },
    error: {
        m1_with_physic_x: 'Native PhysX does not support Apple Silicon',
        targetVersionError: 'The version number is invalid, example: 10.14',
        packageNameRuleMessage:
            'The bundle ID string must contain only alphanumeric characters (A-Z, a-z, and 0-9), hyphens (-), and periods (.). Typically, you use a reverse-DNS format for bundle ID strings.',
    },
};
