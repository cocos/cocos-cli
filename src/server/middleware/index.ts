import { middlewareService } from './core';
import { SceneMiddleware } from '../../core/server/scene.middleware';

// TODO 注册中间件，后续可以写成自动
middlewareService.register('Scene', SceneMiddleware);

export { middlewareService };
