import type { IMiddlewareContribution } from '../../../../server/interfaces';
import { scriptingRoutes } from './scripting-routes';
import { sceneResourceRoutes } from './scene-routes';

/** Register on an existing project server before generic asset routes. Does not initialize a project or Worker. */
export const sceneRuntimeResources = {
    get: [...sceneResourceRoutes, ...scriptingRoutes],
} as IMiddlewareContribution;
export { invalidatePreviewSettings, getCachedSceneEditorSettings, PreviewNotReadyError } from './settings';
