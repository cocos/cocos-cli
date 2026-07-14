/**
 * Asset service entry.
 *
 * Importing this module runs the service's `@register('Asset')` decorator and
 * exposes the ready instance. Import only the services you actually use:
 *
 *   import { Asset } from '<cli>/lib/service/asset';
 *   await Asset.xxx(...);
 */
import { Service } from '../../core/scene/scene-process/service/core/decorator';
import '../../core/scene/scene-process/service/asset';

export const Asset = Service.Asset;
