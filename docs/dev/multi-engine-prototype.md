# Multi-engine backend prototype

Local implementation; no commits or pushes.

## Implemented

- CLI-owned EngineBackendAdapter registry, typed runtime boundary, read-only diagnostics and SDK packaging.
- The default 4.x backend keeps its existing runtime and compilation paths.
- 3.0 through 3.8 are identified separately. Stable 3.5.0 through 3.5.2, 3.6.0 through 3.6.3, 3.7.0 through 3.7.4 and 3.8.0 through 3.8.8 have separate experimental backends; other 3.x patches remain discovery-only. The complete 3.8.0–3.8.7 headless Jest matrix passed; see engine-adapter-jest.md for results and remaining acceptance boundaries.
- 3.8.8 uses the existing HTML5 PAL in an isolated Node host and reuses the engine's Editor semantics. The host is data-only and does not emulate a GPU.
- Source and Web targets compile into bin/.cache/dev-cli-3.8/editor and web. Creator's dev cache and the 4.x dev-cli cache are not reused.
- Prepared targets record engine version, backend cache version, configuration hash and source fingerprint. Same-version source edits invalidate readiness.
- ProgrammingFacet and scripting routes obtain the selected output layout from the adapter.
- A narrow configureRuntime hook maps this engine's serialization exports into missing legacy aliases. No 4.x codec is copied into a 3.x runtime.

## Enable and validate 3.8.8

Use an already built CLI. Default compatibility policy is unchanged; experimental selection requires an explicit process opt-in:

    $env:COCOS_EXPERIMENTAL_ENGINE_ADAPTERS = '1'
    node workflow/compiler-engine.js --engine-path D:/Cocos/code/cocos-editor/resources/3d/engine
    node dist/cli.js --engine-path D:/Cocos/code/cocos-editor/resources/3d/engine doctor --json

The engine must have its own dependencies, external libraries and declarations prepared. This is not a substitute for installing that engine's toolchain.

Repeatable real-engine checks (temporary projects are created and removed automatically):

    node workflow/smoke-engine-adapter.cjs --engine-path D:/Cocos/code/cocos-editor/resources/3d/engine --experimental
    node workflow/smoke-engine-adapter.cjs --engine-path D:/Cocos/code/cocos-editor/resources/3d/engine --experimental --scene-worker

Add --compile to prepare both targets first. Smoke checks cover actual CLI engine initialization, scene service registration, UUID/path queries, rename, descendant paths, Undo/Redo, scene persistence round trip and Prefab serialization round trip. They are not browser rendering tests.

## Acceptance boundary

Verified source: D:/Cocos/code/cocos-editor/resources/3d/engine, revision 165978a181f776ea664d48c7990058096f1c9a1f, package/runtime version 3.8.8. This does not certify every official or custom 3.8 patch.

Browser rendering, script hot reload, complete resource import coverage and native builds are not certified. Diagnostics report Web preview as unverified and native builds as not implemented. Only the explicitly matched stable 3.5, 3.6, 3.7 and 3.8 versions are enabled by the experimental switch; this does not certify feature parity with 4.x.

The CLI development host is still compiled against its normal default-engine declarations. Do not replace those bindings with old-engine declarations merely to run a project. Selecting a runtime engine and rebuilding the CLI's own type bindings are separate operations.

## cocos4 boundary review

See cocos4-adapter-boundaries.md for the reviewed engine commits and the rationale for moving pure interface mappings into version adapters while preserving engine lifecycle behavior.

## Local validation

TypeScript compilation passed. Relevant workflow and real-engine/service regressions passed (156 cases across the completed runs, including the additional host-binding guard). Real 3.8.8 smoke passed for the asset host and scene-worker modes; the asset-host run additionally verifies binary CCON round trips. Browser rendering and native builds remain outside acceptance.

## 3.7 runtime boundary

See engine-adapter-37.md for source preparation, compatibility bridges, unsupported capabilities and validation commands. 3.7 compiles to its own bin/.cache/dev-cli-3.7 directory.

Experimental 3.6 support and focused verification are documented in engine-adapter-36.md.

Experimental 3.5 support and focused verification are documented in engine-adapter-35.md.
