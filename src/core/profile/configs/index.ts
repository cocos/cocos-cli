import * as adsenseH5gPlugin from './adsense-h5g-plugin';
import * as assetDB from './asset-db';
import * as builder from './builder';
import * as engine from './engine';
import * as engineExtends from './engine-extends';
import * as project from './project';
import * as scene from './scene';

export const defaultConfigMap: Record<string, any> = {
    'adsense-h5g-plugin': adsenseH5gPlugin,
    'asset-db': assetDB,
    builder: builder,
    engine: engine,
    'engine-extends': engineExtends,
    project: project,
    scene: scene,
}
