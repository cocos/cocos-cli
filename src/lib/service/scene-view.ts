/**
 * SceneView service entry.
 *
 * Importing this module runs the service's `@register('SceneView')` decorator and
 * exposes the ready instance. Import only the services you actually use:
 *
 *   import { SceneView } from '<cli>/lib/service/scene-view';
 *   await SceneView.xxx(...);
 */
import { Service } from '../../core/scene/scene-process/service/core/decorator';
import '../../core/scene/scene-process/service/scene-view';

export const SceneView = Service.SceneView;
