/**
 * Snapshot restore policy — defines which properties are safe to restore
 * during undo/redo operations.
 *
 * These constants must stay in sync with the dump encode functions:
 * - NODE_SNAPSHOT_RESTORE_PROPERTY_PATHS  ↔  encodeNode()  (encode.ts)
 * - COMPONENT_SNAPSHOT_RESTORE_SKIP_KEYS  ↔  encodeComponent()  (encode.ts)
 *
 * When adding/removing an editable property in encodeNode or
 * encodeComponent, update the corresponding constant here so that
 * undo/redo correctly covers the new property.
 */

/**
 * Node snapshot editable property paths (whitelist).
 *
 * Only these properties are restored from a node snapshot dump during
 * undo/redo.  Structural fields (uuid, parent, children, __comps__,
 * __type__, __prefab__, etc.) are intentionally excluded — they are
 * managed by node-structure commands, not snapshot commands.
 *
 * `name` and `locked` are also excluded here because they require
 * special handling (editor name-mapping notification / objFlags bit
 * manipulation) and are handled separately by the undo layer.
 */
export const NODE_SNAPSHOT_RESTORE_PROPERTY_PATHS = ['active', 'layer', 'mobility', 'position', 'rotation', 'scale'] as const;

/**
 * Component snapshot identity / editor-internal fields (blacklist).
 *
 * These keys are skipped when restoring a component snapshot dump.
 * All other keys in `dump.value` are treated as user-defined
 * properties and passed through `restoreProperty`.
 */
export const COMPONENT_SNAPSHOT_RESTORE_SKIP_KEYS = new Set(['uuid', 'node', '__scriptAsset', '__eventTargets']);
