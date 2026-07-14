/**
 * Scene service aggregate for external callers.
 *
 * Prefer the per-service entry modules — each registers its service (via its
 * `@register(...)` decorator) and exports the ready, precisely-typed instance,
 * so you only load what you use:
 *
 * ```ts
 * import { Node } from '<cli>/lib/service/node';
 * await Node.createByType(...);
 * ```
 *
 * `Service` here is the shared `DecoratorService` proxy (`Service.Node`, …). It is
 * typed as the full service map, so a service only actually resolves at runtime
 * after its module has been imported; otherwise `Service.X` throws "not
 * registered". Use it when you already hold the aggregate; otherwise prefer the
 * per-service modules above.
 */
export { Service } from '../../core/scene/scene-process/service/core/decorator';
export type { IServiceManager } from '../../core/scene/scene-process/service/interfaces';
// The service event bus, returned at runtime by `serviceManager.getServiceEvents()`.
export type { GlobalEventManager } from '../../core/scene/scene-process/service/core/global-events';

