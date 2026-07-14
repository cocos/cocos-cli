/**
 * Node service entry.
 *
 * Importing this module runs the service's `@register('Node')` decorator and
 * exposes the ready instance. Import only the services you actually use:
 *
 *   import { Node } from '<cli>/lib/service/node';
 *   await Node.xxx(...);
 */
import { Service } from '../../core/scene/scene-process/service/core/decorator';
import '../../core/scene/scene-process/service/node';

export const Node = Service.Node;
