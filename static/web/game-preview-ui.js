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

function createOption(preset, designResolution) {
    const option = document.createElement('option');
    option.value = preset.id;
    option.disabled = !!preset.disabled;
    if (preset.id === 'design') {
        option.textContent = `${preset.name} (${designResolution.width}×${designResolution.height})`;
    } else if (preset.width && preset.height) {
        option.textContent = `${preset.name} (${preset.width}×${preset.height})`;
    } else {
        option.textContent = preset.name;
    }
    return option;
}

function getDebugApi(cc) {
    return cc.debug || window.cc?.debug || cc;
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
    const deviceSelect = getElement('preview-device');
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
    const designResolution = getDesignResolution();
    const presets = new Map(DEVICE_PRESETS.map((preset) => [preset.id, preset]));
    let rotated = true;
    let webpageFullScreen = false;

    DEVICE_PRESETS.forEach((preset) => deviceSelect.appendChild(createOption(preset, designResolution)));
    deviceSelect.value = 'design';
    debugModeSelect.value = 'WARN_FOR_WEB_PAGE';
    frameRateInput.value = '60';

    const getCurrentSize = () => {
        const preset = presets.get(deviceSelect.value);
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
        const paused = cc.game.isPaused();
        setChecked(pauseButton, paused);
        stepButton.classList.toggle('show', paused);
        stepLength.classList.toggle('show', paused);
        frameTimeInput.value = String(Math.round(cc.game.frameTime || 1));
    };

    const updateFpsControl = () => setChecked(showFpsButton, getStatsVisible());

    rotateButton.addEventListener('click', () => {
        rotated = !rotated;
        setChecked(rotateButton, rotated);
        if (deviceSelect.value !== 'fullscreen') {
            applyWindowSize();
        }
        window.dispatchEvent(new Event('orientationchange'));
    });

    deviceSelect.addEventListener('change', async () => {
        setWebpageFullScreen(deviceSelect.value === 'webpage-fullscreen');
        if (deviceSelect.value === 'fullscreen') {
            if (typeof cc.screen?.requestFullScreen === 'function') {
                try {
                    await cc.screen.requestFullScreen();
                } catch (error) {
                    console.warn('[Game Preview] request fullscreen failed:', error);
                }
            }
        } else {
            applyWindowSize();
        }
    });

    window.addEventListener('resize', () => {
        if (deviceSelect.value === 'webpage-fullscreen') {
            applyWindowSize();
        }
    });

    // 与 Creator 一致：Webpage Full Screen 下工具栏默认隐藏；鼠标进入顶部命中区才以覆盖层方式
    // 露出，离开后立即隐藏，因此不会改变模拟设备帧的可用尺寸。
    // 游戏 Canvas 可能会在冒泡阶段消费 mousemove；使用捕获阶段才能稳定观察到顶部触发区。
    document.addEventListener('mousemove', (event) => {
        if (!webpageFullScreen) {
            return;
        }
        document.body.classList.toggle('preview-toolbar-revealed', event.clientY <= TOOLBAR_HEIGHT);
    }, true);

    showFpsButton.addEventListener('click', () => {
        setStatsVisible(!getStatsVisible());
        updateFpsControl();
    });

    debugModeSelect.addEventListener('change', () => {
        applyDebugMode();
    });

    frameRateInput.addEventListener('change', () => {
        const frameRate = Number.parseInt(frameRateInput.value, 10);
        const value = Number.isFinite(frameRate) && frameRate > 0 ? frameRate : 60;
        frameRateInput.value = String(value);
        cc.game.setFrameRate(value);
    });

    pauseButton.addEventListener('click', () => {
        if (cc.game.isPaused()) {
            cc.game.resume();
        } else {
            cc.game.pause();
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
    if (cc.game && cc.Game?.EVENT_PAUSE && cc.Game?.EVENT_RESUME) {
        cc.game.on(cc.Game.EVENT_PAUSE, updatePauseControls);
        cc.game.on(cc.Game.EVENT_RESUME, updatePauseControls);
    }
    document.body.classList.add('preview-toolbar-enabled');
    toolbar.classList.remove('disabled');
    applyDebugMode();
    setStatsVisible(true);
    cc.game.setFrameRate(60);
    applyWindowSize();
    updateFpsControl();
    updatePauseControls();
}
