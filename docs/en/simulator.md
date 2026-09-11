# Cocos CLI Simulator

The simulator module lets Cocos CLI build a native simulator executable, prepare the runtime resources it needs, and launch a preview session that runs a project's scene in a standalone native window. It covers the full chain: build → prepare resources → start preview server → spawn the simulator process.

## 1. Build

The simulator has two buildable parts — the **native executable** and the **runtime TypeScript artifacts**. They can be built separately or together:

```bash
npm run build:simulator:native   # native executable (workflow/build-simulator.js)
npm run build:simulator:runtime  # engine runtime TS artifacts (workflow/build-simulator-runtime.js)
npm run build:simulator          # both, in order
```

`npm run build` does **not** build the simulator. The release pipeline (`workflow/release.js`) builds it automatically before packaging, so a plain release already includes a working simulator.

Runtime artifacts (`packages/engine/bin/simulator/{import-map.json,system.bundle.js,polyfills.bundle.js}` and `packages/engine/bin/**`) are git-ignored — a fresh clone must run `npm run build:simulator:runtime` before the tests or the launcher will work.

## 2. Implementation

| File | Responsibility |
| :--- | :--- |
| `src/core/simulator/index.ts` | Orchestration: preview server, build, `prepareResources`, process lifecycle |
| `src/core/simulator/internal.ts` | Pure logic: platform artifact table, path resolution, CLI args, `config.json`, preload asset trimming |
| `src/core/simulator/runtime-writer.ts` | Writes runtime artifacts: settings / bundle index / `cc/env` / template rendering / validation |
| `static/simulator/main.ejs` | Simulator bootstrap |
| `workflow/build-simulator-runtime.js` | Engine runtime artifacts + `packages/engine/bin/simulator/import-map.json` |
| `workflow/build-simulator.js` | Native executable |
| `src/lib/simulator/simulator.ts` | Public command layer (facade) |

`internal.ts` and `runtime-writer.ts` were split out of `index.ts` so they can be unit-tested against a temp directory without depending on the builder / asset-db / preview server.

## 3. Public API

The facade `src/lib/simulator/simulator.ts` exports 19 functions. Every export is part of the public protocol — removing or renaming one after integration is a breaking change.

| Category | Signature | Description |
| :--- | :--- | :--- |
| Lifecycle | `init(projectPath): Promise<void>` | Records the project path as the default for later calls |
| Build | `build(enginePath?): Promise<void>` | Native + runtime; concurrent calls are deduped |
| | `buildNative(enginePath?): Promise<void>` | Native executable only |
| | `buildRuntime(enginePath?): Promise<void>` | Runtime TS artifacts only |
| | `isBuilt(enginePath?): Promise<boolean>` | Whether the native executable exists and matches the host platform |
| Paths | `getManifest(enginePath?)` | Host platform artifact info (`bundle` / `entry` / `builtAt`); `null` if unsupported |
| | `getExecutablePath(enginePath?)` | Absolute path to the native executable; `null` if not built |
| | `getResourcesPath(enginePath?)` | Default runtime artifact location (macOS `Contents/Resources`, Windows `Release/`) |
| | `getWritablePath(enginePath?)` | Native `-writable-path` (Windows `%LOCALAPPDATA%/SimulatorApp-Win32/debugruntime`) |
| Run | `prepareResources(options?)` | Writes settings / bundle index / engine artifacts / `config.json`; deduped per output dir |
| | `launchPreview(options?)` | Preview server → `prepareResources` → spawn. **Stop-then-start**, so it is also the restart entry |
| | `start(options)` | Low-level spawn: no preview server, no resource prep, does not stop existing sessions (multi-instance) |
| | `stop(id): Promise<boolean>` | Stops one session via `treeKill`; `false` if absent or already stopped |
| | `stopAll(): Promise<number>` | Stops all running sessions; call when closing / switching a project |
| | `getStatus(id)` | Session state; `null` if absent |
| | `listSessions()` | All sessions, including stopped ones |
| Events | `onDidChangeSession(listener)` | Session lifecycle changes |
| | `onLog(listener)` | Line-by-line stdout/stderr |
| | `onDidChangeBuildState(listener)` | Build phase state |

Each `onXxx(listener)` returns a dispose function that unsubscribes.

### 3.1 Events

```typescript
/** Fires on spawn, first stdout line (readyAt), exit, spawn error, and stop. */
export function onDidChangeSession(
    listener: (session: ISimulatorSessionInfo) => void,
): () => void;

/** One line of output from the simulator process or a build script. */
export function onLog(
    listener: (entry: ISimulatorLogEntry) => void,
): () => void;

/** Build phase state: start / success / failed (no percentage). */
export function onDidChangeBuildState(
    listener: (state: ISimulatorBuildState) => void,
): () => void;
```

`onDidChangeSession` is intentionally a single event rather than separate `onDidStart` / `onDidExit` — the `status` / `readyAt` / `exitCode` / `signal` fields are enough to tell running, ready, normal exit, and crash apart.

### 3.2 Key types

| Type | Fields |
| :--- | :--- |
| `ISimulatorSessionInfo` | `id` / `pid` / `status` / `startedAt` / `readyAt` / `exitedAt` / `exitCode` / `signal` / `runtimeRoot` / `enginePath` / `executablePath` / `args` |
| `ISimulatorLogEntry` | `source` (`'simulator'` \| `'build'`) / `level` (`'log'` \| `'error'`) / `message` / `sessionId?` |
| `ISimulatorBuildState` | `step` (`'native'` \| `'runtime'`) / `state` (`'start'` \| `'success'` \| `'failed'`) / `error?` |

All payloads are plain JSON values.

## 4. Runtime Paths

`prepareResources` / `launchPreview` accept two optional overrides. Defaults are unchanged when omitted:

| Option | Omitted | Provided |
| :--- | :--- | :--- |
| `runtimeRoot` | Simulator's own resource dir (macOS `Contents/Resources`, Windows `Release/`) | Writes only to this dir, never touches the app bundle |
| `writablePath` | Platform's real writable path (or follows `runtimeRoot` if set) | Second `config.json` write dir (native `-writable-path`); resolved against `runtimeRoot` |

`writablePath` follows `runtimeRoot` on purpose: the intent of overriding `runtimeRoot` is to avoid touching the real product directory, and on Windows `config.json` would otherwise still land in `%LOCALAPPDATA%`. The native executable is still read from `enginePath`'s `Release` dir and is unaffected by either option.

## 5. Process Management

- **Stop-then-start**: `launchPreview` stops all running sessions before spawning a new one, so calling it again with new resolution / orientation is the restart path.
- **`treeKill`**: `stop` / `stopAll` kill the whole process tree, covering child processes the simulator may spawn.
- **Stop and cancellation**: `stopAll()` cancels pending launches and terminates build processes. Termination escalates from SIGTERM to SIGKILL after 3 seconds, then waits another 3 seconds. An unconfirmed exit rejects instead of reporting stopped.
- **Exit fallback**: normal process exit performs best-effort cleanup. SIGKILL or forced host termination may bypass this handler; hosts should explicitly call `stopAll()` before closing a project.
- **Runtime directory**: single-simulator usage allows subsequent operations to overwrite shared output. No multi-instance isolation or cross-process lock is provided. Preparation clears old engine scripts and effect.bin; a failed preparation must be retried.
- **Status and history**: `start()` waits for process creation and rejects on failure. `readyAt` still means first stdout, not successful scene loading. Child references are released on close while session history remains available.

## 6. Testing

```bash
npx jest tests/simulator-
```

3 test files grouped into 6 areas. A fresh clone must run `npm run build:simulator:runtime` first. Runtime artifacts are allowed dependencies; native executables, spawned processes and jsb calls are mocked, so tests do not require building or launching the native simulator.

| Area | File | Covers |
| :--- | :--- | :--- |
| `simulator-internal` | `simulator-manager.test.ts` | Platform artifact table, path resolution, win32 branches, `config.json` double-write, preload asset trimming |
| `simulator-build-artifacts` | `simulator-runtime.test.ts` | Artifact table parity with `workflow/build-simulator.js`, `import-map.json` consistency, `main.ejs` bootstrap invariants |
| `simulator-runtime-writer` | `simulator-runtime.test.ts` | Settings / bundle index / `cc/env` output, template rendering, error messages |
| `simulator-prepare-resources` | `simulator-runtime.test.ts` | `prepareResources()` end-to-end: artifact locations, `builtinAssets` trimming, bundle cleanup, idempotency |
| `simulator-manager` | `simulator-manager.test.ts` | Process orchestration: stdio pipe + line-by-line `onLog`, session events, `treeKill`, build event broadcast, `launchPreview` stop-then-start |
| `simulator-facade` | `simulator-facade.test.ts` | Facade export signatures: 19 functions, `onXxx` return dispose, absent helpers |

The `prepareResources` end-to-end test points `runtimeRoot` at a temp dir. Project / preview server dependencies and native executable detection are mocked; runtime artifacts use real files.
