/**
 * Selection service entry.
 *
 * Importing this module runs the service's `@register('Selection')` decorator and
 * exposes the ready instance. Import only the services you actually use:
 *
 *   import { Selection } from '<cli>/lib/service/selection';
 *   await Selection.xxx(...);
 */
import { Service } from '../../core/scene/scene-process/service/core/decorator';
import '../../core/scene/scene-process/service/selection';

export const Selection = Service.Selection;
