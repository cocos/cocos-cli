/**
 * Redo service entry.
 *
 * Importing this module runs the service's `@register('Redo')` decorator and
 * exposes the ready instance. Import only the services you actually use:
 *
 *   import { Redo } from '<cli>/lib/service/redo';
 *   await Redo.xxx(...);
 */
import { Service } from '../../core/scene/scene-process/service/core/decorator';
import '../../core/scene/scene-process/service/redo';

export const Redo = Service.Redo;
