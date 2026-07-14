/**
 * Prefab service entry.
 *
 * Importing this module runs the service's `@register('Prefab')` decorator and
 * exposes the ready instance. Import only the services you actually use:
 *
 *   import { Prefab } from '<cli>/lib/service/prefab';
 *   await Prefab.xxx(...);
 */
import { Service } from '../../core/scene/scene-process/service/core/decorator';
import '../../core/scene/scene-process/service/prefab';

export const Prefab = Service.Prefab;
