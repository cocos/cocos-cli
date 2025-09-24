'use strict';

const assetMap = {
    get scene() {
        return cc.SceneAsset;
    },

    get texture() {
        return cc.Texture2D;
    },

    get 'sprite-frame'() {
        return cc.SpriteFrame;
    },
};

function getCtor(importer) {

    switch (importer) {
        case 'scene':
            return cc.Scene;
        case 'texture':
            return cc.Texture;
        case 'sprite-frame':
            return cc.SpriteFrame;
        case 'tiled-map':
            return cc.TiledMap;
        case 'material':
            return cc.Material;
    }
}

function getImporter(ctor) {
    switch (ctor) {
        case cc.SpriteFrame:
            return 'sprite-frame';
        case cc.ImageAsset:
            return 'image';
        case cc.JsonAsset:
            return 'json';
        case cc.Material:
            return 'material';
        case cc.Texture2D:
            return 'texture';
        case cc.SceneAsset:
            return 'scene';
        case cc.TextAsset:
            return 'text';
        default: return '';
    }
}

module.exports = {
    getCtor,
    assetMap,
    getImporter,
};
