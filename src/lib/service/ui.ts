/**
 * UI service entry.
 *
 * Importing this module runs the service's `@register('UI')` decorator and
 * exposes the ready instance. Import only the services you actually use:
 *
 *   import { UI } from '<cli>/lib/service/ui';
 *   await UI.xxx(...);
 */
import { Service } from '../../core/scene/scene-process/service/core/decorator';
import '../../core/scene/scene-process/service/ui';

export const UI = Service.UI;
