import { AnimationClip, Node } from 'cc';
import type {
    IAnimationCurveDump,
    IAnimationPropertyType,
    IAnimationValue,
} from '../../../common';
import { getNodeBySystemPath, getNodePath } from './scene-node';
import {
    getClipSample,
    normalizeFrames,
} from './utils';
import {
    dumpPropertyTrack,
    copyCurveKeysTo,
    moveCurveKeys,
    queryTargetCurves,
    removeCurveKeys,
    restoreTrackKeyframes,
    setTrackKey,
    updateTrackKey,
} from './property-curve-keyframe';
import type { IDumpRealKeyDataOptions } from './real-curve-key-data';
import {
    applyTrackExtrapolation,
    createPropertyDescriptor,
    createPropertyDescriptorFromDump,
    createPropertyTrack,
    findPropertyTrack,
    getClipTracks,
    normalizePath,
    parsePropertyTrack,
    queryFirstRealCurve,
    removeSupportedPropertyTracks,
} from './property-curve-track';
import type {
    AnyTrack,
    ICopyPropertyKeysOperation,
    ICreatePropertyKeyOperation,
    IMovePropertyKeysOperation,
    IPropertyKeyFramesOperation,
    IPropertyTrackDescriptor,
    PropertyKind,
    IPropertyTarget,
    ISetPropertyCurveExtrapolationOperation,
    IUpdatePropertyKeyDataOperation,
} from './property-curve-types';

// After decoupling, the operation target must carry both the display path and a reliability flag
interface IResolvedPropertyTarget {
    nodePath: string;   // Display path used by animation tracks (joined from node.name)
    propKey: string;     // Property key (e.g. position, rotation)
    reliable: boolean;   // Whether the path was reliably resolved (false on lenient fallback, blocks writes)
    nodeUuid?: string;   // UUID of the target node, used for trackOwnership verification
}

/**
 * After name/path decoupling, animation track nodePath uses display paths (joined from node.name),
 * while NodePathManager maintains unique system paths. This cache maps multiple key types to
 * display paths, so tracks of deleted nodes can still be located and cleaned up via cached paths.
 */
interface ICachedNodePath {
    uuid: string;          // Node UUID, retained after node deletion
    displayPath: string;   // Display path (joined from node.name), used as animation track nodePath
    ambiguous: boolean;    // Whether the same display path maps to multiple UUIDs (same-name siblings)
}

// Per-rootNode (scene/prefab) cache with four key types mapping to the same ICachedNodePath
interface INodePathCache {
    byUuid: Map<string, ICachedNodePath>;                  // UUID -> cache entry (most precise)
    byAbsoluteSystemPath: Map<string, ICachedNodePath>;    // Absolute system path -> cache entry
    byRelativeSystemPath: Map<string, ICachedNodePath>;    // Relative system path (relative to rootNode) -> cache entry
    byDisplayPath: Map<string, Set<ICachedNodePath>>;      // Display path -> entry set (Set for same-name sibling detection)
    // Records which node UUID owns each animation track, for precise matching with same-name siblings
    // key = JSON.stringify([nodePath, propKey]), value = nodeUuid
    trackOwners: WeakMap<AnimationClip, Map<string, string>>;
}

// WeakMap keyed by rootNode: cache is auto-collected when scene/prefab closes and rootNode is GC'd
const displayPathCache = new WeakMap<Node, INodePathCache>();

// Cache a single node's display path by UUID (called externally on node creation/move)
export function cacheNodeDisplayPath(rootNode: Node, nodeUuid: string): void {
    const target = findNodeByUuid(rootNode, nodeUuid); // Recursively find the node instance
    if (target) {
        cacheNodeDisplayPaths(rootNode, target); // Cache this node and all its children
    }
}

// Recursively cache display paths for all nodes under subtreeRoot, joined from node.name
export function cacheNodeDisplayPaths(rootNode: Node, subtreeRoot: Node = rootNode): void {
    // Compute the display path prefix of subtreeRoot relative to rootNode
    const subtreePath = findRelativeNodePathByUuid(rootNode, subtreeRoot.uuid);
    if (subtreePath === null) {
        return; // subtreeRoot is not within rootNode's subtree, skip
    }

    const visit = (node: Node, displayPath: string): void => {
        cacheDisplayPathEntry(rootNode, node, displayPath); // Write into multi-key cache
        for (const child of node.children) {
            // Child display path = parent path + "/" + child.name (empty prefix for root)
            visit(child, displayPath ? `${displayPath}/${child.name}` : child.name);
        }
    };
    visit(subtreeRoot, subtreePath);
}

// Clear cache when scene/prefab is closed or reloaded
export function clearNodeDisplayPathCache(rootNode: Node): void {
    displayPathCache.delete(rootNode);
}

export interface IAnimationPropertyMetadata {
    type: IAnimationPropertyType;
    valueCtor?: new () => unknown;
}

export interface IPropertyCurveMetadataContext {
    rootNode?: Node;
    queryPropertyMetadata?: (nodePath: string, propKey: string) => IAnimationPropertyMetadata | null;
}

// trackOwners snapshot type: key = JSON.stringify([nodePath, propKey]), value = nodeUuid
export type IPropertyTrackOwnersSnapshot = Record<string, string>;

// Serialize the current clip's track ownership map into a persistable snapshot object.
// Used by undo/redo: capture before operation, restore after undo to recover precise track-node bindings.
// Solves: after undo with same-name siblings, we need to know exactly which track belongs to which node.
export function capturePropertyTrackOwners(
    rootNode: Node, clip: AnimationClip,
): IPropertyTrackOwnersSnapshot {
    // Retrieve the trackOwners Map for this clip from cache
    const owners = displayPathCache.get(rootNode)?.trackOwners.get(clip);
    if (!owners) {
        return {}; // No ownership records, return empty snapshot
    }

    // Only retain ownership records for tracks that still exist in the clip (discard deleted tracks)
    const existingKeys = queryPropertyTrackKeys(clip);
    const snapshot: IPropertyTrackOwnersSnapshot = {};
    for (const [key, uuid] of owners) {
        if (existingKeys.has(key)) {
            snapshot[key] = uuid; // Track still exists, preserve ownership
        }
    }
    return snapshot;
}

// Restore track ownership map from a snapshot, replacing the current clip's trackOwners.
// Typical scenario: after undo restores to a historical state, rebuild precise track-node bindings.
export function restorePropertyTrackOwners(
    rootNode: Node, clip: AnimationClip, snapshot: IPropertyTrackOwnersSnapshot,
): void {
    const cache = getNodePathCache(rootNode);
    const existingKeys = queryPropertyTrackKeys(clip); // Tracks currently in the clip
    const owners = new Map<string, string>();
    for (const [key, uuid] of Object.entries(snapshot)) {
        // Only restore tracks that still exist in the clip; ignore stale snapshot entries
        if (existingKeys.has(key) && uuid) {
            owners.set(key, uuid);
        }
    }
    if (owners.size > 0) {
        cache.trackOwners.set(clip, owners); // Replace trackOwners entirely
    } else {
        cache.trackOwners.delete(clip); // Remove empty Map to avoid stale entries
    }
}

// Operation context: after decoupling, rootNode (scene/prefab root) and rootPath (root's system path) are needed
// to convert nodeUuid/nodePath in operations into display paths used by animation tracks
export interface IPropertyCurveOperationContext extends IPropertyCurveMetadataContext {
    rootNode: Node;    // Root node reference for the animation editing session
    rootPath: string;  // System path of rootNode in the scene hierarchy
}

export function dumpPropertyCurves(clip: AnimationClip, options: IDumpRealKeyDataOptions & IPropertyCurveMetadataContext = {}): IAnimationCurveDump[] {
    const curves: IAnimationCurveDump[] = [];
    for (const track of getClipTracks(clip)) {
        const parsed = parsePropertyTrack(track);
        if (!parsed) {
            continue;
        }

        const descriptor = applyPropertyMetadata(options, parsed.nodePath, parsed.descriptor, track);
        const curveDump = dumpPropertyTrack(clip, track, descriptor, options);
        if (curveDump) {
            curves.push({
                nodePath: parsed.nodePath,
                key: descriptor.propKey,
                ...curveDump,
            });
        }
    }
    return curves;
}

export function createPropertyKey(
    clip: AnimationClip,
    context: IPropertyCurveOperationContext,
    operation: ICreatePropertyKeyOperation,
): boolean {
    // Core decoupling: resolve nodeUuid/nodePath from the operation into a display path
    const target = resolvePropertyTarget(context, operation);
    const frame = Number(operation.frame);
    if (!target || !Number.isFinite(frame) || frame < 0) {
        return false;
    }

    // Find existing track using the resolved display path
    const matchedTrack = findPropertyTrack(clip, target.nodePath, target.propKey);
    const existedTrack = matchedTrack
        ? verifyTrackOwnership(clip, matchedTrack, target.reliable, context.rootNode, target.nodeUuid)
        : null;
    if (matchedTrack && !existedTrack) {
        return false;
    }
    const descriptor = existedTrack
        ? queryTrackDescriptor(context, existedTrack)
        : createDescriptor(context, target, operation.value);
    if (!descriptor) {
        return false;
    }

    const track = existedTrack || createPropertyTrack(clip, target.nodePath, descriptor);
    const time = frame / getClipSample(clip);
    const changed = setTrackKey(
        track, descriptor, time, operation.value, operation.channel, operation.keyData ?? operation.curveData,
    );
    // Establish ownership for both new tracks and safely adopted legacy tracks.
    if (changed) {
        recordTrackOwnership(context.rootNode, clip, track, target.nodeUuid);
    }
    return changed;
}

export function addPropertyCurve(
    clip: AnimationClip,
    context: IPropertyCurveOperationContext,
    operation: IPropertyTarget & { value?: IAnimationValue },
): boolean {
    // Core decoupling: nodeUuid/nodePath -> display path
    const target = resolvePropertyTarget(context, operation);
    if (!target) {
        return false;
    }

    // Match existing track by display path
    const matchedTrack = findPropertyTrack(clip, target.nodePath, target.propKey);
    if (matchedTrack) {
        const ownedTrack = verifyTrackOwnership(
            clip, matchedTrack, target.reliable, context.rootNode, target.nodeUuid,
        );
        if (!ownedTrack) {
            return false;
        }
        recordTrackOwnership(context.rootNode, clip, ownedTrack, target.nodeUuid);
        return true; // Track already exists and belongs to this node.
    }

    const descriptor = createDescriptor(context, target, operation.value);
    if (!descriptor) {
        return false;
    }

    const track = createPropertyTrack(clip, target.nodePath, descriptor);
    // Record track ownership on creation
    recordTrackOwnership(context.rootNode, clip, track, target.nodeUuid);
    return true;
}

export function updatePropertyKey(
    clip: AnimationClip,
    context: IPropertyCurveOperationContext,
    operation: ICreatePropertyKeyOperation,
): boolean {
    const target = resolvePropertyTarget(context, operation);
    const frame = Number(operation.frame);
    if (!target || !Number.isFinite(frame) || frame < 0) {
        return false;
    }

    const matchedTrack = findPropertyTrack(clip, target.nodePath, target.propKey);
    const track = matchedTrack
        ? verifyTrackOwnership(clip, matchedTrack, target.reliable, context.rootNode, target.nodeUuid)
        : null;
    if (matchedTrack && !track) {
        return false;
    }
    const descriptor = track ? queryTrackDescriptor(context, track) : null;
    if (track && descriptor) {
        const changed = updateTrackKey(
            track, descriptor, frame / getClipSample(clip), operation.value,
            operation.channel, operation.keyData ?? operation.curveData,
        );
        if (changed) {
            recordTrackOwnership(context.rootNode, clip, track, target.nodeUuid);
        }
        return changed;
    }

    return createPropertyKey(clip, context, operation);
}

export function updatePropertyKeyData(
    clip: AnimationClip,
    context: IPropertyCurveOperationContext,
    operation: IUpdatePropertyKeyDataOperation,
): boolean {
    const target = resolvePropertyTarget(context, operation);
    const frame = Number(operation.frame);
    if (!target || !Number.isFinite(frame) || frame < 0) {
        return false;
    }

    const matchedTrack = findPropertyTrack(clip, target.nodePath, target.propKey);
    const track = matchedTrack
        ? verifyTrackOwnership(clip, matchedTrack, target.reliable, context.rootNode, target.nodeUuid)
        : null;
    const descriptor = track ? queryTrackDescriptor(context, track) : null;
    if (!track || !descriptor) {
        return false;
    }

    const changed = updateTrackKey(
        track, descriptor, frame / getClipSample(clip), undefined,
        operation.channel, operation.keyData ?? operation.curveData,
    );
    if (changed) {
        recordTrackOwnership(context.rootNode, clip, track, target.nodeUuid);
    }
    return changed;
}

export function removePropertyKey(
    clip: AnimationClip,
    context: IPropertyCurveOperationContext,
    operation: IPropertyKeyFramesOperation,
): boolean {
    // lenient=true: deletion scenario allows fallback to cache/string derivation
    const target = resolvePropertyTarget(context, operation, true);
    const frames = normalizeFrames(operation.frames);
    if (!target || frames.length === 0) {
        return false;
    }

    let track = findPropertyTrack(clip, target.nodePath, target.propKey);
    if (track) {
        // Core decoupling: verify the found track truly belongs to the target node,
        // preventing accidental deletion of a same-name sibling's track
        track = verifyTrackOwnership(clip, track, target.reliable, context.rootNode, target.nodeUuid);
    }
    const descriptor = track ? queryTrackDescriptor(context, track) : null;
    if (!track || !descriptor) {
        return false;
    }

    let changed = false;
    for (const curve of queryTargetCurves(track, descriptor, operation.channel)) {
        changed = removeCurveKeys(clip, curve, frames) || changed;
    }
    if (changed) {
        recordTrackOwnership(context.rootNode, clip, track, target.nodeUuid);
    }
    return changed;
}

export function removePropertyKeys(
    clip: AnimationClip,
    context: IPropertyCurveOperationContext,
    operation: IPropertyKeyFramesOperation,
): boolean {
    return removePropertyKey(clip, context, operation);
}

export function removePropertyCurve(
    clip: AnimationClip,
    context: IPropertyCurveOperationContext,
    operation: IPropertyTarget,
): boolean {
    // lenient=true: deletion scenario allows fallback to cache/string derivation
    const target = resolvePropertyTarget(context, operation, true);
    if (!target) {
        return false;
    }

    let track = findPropertyTrack(clip, target.nodePath, target.propKey);
    if (track) {
        // Core decoupling: verify track ownership to prevent deleting a same-name sibling's track
        track = verifyTrackOwnership(clip, track, target.reliable, context.rootNode, target.nodeUuid);
    }
    if (!track) {
        return false;
    }

    const tracks = getClipTracks(clip);
    for (let index = tracks.length - 1; index >= 0; index--) {
        if (clip.getTrack(index) === track) {
            clip.removeTrack(index);
            // Clean up ownership record after track removal
            forgetTrackOwnership(context.rootNode, clip, track);
            return true;
        }
    }
    return false;
}

export function movePropertyKeys(
    clip: AnimationClip,
    context: IPropertyCurveOperationContext,
    operation: IMovePropertyKeysOperation,
): boolean {
    const target = resolvePropertyTarget(context, operation);
    const frames = normalizeFrames(operation.frames);
    const offset = Number(operation.offset);
    if (!target || frames.length === 0 || !Number.isFinite(offset)) {
        return false;
    }

    const matchedTrack = findPropertyTrack(clip, target.nodePath, target.propKey);
    const track = matchedTrack
        ? verifyTrackOwnership(clip, matchedTrack, target.reliable, context.rootNode, target.nodeUuid)
        : null;
    const descriptor = track ? queryTrackDescriptor(context, track) : null;
    if (!track || !descriptor) {
        return false;
    }

    let changed = false;
    for (const curve of queryTargetCurves(track, descriptor, operation.channel)) {
        changed = moveCurveKeys(clip, curve, frames, offset) || changed;
    }
    if (changed) {
        recordTrackOwnership(context.rootNode, clip, track, target.nodeUuid);
    }
    return changed;
}

export function copyPropertyKeysTo(
    clip: AnimationClip,
    context: IPropertyCurveOperationContext,
    operation: ICopyPropertyKeysOperation,
): boolean {
    const target = resolvePropertyTarget(context, operation);
    const frames = normalizeFrames(operation.frames);
    const dstFrame = Number(operation.dstFrame);
    if (!target || frames.length === 0 || !Number.isFinite(dstFrame)) {
        return false;
    }

    const matchedTrack = findPropertyTrack(clip, target.nodePath, target.propKey);
    const track = matchedTrack
        ? verifyTrackOwnership(clip, matchedTrack, target.reliable, context.rootNode, target.nodeUuid)
        : null;
    const descriptor = track ? queryTrackDescriptor(context, track) : null;
    if (!track || !descriptor) {
        return false;
    }

    let changed = false;
    for (const curve of queryTargetCurves(track, descriptor, operation.channel)) {
        changed = copyCurveKeysTo(clip, curve, frames, dstFrame) || changed;
    }
    if (changed) {
        recordTrackOwnership(context.rootNode, clip, track, target.nodeUuid);
    }
    return changed;
}

export function setPropertyCurveExtrapolation(
    clip: AnimationClip,
    context: IPropertyCurveOperationContext,
    operation: ISetPropertyCurveExtrapolationOperation,
): boolean {
    const target = resolvePropertyTarget(context, operation);
    if (!target) {
        return false;
    }

    const matchedTrack = findPropertyTrack(clip, target.nodePath, target.propKey);
    const track = matchedTrack
        ? verifyTrackOwnership(clip, matchedTrack, target.reliable, context.rootNode, target.nodeUuid)
        : null;
    if (!track || !queryFirstRealCurve(track)) {
        return false;
    }

    applyTrackExtrapolation(track, operation.preExtrap, operation.postExtrap);
    recordTrackOwnership(context.rootNode, clip, track, target.nodeUuid);
    return true;
}

export function replacePropertyCurves(clip: AnimationClip, curves: IAnimationCurveDump[]): boolean {
    removeSupportedPropertyTracks(clip);

    for (const curve of curves) {
        const descriptor = createPropertyDescriptorFromDump(curve);
        if (!descriptor) {
            continue;
        }

        const keyframes = Array.isArray(curve.keyframes) ? [...curve.keyframes].sort((a, b) => a.frame - b.frame) : [];
        const channelDumps = Array.isArray(curve.channels) ? curve.channels : [];
        const track = createPropertyTrack(clip, curve.nodePath, descriptor);
        applyTrackExtrapolation(track, curve.preExtrap, curve.postExtrap);
        if (!restoreTrackKeyframes(clip, track, descriptor, keyframes, channelDumps)) {
            return false;
        }
    }

    return true;
}

/**
 * Three-layer verification to prevent deleting/modifying the wrong track
 * (when same-name siblings cause system path != display path):
 * 1. Live node check: the live node resolved from track's nodePath must match the operation target UUID
 * 2. Ownership record check: the UUID in trackOwners cache must match
 * 3. Reliability fallback: if path resolution was unreliable (lenient fallback), reject outright
 */
function verifyTrackOwnership(
    clip: AnimationClip, track: AnyTrack, reliable: boolean, rootNode: Node, nodeUuid?: string,
): AnyTrack | null {
    // Layer 1: find the live node via the track's recorded display path
    const parsed = parsePropertyTrack(track);
    const trackLabel = parsed
        ? `${parsed.nodePath || '<root>'}.${parsed.descriptor.propKey}`
        : '<unknown>';
    if (parsed && parsed.nodePath) {
        const liveNode = rootNode.getChildByPath(parsed.nodePath); // Look up live node by display path
        // If a live node exists but its UUID doesn't match the operation target -> track belongs to another same-name node, reject
        if (liveNode && nodeUuid && liveNode.uuid !== nodeUuid) {
            console.warn(
                `Animation: rejected operation on track "${trackLabel}" because its display path resolves to node `
                + `"${liveNode.uuid}", but the requested target is "${nodeUuid}".`,
            );
            return null;
        }
    }
    // Layer 2: check trackOwners ownership record
    const key = createPropertyTrackKey(track); // JSON.stringify([nodePath, propKey])
    const ownerUuid = key
        ? displayPathCache.get(rootNode)?.trackOwners.get(clip)?.get(key)
        : undefined;
    // If both operation and ownership record have UUIDs, do exact matching
    if (nodeUuid && ownerUuid) {
        if (ownerUuid !== nodeUuid) {
            console.warn(
                `Animation: rejected operation on track "${trackLabel}" because it is owned by node `
                + `"${ownerUuid}", but the requested target is "${nodeUuid}".`,
            );
            return null;
        }
        return track;
    }
    // Layer 3: no ownership record — check whether path resolution was reliable
    // reliable=false means the path came from lenient fallback (string derivation), untrustworthy -> reject
    if (!reliable) {
        console.warn(
            `Animation: rejected operation on track "${trackLabel}" because the target path could not be resolved reliably.`,
        );
        return null;
    }
    return track; // Path is reliable and no contradictory evidence -> allow operation
}

// Record the owning node UUID when a track is created (written to trackOwners).
// Used by verifyTrackOwnership and capturePropertyTrackOwners downstream.
function recordTrackOwnership(
    rootNode: Node, clip: AnimationClip, track: AnyTrack, nodeUuid?: string,
): void {
    const key = createPropertyTrackKey(track); // JSON.stringify([nodePath, propKey])
    if (nodeUuid && key) {
        const cache = getNodePathCache(rootNode);
        let owners = cache.trackOwners.get(clip);
        if (!owners) {
            owners = new Map(); // First trackOwners creation for this clip
            cache.trackOwners.set(clip, owners);
        }
        owners.set(key, nodeUuid); // trackKey -> nodeUuid
    }
}

// Clean up ownership record after track removal; prevents stale records from interfering with future verification
function forgetTrackOwnership(rootNode: Node, clip: AnimationClip, track: AnyTrack): void {
    const key = createPropertyTrackKey(track);
    const owners = displayPathCache.get(rootNode)?.trackOwners.get(clip);
    if (!key || !owners) {
        return;
    }
    owners.delete(key);
    // Remove the entire Map when empty to avoid stale entries
    if (owners.size === 0) {
        displayPathCache.get(rootNode)?.trackOwners.delete(clip);
    }
}

// Collect the set of unique track keys in the clip, used by capture/restore to filter out deleted tracks
function queryPropertyTrackKeys(clip: AnimationClip): Set<string> {
    const keys = new Set<string>();
    for (const track of getClipTracks(clip)) {
        const key = createPropertyTrackKey(track);
        if (key) {
            keys.add(key);
        }
    }
    return keys;
}

// Track unique key = JSON.stringify([nodePath, propKey])
// A node's property has exactly one track, so [nodePath, propKey] is a unique identifier
function createPropertyTrackKey(track: AnyTrack): string | null {
    const parsed = parsePropertyTrack(track);
    return parsed ? JSON.stringify([parsed.nodePath, parsed.descriptor.propKey]) : null;
}

// Wrap operation's nodeUuid/nodePath + propKey into IResolvedPropertyTarget.
// lenient=true allows fallback (deletion scenario) but marks reliable=false to block write operations.
function resolvePropertyTarget(context: IPropertyCurveOperationContext, operation: IPropertyTarget, lenient = false): IResolvedPropertyTarget | null {
    const result = resolveRelativeNodePath(context, operation, lenient);
    if (result === null) {
        return null;
    }

    return {
        nodePath: result.path,      // Display path used by animation tracks
        propKey: operation.propKey,  // Pass through the property key from the operation
        reliable: result.reliable,  // Whether path resolution was reliable
        nodeUuid: result.nodeUuid,  // Target node UUID
    };
}

function createDescriptor(
    context: IPropertyCurveOperationContext,
    target: IResolvedPropertyTarget,
    value?: IAnimationValue,
    trackKind?: PropertyKind,
    track?: AnyTrack,
): IPropertyTrackDescriptor | null {
    const metadata = context.queryPropertyMetadata?.(target.nodePath, target.propKey) || undefined;
    return createPropertyDescriptor(target.propKey, value, trackKind, track, metadata?.type, metadata?.valueCtor);
}

function queryTrackDescriptor(context: IPropertyCurveMetadataContext, track: AnyTrack): IPropertyTrackDescriptor | null {
    const parsed = parsePropertyTrack(track);
    return parsed ? applyPropertyMetadata(context, parsed.nodePath, parsed.descriptor, track) : null;
}

function applyPropertyMetadata(
    context: IPropertyCurveMetadataContext,
    nodePath: string,
    descriptor: IPropertyTrackDescriptor,
    track?: AnyTrack,
): IPropertyTrackDescriptor {
    const metadata = context.queryPropertyMetadata?.(nodePath, descriptor.propKey) || undefined;
    if (!metadata) {
        return descriptor;
    }
    return createPropertyDescriptor(descriptor.propKey, undefined, descriptor.kind, track, metadata.type, metadata.valueCtor) || {
        ...descriptor,
        type: metadata.type,
        valueCtor: metadata.valueCtor,
    };
}

// Path resolution result
interface IResolvedNodePath {
    path: string;       // Display path used by animation tracks
    reliable: boolean;  // Whether resolved precisely (false = from lenient fallback)
    nodeUuid?: string;  // Resolved node UUID
}

// Get or lazily create the cache instance for a given rootNode
function getNodePathCache(rootNode: Node): INodePathCache {
    let cache = displayPathCache.get(rootNode);
    if (!cache) {
        cache = {
            byUuid: new Map(),
            byAbsoluteSystemPath: new Map(),
            byRelativeSystemPath: new Map(),
            byDisplayPath: new Map(),
            trackOwners: new WeakMap(), // WeakMap<AnimationClip>: auto-cleaned when clip is GC'd
        };
        displayPathCache.set(rootNode, cache);
    }
    return cache;
}

// Build a multi-key cache entry for a node (UUID / absolute system path / relative system path / display path).
// Cache persists after node deletion, used by findCachedPathBySystemPath and lenient fallback.
function cacheDisplayPathEntry(rootNode: Node, node: Node, displayPath: string): void {
    const cache = getNodePathCache(rootNode);
    // Reuse existing entry if displayPath hasn't changed (preserves ambiguous state etc.)
    const previousEntry = cache.byUuid.get(node.uuid);
    removeCachedSystemPathEntries(cache, node.uuid);
    if (previousEntry && previousEntry.displayPath !== displayPath) {
        removePreviousDisplayPathEntry(rootNode, cache, previousEntry);
    }
    const entry = previousEntry?.displayPath === displayPath
        ? previousEntry
        : { uuid: node.uuid, displayPath, ambiguous: false };
    // Detect same-name siblings at this path (affects animation binding stability)
    entry.ambiguous ||= displayPath ? hasSameNameSiblings(rootNode, displayPath) : false;

    if (displayPath) {
        // byDisplayPath uses Set: a single display path may map to multiple UUIDs (same-name siblings)
        let entries = cache.byDisplayPath.get(displayPath);
        if (!entries) {
            entries = new Set();
            cache.byDisplayPath.set(displayPath, entries);
        }
        // Different UUIDs under the same display path -> mark both as ambiguous
        for (const cached of entries) {
            if (cached.uuid !== node.uuid) {
                cached.ambiguous = true;
                entry.ambiguous = true;
            }
        }
        entries.add(entry);
    }
    cache.byUuid.set(node.uuid, entry); // UUID -> entry

    // Record system path mapping (getNodePath returns the unique path maintained by NodePathManager)
    const systemPath = normalizePath(getNodePath(node));
    if (!systemPath) {
        return;
    }
    cache.byAbsoluteSystemPath.set(systemPath, entry); // Absolute system path -> entry

    // Compute and cache the system path relative to rootNode
    const rootSystemPath = normalizePath(getNodePath(rootNode));
    const relativeSystemPath = toRelativePathByString(rootSystemPath, systemPath);
    cache.byRelativeSystemPath.set(relativeSystemPath, entry); // Relative system path -> entry
}

function removeCachedSystemPathEntries(cache: INodePathCache, nodeUuid: string): void {
    for (const [path, cached] of cache.byAbsoluteSystemPath) {
        if (cached.uuid === nodeUuid) {
            cache.byAbsoluteSystemPath.delete(path);
        }
    }
    for (const [path, cached] of cache.byRelativeSystemPath) {
        if (cached.uuid === nodeUuid) {
            cache.byRelativeSystemPath.delete(path);
        }
    }
}

function removePreviousDisplayPathEntry(
    rootNode: Node,
    cache: INodePathCache,
    previousEntry: ICachedNodePath,
): void {
    if (!previousEntry.displayPath) {
        return;
    }
    const entries = cache.byDisplayPath.get(previousEntry.displayPath);
    if (!entries) {
        return;
    }
    entries.delete(previousEntry);
    if (entries.size === 0) {
        cache.byDisplayPath.delete(previousEntry.displayPath);
        return;
    }

    const ambiguousByHistory = entries.size > 1;
    for (const cached of entries) {
        const liveNode = findNodeByUuid(rootNode, cached.uuid);
        cached.ambiguous = ambiguousByHistory || Boolean(
            liveNode && hasSameNameSiblings(rootNode, cached.displayPath),
        );
    }
}

// Reverse-lookup a deleted node's former display path via its system path in cache.
// Use case: after a node is deleted, animation operations only have the system path (from nodePath field);
// this function finds the node's former display path to locate the corresponding animation track.
function findCachedPathBySystemPath(rootNode: Node, rootPath: string, nodePath: string): ICachedNodePath | null {
    const cache = displayPathCache.get(rootNode);
    if (!cache) {
        return null; // No cache means paths were never cached for this rootNode
    }
    const normalizedRoot = normalizePath(rootPath);
    const normalizedPath = normalizePath(nodePath);
    // Determine if nodePath is absolute or relative, and use the corresponding cache Map
    const isAbsolute = Boolean(
        normalizedRoot && (normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`)),
    );
    return (isAbsolute
        ? cache.byAbsoluteSystemPath.get(normalizedPath)   // Absolute path -> byAbsoluteSystemPath
        : cache.byRelativeSystemPath.get(normalizedPath))  // Relative path -> byRelativeSystemPath
        ?? null;
}

/**
 * Core path resolution pipeline: resolves nodeUuid/nodePath from an operation
 * into the display path used by animation tracks.
 *
 * Resolution strategy (highest to lowest priority):
 * 1. Has nodeUuid -> traverse node tree to find node -> join display path from node.name
 * 2. No nodeUuid -> treat nodePath as system path -> getNodeBySystemPath -> get UUID -> same as strategy 1
 * 3. Node not found + lenient=true -> fall back to cache or string derivation, mark reliable=false
 * 4. Node not found + lenient=false -> return null to reject the operation
 *
 * lenient=true is only used for deletion scenarios (removePropertyKey/removePropertyCurve),
 * allowing tracks of deleted nodes to be found via cache, but reliable=false triggers
 * verifyTrackOwnership rejection.
 */
function resolveRelativeNodePath(
    context: IPropertyCurveOperationContext, operation: IPropertyTarget, lenient = false,
): IResolvedNodePath | null {
    let targetUuid = operation.nodeUuid;
    // Branch A: operation only provides nodePath (system path), no UUID
    if (!targetUuid) {
        const nodePath = normalizePath(operation.nodePath || '');
        if (!nodePath) {
            // Empty path = the root node itself
            return { path: '', reliable: true, nodeUuid: context.rootNode.uuid };
        }
        // Find a live node by system path (exact match first, then case-insensitive fallback)
        const node = getNodeBySystemPath(context.rootNode, context.rootPath, nodePath);
        if (!node) {
            // Node not found (may have been deleted)
            if (lenient) {
                // Lenient fallback 1: reverse-lookup the former display path from cache
                const cached = findCachedPathBySystemPath(context.rootNode, context.rootPath, nodePath);
                if (cached) {
                    return {
                        path: cached.displayPath,
                        reliable: !cached.ambiguous, // Unreliable when same-name siblings exist
                        nodeUuid: cached.uuid,
                    };
                }
                // Lenient fallback 2: pure string derivation (strip rootPath prefix)
                // reliable=false causes verifyTrackOwnership to reject misoperations
                return { path: toRelativePathByString(context.rootPath, nodePath), reliable: false };
            }
            return null; // Non-lenient mode, reject
        }
        targetUuid = node.uuid; // Node is alive -> get its UUID and proceed to branch B
    }

    // Branch B: have UUID, traverse node tree to build display path (joined from node.name)
    const relativePath = findRelativeNodePathByUuid(context.rootNode, targetUuid);
    if (relativePath === null) {
        // UUID's node is not in rootNode's subtree (deleted or outside current editing scope)
        if (lenient) {
            // Lenient fallback 3: retrieve former display path from UUID cache
            const cached = displayPathCache.get(context.rootNode)?.byUuid.get(targetUuid);
            if (cached) {
                return {
                    path: cached.displayPath,
                    reliable: !cached.ambiguous,
                    nodeUuid: cached.uuid,
                };
            }
            // Lenient fallback 4: string derivation from the operation's original nodePath
            if (operation.nodePath) {
                return {
                    path: toRelativePathByString(context.rootPath, operation.nodePath),
                    reliable: false,
                    nodeUuid: targetUuid,
                };
            }
        }
        return null;
    }

    // Node is alive and display path found -> update cache (available for future deletions)
    const targetNode = findNodeByUuid(context.rootNode, targetUuid);
    if (targetNode) {
        cacheDisplayPathEntry(context.rootNode, targetNode, relativePath);
    }

    // Root node itself: display path is empty
    if (relativePath === '') {
        return { path: '', reliable: true, nodeUuid: targetUuid };
    }

    // Same-name sibling detection: animation binding is unstable when display path has same-name siblings
    if (hasSameNameSiblings(context.rootNode, relativePath)) {
        if (!lenient) {
            // Non-deletion scenario (create/update keyframes): reject with warning
            console.warn(
                `Animation: path "${relativePath}" contains same-name siblings. `
                + `Animation binding is unstable because sibling order may change.`,
            );
            return null;
        }
        // Deletion scenario: verify the display path resolves to the intended target node
        const resolved = context.rootNode.getChildByPath(relativePath);
        if (!resolved || resolved.uuid !== targetUuid) {
            return null; // Path resolved to the wrong same-name sibling -> reject
        }
    }

    return { path: relativePath, reliable: true, nodeUuid: targetUuid };
}

// Detect whether the display path contains same-name sibling nodes.
// Animation tracks use display paths (joined from node.name); same-name siblings create ambiguity
// (e.g., two children both named "Enemy" -> display path "Enemy" can't distinguish which one).
// getChildByPath("Enemy") returns the first match, but sibling order may change.
export function hasSameNameSiblings(rootNode: Node, relativePath: string): boolean {
    const segments = relativePath.split('/');
    let current: Node = rootNode;
    for (const segment of segments) {
        let count = 0;
        let next: Node | null = null;
        for (const child of current.children) {
            if (child.name === segment) {
                count++;
                if (!next) {
                    next = child; // Remember the first matching child
                }
                if (count > 1) {
                    return true; // Found a second same-name child -> has same-name siblings
                }
            }
        }
        if (!next) {
            return true; // Path broken mid-way (no matching node for segment), treat as unsafe
        }
        current = next; // Descend to next level
    }
    return false; // No same-name siblings at any level
}

// Pure string operation: strip rootPath prefix from an absolute path to get a relative path.
// Does not depend on the node tree (node may be deleted); only used for lenient fallback.
function toRelativePathByString(rootPath: string, nodePath: string): string {
    const normalized = normalizePath(nodePath);
    if (!normalized) return '';                     // Empty path
    const normalizedRoot = normalizePath(rootPath);
    if (!normalizedRoot) return normalized;         // No root path, return as-is
    if (normalized === normalizedRoot) return '';   // Path equals root -> relative path is empty
    if (normalized.startsWith(`${normalizedRoot}/`)) return normalized.slice(normalizedRoot.length + 1); // Strip root prefix + "/"
    return normalized;                             // Doesn't start with root -> already relative
}

// Recursively find a node by UUID in the tree and build its display path (joined from node.name).
// Returns the display path relative to `node`; root node returns `prefix` (initially empty string).
// Returns null if UUID is not in the subtree.
export function findRelativeNodePathByUuid(node: Node, uuid: string, prefix = ''): string | null {
    if (node.uuid === uuid) {
        return prefix; // Found the target node, return accumulated display path
    }
    for (const child of node.children) {
        // Join using child.name (display name), not system path
        const path = prefix ? `${prefix}/${child.name}` : child.name;
        const result = findRelativeNodePathByUuid(child, uuid, path);
        if (result !== null) {
            return result;
        }
    }
    return null; // Not found
}

// Recursively find a node instance by UUID in the tree.
// Similar to findRelativeNodePathByUuid but returns the node object instead of a path string.
function findNodeByUuid(node: Node, uuid: string): Node | null {
    if (node.uuid === uuid) {
        return node;
    }
    for (const child of node.children) {
        const result = findNodeByUuid(child, uuid);
        if (result) {
            return result;
        }
    }
    return null;
}
