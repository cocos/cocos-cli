// 
import { SceneProxy } from './proxy/scene-proxy';
import { NodeProxy } from './proxy/node-proxy';

export const Scene = {
    ...SceneProxy,
    ...NodeProxy,
}