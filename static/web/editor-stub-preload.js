/* global window */

window.CC_EDITOR = true;

window.Editor = {
    Message: {
        request: async function (target, method, uuid) {
            if (method === 'query-asset-info') {
                const currentUrl = window.location.origin;
                return await fetch(`${currentUrl}/query-asset-info/${uuid}`)
                    .then(function (r) { return r.json(); })
                    .catch(function () { return ''; });
            }
            return Promise.resolve(null);
        },
    },
};

window.EditorExtends = {
    emit: function () { },
    on: function () { },
    removeListener: function () { },
    UuidUtils: {
        uuid: function () { return ''; },
        compressUuid: function (u) { return u; },
        compressUUID: function (u) { return u; },
        decompressUuid: function (u) { return u; },
        isUuid: function () { return false; },
    },
    Component: {
        addMenu: function () { },
        removeMenu: function () { },
        add: function () { },
        remove: function () { },
    },
    Node: {
        add: function () { },
        remove: function () { },
        getNode: function () { return null; },
        emit: function () { },
    },
    Script: { allow: false },
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