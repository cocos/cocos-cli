/* global window */

window.CC_EDITOR = true;
const serverUrl = window.WebEnv.serverURL;

window.Editor = {
    Message: {
        request: async function (target, method, uuid) {
            if (method === 'query-asset-info') {
                return await fetch(`${serverUrl}/query-asset-info/${uuid}`)
                    .then(function (r) { return r.json(); })
                    .catch(function () { return ''; });
            } else if (method === 'query-engine-info') {
                return await fetch(`${serverUrl}/engine/query-engine-info`)
                    .then(function (r) { return r.json(); })
                    .catch(function () { return ''; });
            }
            return Promise.resolve(null);
        },
    },
};

if (typeof window.require === 'undefined') {
    const fsMock = {
        readFile: function (filePath) {
            const requestUrl = `${serverUrl}/engine/read-file-sync?path=${encodeURIComponent(filePath)}`;
            return fetch(requestUrl).then(function (res) {
                if (res.ok) {
                    return res.arrayBuffer();
                }
                throw new Error('Failed to read file: ' + filePath);
            });
        },
        readFileSync: function (filePath) {
            const requestUrl = `${serverUrl}/engine/read-file-sync?path=${encodeURIComponent(filePath)}`;
            const xhr = new XMLHttpRequest();
            xhr.open('GET', requestUrl, false); // synchronous
            xhr.overrideMimeType('text/plain; charset=x-user-defined');
            xhr.send(null);

            if (xhr.status === 200) {
                const val = xhr.responseText;
                const len = val.length;
                const buf = new Uint8Array(len);
                for (let i = 0; i < len; i++) {
                    buf[i] = val.charCodeAt(i) & 0xff;
                }
                return buf;
            }
            throw new Error('Failed to read file synchronously: ' + filePath);
        }
    };

    window.require = function (name) {
        if (window.require.cache[name]) {
            return window.require.cache[name].exports;
        }

        if (name === 'fs' || name === 'fs-extra') {
            return fsMock;
        }

        if (name.endsWith('.js') || name.includes('\\') || name.includes('/')) {
            try {
                const buf = fsMock.readFileSync(name);
                const decoder = new TextDecoder('utf-8');
                const content = decoder.decode(buf);
                const module = { exports: {} };
                const wrapper = new Function('exports', 'require', 'module', '__filename', '__dirname', content);
                
                const dirname = name.includes('\\') ? name.substring(0, name.lastIndexOf('\\')) : name.substring(0, name.lastIndexOf('/'));
                wrapper(module.exports, window.require, module, name, dirname);
                
                window.require.cache[name] = module;
                return module.exports;
            } catch (e) {
                throw new Error('Failed to require dynamically ' + name + ': ' + e.message);
            }
        }

        throw new Error('Module ' + name + ' not found in editor-stub-preload require mock');
    };
    window.require.cache = {};
}

window.EditorExtends = {
    emit: function () { },
    on: function () { },
    off: function () { },
    removeListener: function () { },
    UuidUtils: {
        uuid: function () { return ''; },
        compressUuid: function (u) { return u; },
        compressUUID: function (u) { return u; },
        decompressUuid: function (u) { return u; },
        isUuid: function () { return false; },
    },
    Component: {
        allow: false,
        addMenu: function () { },
        removeMenu: function () { },
        getMenus: function () { return []; },
        add: function () { },
        remove: function () { },
        clear: function () { },
        getComponent: function () { return null; },
        getComponentFromPath: function () { return null; },
        getPathFromUuid: function () { return ''; },
        getComponents: function () { return {}; },
        changeUUID: function () { },
        emit: function () { },
        on: function () { },
        off: function () { },
        removeListener: function () { },
    },
    Node: {
        allow: false,
        add: function () { },
        remove: function () { },
        clear: function () { },
        updateNodeName: function () { },
        getNode: function () { return null; },
        getNodeByPath: function () { return null; },
        getNodePath: function () { return ''; },
        getNodeUuidByPath: function () { return null; },
        getNodeByPathOrThrow: function () { throw new Error('Not implemented'); },
        getNodeUuidByPathOrThrow: function () { throw new Error('Not implemented'); },
        getNodes: function () { return {}; },
        getNodesByAsset: function () { return []; },
        getNodesInScene: function () { return {}; },
        changeNodeUUID: function () { },
        emit: function () { },
        on: function () { },
        off: function () { },
        removeListener: function () { },
    },
    Script: {
        allow: false,
        add: function () { },
        remove: function () { },
        getCtors: function () { return []; },
        emit: function () { },
        on: function () { },
        off: function () { },
        removeListener: function () { },
    },
    MissingReporter: {
        classInstance: (function () {
            const finder = function (type, data, owner, propName) {
                // Resolve class by type ID, same as cc.js.getClassById
                return cc && cc.js ? cc.js.getClassById(type) : null;
            };
            finder.onDereferenced = function () { };
            return {
                classFinder: finder,
                reportMissingClass: function () { },
                reset: function () { },
            };
        })(),
        class: null,
        object: function () { return { stashByOwner: function () { } }; },
    },
    serialize: {
        asAsset: function (uuid) { return uuid; },
    },
};