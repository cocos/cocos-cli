# Jest against engine adapters

Runtime Adapter locations are described in [Engine Adapter layout](engine-adapter-layout.md). The implementation now lives in adapters/engine; earlier retained logs may show its former workflow location.

The adapter matrix runs the complete default jest.config.ts suite set against each selected engine backend. Separately configured MCP E2E suites and package-level type snapshots keep their existing entry points. It includes Node and component operations, scene and Prefab editing, Undo/Redo, resource import/query/create, and the existing real-engine serialization suites. It also runs a mandatory runtime identity test. Pure unit tests retain their mocks; the integration suites load the selected engine and start the real scene worker.

## Prepare

Install the normal CLI dependencies and build the CLI before starting the matrix. Rebuild after changing production TypeScript: scene workers execute files from dist, while Jest loads the test sources.

For an already prepared development checkout:

~~~powershell
npx tsc --pretty false
~~~

Each engine must have its backend's compiled editor/web loaders and declarations. The default 4.x backend uses bin/.cache/dev-cli. The experimental 3.8.x backend uses its own bin/.cache/dev-cli-3.8; a Creator dev cache is not interchangeable with this cache. Prepare legacy engines with the standalone compiler rather than regenerating the CLI's default cc-module type bindings:

~~~powershell
node --max-old-space-size=8192 workflow/compiler-engine.js --engine-path D:/Cocos/code/cocos-editor/resources/3d/engine --force
~~~

This standalone compiler prepares loaders. The selected engine must also provide its own declarations from its matching tooling; the matrix reports missing declarations rather than substituting the default engine's files.

## Run all original suites

~~~powershell
npm run test:engine-adapters -- --engine-path D:/Cocos/code/cocos-cli/packages/engine --engine-path D:/Cocos/code/cocos-editor/resources/3d/engine --experimental
~~~

Repeat --engine-path to add targets. The order determines execution order. --experimental explicitly enables experimental backends; discovery-only versions still fail rather than falling back to the default engine.

To limit a diagnostic run, repeat --test-path. The runtime identity suite is always included:

~~~powershell
npm run test:engine-adapters -- --engine-path D:/Cocos/code/cocos-editor/resources/3d/engine --experimental --test-path src/core/scene/test/scene.test.ts --test-path src/core/assets/test/importer.test.ts
~~~

--timeout-minutes defaults to 45 per engine. --output may name a new output directory; an existing directory is rejected. A failed target does not prevent later targets from producing their own results. The command exits nonzero if any target fails.

## Isolation and results

Each target gets an independent CLI/fixture copy and engine copy under .build/adapter-tests/<run>/<target>. The matrix excludes project library/temp/build caches and unrelated engine compilation caches. Installed dependencies are reused through directory links. The private CLI type facade uses the default host declarations so TypeScript does not merge two incompatible engine ambient APIs; project script declarations and the loaded runtime still come from the selected engine. Do not run installation or dependency updates inside these disposable copies.

Jest runs serially within one target because the original scene suites share project state. A per-suite Jest resolver prevents virtual cc modules from contaminating subsequent mocked suites. This custom runtime uses Jest 29's module-map contract and fails explicitly if that contract changes.

Files retained per target:

- source and engine: the independent working copies.
- jest.log: complete test output, including scene-worker logs.
- jest.json: individual suite/test results.
- identity.json: selected Adapter, engine root, package version and the version reported by the loaded runtime.

The run's report.json contains the aggregate status, counts, suite-setup failures, individual failures, timeouts and identity. Package prereleases can intentionally expose a release-core runtime VERSION (for example 4.0.0-alpha.32 exposes 4.0.0). Verification compares the loaded value with the selected engine's source declaration and separately verifies package identity; it never accepts another patch version.

No Adapter-specific skip list is used. Existing Jest skips remain visible in the report. A missing identity report, failed setup, unsupported backend or an empty test run cannot be marked successful.

## Current boundaries

The shared experimental 3.8 backend recognizes exact stable versions 3.8.0 through 3.8.8. The complete headless matrix for 3.8.0–3.8.7 passed; see the results below. Registration alone is not acceptance. Other 3.x entries remain discovery-only until their runtime contracts and original suites pass. These headless Jest results do not certify browser rendering, PinK interaction, native builds or device execution.

The 3.8 runtime supplies HTML5 PAL host services, loopback resource-byte requests, XML parsing, legacy template paths, and the live editor selection bridge. Scene serialization retains node UUIDs so nested Prefab restore and Undo continue to target the original objects.

Infrastructure checks:

~~~powershell
node --test workflow/test/engine-adapter-jest.test.cjs workflow/test/cocos38-adapter.test.cjs workflow/test/engine-backend-adapters.test.cjs
~~~

## Local validation (2026-11-02)

The complete matrix passed for cocos-4 (package 4.0.0-alpha.32, runtime 4.0.0) and cocos-3.8.8 (runtime 3.8.8). Each target passed 256 suites and 2,881 tests, with zero failures and three pre-existing skipped tests. No Adapter-specific skips were added. Runtime identity checks passed for both targets.

## Historical 3.8 matrix

The shared cocos-3.8-runtime backend matches exact stable package versions 3.8.0 through 3.8.8. Each target still compiles its own source and uses its own declarations, external WASM binaries, fixtures and runtime identity checks. It does not reuse a 3.8.8 loader for earlier patches.

Local official sources for 3.8.0–3.8.7 are prepared under .build/engine-versions/<version>. The ignored sources.json records exact tag commits, matching external revisions and dependency preparation. Only the external emscripten subtree needed by the HTML5 host is materialized; this matrix does not validate native external toolchains.

Compatibility boundaries found by the matrix:

- 3.8.0–3.8.2 use flat default templates; the Adapter resolves existing flat files without modifying engine sources or custom project templates.
- 3.8.0 lacks the pose-input attribute editor API. The bridge derives attributes from that engine's class metadata and exposes serializable graph inputs for editing without changing the original metadata.
- 3.8.0–3.8.3 use pipeline-asset configuration and select shader libraries by module presence. The Adapter keeps effect registration and Pass lookup aligned with the active pipeline, including modules loaded after initialization. The modern customPipeline option is explicitly unavailable on these patches.
- 3.8.0–3.8.6 expect a .cconb library key in the editor query protocol. The Adapter translates CLI's sole .bin CCON representation. The flat asset endpoint serves its advertised .cconb URL from that same binary file; companion mesh binaries are not treated as CCON.
- CLI-only Inspector labels missing from older dictionaries receive a small fallback patch before the engine's own translations are registered.

Literal host translation snapshots keep their original host vocabulary. Additional exhaustive tests load every translation from the selected engine's own dictionaries. Render-config checks traverse the selected source configuration and verify every translation present in its dictionary rather than requiring flags/categories introduced in later patches.

The matrix uses an 8 GiB Node heap limit because complete historical-engine runs exceeded the earlier 4 GiB limit. An aborted process or missing Jest JSON is a failure, never a pass. No per-Adapter test exclusions are used.

## Completed historical matrix (2026-11-03)

All eight official versions completed the full default Jest matrix with the shared experimental Adapter. Each run verifies the actual runtime version and has no Adapter-specific exclusions.

| Engine | Passed suites | Passed tests | Failed tests | Existing skips | Runtime | Source commit |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| 3.8.0 | 256 | 2885 | 0 | 3 | 3.8.0 | aacc0d7261ba |
| 3.8.1 | 256 | 2885 | 0 | 3 | 3.8.1 | c4fcece55312 |
| 3.8.2 | 256 | 2885 | 0 | 3 | 3.8.2 | ddd45f96d0b4 |
| 3.8.3 | 256 | 2885 | 0 | 3 | 3.8.3 | 7087c23f72a2 |
| 3.8.4 | 256 | 2885 | 0 | 3 | 3.8.4 | 78e8d0e67a1d |
| 3.8.5 | 256 | 2885 | 0 | 3 | 3.8.5 | 0e4607fa9e19 |
| 3.8.6 | 256 | 2885 | 0 | 3 | 3.8.6 | d84d668450b6 |
| 3.8.7 | 256 | 2885 | 0 | 3 | 3.8.7 | 6a204c1b6ca1 |

The original three skipped tests remain unchanged. The four extra passing tests compared with the earlier 2,881-test baseline cover selected-engine translations and CCON byte-route behavior. Boolean/color component updates remain tested on all versions; 3.8.0/1 use existing Label properties because Label outline properties were introduced in 3.8.2.

The latest complete successful result for each engine is recorded in .build/adapter-tests/3.8-validation-2026-11-03.json, with links to the unmodified per-run Jest JSON/logs, runtime identity, exact source commit, external revision and dependency preparation. Earlier failed iterations are retained separately and are not rewritten.

Regression checks also passed: 54 Adapter/matrix contract tests, 91 engine-selection/diagnostic/SDK/install workflow tests, and TypeScript compilation. Default 4.0.0-alpha.32 and the existing local 3.8.8 checkout each passed the same 694-test focused core regression (scene/Prefab/animation/Undo, asset import/create/query/serialization, script compilation and metadata). Those focused regressions do not replace their earlier complete baselines.

These results validate the headless CLI test scope. Browser rendering, PinK UI interaction, native builds and device behavior still require separate acceptance. Legacy runtimes continue to require explicit experimental opt-in. All changes and generated test artifacts remain local.
