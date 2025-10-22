import { middlewareService } from './core';
import SceneMiddleware from '../../core/server/scene.middleware';
import BuildMiddleware from '../../core/server/build.middleware';

// TODO 注册中间件，后续可以写成自动，这里的顺序很重要，哪个路由先处理
middlewareService.register('Build', BuildMiddleware);
middlewareService.register('Scene', SceneMiddleware);

export { middlewareService };
