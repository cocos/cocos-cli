# Experimental Cocos 3.7 backend

The cocos-3.7-runtime backend matches exact stable versions 3.7.0–3.7.4. Experimental opt-in remains mandatory. It compiles each selected source tree into bin/.cache/dev-cli-3.7 and never reuses a 3.8 or default-engine cache.

## Preparation

Local official tags are archived under .build/engine-versions/3.7.<patch>. Their exact commits, external revisions and dependency preparation are retained in the ignored sources37.json manifest. The original Creator engine checkout is unchanged.

Old lock files contain expired registry URLs. Local preparation replaces only tarball locations with canonical npm URLs, retaining locked package versions and integrity values. Matching native external emscripten files and the selected engine's own declarations are prepared separately. This does not certify native builds.

## Compatibility bridges

- Shared HTML5 PAL host, flat asset byte transport, legacy render-pipeline selection and selected-engine CCON codecs.
- Material Inspector state wrappers adapted from Creator 3.7 and compiled against the selected engine's gfx types.
- Earcut editor export for 3.7.0/1, using their existing implementation.
- Prefab instantiation assigns selected-engine PrefabInstance metadata to the clone, preserving the original source asset. Nested instance persistence and Undo use that real metadata.
- Animation graph scalar variable creation delegates to addFloat/addBoolean/addTrigger/addInteger. AnimationBlend aliases the actual selected-runtime superclass, which 3.7 exports as a type only.
- Legacy binary-condition edits preserve BindableNumber storage and expose scalar right-hand values through the public view. Unsupported newer binding properties fail with a capability error.
- Early 3.7 light probe notifications delegate to the engine's own SH cache invalidation, allowing generic scene snapshot Undo to complete.
- Missing optional state/transition event bindings and stash collections are not fabricated.
- PhysicsMaterial Inspector float metadata and missing CLI importer translation labels are normalized.
- Explicit node-add events request a repaint independently of version-specific parent-change notifications.
- Light probe settings expose only supported scalar fields. Requesting an unavailable sphere display size fails explicitly.
- Legacy input-attachment sampler fallbacks retain their explicit matching attachment slot; unrelated sparse sampler bindings remain invalid.

## Unsupported engine capabilities

3.7 does not implement Pose Graphs, stashes, additive graph layers, newer transition binding classes, vector graph variables or AnimationClip auxiliary curves. These are engine feature gaps, not export aliases. The backend reports known absent capabilities; unsupported graph commands fail transactionally instead of mutating or inventing runtime data. Inspector bindings omit unavailable layer fields. Discovery of Pose Graph drag handlers returns an empty list.

Existing tests that require these 3.8 APIs remain visible as failures in complete 3.7 matrix reports. They are not skipped or counted as passes. Additional real-engine tests cover classic graph mutation/save/reload and transactional capability rejection.

## Local verification

Run from the CLI checkout after building the CLI:

~~~powershell
node workflow/compiler-engine.js --engine-path .build/engine-versions/3.7.4
node workflow/smoke-engine-adapter.cjs --engine-path .build/engine-versions/3.7.4 --experimental
node workflow/smoke-engine-adapter.cjs --engine-path .build/engine-versions/3.7.4 --experimental --scene-worker
node workflow/test-engine-adapters.cjs --engine-path .build/engine-versions/3.7.4 --experimental
~~~

Run real-project matrices sequentially: the existing test host binds port 9527. Multiple independently launched matrices must not share it. Reports preserve individual Jest JSON, logs and actual runtime identity; failed or interrupted reports must not be interpreted as acceptance.

All five versions compiled editor and web targets and passed asset-host plus scene-worker smoke checks (10 runs). Further full-matrix results are recorded separately as they complete. The smoke scope covers initialization, node and descendant paths, rename, Undo/Redo, scene/Prefab persistence and CCON; it does not validate browser rendering, PinK UI, GPU execution or native/device builds.

## Core validation results (2026-11-03)

The final focused matrix requests the real scene suite, serialized-node persistence, Prefab refresh/Undo, material Inspector, classic graph operations and legacy shader binding tests, plus mandatory runtime identity. It is not a new complete default Jest baseline.

- 3.7.1, 3.7.2, 3.7.3 and 3.7.4 each completed 448 assertions: 445 passed and 3 failed. All three failures request AnimationClip auxiliary curves, which these engines do not implement. No tests were skipped.
- 3.7.0 passed the same runtime paths. Its first focused report additionally retained a new-test type-check failure and an invalid negative shader fixture. Both test defects were corrected; a separate real 3.7.0 follow-up passed all 7 assertions covering classic graph operations, native condition storage, capability rejection, shader fallback acceptance and invalid binding rejection. Original reports remain unchanged.
- All five selected editor/web caches passed preparation validation. All ten earlier real asset-host/scene-worker smoke checks passed.
- The explicit node-add repaint and light-probe settings unit tests passed 24 assertions.
- Comparison with the unmodified compiler on 14 existing/new shader fixtures found 13 unchanged outcomes and one fixed legacy-subpass case, with no newly failing fixture. Some historical fixtures intentionally do not compile against a real WebGL context; unchanged outcomes are not counted as passing shader tests.

Core report: .build/adapter-tests/engine37-core-validation/report.json. Corrected 3.7.0 tests: .build/adapter-tests/engine370-supplement/report.json. Smoke report: .build/adapter-tests/engine37-smoke.json.

These runs do not turn the modern Pose Graph, stash, additive-layer, vector-variable or auxiliary-curve assertions into passes. Existing modern-feature test failures remain visible, and native/GPU/browser acceptance is separate.

Final cross-version regressions passed on real 3.8.0 and the default 4.0.0-alpha.32 package (runtime 4.0.0): 31 assertions each, including the original 19-case animation graph service suite, material editing, native condition persistence and shader binding validation. The final serial Adapter/selection/diagnostic/compatibility/SDK checks passed 103 assertions. An earlier concurrent subprocess run timed out before graph assertions; its logs remain available, and the isolated 3.8.0 rerun passed without increasing timeouts.

Consolidated local evidence: .build/adapter-tests/3.7-validation-2026-11-03.json. Detailed cross-version reports: engine380-isolated-final/report.json and the cocos-4 target in engine37-cross-version-final/report.json. The latter report retains the earlier 3.8 startup failure; the separate isolated report is the completed 3.8 regression.

The npm packlist includes all 15 Adapter files, including the 3.7 material TypeScript source and shared runtime/compiler factories. No package was published.
