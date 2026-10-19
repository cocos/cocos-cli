import { randomUUID } from 'crypto';
import { statSync } from 'fs';
import { dirname } from 'path';
import type { IAssetMovePreflightResult } from '../../@types/public';
import { readMovePathState } from './state';

/** Already resolved and validated against the current Asset DB mounts. */
export interface ResolvedAssetMove {
    source: string;
    target: string;
    sourceUrl: string;
    targetUrl: string;
    sourceUuid: string;
    sourceIsDirectory: boolean;
    sourceDB: object;
    targetDB: object;
    targetUuid: string | null;
}

interface MoveObservation {
    source: string;
    sourceMeta: string;
    target: string | null;
    targetMeta: string | null;
    parent: string;
    targetIsDirectory: boolean | null;
}

interface MovePreflightRecord {
    epoch: number;
    request: ResolvedAssetMove;
    observation: MoveObservation;
}

function observe(request: ResolvedAssetMove): MoveObservation {
    const source = readMovePathState(request.source);
    const sourceMeta = readMovePathState(`${request.source}.meta`);
    if (!source || !sourceMeta) {
        throw new Error('Cannot move an asset without its source file and metadata.');
    }
    const target = readMovePathState(request.target);
    const targetMeta = readMovePathState(`${request.target}.meta`);
    const parent = statSync(dirname(request.target), { bigint: true });
    return {
        source: source.revision,
        sourceMeta: sourceMeta.revision,
        target: target?.revision ?? null,
        targetMeta: targetMeta?.revision ?? null,
        parent: `${parent.dev}:${parent.ino}`,
        targetIsDirectory: target?.directory ?? null,
    };
}

/** Owns single-use observations; tokens never reserve a path or lock a mount. */
export class AssetMovePreflights {
    private readonly records = new Map<string, MovePreflightRecord>();
    private epoch = 0;

    clear(): void {
        this.epoch++;
        this.records.clear();
    }

    create(request: ResolvedAssetMove): IAssetMovePreflightResult {
        const observation = observe(request);
        const preflightToken = randomUUID();
        if (this.records.size >= 128) {
            this.records.delete(this.records.keys().next().value!);
        }
        this.records.set(preflightToken, { epoch: this.epoch, request, observation });
        if (observation.target !== null || observation.targetMeta !== null) {
            return {
                action: 'choose-conflict-handling',
                preflightToken,
                conflict: {
                    sourceUrl: request.sourceUrl,
                    targetUrl: request.targetUrl,
                    sourceIsDirectory: request.sourceIsDirectory,
                    targetIsDirectory: observation.targetIsDirectory,
                },
            };
        }
        return { action: 'move', preflightToken };
    }

    /** Consumes once, returning a guard that is checked after all execution waits. */
    take(token: string): (request: ResolvedAssetMove) => void {
        const record = this.records.get(token);
        this.records.delete(token);
        if (!record) {
            throw new Error('Asset move preflight token is invalid or already used. Run preflightMoveAsset again.');
        }
        return request => {
            const expected = record.request;
            if (
                record.epoch !== this.epoch ||
                request.source !== expected.source ||
                request.target !== expected.target ||
                request.sourceUuid !== expected.sourceUuid ||
                request.targetUuid !== expected.targetUuid ||
                request.sourceDB !== expected.sourceDB ||
                request.targetDB !== expected.targetDB ||
                JSON.stringify(observe(request)) !== JSON.stringify(record.observation)
            ) {
                throw new Error('Asset move state changed after preflight. Run preflightMoveAsset again.');
            }
        };
    }
}
