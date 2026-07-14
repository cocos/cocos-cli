/**
 * Engine service entry.
 *
 * Importing this module runs the service's `@register('Engine')` decorator and
 * exposes the ready instance. Import only the services you actually use:
 *
 *   import { Engine } from '<cli>/lib/service/engine';
 *   await Engine.xxx(...);
 */
import { Service } from '../../core/scene/scene-process/service/core/decorator';
import '../../core/scene/scene-process/service/engine';

export const Engine = Service.Engine;
