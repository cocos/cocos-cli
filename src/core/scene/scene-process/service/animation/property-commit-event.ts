import type { IAnimationPropertyCommittedEvent } from '../../../common';
import { ServiceEvents } from '../core';

export function normalizeAnimationPropertyCommitPath(propPath: string): string {
    return propPath.replace(/^_components\b/, '__comps__');
}

export function broadcastAnimationPropertyCommitted(event: IAnimationPropertyCommittedEvent): void {
    if (!event.nodePath || !event.propPath) {
        return;
    }
    ServiceEvents.broadcast('animation:property-committed', {
        ...event,
        propPath: normalizeAnimationPropertyCommitPath(event.propPath),
    });
}
