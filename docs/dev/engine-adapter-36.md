# Experimental Cocos 3.6 adapter

Exact stable 3.6.0–3.6.3 sources, commits and matching externals are recorded in .build/engine-versions/sources36.json. All four locked dependency installations and editor/web compilations completed. Original engine checkouts are unchanged. Runtime selection requires experimental opt-in.

## Compatibility changes

- Add missing decorator optimization configuration with empty optimization lists only in disposable compiler input. Preserve the selected engine's own decorator implementation.
- Use a relative output directory for the older declaration bundler and compatible isolatedModules settings in disposable source copies.
- Compile legacy material state wrappers against 3.6 core gfx imports. The schema derives from Creator 3.7 state wrappers; no newer engine implementation is loaded.
- Export the selected engine's actual color conversion, custom graph types and EmptyDevice. Do not export nonexistent archive helpers.
- Load reflection probe and LOD editor utilities on use. Unsupported features no longer block unrelated scene services at import time.
- Handle absent light probe globals during scene activation. Hide and mark unavailable node mobility fields readonly.
- Preserve Scene UUIDs during serialization. In 3.6 Scene inherits BaseNode rather than Node, so the old Node-only identity branch omitted the root ID. A reload then changed the root identity and safely blocked Undo. Explicit Scene handling preserves identity without relaxing Undo target validation.
- Keep each family cache separate and include 3.6 runtime sources/caches in SDK packaging and isolated test snapshots.

## Validation

All four versions initially completed the selected real-engine core matrix with 39 passing assertions and four failing reload/nested-Prefab Undo assertions. Material Inspector, Prefab resource-refresh Undo and classic animation graph operations passed. After the Scene identity fix, all four versions passed the 34-assertion serialized-node/runtime-identity follow-up with zero failures. Original reports are retained:

- .build/adapter-tests/engine36-core/report.json
- .build/adapter-tests/engine36-undo-corrected/report.json

The real 3.6.3 scene-worker smoke also passed initialization, node/descendant paths, rename, Undo/Redo, scene and Prefab persistence, and CCON binary round trips. Two unit suites covering light-probe activation and reflection-probe transactions passed 35 assertions. This is focused headless validation, not a complete default Jest baseline or GPU/browser/native acceptance.

## Capability limits

3.6 lacks reflection probe and LOD editor modules, light probe scene globals, node MobilityMode, Pose Graphs, newer graph binding classes and auxiliary curves. These features must not be fabricated or shown as supported. Modern custom layout archive serialization is unavailable. Browser preview, native builds and device rendering require separate acceptance.

All changes remain local; no commits or pushes were made.

Additional real-engine regression passed on 3.6.3 and default 4.0.0-alpha.32: 69 script-manager/serialization/runtime-identity assertions each, zero failures. Serial Adapter, discovery and SDK packaging checks passed 46 assertions. Original failed iterations remain available. No complete default Jest, GPU, browser or native certification is claimed.

## Bake settings compatibility

The generated 3.6 `cc/editor/cli-host` module maps `cc.ModelBakeSettings` to the
engine's native `cc.ModelLightmapSettings` class. Its renderer decoder accepts
both `bakeSettings` and `lightmapSettings`, preserving the texture and UV values
supported by 3.6. Native serialization field lists and project source data are
not changed. This does not implement newer light-probe, reflection-probe or LOD
features. Browser runtimes load the adapter module before project assets.

Adapter cache version `cocos-3.6-cli-2` requires regenerating both editor and Web
outputs when upgrading from the previous adapter cache.
