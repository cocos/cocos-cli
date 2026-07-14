/**
 * Editor service entry.
 *
 * Importing this module runs the service's `@register('Editor')` decorator and
 * exposes the ready instance. Import only the services you actually use:
 *
 *   import { Editor } from '<cli>/lib/service/editor';
 *   await Editor.xxx(...);
 */
import { Service } from '../../core/scene/scene-process/service/core/decorator';
import '../../core/scene/scene-process/service/editor';

export const Editor = Service.Editor;
