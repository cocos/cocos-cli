# cocos4 CLI integration and adapter boundaries

Reviewed the local cocos4 baseline df98a99bb6 and the public v4.0.0 head b9f9e95b9b3175298434bf38c2186669d9d4b4db. The public head is 39 commits ahead; among the reviewed data/lifecycle/platform paths, that interval changes cc.config.json. This review targets concrete CLI-related changes rather than treating every 3.x-to-4.x engine change as an integration shim.

## Changes suitable for backend adapters

- Runtime layout, compiler choice, editor module lists, host environment construction, local external/WASM path resolution and capability reporting.
- cocos4 commit da75e89f4a (#118) publishes encodeCCONBinary and BufferBuilder on cclegacy.internal. The real implementation already exists in the serialization module. A legacy adapter can provide missing aliases using that selected engine's public editor exports. Preserve existing implementations and reject missing exports; never import a 4.x codec to fill a 3.x slot.
- Version-specific mapping of public editor modules and missing public method aliases, when the underlying behavior exists in that engine.

The prototype implements this mapping via EngineBackendAdapter.configureRuntime and a pre-validation preload hook. The 3.8 backend also requests its existing Editor semantics explicitly, including ordinary CLI asset-host initialization.

## Behavior that must remain owned by the engine

- 2bc107dcbc (#25): enabling node attachment/registration behavior outside Creator.
- f8c33a685d (#26): keeping EditorExtends component registration synchronized with actual component add/remove operations.
- 12a934b4fe (#45): object flags, real validity and deferred/editor destruction behavior.
- e188ea0dad (#17): clearing the actual private requiring-frame stack through _RF.reset.
- 255466a6a0 (#8): exposing the selected engine's own deserialize metadata in the CLI environment.

These changes often enable existing Editor behavior for NODEJS. They are not equivalent to declaring a public method on a prototype. External wrappers can miss instantiation, deserialization, destruction, prefab cloning and engine-internal calls. Keep the 4.x implementation until every consumer has a tested replacement.

For legacy 3.8, prefer its existing Editor path rather than copying all NODEJS branches into the old source. If a still-older engine lacks a required hook entirely, provide a narrowly scoped engine integration or declare that capability unsupported; do not fabricate private metadata.

## PAL ownership

Node.js input, scheduling, system information, filesystem and WASM implementations are host/platform concerns. Backend adapters should select and configure them. A reusable Node PAL can remain an independent engine-platform package; it should not depend on PinK Inspector or project-session business logic. cc.config.json platform overrides remain part of compilation integration.

The prototype's legacy Node DOM boundary is an isolated data-operation host, not a replacement for the full cocos4 Node PAL or a guarantee of graphics/audio compatibility.

## Migration sequence

1. Keep working cocos4 behavior unchanged.
2. Implement legacy backends and pure export mappings on the CLI side.
3. Test asset-host and scene-worker modes independently.
4. Expand coverage to component lifetime, script registration/reload, Prefab restore and resource import before claiming complete editing support.
5. Consider removing an engine-side change only after verifying it has no remaining consumers and proving equivalent lifecycle behavior. No engine code was removed in this prototype.

Real 3.8 acceptance also verifies the binary CCON aliases with the selected engine codec. This is separate from scene JSON persistence and does not assume that different engine families share a binary format.
