# Native Module .node Injection (gl / sharp ABI Adaptation for Host Electron)

## Background

cocos-cli depends on two native modules:

- `gl` (headless-gl): loads `build/Release/webgl.node` via `bindings('webgl')`
- `sharp`: loads its native binding via `require('../build/Release/sharp-<platformAndArch>.node')`

These `.node` binaries are tightly coupled to the ABI of the Node/Electron runtime that
loads them. When a cocos-cli process is started by a host Electron runtime (e.g. pink /
Cocos Creator editor), the `.node` binaries bundled with cocos-cli may not match the
host's Electron version, causing load failures.

## Mechanism

Via patch-package patches (`patches/gl+9.0.0-rc.10.patch`, `patches/sharp+0.32.6.patch`),
the gl / sharp native binding loaders read environment variables. When an env var is
set, the `.node` file at the specified path is loaded; otherwise the bundled default
binary is used. **When unset, behavior is identical to before.**

## Env Var Contract (host side)

| Env var | Meaning | Example value |
|---|---|---|
| `COCOS_CLI_GL_NODE` | Path to the gl (webgl) native binding `.node` | `/path/to/electron/webgl.node` |
| `COCOS_CLI_SHARP_NODE` | Path to the sharp native binding `.node` | `/path/to/electron/sharp-darwin-arm64v8.node` |

> The path should be absolute. When unset or empty, cocos-cli falls back to its bundled `.node`.

### pink CocosMainService usage example

Pass the env vars when spawning the cocos-cli process:

```ts
const child = spawn(cocosCliEntry, args, {
    env: {
        ...process.env,
        COCOS_CLI_GL_NODE: path.join(pinkNativeDir, 'webgl.node'),
        COCOS_CLI_SHARP_NODE: path.join(pinkNativeDir, 'sharp-darwin-arm64v8.node'),
    },
});
```

## Child Process Propagation

cocos-cli's internal child processes (effect compilation, builder workers, scene process,
script/engine compilation, etc.) are launched via `spawn`/`fork` without an explicit `env`
override, so they **automatically inherit** the main process env vars. The host only needs
to set the env vars on the main process to cover the whole chain.

## Patch Maintenance

- Patch files: `patches/gl+9.0.0-rc.10.patch`, `patches/sharp+0.32.6.patch`
- Apply/rebuild: `npm run rebuild` (runs patch-package + @electron/rebuild)
- Apply manually: `npx patch-package`
- Regenerate patches (after modifying node_modules):

  ```sh
  npx patch-package gl sharp --exclude 'build/|node-addon-api'
  ```

  > Note: passing multiple `--exclude` values merges them into a single regex (with a
  > literal comma), so use an alternation inside one regex (e.g. `'build/|node-addon-api'`);
  > paths are relative to the package root (no leading `/`), so `build/` matches `build/...`.
