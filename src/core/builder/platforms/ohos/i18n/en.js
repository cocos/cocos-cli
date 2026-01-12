'use strict';

module.exports = {
    title: 'HarmonyOS',
    options: {
        package_name: 'Game Package Name',
        package_name_hint: 'Enter the name of the game package, such as: com.example.demo',
  
        full_screen: 'Whether full screen',
        orientation: 'Screen orientation',
        landscape: 'Landscape',
        landscape_left: 'Landscape Left',
        landscape_right: 'Landscape Right',
        portrait: 'Portrait',

        render_back_end: 'Render BackEnd',
        
        apiLevel: 'API Level',
        appABIs: 'Supported CPU Architectures',
        app_bundle: 'App Bundle',
        google_play_instant: 'Google Play Instant',
        input_sdk: 'Input SDK',
        remoteUrl: 'Remote URL',
    },
    tips: {
        not_empty: 'Can not be empty!',
        at_least_one: 'Please select at least one.',
        package_name_error: 'Please enter the correct application ID: it must contain at least two paragraphs (one or more dots), each paragraph must start with a letter, and the package name can only contain numbers, letters and underscores.',
        ohos_sdk_error: 'Can’t find the HarmonyOS NDK/SDK path, please go to Preferences -> External Programs to set',
        set_ohos_sdk: 'Set HarmonyOS SDK',
        apilevel_empty: 'Failed to get apiLevel, please check the \'HarmonyOS NDK/SDK\' path configuration by clicking on the \'Set HarmonyOS SDK\' button next to \'Preferences -> External Programs\'',
        orientation_portrait: 'The screen is upright and the Home button is down',
        orientation_landscape_left: 'The screen is horizontal, the Home button is on the left side of the screen',
        orientation_landscape_right: 'The screen is horizontal, the Home button is on the right side of the screen',
    },
    make: {
        label: 'Make',
    },
    run: {
        label: 'Run',
    },
    program: {
        ohosNDK: 'HarmonyOS NDK',
        ohosSDK: 'HarmonyOS SDK',
    },
};
