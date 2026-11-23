# Build configuration discovery and validation

These APIs require an initialized project, selected engine and initialized builder. They are available through BuilderApi / MCP. Configuration discovery does not start a build.

| Tool | Arguments | Result data |
| --- | --- | --- |
| builder-query-platforms | None | Registered platforms and their metadata |
| builder-query-default-build-config | platform | Existing platform defaults |
| builder-query-build-config-schema | platform | common, platformOptions, supportPlatforms |
| builder-query-engine-modules | None | modules and selectedModules |
| builder-validate-build-config | platform, options | valid, errors, warnings, checks |

Use the platform identifiers returned by discovery. Module identifiers come from the selected engine, not a fixed list. Display groups are excluded; dependency and environment information is preserved from engine configuration.

The configuration schema is the builder's field schema, also used by the IDE. It is not a standalone JSON Schema document. Common fields belong at the top level. Platform-specific fields belong in packages[platform]. Existing lib/builder exports getPlatformBuildSchema and queryPlatformConfig expose the same discovery information. New lib/builder exports queryEngineModules and validateBuildConfig provide module discovery and validation.

Example validation request:

~~~json
{
  "platform": "taobao-mini-game",
  "options": {
    "debug": false,
    "includeModules": ["base", "gfx-webgl", "2d", "ui"],
    "packages": { "taobao-mini-game": { "appid": "your-app-id" } }
  }
}
~~~

Validation overlays partial input on current platform defaults without writing configuration. A successful API call (code 200) can return valid: false: inspect data.errors. Warnings alone do not make the configuration invalid. Per-field checks retain any fixedValue suggestion from existing builder rules; suggestions are not silently applied. Unknown engine modules and conflicting platform identifiers are rejected before platform rules execute. Exceptions return the standard failure envelope.

Validation uses existing builder field rules. It does not resolve the final dependency graph, guarantee toolchain availability, or replace validation performed during the actual build. It does not return a final resolved build configuration. Dependencies and platform restrictions must still be processed by the engine compiler.

Recommended sequence: discover platforms, read defaults and field schema, query engine modules, validate options, then call builder-build. The same options can be saved as a JSON file and passed to the CLI with --build-config. Do not assume a platform plugin is runnable on the current host merely because it is registered.
