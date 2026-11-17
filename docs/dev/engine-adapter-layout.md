# Engine Adapter layout

Runtime engine compatibility lives under adapters/engine. Workflow scripts orchestrate preparation, compilation, packaging and validation; runtime loading must not depend on a workflow-owned registry implementation.

~~~text
adapters/engine/
  registry.cjs
  cocos3-discovery.cjs
  shared/
    legacy-backend.cjs
    legacy-compiler.cjs
    node-host.cjs
    asset-transport.cjs
  cocos35/
    index.cjs
    compiler.cjs
    constants.cjs
    host.cjs
    material-editor.ts
  cocos36/
    index.cjs
    compiler.cjs
    host.cjs
    material-editor.ts
  cocos37/
    index.cjs
    compiler.cjs
    host.cjs
    material-editor.ts
  cocos38/
    index.cjs
    compiler.cjs
    host.cjs
    asset-transport.cjs
  cocos4/
    index.cjs
~~~

- registry.cjs selects a backend by engine identity and optional SDK metadata.
- cocos3-discovery.cjs identifies unimplemented 3.x series and reports their missing capabilities.
- Each version-family index declares support, paths and runtime compatibility hooks.
- compiler.cjs implements family-specific compilation; workflow/compiler-engine.js remains the command entry.
- host.cjs installs the selected 3.7/3.8 HTML5 PAL's Node environment when required by the engine preloader. It replaces the former one-line web-adapter bootstrap and exported host installer pair.
- asset-transport.cjs handles the host's asset byte transport.

The existing runtime contract retains webAdapter/webAdapterPath as the preloader hook for compatibility with the 4.x Engine SDK layout. For the 3.8 backend it points directly to host.cjs; this name does not mean a browser preview page Adapter. Browser preview startup, module loading, refresh and diagnostics remain separate concerns.

A future host implementation shared by multiple engine families can move to adapters/host. Engine-specific host behavior stays within its family until sharing is needed.

Both the npm files whitelist and CLI SDK packaging include the new runtime directory. The isolated Jest matrix copies adapters along with the CLI sources. Relocated SDK tests resolve the registry and compiler using only the packaged files.

The earlier full 3.8 acceptance results are documented in engine-adapter-jest.md. Moving this directory does not change the engine compiler output or invalidate those engine caches. Migration verification additionally exercises relocated packaging, both host modes for 3.8.0–3.8.8, and the default 4.x scene suite.

## Migration verification (2026-11-03)

- TypeScript build passed.
- Adapter, selection, diagnostics, SDK and install-workflow checks passed, including a relocated SDK that loads the actual new registry and compiler modules.
- All nine stable versions 3.8.0–3.8.8 passed both asset-host and scene-worker smoke checks (18 runs). Each checks runtime identity, node/descendant paths, rename, Undo/Redo, scene and Prefab round trips, and CCON binary round trips.
- Default 4.0.0-alpha.32 passed the migrated isolated scene matrix: 404 tests, zero failures.
- npm dry-run includes all seven runtime Adapter modules; the release ignore patterns also retain all seven.

Local machine-readable smoke results: .build/adapter-tests/adapter-layout-smoke.json. Default-engine Jest results: .build/adapter-tests/1793679205014-01e425/report.json. Earlier complete historical-version Jest reports are retained without rewriting their original paths.

## Shared legacy implementation

The 3.7 and 3.8 entry points configure shared legacy compiler, backend and Node-host factories. Each family retains its own version predicate, cache identity and preparation hooks. A 3.7 cache cannot satisfy 3.8 readiness, or vice versa. The 3.7 material editor schema is compiled against the selected engine and follows Creator 3.7 state wrappers; it does not borrow engine implementations from 3.8.

Experimental 3.6 support and focused verification are documented in engine-adapter-36.md.

Experimental 3.5 support and focused verification are documented in engine-adapter-35.md.
