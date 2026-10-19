import { randomUUID } from 'crypto';
import { lstatSync, readdirSync, statSync } from 'fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'path';
import { readMoveContentDigest, readMovePathState, type MovePathState } from './state';

interface MoveFileEffects {
    rename(source: string, target: string, options: { overwrite: boolean }): Promise<void>;
    createDirectory(path: string): Promise<void>;
    remove(path: string, options: { useTrash: boolean }): Promise<void>;
}

interface OwnedPath {
    origin: string;
    path: string;
    state: MovePathState;
}

/** Whether child is the same path or lies below parent. */
function contains(parent: string, child: string): boolean {
    const path = relative(resolve(parent), resolve(child));
    return (
        path === '' ||
        (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`))
    );
}

/** Replaces a resource through reversible, non-overwriting provider renames. */
export async function moveAssetSourceWithRecovery(
    source: string,
    target: string,
    options: { overwrite: boolean; tempRoot: string },
    files: MoveFileEffects,
): Promise<void> {
    if (resolve(source) === resolve(target)) {
        return;
    }
    if (!options.overwrite && (readMovePathState(target) || readMovePathState(`${target}.meta`))) {
        throw new Error(`Asset move destination already exists: ${target}`);
    }
    const staging = join(options.tempRoot, 'move-temp', randomUUID());
    if (contains(source, staging) || contains(target, staging)) {
        throw new Error('Asset move recovery directory must be outside the source and target.');
    }
    const owned = new Map<string, OwnedPath>();
    const companions = new Map([
        [source, `${source}.meta`],
        [`${source}.meta`, source],
        [target, `${target}.meta`],
        [`${target}.meta`, target],
    ]);
    // Original entries remain unowned until their first verified rename. Their
    // expected states may advance only for known changes made by this operation.
    const expectedStates = new Map([...companions.keys()].map(path => [path, readMovePathState(path)]));
    const journal: Array<{ from: string; to: string; owner: OwnedPath }> = [];
    const createdDirectories = new Map<string, string>();

    const ensureParent = async (path: string): Promise<void> => {
        const missing: string[] = [];
        let parent = dirname(path);
        while (!isMoveParentDirectory(parent)) {
            missing.push(parent);
            parent = dirname(parent);
        }
        if (missing.length) {
            await files.createDirectory(missing[0]);
            for (const directory of missing) {
                const state = readDirectoryIdentity(directory);
                if (state) {
                    createdDirectories.set(directory, state);
                }
            }
        }
    };

    const renameOwnedPath = async (from: string, to: string, onMoved?: (owner: OwnedPath) => void): Promise<void> => {
        const before = readMovePathState(from);
        if (!before) {
            throw new Error(`Asset move source disappeared: ${from}`);
        }
        const existingOwner = owned.get(from);
        const expected = existingOwner ? existingOwner.state : expectedStates.get(from);
        if (!expected || expected.revision !== before.revision) {
            throw new Error(`Asset move recovery data changed: ${from}`);
        }
        const owner = existingOwner ?? { origin: from, path: from, state: expected };
        await ensureParent(to);
        if (readMovePathState(from)?.revision !== before.revision || readMovePathState(to)) {
            throw new Error(`Asset move paths changed before rename: ${from} -> ${to}`);
        }
        const targetDevice = statSync(dirname(to), { bigint: true }).dev.toString();
        const crossDevice = before.device !== targetDevice;
        const content = crossDevice ? readMoveContentDigest(from) : undefined;
        const recordCompletedRename = (): void => {
            const after = readMovePathState(to);
            const continuous =
                after &&
                (crossDevice
                    ? after.device === targetDevice && readMoveContentDigest(to) === content
                    : after.identity === before.identity && after.continuity === before.continuity);
            if (!continuous) {
                throw new Error(`Asset move data changed during rename. Recovery data retained at ${staging}`);
            }
            owner.path = to;
            owner.state = after;
            owned.delete(from);
            owned.set(to, owner);
            onMoved?.(owner);
        };
        try {
            await files.rename(from, to, { overwrite: false });
        } catch (error) {
            // A provider may reject after completing its rename. Track that completed
            // step only when the original filesystem object is still identifiable.
            if (!readMovePathState(from)) {
                try {
                    recordCompletedRename();
                } catch (validationError) {
                    throw new AggregateError(
                        [error, validationError],
                        `Asset move failed after its data changed. Recovery data retained at ${staging}`,
                    );
                }
            }
            throw error;
        }
        recordCompletedRename();
    };

    const rename = (from: string, to: string): Promise<void> =>
        renameOwnedPath(from, to, owner => journal.push({ from, to, owner }));

    const removeEmptyCreatedDirectories = async (): Promise<void> => {
        for (const [path, identity] of [...createdDirectories].sort((a, b) => b[0].length - a[0].length)) {
            if (readDirectoryIdentity(path) === identity && readdirSync(path).length === 0) {
                await files.remove(path, { useTrash: false });
                createdDirectories.delete(path);
            }
        }
    };

    try {
        const overlapping = contains(source, target) || contains(target, source);
        let currentSource = source;
        if (overlapping) {
            currentSource = join(staging, 'source');
            await rename(`${source}.meta`, `${currentSource}.meta`);
            await rename(source, currentSource);
            // Verified removal of a nested source changes its ancestor's contents.
            // Advance that expectation only if the ancestor itself was not replaced.
            if (contains(target, source)) {
                const ancestor = readMovePathState(target);
                if (!ancestor || ancestor.identity !== expectedStates.get(target)?.identity) {
                    throw new Error(`Asset move ancestor destination changed: ${target}`);
                }
                expectedStates.set(target, ancestor);
            }
        }
        if (readMovePathState(`${target}.meta`)) {
            await rename(`${target}.meta`, join(staging, 'target.meta'));
        }
        if (readMovePathState(target)) {
            await rename(target, join(staging, 'target'));
        }
        await rename(`${currentSource}.meta`, `${target}.meta`);
        await rename(currentSource, target);
    } catch (error) {
        const failures: unknown[] = [];
        for (const entry of journal.reverse()) {
            try {
                await removeEmptyCreatedDirectories();
                const state = readMovePathState(entry.to);
                if (
                    entry.owner.path !== entry.to ||
                    state?.revision !== entry.owner.state.revision ||
                    readMovePathState(entry.from)
                ) {
                    throw new Error(
                        `Asset move recovery refused to replace changed data: ${entry.to} -> ${entry.from}`,
                    );
                }
                const companion = companions.get(entry.from);
                if (companion) {
                    const current = readMovePathState(companion);
                    const companionOwner = owned.get(companion);
                    const expected =
                        companionOwner?.origin === companion ? companionOwner.state : expectedStates.get(companion);
                    if (current && current.revision !== expected?.revision) {
                        throw new Error(`Asset move recovery refused to pair metadata with changed data: ${companion}`);
                    }
                }
                await renameOwnedPath(entry.to, entry.from);
            } catch (recoveryError) {
                failures.push(recoveryError);
            }
        }
        try {
            await removeEmptyCreatedDirectories();
        } catch (cleanupError) {
            failures.push(cleanupError);
        }
        if (failures.length) {
            throw new AggregateError(
                [error, ...failures],
                `Asset move failed and could not be restored safely. Recovery data: ${staging}`,
            );
        }
        throw error;
    }

    // The move is committed. Preserve changed backups, or backups that cannot be
    // cleaned up, without falsely reporting that the source was not moved.
    if (createdDirectories.has(staging)) {
        try {
            if (readDirectoryIdentity(staging) !== createdDirectories.get(staging)) {
                throw new Error('Asset move recovery directory was replaced.');
            }
            const backups = [...owned.values()].filter(item => dirname(item.path) === staging);
            const actualNames = readdirSync(staging).sort();
            if (
                JSON.stringify(actualNames) !== JSON.stringify(backups.map(item => basename(item.path)).sort()) ||
                backups.some(item => readMovePathState(item.path)?.revision !== item.state.revision)
            ) {
                throw new Error('Asset move backup changed during the operation.');
            }
            await files.remove(staging, { useTrash: false });
        } catch (error) {
            console.warn(`Asset move completed; recovery data retained at ${staging}`, error);
        }
    }
}

/** Existing parents may be symlinks to directories; dangling links are not missing parents. */
function isMoveParentDirectory(path: string): boolean {
    let state;
    try {
        state = lstatSync(path);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return false;
        }
        throw error;
    }
    if (state.isSymbolicLink()) {
        state = statSync(path);
    }
    if (!state.isDirectory()) {
        throw new Error(`Asset move parent is not a directory: ${path}`);
    }
    return true;
}

/** Only directories created by this operation are eligible for cleanup, never symlinks. */
function readDirectoryIdentity(path: string): string | null {
    try {
        const state = lstatSync(path, { bigint: true });
        if (!state.isDirectory()) {
            return null;
        }
        return `${state.dev}:${state.ino}`;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return null;
        }
        throw error;
    }
}
