import type { AssetPropertySchemaMap } from './@types/public';
import { createPropertySchema } from '../configuration/script/metadata';

export function createAssetPropertySchemaMap(
    config: AssetPropertySchemaMap | undefined
): AssetPropertySchemaMap {
    const result: AssetPropertySchemaMap = {};
    if (!config) {
        return result;
    }

    for (const [key, schema] of Object.entries(config)) {
        result[key] = createPropertySchema(schema);
    }

    return result;
}
