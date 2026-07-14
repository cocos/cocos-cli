/**
 * Operation service entry.
 *
 * Importing this module runs the service's `@register('Operation')` decorator and
 * exposes the ready instance. Import only the services you actually use:
 *
 *   import { Operation } from '<cli>/lib/service/operation';
 *   await Operation.xxx(...);
 */
import { Service } from '../../core/scene/scene-process/service/core/decorator';
import '../../core/scene/scene-process/service/operation';

export const Operation = Service.Operation;
