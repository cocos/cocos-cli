'use strict';

const { basename } = require('path');
const { EventEmitter } = require('events');

class Engine extends EventEmitter {
    constructor() {
        super();
        this.attachedObjsForEditor = {};
    }

    off() { }

    getDesignResolutionSize() {
        return { width: 1280, height: 760 }; // 手写的设计分辨率
    }

    setDesignResolutionSize() { }
}

// 适配 cc.engine
// todo 引擎内发送了 node-attach-to-scene 等事件
cc.engine = new Engine();

// 适配 _Scene
window._Scene = {
    AssetsWatcher: {
        start() { },
        initComponent() { },
        stop() { },
    },
    DetectConflict: {
        beforeAddChild() { },
        afterAddChild() { },
    },
};

let loadingProjectScripts = 0;
cc.require = function(request, originRequire) {
    originRequire = originRequire || require;
    loadingProjectScripts ++;

    let m;
    try {
        const name = basename(request);

        m = cc.js.getClassByName(name);
        if (!m) {
            m = originRequire(request);
        }
    } catch (err) {
        console.error(`load script [${request}] failed : ${err.stack}`);
    }

    loadingProjectScripts--;
    return m;
};

// 适配 cc._throw
cc._throw = cc.error;
