# Asset move preflight

`preflightMoveAsset(source, target)` observes one internal resource move without
changing or reserving files. `source` accepts a main asset UUID, URL or absolute
path. `target` accepts an Asset DB URL or absolute path with an existing parent
inside a writable, active Asset DB. Asset DB roots and overlapping source/target
paths are rejected during preflight.

Overlap checks compare both request paths and filesystem locations with parent
symlinks resolved. A directory cannot be moved into or over itself through an
alias. The final path entry is not dereferenced: moving or replacing a symlink
still addresses that entry, rather than the resource it points to. These checks
also run on token submission and after waiting for Animation Graph writes;
legal aliases retain their requested Asset DB URLs.

The result is either:

- `{ action: 'move', preflightToken }` when the target name is unoccupied.
- `{ action: 'choose-conflict-handling', preflightToken, conflict }` when a target
  file, directory or its metadata occupies the name. Conflict facts contain the
  source/target URLs and directory flags. `targetIsDirectory` is `null` for a
  metadata-only conflict.

The host owns the choice. It passes `overwrite: true` or `rename: true` together
with the token to `moveAsset`. Cancellation does not submit a move. A batch should
finish each item's observation, optional choice and submission before starting
the next item.

```ts
const preflight = await assets.preflightMoveAsset(source, target);
const choice =
    preflight.action === 'choose-conflict-handling' ? await chooseConflictHandling(preflight.conflict) : undefined;

if (choice !== 'cancel') {
    const moved = await assets.moveAsset(source, target, {
        preflightToken: preflight.preflightToken,
        overwrite: choice === 'overwrite',
        rename: choice === 'rename',
    });
    // moved.uuid is the original source identity; moved.url is the actual final URL.
}
```

## Observation and failure contract

Tokens are opaque and single-use, including failed submission attempts. They
bind the normalized request, resource identities, mount instances and observed
filesystem revisions. Directory observations include descendants. Changes while
waiting for an Animation Graph write, project teardown or database replacement
invalidate the submission. The host must start a new interaction after refusal;
it must not silently retry the previous overwrite choice.

The token is optimistic validation, not a filesystem lock or a destination
reservation. The implementation checks state again before writing. An active
import reservation is an error, not a user-resolvable name conflict.

Automatic naming considers both resource files and metadata. A symlink occupies
its name even when its target is missing or the link is not indexed by Asset DB.
Automatic rename preserves such entries; explicit overwrite may replace them.
Replacing a symlink addresses the link itself, not its referenced path.

Overwrite replaces the target as a whole, including directories, while retaining
the source UUID and child metadata. Source/meta move failures propagate before
refreshing the Asset DB. Overwrite recovery uses reversible, non-overwriting provider renames;
it refuses to replace third-party data when recovery is no longer safe. Such a
failure includes the retained recovery location. Cleanup failures after a move
has committed retain the backup and log its location without claiming that the
move did not happen.

Before first taking ownership of an original body or metadata entry, recovery
checks it against the operation's initial observation. A changed or newly
appeared entry is not adopted. Entries already moved by this operation are
checked against their last verified state. A legacy nested move may advance the
expected ancestor state after staging the source, provided the ancestor entry's
identity is unchanged. Unsafe metadata/body pairings are refused and recoverable
metadata is retained for manual recovery.

Successful moves return the refreshed `IAssetInfo`, including the actual final
name. Failure to resolve that information after a completed move is reported
explicitly as a refresh/result failure.

## Compatibility and ownership

Existing `moveAsset` calls without a token remain supported. `preflightToken`
belongs to `AssetMoveOptions`; it is not part of shared `AssetOperationOption`.
The lib entry and `assets-preflight-move-asset` tool expose the same facts. The CLI
module owns path interpretation, occupation rules, token lifecycle, write
coordination, recovery and final resource data; callers own prompts and batch
policy.

## Internal organization

The implementation is grouped under `src/core/assets/manager/asset-move/`:

- `preflight.ts` owns observations and single-use tokens.
- `source.ts` owns reversible body/metadata moves and recovery.
- `state.ts` provides filesystem identity, revision and continuity observations.

`operation.ts` and the filesystem bridge import their respective internal
modules directly. Public lib, tool and type interfaces remain unchanged.
