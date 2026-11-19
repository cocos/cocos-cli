import { createBuilderRenderSchema } from './metadata';
import type { IPlatformBuildPluginConfig } from '../@types/protected';
import type { ICocosConfigurationPropertySchema } from '../../configuration/script/metadata';

function copyValidation(source: unknown, schema: ICocosConfigurationPropertySchema): void {
    if (!source || typeof source !== 'object') { return; }
    const item = source as Record<string, unknown>;
    Object.assign(schema, { verifyRules: item.verifyRules, verifyLevel: item.verifyLevel });
    if (schema.properties && item.properties && typeof item.properties === 'object') {
        const properties = item.properties as Record<string, unknown>;
        for (const [key, field] of Object.entries(schema.properties)) {
            copyValidation(properties[key], field);
        }
    }
    if (schema.items && item.type === 'array') {
        if (Array.isArray(schema.items)) {
            schema.items.forEach((field, index) => copyValidation(Array.isArray(item.items) ? item.items[index] : item.items, field));
        } else {
            copyValidation(item.items, schema.items);
        }
    }
}

/** Internal platform packaging: CLI and PinK share execution config, with separate discovery entries. */
export function createPinKPlatformConfig(config: IPlatformBuildPluginConfig, platform: string) {
    const schema = createBuilderRenderSchema(config.options || {}, platform);
    for (const [key, field] of Object.entries(schema.properties || {})) {
        copyValidation(config.options?.[key], field);
    }
    // Retain execution-only options omitted from the display schema, including their defaults.
    const { hooks, ...execution } = config;
    return { ...execution, schema };
}
