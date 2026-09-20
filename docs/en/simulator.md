# Simulator compilation and artifacts

The CLI owns native simulator and engine runtime compilation, artifact discovery, and build events. Preview servers, resource preparation, simulator process sessions and the former simulator preview command belong to the private editor package. Running an ordinary built project remains supported.

Run `npm run build:simulator`, or `build:simulator:native` / `build:simulator:runtime` separately. The SDK `Simulator` export retains `build`, `buildNative`, `buildRuntime`, `isBuilt`, `getManifest`, `getExecutablePath`, `onLog`, and `onDidChangeBuildState`. Builds are serialized per engine; concurrent requests for the same step share a promise. `isBuilt` checks only the native executable.

Native output: `<engine>/native/simulator/Release`. Runtime output: `<engine>/bin/simulator`. Successful builds write `simulator-artifact.json` with format version, artifact kind, platform, architecture, engine version and build timestamp. Queries reject incompatible metadata; legacy artifacts without metadata are accepted and should be rebuilt. Consumers receive paths through the manifest and must keep generated project preview resources outside these shared directories.

`npm run build` does not compile the simulator; release retains its simulator build steps. Native compilation requires the platform toolchain. IDE integrations must import preview/session APIs from `@cocos/scene-editor`; the CLI does not depend on that package.
