/**
 * Undo service entry.
 *
 * Importing this module runs the service's `@register('Undo')` decorator and
 * exposes the ready instance. Import only the services you actually use:
 *
 *   import { Undo } from '<cli>/lib/service/undo';
 *   await Undo.xxx(...);
 */
import { Service } from '../../core/scene/scene-process/service/core/decorator';
import '../../core/scene/scene-process/service/undo';

export const Undo = Service.Undo;
