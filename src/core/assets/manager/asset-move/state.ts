import { createHash } from 'crypto';
import { closeSync, lstatSync, openSync, readSync, readdirSync, readlinkSync, type BigIntStats } from 'fs';
import { join } from 'path';

/** Local filesystem observations shared by move preflight and recovery. */
export interface MovePathState {
    identity: string;
    device: string;
    revision: string;
    /** Excludes ctime, which a rename itself can change. */
    continuity: string;
    directory: boolean;
    symlinks: string[];
}

/** Observes descendants without following symlinks or reading asset contents. */
export function readMovePathState(path: string): MovePathState | null {
    let root: BigIntStats;
    try {
        root = lstatSync(path, { bigint: true });
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return null;
        }
        throw error;
    }
    const symlinks: string[] = [];
    const hash = createHash('sha256');
    const continuity = createHash('sha256');
    const visit = (current: string, relative: string, state: typeof root): void => {
        hash.update(
            JSON.stringify([
                relative,
                state.dev.toString(),
                state.ino.toString(),
                state.mode.toString(),
                state.size.toString(),
                state.mtimeNs.toString(),
                state.ctimeNs.toString(),
            ]),
        );
        continuity.update(
            JSON.stringify([
                relative,
                state.dev.toString(),
                state.ino.toString(),
                state.mode.toString(),
                state.size.toString(),
                state.mtimeNs.toString(),
            ]),
        );
        if (state.isSymbolicLink()) {
            symlinks.push(current);
            const link = readlinkSync(current);
            hash.update(link);
            continuity.update(link);
        } else if (state.isDirectory()) {
            for (const name of readdirSync(current).sort()) {
                const child = join(current, name);
                visit(child, `${relative}/${name}`, lstatSync(child, { bigint: true }));
            }
        }
    };
    visit(path, '', root);
    return {
        identity: `${root.dev}:${root.ino}`,
        device: root.dev.toString(),
        revision: hash.digest('hex'),
        continuity: continuity.digest('hex'),
        directory: root.isDirectory(),
        symlinks,
    };
}

/** Cross-device renames change inode identity; compare streamed contents instead. */
export function readMoveContentDigest(path: string): string {
    const hash = createHash('sha256');
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    const visit = (current: string, relative: string): void => {
        const state = lstatSync(current);
        hash.update(
            JSON.stringify([relative, state.isDirectory(), state.isSymbolicLink(), state.isFile() ? state.size : null]),
        );
        if (state.isSymbolicLink()) {
            hash.update(readlinkSync(current));
        } else if (state.isDirectory()) {
            for (const name of readdirSync(current).sort()) visit(join(current, name), `${relative}/${name}`);
        } else {
            const file = openSync(current, 'r');
            try {
                let count: number;
                while ((count = readSync(file, buffer, 0, buffer.length, null)) > 0)
                    hash.update(buffer.subarray(0, count));
            } finally {
                closeSync(file);
            }
        }
    };
    visit(path, '');
    return hash.digest('hex');
}
