import * as assetDB from './asset-db';
import * as builder from './builder';
import * as engine from './engine';
import * as engineExtends from './engine-extends';
import * as project from './project';
import * as scene from './scene';

export const defaultConfigMap: Record<string, any> = {
    'asset-db': assetDB.default,
    builder: builder.default,
    engine: engine.default,
    'engine-extends': engineExtends.default,
    project: project.default,
    scene: scene.default,
}

function initDefaultConfig() {


}