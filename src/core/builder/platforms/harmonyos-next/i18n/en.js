'use strict';

module.exports = {
    title: 'HarmonyOS Next',
    options: {
        package_name: 'Game Package Name',
        package_name_hint: 'Enter the name of the game package, such as: com.example.demo',

        full_screen: 'Whether full screen',
        orientation: 'Screen orientation',
        landscape: 'Landscape',
        landscape_left: 'Landscape Left',
        landscape_right: 'Landscape Right',
        portrait: 'Portrait',

        device_types: 'Device Types',
        device_phone: 'phone',
        device_tablet: 'tablet',
        device_pc_2in1: 'PC/2in1',
        device_tv: 'tv',
        device_wearable: 'wearable',
        device_car: 'car',
        device_default: 'default',

        render_back_end: 'Render BackEnd',
        use_aot_optimization: 'Engine AOT Optimization',
        js_engine: 'JavaScript Engine',
        v8: 'V8',
        ark: 'Ark',
        jsvm: 'JSVM',
        use_gamepad: 'Gamepad',
    },
    label: {
        harmonyosnext_ndk: 'HarmonyOS Next NDK',
        harmonyosnext_sdk: 'HarmonyOS Next SDK',
    },
    tips: {
        not_empty: 'Can not be empty!',
        at_least_one: 'Please select at least one.',
        package_name_error: 'Please enter the correct application ID: Must be a dot-separated string with at least three segments. Each segment can only contain letters, numbers, or underscores (_). The first segment must start with a letter, non-first segments must start with a letter or number, and each segment must end with a letter or number.',
        package_name_length: 'Length must be between 7 and 128 characters.',
        package_name_contains_sensitive_words: 'Package name cannot contain sensitive words: oh, ohos, harmony, harmonyos, openharmony, system',
        ohos_sdk_error: 'Can’t find the HarmonyOS Next SDK path, please go to Preferences -> External Programs to set',
        set_ohos_sdk: 'Set HarmonyOS Next SDK',
        apilevel_empty: 'Failed to get apiLevel, please check the \'HarmonyOS Next NDK/SDK\' path configuration by clicking on the \'Set HarmonyOS Next SDK\' button next to \'Preferences -> External Programs\'',
        orientation_portrait: 'The screen is upright and the Home button is down',
        orientation_landscape_left: 'The screen is horizontal, the Home button is on the left side of the screen',
        orientation_landscape_right: 'The screen is horizontal, the Home button is on the right side of the screen',
        use_aot_optimization: 'When enable this option, the engine build tool will keep the type information to take a step towards AOT optimization.',
    },
    make: {
        label: 'Make',
    },
    run: {
        label: 'Run',
    },
    customIcon: {
        openFailed: 'Open failed',
        label: 'Open the project with DevEco Studio',
        ideNotFound: 'Please set DevEco Studio path in the Creator preference first',
        confirm: 'Confirm',
    },
};
