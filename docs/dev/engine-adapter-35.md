# Experimental Cocos 3.5 adapter

The adapter matches stable 3.5.0, 3.5.1 and 3.5.2 explicitly. Other patches remain discovery-only. Runtime selection requires experimental opt-in. Source commits, external revisions and locked installation results are recorded in .build/engine-versions/sources35.json. Original source checkouts are unchanged.

## Compatibility changes

- Keep the 3.5 cache separate at bin/.cache/dev-cli-3.5. Build declarations with the selected historical build tool; editor/web compilation uses the shared legacy compiler.
- Translate the selected engine's legacy build constants into modern compiler metadata. Dynamic helper declarations remain unique and globals use the selected engine's values.
- Translate modern initialization settings into the 3.5 flat Game configuration. Complete the native pipeline initialization without starting the game loop. Expose the selected Game's actual graphics device and selected shader assembly.
- Bridge legacy class-ID APIs in both exported and cclegacy namespaces. Preserve Scene UUIDs and synchronized nested Prefab instance-root UUIDs during serialization, so reload and Undo retain identity.
- Build material wrappers against the selected engine's gfx types. Use CLI-owned offline sRGB quantization where older engine editor exports lack this utility.
- Load optional editor features on demand. Ordinary rectangular SpriteFrames, clips without embedded players, classic effects and classic animation graphs remain usable without newer APIs.
- Skip automatic custom pipeline effect.bin generation on engines without that pipeline. An explicit forced request reports ENGINE_CAPABILITY_UNAVAILABLE.

## Validation

All three locked installations and editor/web compilations passed. All three versions passed the focused real-engine matrix: 43 tests each, zero failures, covering Node serialization, nested Prefab Undo/Redo, Prefab resource-refresh Undo, material properties, classic animation graph operations and loaded runtime identity. The report is .build/adapter-tests/engine35-core-final/report.json. Earlier failed iterations remain available for diagnosis.

The additional script-manager, serialization, runtime identity and Effect capability regression passed 70 tests on 3.5.2 and 70 tests on default 4.0.0-alpha.32, with zero failures. Its report is .build/adapter-tests/engine35-script-regression/report.json.

Adapter/discovery/SDK contract checks passed 49 tests. The color quantization and optional module loader unit suites passed 11 tests. Missing transitive dependencies are rethrown rather than hidden as unsupported features.

This is focused headless validation. It does not certify the complete Jest baseline, browser/GPU rendering, native builds or feature parity with 4.x.

## Local verification

After compiling the selected historical source and CLI, run the focused matrix from the repository root:

~~~powershell
node workflow/test-engine-adapters.cjs --engine-path .build/engine-versions/3.5.0 --engine-path .build/engine-versions/3.5.1 --engine-path .build/engine-versions/3.5.2 --experimental --test-path src/core/scene/test/serialized-node-data.engine-test.ts --test-path src/core/scene/test/prefab-asset-refresh-undo.e2e.test.ts --test-path src/core/assets/test/material-service.test.ts --test-path src/core/assets/test/animation-graph-legacy.test.ts
~~~

The runner creates isolated source/engine snapshots and always verifies the loaded runtime identity. Passing results cannot come from silently selecting the default engine.

## Capability limits

3.5 lacks embedded players, polygon SpriteFrame mesh APIs, newer custom pipeline layout serialization, reflection probes, LOD editor utilities, light probe scene globals, node mobility, Pose Graphs, additive layers and auxiliary curves. Unsupported operations must return a capability error rather than fabricate an engine implementation.

All changes remain local. No commits, pushes or pull requests were created.

Consolidated local results: .build/adapter-tests/3.5-validation-2026-11-04.json. CLI TypeScript compilation and git diff --check passed.
