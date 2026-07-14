/**
 * Preview service entry.
 *
 * Importing this module runs the service's `@register('Preview')` decorator and
 * exposes the ready instance. Import only the services you actually use:
 *
 *   import { Preview } from '<cli>/lib/service/preview';
 *   await Preview.xxx(...);
 */
import { Service } from '../../core/scene/scene-process/service/core/decorator';
import '../../core/scene/scene-process/service/preview';

export const Preview = Service.Preview;
