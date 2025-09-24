declare const CC_BUILD: boolean;
declare const CC_TEST: boolean;
declare const CC_EDITOR: boolean;
declare const CC_PREVIEW: boolean;
declare const CC_DEV: boolean;
declare const CC_DEBUG: boolean;
declare const CC_JSB: boolean;
declare const CC_WECHAT: boolean;
declare const CC_ALIPAY: boolean;
declare const CC_XIAOMI: boolean;
declare const CC_BAIDU: boolean;
declare const CC_COCOSPLAY: boolean;
declare const CC_MINIGAME: boolean;
declare const CC_RUNTIME_BASED: boolean;
declare const CC_SUPPORT_JIT: boolean;
declare const CC_PHYSICS_CANNON: boolean;
declare const CC_PHYSICS_AMMO: boolean;
declare const CC_PHYSICS_BUILTIN: boolean;
declare const cc: any;

// polyfills for editor
declare module 'cc' {
    interface CCObject {
        isRealValid: boolean;
        objFlags: number;
    }
    interface Node {
        [editorExtrasTag]: {
            // restore the PrefabInstance Node when this node is the mounted child node of it.
            mountedRoot?: Node;
        };
        objectFlags: number;
    }
    interface Component {
        [editorExtrasTag]: {
            // restore the PrefabInstance Node when this component is the mounted component under it.
            mountedRoot?: Node
        };
        objectFlags: number;
    }

    interface RealKeyframeValue {
        [editorExtrasTag]: {
            tangentMode?: TangentMode;
            broken?: boolean;
        }
    }

    interface ParticleSystem {
        _isShowBB?: boolean;    // 是否显示包围盒
    }

    interface EmbeddedPlayerGroup {
        name: string, // 通知轨道类型
        key: string; // 唯一标识符
        type: string;
    }

    interface AnimationClip {
        [editorExtrasTag]: {
            embeddedPlayerGroups: EmbeddedPlayerGroup[];
        }
    }
}

declare module 'cc/editor/embedded-player' {
    import { editorExtrasTag } from 'cc';
    interface EmbeddedPlayer {
        [editorExtrasTag]: {
            group: string;
            displayName?: string;
        }
    }
}
