/* global System, window, document */

const DEVICE_PRESETS = [
    { id: 'design', name: 'Design Resolution' },
    { id: 'fullscreen', name: 'Full Screen' },
    { id: 'webpage-fullscreen', name: 'Webpage Full Screen' },
    { id: 'separator', name: '──────────', disabled: true },
    { id: 'iphone-14-pro', name: 'Apple iPhone 14 Pro', width: 393, height: 852 },
    { id: 'iphone-14-plus', name: 'Apple iPhone 12/13 Pro Max; 14 Plus', width: 428, height: 926 },
    { id: 'iphone-14', name: 'Apple iPhone 12; 13; 14; 12/13 Pro', width: 390, height: 844 },
    { id: 'iphone-x', name: 'Apple iPhone X; XS; 11 Pro; 12/13 Mini', width: 375, height: 812 },
    { id: 'iphone-xr', name: 'Apple iPhone XR; 11', width: 414, height: 896 },
    { id: 'ipad-10-2', name: 'Apple iPad 10.2', width: 1620, height: 2160 },
    { id: 'ipad-air', name: 'Apple iPad Air 10.9', width: 1640, height: 2360 },
    { id: 'ipad-pro', name: 'Apple iPad Pro 10.5', width: 1668, height: 2224 },
    { id: 'oppo-reno-2', name: 'OPPO Reno 2', width: 360, height: 800 },
    { id: 'huawei-nova-5', name: 'HUAWEI Nova 5', width: 360, height: 780 },
    { id: 'honor-x8', name: 'HONOR X8', width: 360, height: 796 },
    { id: 'huawei-nova-8i', name: 'HUAWEI Nova 8i', width: 360, height: 792 },
    { id: 'huawei-mate-40-pro', name: 'HUAWEI Mate 40 Pro', width: 448, height: 924 },
    { id: 'huawei-mate-30-pro', name: 'HUAWEI Mate30 Pro', width: 392, height: 800 },
    { id: 'xiaomi-redmi-8', name: 'Xiaomi Redmi 8', width: 360, height: 760 },
    { id: 'sony-xperia-5', name: 'Sony Xperia 5', width: 360, height: 840 },
    { id: 'oppo-a77', name: 'OPPO A77', width: 360, height: 806 },
    { id: 'nokia-c2', name: 'Nokia C2', width: 360, height: 720 },
    { id: 'asus-rog-phone-6', name: 'Asus ROG Phone 6', width: 360, height: 816 },
    { id: 'lenovo-legion-2-pro', name: 'Lenovo Legion 2 Pro', width: 360, height: 820 },
];
const TOOLBAR_HEIGHT = 50;

function getLocalizedDevicePresets() {
    const deviceText = window.__previewToolbarI18n?.device || {};
    return DEVICE_PRESETS.map((preset) => {
        const localizedName = {
            design: deviceText.designResolution,
            fullscreen: deviceText.fullScreen,
            'webpage-fullscreen': deviceText.webpageFullScreen,
        }[preset.id];
        return localizedName ? { ...preset, name: localizedName } : preset;
    });
}

function getElement(id) {
    const element = document.getElementById(id);
    if (!element) {
        throw new Error(`[Game Preview] missing toolbar element: ${id}`);
    }
    return element;
}

function getDesignResolution() {
    const resolution = window._CCSettings?.screen?.designResolution || {};
    return {
        width: Number(resolution.width) || 1280,
        height: Number(resolution.height) || 720,
    };
}

function getPresetLabel(preset, designResolution) {
    if (preset.id === 'design') {
        return `${preset.name} (${designResolution.width}×${designResolution.height})`;
    }
    if (preset.width && preset.height) {
        return `${preset.name} (${preset.width}×${preset.height})`;
    }
    return preset.name;
}

function createDeviceOption(preset, designResolution) {
    const option = document.createElement('li');
    if (preset.id === 'separator') {
        option.className = 'separator';
        return option;
    }
    option.dataset.device = preset.id;
    option.textContent = getPresetLabel(preset, designResolution);
    return option;
}

function getDebugApi(cc) {
    return cc.debug || window.cc?.debug || cc;
}

function getPreviewToolbarOptions() {
    return window.__previewToolbarOptions || {
        device: 'design',
        rotate: false,
        debugMode: 'WARN',
        showFps: true,
    };
}

function emitOptionChange(name, value) {
    window.__previewSocket?.emit('changeOption', name, value);
}

function setChecked(button, checked) {
    button.classList.toggle('checked', checked);
}

function setPreviewWindowSize(cc, width, height) {
    const pixelRatio = cc.screen?.devicePixelRatio || window.devicePixelRatio || 1;
    cc.screen.windowSize = new cc.Size(width * pixelRatio, height * pixelRatio);
}

export default async function initializePreviewToolbar() {
    const toolbar = getElement('preview-toolbar');
    const devicePicker = getElement('preview-device');
    const deviceName = getElement('preview-device-name');
    const deviceOptions = getElement('preview-device-options');
    const deviceOptionList = deviceOptions.querySelector('ul');
    const deviceSelectTrigger = devicePicker.querySelector('.view-select');
    const rotateButton = getElement('preview-rotate');
    const debugModeSelect = getElement('preview-debug-mode');
    const showFpsButton = getElement('preview-show-fps');
    const frameRateInput = getElement('preview-frame-rate');
    const pauseButton = getElement('preview-pause');
    const stepButton = getElement('preview-step');
    const stepLength = getElement('preview-step-length');
    const frameTimeInput = getElement('preview-frame-time');

    const cc = window.cc || await System.import('cc');
    const debug = getDebugApi(cc);
    const toolbarOptions = getPreviewToolbarOptions();
    const designResolution = getDesignResolution();
    const devicePresets = getLocalizedDevicePresets();
    const presets = new Map(devicePresets.map((preset) => [preset.id, preset]));
    let selectedDevice = presets.has(toolbarOptions.device) ? toolbarOptions.device : 'design';
    let rotated = !!toolbarOptions.rotate;
    let webpageFullScreen = selectedDevice === 'webpage-fullscreen';
    // 游戏启动时会短暂 pause 以等待场景加载；这不是用户通过预览工具栏发起的暂停，不能展示 Step 控件。
    let pausedByToolbar = false;

    devicePresets.forEach((preset) => deviceOptionList?.appendChild(createDeviceOption(preset, designResolution)));
    debugModeSelect.value = toolbarOptions.debugMode;
    frameRateInput.value = '60';

    const updateSelectedDevice = (deviceId) => {
        selectedDevice = deviceId;
        devicePicker.setAttribute('value', deviceId);
        const preset = presets.get(deviceId);
        deviceName.textContent = getPresetLabel(preset || devicePresets[0], designResolution);
        deviceOptionList?.querySelectorAll('li[data-device]').forEach((option) => {
            option.classList.toggle('selected', option.dataset.device === deviceId);
        });
    };
    updateSelectedDevice(selectedDevice);

    const getCurrentSize = () => {
        const preset = presets.get(selectedDevice);
        if (preset?.id === 'webpage-fullscreen' || preset?.id === 'fullscreen') {
            return { width: window.innerWidth, height: window.innerHeight };
        }
        const width = preset?.id === 'design' ? designResolution.width : preset?.width || designResolution.width;
        const height = preset?.id === 'design' ? designResolution.height : preset?.height || designResolution.height;
        return rotated ? { width: height, height: width } : { width, height };
    };

    const applyWindowSize = () => {
        const size = getCurrentSize();
        setPreviewWindowSize(cc, size.width, size.height);
    };

    const setWebpageFullScreen = (enabled) => {
        webpageFullScreen = enabled;
        document.body.classList.toggle('preview-webpage-fullscreen', enabled);
        document.body.classList.remove('preview-toolbar-revealed');
    };

    const selectDevice = async (deviceId) => {
        if (deviceId === 'fullscreen') {
            if (typeof cc.screen?.requestFullScreen === 'function') {
                try {
                    await cc.screen.requestFullScreen();
                } catch (error) {
                    console.warn('[Game Preview] request fullscreen failed:', error);
                }
            }
            return;
        }
        updateSelectedDevice(deviceId);
        setWebpageFullScreen(deviceId === 'webpage-fullscreen');
        applyWindowSize();
    };

    const getStatsVisible = () => {
        if (typeof debug.isDisplayStats === 'function') {
            return debug.isDisplayStats();
        }
        return typeof cc.isDisplayStats === 'function' && cc.isDisplayStats();
    };

    const setStatsVisible = (visible) => {
        if (typeof debug.setDisplayStats === 'function') {
            debug.setDisplayStats(visible);
        } else if (typeof cc.setDisplayStats === 'function') {
            cc.setDisplayStats(visible);
        }
    };

    const applyDebugMode = () => {
        const mode = cc.DebugMode?.[debugModeSelect.value] ?? debug.DebugMode?.[debugModeSelect.value];
        if (typeof debug._resetDebugSetting === 'function' && mode !== undefined) {
            debug._resetDebugSetting(mode);
        }
    };

    const updatePauseControls = () => {
        setChecked(pauseButton, pausedByToolbar);
        stepButton.classList.toggle('show', pausedByToolbar);
        stepLength.classList.toggle('show', pausedByToolbar);
        frameTimeInput.value = String(Math.round(cc.game.frameTime || 1));
    };

    const updateFpsControl = () => setChecked(showFpsButton, getStatsVisible());

    rotateButton.addEventListener('click', () => {
        rotated = !rotated;
        setChecked(rotateButton, rotated);
        if (selectedDevice !== 'fullscreen') {
            applyWindowSize();
        }
        window.dispatchEvent(new Event('orientationchange'));
        emitOptionChange('rotate', rotated);
    });

    deviceSelectTrigger?.addEventListener('click', (event) => {
        event.stopPropagation();
        deviceOptions.toggleAttribute('open');
    });

    document.addEventListener('click', () => {
        deviceOptions.removeAttribute('open');
    });

    deviceOptionList?.addEventListener('click', async (event) => {
        const option = event.target.closest('li[data-device]');
        if (option?.dataset.device) {
            await selectDevice(option.dataset.device);
            if (option.dataset.device !== 'fullscreen') {
                emitOptionChange('device', option.dataset.device);
            }
        }
        deviceOptions.removeAttribute('open');
    });

    window.addEventListener('resize', () => {
        if (selectedDevice === 'webpage-fullscreen') {
            applyWindowSize();
        }
    });

    document.addEventListener('fullscreenchange', () => {
        if (!document.fullscreenElement) {
            applyWindowSize();
            window.dispatchEvent(new Event('resize'));
        }
    });

    // 与 Creator 一致：Webpage Full Screen 下工具栏默认隐藏；鼠标进入顶部命中区才以覆盖层方式
    // 露出，离开后立即隐藏，因此不会改变模拟设备帧的可用尺寸。
    // 游戏 Canvas 可能会在冒泡阶段消费 mousemove；使用捕获阶段才能稳定观察到顶部触发区。
    document.addEventListener('mousemove', (event) => {
        if (!webpageFullScreen) {
            return;
        }
        // 下拉菜单位于工具栏下方。菜单打开后，鼠标离开顶部 50px 不应隐藏其宿主工具栏，
        // 否则 Webpage Full Screen 下无法点选任何设备项。
        const isDeviceMenuOpen = deviceOptions.hasAttribute('open');
        document.body.classList.toggle('preview-toolbar-revealed', isDeviceMenuOpen || event.clientY <= TOOLBAR_HEIGHT);
    }, true);

    showFpsButton.addEventListener('click', () => {
        setStatsVisible(!getStatsVisible());
        updateFpsControl();
        emitOptionChange('showFps', getStatsVisible());
    });

    debugModeSelect.addEventListener('change', () => {
        applyDebugMode();
        emitOptionChange('debugMode', debugModeSelect.value);
    });

    frameRateInput.addEventListener('change', () => {
        const frameRate = Number.parseInt(frameRateInput.value, 10);
        const value = Number.isFinite(frameRate) && frameRate > 0 ? frameRate : 60;
        frameRateInput.value = String(value);
        cc.game.setFrameRate(value);
    });

    pauseButton.addEventListener('click', () => {
        if (pausedByToolbar) {
            cc.game.resume();
            pausedByToolbar = false;
        } else {
            cc.game.pause();
            pausedByToolbar = true;
        }
        updatePauseControls();
    });

    stepButton.addEventListener('click', () => cc.game.step());

    frameTimeInput.addEventListener('change', () => {
        const frameTime = Number.parseInt(frameTimeInput.value, 10);
        const value = Number.isFinite(frameTime) && frameTime > 0 ? frameTime : 1;
        frameTimeInput.value = String(value);
        cc.game.frameTime = value;
    });

    if (cc.director && cc.Director?.EVENT_END_FRAME) {
        cc.director.on(cc.Director.EVENT_END_FRAME, updatePauseControls);
    }
    document.body.classList.add('preview-toolbar-enabled');
    toolbar.classList.remove('disabled');
    setChecked(rotateButton, rotated);
    setWebpageFullScreen(webpageFullScreen);
    updateSelectedDevice(selectedDevice);
    applyDebugMode();
    setStatsVisible(!!toolbarOptions.showFps);
    cc.game.setFrameRate(60);
    applyWindowSize();
    updateFpsControl();
    updatePauseControls();
}
