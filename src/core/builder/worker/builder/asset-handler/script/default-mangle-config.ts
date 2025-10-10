
import * as ccBuild from '@cocos/ccbuild';

export type MangleConfigPlatformType = Exclude<ccBuild.StatsQuery.ConstantManager.PlatformType, 'WEB_MOBILE' | 'WEB_DESKTOP' | 'BAIDU' | 'WEB_EDITOR' | 'COCOSPLAY' | 'QTT' | 'LINKSURE' | 'NATIVE_EDITOR' | 'TAOBAO' | 'WECHAT_MINI_PROGRAM' | 'INVALID_PLATFORM'> | 'COMMON' | 'MINIGAME';

export interface IMangleConfigValue {
    extends?: MangleConfigPlatformType;
    mangleProtected?: boolean;
    mangleList?: string[];
    dontMangleList?: string[];
}

export const defaultMangleConfig: Record<MangleConfigPlatformType, IMangleConfigValue> & { __doc_url__?: string } = {
    __doc_url__: '',
    COMMON: {
        mangleProtected: false,
        mangleList: [
            'UITransform._sortSiblings',
            'UITransform._cleanChangeMap',
            'Node._findComponents',
            'Node._findChildComponent',
            'Node._findChildComponents',
            'Node.idGenerator',
            'Node._stacks',
            'Node._stackId',
            'Node._setScene',
            'EffectAsset._layoutValid',
            'EffectAsset._effects',
            'ReflectionProbe.DEFAULT_CUBE_SIZE',
            'ReflectionProbe.DEFAULT_PLANER_SIZE',
            'WebGLDeviceManager.setInstance',
            'WebGL2DeviceManager.setInstance',
            'CanvasPool',
        ],
        dontMangleList: [
            'Component',
        ],
    },
    NODEJS: {
        extends: 'COMMON',
        mangleList: [],
        dontMangleList: [],
    },
    HTML5: {
        extends: 'COMMON',
        mangleList: [],
        dontMangleList: [],
    },
    NATIVE: {
        extends: 'COMMON',
        mangleList: [],
        dontMangleList: [],
    },
    MINIGAME: {
        extends: 'COMMON',
        mangleList: [],
        dontMangleList: [],
    },
    WECHAT: {
        extends: 'MINIGAME',
        mangleList: [],
        dontMangleList: [],
    },
    BYTEDANCE: {
        extends: 'MINIGAME',
        mangleList: [],
        dontMangleList: [],
    },
    XIAOMI: {
        extends: 'MINIGAME',
        mangleList: [],
        dontMangleList: [],
    },
    ALIPAY: {
        extends: 'MINIGAME',
        mangleList: [],
        dontMangleList: [],
    },
    TAOBAO_MINIGAME: {
        extends: 'MINIGAME',
        mangleList: [],
        dontMangleList: [],
    },
    OPPO: {
        extends: 'MINIGAME',
        mangleList: [],
        dontMangleList: [],
    },
    VIVO: {
        extends: 'MINIGAME',
        mangleList: [],
        dontMangleList: [],
    },
    HUAWEI: {
        extends: 'MINIGAME',
        mangleList: [],
        dontMangleList: [],
    },
    MIGU: {
        extends: 'MINIGAME',
        mangleList: [],
        dontMangleList: [],
    },
    HONOR: {
        extends: 'MINIGAME',
        mangleList: [],
        dontMangleList: [],
    },
    COCOS_RUNTIME: {
        extends: 'MINIGAME',
        mangleList: [],
        dontMangleList: [],
    },
    ANDROID: {
        extends: 'NATIVE',
        mangleList: [],
        dontMangleList: [],
    },
    WINDOWS: {
        extends: 'NATIVE',
        mangleList: [],
        dontMangleList: [],
    },
    IOS: {
        extends: 'NATIVE',
        mangleList: [],
        dontMangleList: [],
    },
    MAC: {
        extends: 'NATIVE',
        mangleList: [],
        dontMangleList: [],
    },
    OHOS: {
        extends: 'NATIVE',
        mangleList: [],
        dontMangleList: [],
    },
    OPEN_HARMONY: {
        extends: 'NATIVE',
        mangleList: [],
        dontMangleList: [],
    },
    LINUX: {
        extends: 'NATIVE',
        mangleList: [],
        dontMangleList: [],
    },
};
