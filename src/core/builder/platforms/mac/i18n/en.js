'use strict';

module.exports = {
    options: {
        render_back_end: 'Render BackEnd',
        targetVersion: 'Target Version',
        executable_name: 'Executable Name',
        package_name: 'Bundle Identifier',
        package_name_hint:
            'The package name, usually arranged in the reverse order of the product\'s website URL, such as: com.mycompany.myproduct.',
        skipUpdateXcodeProject: 'Skip the update of Xcode project',
        targetVersionDefault: 'Default: 10.14',
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
            'The bundle ID string must contain only alphanumeric characters (A–Z, a–z, and 0–9), hyphens (-), and periods (.). Typically, you use a reverse-DNS format for bundle ID strings. ',
    },
};
