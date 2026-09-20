/** Supported in-process scene runtime integration surface. Requires the matching CLI version. */
export { BaseService } from '../scene-process/service/core/base-service';
export { register, Service, queryRegisteredService, getServiceAll } from '../scene-process/service/core/decorator';
export { ServiceEvents } from '../scene-process/service/core/global-events';
export { registerViewUpdate } from '../scene-process/service/core/view-updates';
export { registerTerrainSessionResolver } from '../scene-process/service/core/terrain-session';
export type { TerrainSession } from '../scene-process/service/core/terrain-session';
