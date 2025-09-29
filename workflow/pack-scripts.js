const { PackerDriver } = require('../dist/core/scripting/packer-driver');
const utils = require('./utils');
const { engine: enginePath, project: projectPath } = require('../.user.json');
const { configurationManager } = require('../dist/core/configuration/script/manager');


(async () => {
    utils.logTitle('Pack script');
    try {
        await configurationManager.initialize(projectPath);
        const packerDriver = PackerDriver.create(projectPath, enginePath);
        const features = ["2d", "3d", "affine-transform", "animation", "audio", "base", "custom-pipeline", "dragon-bones", "gfx-webgl", "graphics", "intersection-2d", "light-probe", "marionette", "mask", "particle", "particle-2d", "physics-2d-box2d", "physics-physx", "primitive", "procedural-animation", "profiler", "rich-text", "skeletal-animation", "spine-3.8", "terrain", "tiled-map", "tween", "ui", "ui-skew", "video", "websocket", "webview"];
        (await packerDriver).init(features);
        (await packerDriver).build();
    } catch (error) {
        throw error;
    }
})();
