# Prefab write coordination

This document specifies project-local arbitration for Prefab source writes and the participating runtime contract. Source publication and working-copy synchronization are separate operations.

## Ownership and storage

`PrefabWriteCoordinator` lives in the project Host. Webview HTTP reverse RPC and worker IPC reverse RPC use the same `prefabWriteHost`. Its Asset DB Adapter resolves the current asset by UUID, reads the absolute `IAssetInfo.file` path, and saves through Asset DB, awaiting import completion. `IAssetInfo.source` is a database URL, not a filesystem path.

| Identifier | Contract |
| --- | --- |
| `runtimeId + generation` | Identifies one editor session. A reused runtime ID requires a newer generation. |
| `registrationId` | Host-issued ownership token. Old close requests, leases, and Host epochs cannot address a replacement registration. |
| `editVersion` | Non-negative safe integer incremented when acquiring an edit lease. Save and Undo/Redo never rewind it. Nested operations share their outer occupancy. |
| `fingerprint` | SHA-256 of source file bytes. Compared at the final write, independently of notifications. |

Registrations, edit versions, and loaded baselines are memory-only. They are not written into `.prefab`, `.meta`, or version sidecars. Exhausted edit versions require reopening with a new runtime identity.

## Runtime occupancy and synchronous APIs

An editor registers before loading and accepting edits. A Prefab editor supplies its source UUID; an ordinary Scene does not become a source document merely by containing Prefab instances. Unknown or disconnected participants must not be represented as clean. Confirmed editor closure unregisters its ownership; Host reset invalidates all registrations and drains publications already in progress.

`PrefabWriteRuntime` manages local references to one Host lease. Node/component operations, undo recordings, undo groups, and browser input handlers acquire occupancy before persistent mutations. Source publication and full source replacement require exclusive local occupancy. A recording retains occupancy across multiple property calls and releases it only after its final snapshot has been processed.

The synchronous API shapes are preserved:

- `Editor.unlock(): void` releases the local reload lock immediately and queues Host completion. The Host continues to reserve the runtime until authoritative dirty state arrives; it does not assume clean during the asynchronous gap.
- `Undo.beginRecording(): string` and `Undo.beginGroup(): string` capture synchronously inside an existing occupancy.
- `Undo.cancelRecording(): void`, `endGroup()`, and `cancelGroup()` retain their synchronous signatures while queuing occupancy release.
- `beginRecordingAsync()` and `beginGroupAsync()` acquire protection before invoking their synchronous counterparts. RPC callers explicitly request these asynchronous method names. The dispatcher invokes the requested method without aliases or automatic sync-to-async redirection. `Service` continues to return the original instance without additional proxies or method replacement. PinK recording entry points prefer the asynchronous methods, with a fallback for older CLI builds.
- `Operation.dispatch()` and `emitMouseEvent()` remain synchronous. Browser input uses ordered asynchronous entry points that acquire occupancy before dispatching to gizmos.

This preserves signatures, but it does not make an unguarded synchronous mutation safe. In a registered editor, synchronous recording/group calls without an outer occupancy are rejected. Integrations initiating an edit must use the asynchronous entry or acquire `Editor.lock()` first. Gizmos must propagate occupancy failures before mutating content.

## Source publication

Apply, Prefab Save/Save As, replacement of an existing Prefab by create-from-node, and Apply Undo/Redo write through the Host. Preparation happens on detached candidates; rejection must not consume the live instance's overrides or partially edit its nodes/components.

Applying a removed component publishes only that removal from a detached copy of the source. Other instance overrides remain unapplied. Nested removals update the containing Prefab source, and history captures the outermost instance together with the before/after source content. Only a successful publication may consume the selected live override; Undo/Redo uses the same source-version checks as a full Apply.

The commit Interface accepts an active source lease, target asset UUID, expected loaded fingerprint, and prepared content. For each target UUID the Host:

1. Serializes source reads and writes in one queue.
2. Revalidates the source registration and lease.
3. Rejects another target source document that is dirty, editing, or unavailable. The saving document's own dirty state is allowed. Unrelated ordinary Scenes do not block a write.
4. Reserves participating documents and rejects late registration of another target document.
5. Reads the source file, revalidates participants, and compares the expected fingerprint before calling the write Adapter.
6. Persists and imports the source, reads the persisted result, and returns a receipt containing the commit identity and before/after snapshots.
7. Releases target reservations. The source keeps its edit lease until its local content/history reconciliation finishes.

The conflict policy is rejection. There is no force-overwrite option. UI interaction must happen after releasing occupancy, and resolving a conflict must not blindly replay an old request.

Different source assets have independent queues. The queue never waits for a target to finish editing or for UI confirmation. A caller must not wait for a commit-triggered reload before the commit itself resolves.

## Loaded baselines and synchronization

Source loading captures fingerprints before loading, evicts relevant Prefab caches, and checks source fingerprints again afterward. A new asset load cannot advance an existing instance's stale baseline. A full replacement may load newer dependencies; nested loads share that replacement and publish baselines only after the whole restore succeeds.

An asset notification is a reason to inspect source state, not proof that a runtime loaded it. Likewise, a publication receipt does not prove that other Tabs have synchronized.

For a directly edited Prefab source:

- A clean editor acquires exclusive occupancy, rechecks dirty state and the source fingerprint, and rebuilds its virtual scene from the source asset. Surviving node/component identities are restored by Prefab file ID.
- Its old undo history is cleared only after successful replacement. The loaded baseline advances afterward, and `editor:reload` is emitted after releasing occupancy.
- Dirty or editing documents retain their contents and baseline. A pending notification can be retried when they become clean. Saving against an externally changed source fails with `PREFAB_SOURCE_CHANGED`.
- Duplicate notifications for already loaded content do not acquire replacement occupancy or rebuild the tree.
- A failed source rebuild leaves the participant unavailable until it is closed and reopened; partial reconstruction must not be advertised as a clean, ready document.

Normal Scenes retain the existing instance soft-reload behavior. Their loaded Prefab baselines advance only after the corresponding content reload succeeds. Apply explicitly completes its source-runtime reload before recording the final undo snapshot.

Apply history carries its expected resource fingerprint. Undo/Redo restores source bytes through the same Host and rebinds the instance within a full replacement operation. An intervening source write causes rejection; the undo cursor does not advance on that rejection. Successful consecutive Undo/Redo uses the version produced by the previous operation.

## Errors and transport

The Host returns `{ ok: true, value }` or `{ ok: false, error }`. Runtime callers restore a `PrefabWriteConflict`. Worker RPC preserves only the documented conflict fields, and Undo/Redo may return them in `IUndoRedoResult.error`.

| Code | Meaning |
| --- | --- |
| `PREFAB_DOCUMENT_DIRTY` | Another source document has unsaved edits. |
| `PREFAB_SOURCE_CHANGED` | Source bytes differ from the loaded/expected version. |
| `PREFAB_SESSION_CHANGED` | Registration, version, availability, or Host epoch is obsolete. |
| `PREFAB_BUSY` | An edit or publication already owns the participant. |
| `PREFAB_INVALID_REQUEST` | Identity, version, or commit parameters are invalid. |
| `PREFAB_SOURCE_UNAVAILABLE` | The source is missing, unsupported, or unreadable. |
| `PREFAB_WRITE_FAILED` | Persistence/import or subsequent confirmation/reconciliation failed. |

`commitState` is independent of the error code:

- `not-committed`: the write Adapter has not been invoked.
- `unknown`: persistence/import threw; the file may already have changed.
- `committed`: persistence succeeded and a later confirmation or reconciliation failed.

A late failure must not be described as an unperformed write. Uncertain or committed results must not be automatically retried. A receipt proves source publication, not synchronization of every runtime.

## Scope

Arbitration applies to participating runtime write paths. Generic Asset DB calls, other processes, and external filesystem tools do not automatically participate. Actual byte fingerprints detect stale writes, but this protocol is not an operating-system-wide atomic compare-and-swap. UI conflict dialogs and force-overwrite policy are outside this Interface.

## Validation

Fast contract tests exercise two runtime clients sharing a Host, controlled I/O interleavings, recording occupancy, stale baselines, failed synchronization, and nested restoration. The real-engine `Prefab write integration` test exercises Apply rejection without override loss, Apply/Undo/Redo file contents, clean source reload notifications, and protection of dirty source editors.

```sh
npm test -- --runTestsByPath \
  src/core/scene/test/prefab-write-coordinator.test.ts \
  src/core/scene/test/prefab-write-host.test.ts \
  src/core/scene/test/prefab-write-runtime.test.ts \
  src/core/scene/test/prefab-source-loader.test.ts \
  src/core/scene/test/prefab-removed-component-write.test.ts \
  src/core/scene/test/undo-rpc.test.ts

npm test -- --runTestsByPath src/core/scene/test/scene.test.ts \
  --testNamePattern='Prefab write integration|Removed component Apply integration|applyPrefabChanges (marks dirty|undo and redo)'
```
