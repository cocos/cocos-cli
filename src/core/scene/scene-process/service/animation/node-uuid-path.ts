import { animation, CCClass, Node } from 'cc';

/**
 * Adds and reads the serialized node-identity segment used by Animation Editor
 * property tracks. All reliance on the engine's customized TrackPath storage
 * is isolated here because TrackPath exposes creation but no parser for custom
 * segments.
 */
export function appendNodeUuidPath(path: animation.TrackPath, nodeUuid?: string): void {
    if (nodeUuid) {
        path.toCustomized(new NodeUuidPath(nodeUuid));
    }
}

export function parseNodeUuidPath(path: unknown, index: number): string | undefined {
    const segment = (path as { _paths?: unknown[] })._paths?.[index];
    return segment instanceof NodeUuidPath && segment.nodeUuid ? segment.nodeUuid : undefined;
}

class NodeUuidPath {
    public nodeUuid = '';

    constructor(nodeUuid?: string) {
        this.nodeUuid = nodeUuid || '';
    }

    public get(target: unknown): Node | null {
        return target instanceof Node && target.uuid === this.nodeUuid ? target : null;
    }
}

// Some narrow unit-test doubles omit CCClass; the real Scene engine always registers this serialized type.
CCClass?.fastDefine?.('pink.animation.NodeUuidPath', NodeUuidPath, { nodeUuid: '' });
