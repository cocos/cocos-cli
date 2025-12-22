'use strict';

module.exports = {
    options: {
        render_back_end: 'Render BackEnd',
        developerTeam: 'Developer Team',
        targetVersion: 'Target iOS Version',
        customOption: 'Custom',
        queryAgain: 'Query Again',
        executable_name: 'Executable Name',
        package_name: 'Bundle Identifier',
        package_name_hint:
            'The package name, usually arranged in the reverse order of the product\'s website URL, such as: com.mycompany.myproduct.',

        orientation: 'Orientation',
        landscape_left: 'Landscape Left',
        landscape_left_tips: 'The screen is placed horizontally, with the Home button on the left side of the screen.',
        landscape_right: 'Landscape Right',
        landscape_right_tips: 'The screen is placed horizontally, with the Home button on the right side of the screen.',
        portrait: 'Portrait',
        portrait_tips: 'The screen is placed vertically with the Home button on the bottom.',
        skipUpdateXcodeProject: 'Skip the update of Xcode project',

        os_target: 'OS Target',
        iphone_os: 'iPhone OS',
        ios_simulator: 'iOS Simulator',
    },
    make: {
        label: 'Make',
    },

    run: {
        label: 'Run',
    },

    tips: {
        targetVersionDefault: 'Default: 12.0',
        version_style_error: 'The version number format is wrong, please enter the correct version number format, such as 12.0',
        targetVersionError: 'Minimum version: 11.0',
        targetVersionErrorWithTaskFlow: 'When use TaskFlow, the minimun version should be 12.0',
        developerTeamListError: 'Developer team information not found, select the custom option to fill in',
        at_least_one: 'Please select at least one target.',
        not_empty: 'Can not be empty!',
        packageNameRuleMessage:
            'The bundle ID string must contain only alphanumeric characters (A–Z, a–z, and 0–9), hyphens (-), and periods (.). Typically, you use a reverse-DNS format for bundle ID strings. ',
    },
};
