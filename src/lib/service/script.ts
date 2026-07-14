/**
 * Script service entry.
 *
 * Importing this module runs the service's `@register('Script')` decorator and
 * exposes the ready instance. Import only the services you actually use:
 *
 *   import { Script } from '<cli>/lib/service/script';
 *   await Script.xxx(...);
 */
import { Service } from '../../core/scene/scene-process/service/core/decorator';
import '../../core/scene/scene-process/service/script';

export const Script = Service.Script;
