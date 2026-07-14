/**
 * Camera service entry.
 *
 * Importing this module runs the service's `@register('Camera')` decorator and
 * exposes the ready instance. Import only the services you actually use:
 *
 *   import { Camera } from '<cli>/lib/service/camera';
 *   await Camera.xxx(...);
 */
import { Service } from '../../core/scene/scene-process/service/core/decorator';
import '../../core/scene/scene-process/service/camera';

export const Camera = Service.Camera;
