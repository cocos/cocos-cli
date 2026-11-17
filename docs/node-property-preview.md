# Node property preview transactions

The Scene Runtime publishes Node.previewSetProperty, Node.cancelPreviewSetProperty,
and Node.commitPreviewSetProperty through the generated session allowlist. The
shared scene editor facade consumes this allowlist; clients must not call private RPCs.

## Commands

Send a Scene Runtime command with module Node, the method below and a single options argument:

- previewSetProperty: { uuid, path: 'name', dump: { type: 'String', value: draft }, previewId }
- cancelPreviewSetProperty: { uuid, path: 'name', previewId }
- commitPreviewSetProperty: { uuid, path: 'name', previewId }

The UUID overload returns { success, uuid, previewId, path, previousPath }.
The result path is the current real node path, not the property path. An empty
result path means the node no longer exists. Node.getPathByUuid(uuid) is also public.
Never reconstruct a fallback path from the displayed name. Duplicate sibling names
may have system path suffixes; parent renames also change descendant paths.

Legacy nodePath-based preview/cancel calls still return boolean and retain their
existing behavior. New integrations must use UUID calls for the entire edit.

## Lifetime and concurrency

Generate a unique previewId per edit and reuse it until commit or cancellation.
The first preview captures the original property; subsequent previews preserve it.
The backend serializes preview operations. Commit pushes one property-scoped Undo
command from the original to the actual final value, without cancelling or applying
the draft again. Undo/Redo resolve the node by UUID and do not restore unrelated properties.
An unchanged value does not create an Undo command.

A competing previewId, an overlapping property preview, or a normal setProperty
write to an active property is rejected with PREVIEW_CONFLICT. Completed IDs cannot
be reused: late calls fail with PREVIEW_FINISHED. A new edit needs a new ID.
Cancel failures retain restoration data for retry; commit failures retain the edit
until a successful commit or cancellation. Scene closure/disposal clears previews.
The new UUID interface supports ordinary node properties, not parent/children,
component paths, identity changes or prototype paths.

Blank/whitespace-only names are rejected with INVALID_NODE_NAME. Invalid targets
are rejected with INVALID_PREVIEW_TARGET. Invalid property paths or missing nodes
return success:false; a deleted node has an empty path. Error messages contain a
stable error code even when the transport does not preserve custom Error fields.
Existing node-change notifications are emitted with fresh state; writes include
previousPath internally and the command response always includes previousPath.
No new selection-path event is introduced.

## Inspector integration

1. Keep the node UUID authoritative and allocate an edit ID on focus/start editing.
2. Serialize or coalesce draft requests; do not send invalid blank names as previews.
3. On confirmation await the final preview, then commitPreviewSetProperty.
4. On Escape, selection changes or panel closure, cancel the active preview and
   handle failure before discarding its ID. Do not fall back to setProperty for commit.
5. Refresh through existing scene events and UUID path queries. Treat empty paths as deletion.
6. Commit or cancel an active edit before saving or switching scenes.

The extension's shared scene facade forwards methods from sceneSessionMethods
already. Updating the CLI bundle/type declarations exposes these operations without
a separate extension RPC. Inspector UI wiring remains the host's responsibility.

## Verification

- Transaction tests cover original-value retention, competing sessions, queued calls,
  cancellation retry after false/throw, failed Undo push, and scene lifecycle cleanup.
- Real scene RPC tests cover duplicate sibling path suffixes, parent/descendant
  renames, cancellation, direct commit and Undo/Redo, repeated edits, blank input and deletion.
- The session contract test requires all three methods and getPathByUuid in the public allowlist.
