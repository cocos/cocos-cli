# Prefab operations and reload

Cross-runtime source ownership, conflict errors, and loaded versions are specified in [Prefab write coordination](./prefab-write-coordination.md). This document describes the runtime orchestration of Prefab edits and reloads.

## Operation ownership

`PrefabService` orchestrates public create, Apply, revert, unpack, and unlink operations. `nodeOperation` and `componentOperation` implement Prefab metadata and override transformations. Undo helpers capture the structural before/after states and publish commands through `UndoService`.

Pending Prefab soft reloads finish before a public Prefab mutation acquires its runtime occupancy. This avoids operating on nodes that a previously scheduled reload is about to replace.

Apply prepares source content in a detached candidate, commits through the shared write Host, and only then consumes live instance overrides. It explicitly reloads its source runtime, preserves earlier undo history, and captures the final instance snapshot. Rejection before publication leaves both the source file and instance overrides intact. Errors after publication report committed state.

Save serializes the directly edited Prefab and commits against its loaded source fingerprint. Save As retains the original working-copy identity and dirty state. Replacing an existing Prefab during create-from-node also uses shared arbitration; creating a new resource uses Asset DB creation without overwriting a concurrently created target.

## Two reload behaviors

| Trigger | Behavior |
| --- | --- |
| A referenced Prefab changes in a normal Scene | Rebuild the current scene serialization, expanding instances from current Prefab assets while retaining local overrides. |
| A nested dependency changes in a Prefab editor | Rebuild the current virtual scene, retaining edits to the directly edited Prefab root. |
| The directly edited Prefab source changes | Replace a clean working copy from its source asset. Preserve a dirty working copy and its old baseline. |
| Scripts change | Use the normal content reload lifecycle and refresh the relevant asset caches. |

`PrefabEditor.reload()` preserves the current working tree. `reloadFromSource()` reconstructs it from the source asset and is used only by guarded clean-document synchronization. These operations must not be substituted for one another.

PinK forwards changes to the Tab editing the changed Prefab itself. The runtime decides whether to synchronize or preserve local edits. Hierarchy refresh remains a query of that runtime's actual node tree; it is not a source reload.

## Lifecycle and ordering

The internal `EditorReloadClose` / `EditorReloadOpen` hooks detach and reattach services around content reconstruction. A reload does not represent a publicly closed and reopened editor session. Surviving UUIDs are restored from Prefab file IDs where possible.

`Editor.lock()` remains a local reload barrier and also participates in runtime edit occupancy. Its synchronous `unlock()` schedules publication of final dirty state to the Host. Shared write protection is implemented by the Prefab write protocol, not by extending the local reload lock around an Apply that must itself reload.

`PrefabSoftReloadScheduler` coalesces dependency notifications, scopes queued work to the current editor session, and preserves history when requested or when the working copy is dirty. Closing or replacing the editor invalidates queued work and reload waiters. Source publications and their explicit source-runtime reconstruction do not depend on a debounced notification to complete.

A clean source document emits `editor:reload` only after rebuilding content, updating its baseline, clearing obsolete history, and releasing replacement occupancy. The event therefore permits consumers to query and edit the resulting tree.

## Undo and failures

Local structural operations record node snapshots. Apply additionally records the persisted before/after source contents and the expected source fingerprint. Undo/Redo arbitrates the resource write before replacing the runtime snapshot. It preserves earlier history across its internal reload and refuses to overwrite a resource changed by another writer.

A successful source publication and a successful runtime reload are distinct facts. Post-publication load failures cannot be converted into an ordinary Apply rejection or used as a reason to replay the original write. Failed clean-source reconstruction marks the runtime unavailable until reopen.

## Validation

```sh
npm test -- --runTestsByPath \
  src/core/scene/test/prefab-soft-reload.test.ts \
  src/core/scene/test/prefab-editor-preview-canvas.test.ts \
  src/core/scene/test/prefab-source-loader.test.ts

npm test -- --runTestsByPath src/core/scene/test/scene.test.ts \
  --testNamePattern='Prefab write integration|Prefab dirty/undo contract'
```
