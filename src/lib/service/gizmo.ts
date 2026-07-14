/**
 * Gizmo service entry.
 *
 * Importing this module runs the service's `@register('Gizmo')` decorator and
 * exposes the ready instance. Import only the services you actually use:
 *
 *   import { Gizmo } from '<cli>/lib/service/gizmo';
 *   await Gizmo.xxx(...);
 */
import { Service } from '../../core/scene/scene-process/service/core/decorator';
import '../../core/scene/scene-process/service/gizmo';

export const Gizmo = Service.Gizmo;
