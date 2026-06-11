import lodash from 'lodash';
import i18n from '../../base/i18n';
import type { EnumItem } from '../../base/type';

export interface ICocosConfigurationPropertySchema {
    type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'enum';
    default?: unknown;
    title?: string;
    description?: string;
    enum?: Array<string | number | boolean>;
    enumDescriptions?: string[];
    minimum?: number;
    maximum?: number;
    step?: number;
    order?: number;
    properties?: Record<string, ICocosConfigurationPropertySchema>;
    items?: ICocosConfigurationPropertySchema | ICocosConfigurationPropertySchema[];
    additionalProperties?: boolean | ICocosConfigurationPropertySchema;
    required?: string[];
}

export interface ICocosConfigurationNode {
    id: string;
    title: string;
    group: string;
    order?: number;
    properties: Record<string, ICocosConfigurationPropertySchema>;
}

export type ICocosConfigurationMetadataValue = ICocosConfigurationNode[] | Promise<ICocosConfigurationNode[]>;
export type ICocosConfigurationMetadataProvider = () => ICocosConfigurationMetadataValue;
export type ICocosConfigurationMetadataRegistration = ICocosConfigurationNode[] | ICocosConfigurationMetadataProvider;

export function createPropertySchema(schema: ICocosConfigurationPropertySchema): ICocosConfigurationPropertySchema {
    const {
        title,
        description,
        enumDescriptions,
        properties,
        items,
        additionalProperties,
        ...base
    } = schema;

    const result: ICocosConfigurationPropertySchema = {
        ...base,
        title: translateMetadataText(title),
        description: translateMetadataText(description),
        enumDescriptions: enumDescriptions?.map((value) => translateMetadataText(value) ?? value),
    };

    if (properties) {
        result.properties = Object.fromEntries(
            Object.entries(properties).map(([key, value]) => [key, createPropertySchema(value)])
        );
    }

    if (items) {
        result.items = Array.isArray(items)
            ? items.map((item) => createPropertySchema(item))
            : createPropertySchema(items);
    }

    if (typeof additionalProperties === 'object') {
        result.additionalProperties = createPropertySchema(additionalProperties);
    } else if (typeof additionalProperties === 'boolean') {
        result.additionalProperties = additionalProperties;
    }

    return result;
}

export function createNode(
    id: string,
    title: string,
    group: string,
    props: Record<string, ICocosConfigurationPropertySchema>,
    order?: number
): ICocosConfigurationNode {
    const properties: Record<string, ICocosConfigurationPropertySchema> = {};
    for (const key of Object.keys(props)) {
        properties[key] = createPropertySchema(props[key]);
    }
    return {
        id,
        title: translateMetadataText(title) ?? title,
        group,
        order,
        properties,
    };
}

export function createTitleFromKey(key: string): string {
    const normalized = key.replace(/\[\d+\]/g, '').split('.').pop() || key;
    return lodash.startCase(normalized);
}

export function translateMetadataText(value: string | undefined): string | undefined {
    if (!value) {
        return undefined;
    }

    if (!value.startsWith('i18n:')) {
        return value;
    }

    const translated = i18n.transI18nName(value);
    const strippedKey = value.slice('i18n:'.length);
    if (translated && translated !== strippedKey) {
        return translated;
    }

    return value;
}

function resolveDisplayText(
    translatedValue: string | undefined,
    i18nValue: string | undefined
): string | undefined {
    if (translatedValue) {
        return translateMetadataText(translatedValue);
    }

    return translateMetadataText(i18nValue);
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function hasConfigItemShape(value: unknown): value is ICocosConfigurationPropertySchema {
    return !!value
        && typeof value === 'object'
        && 'type' in value
        && typeof (value as { type?: unknown }).type === 'string';
}

function normalizeEnumValue(value: string | number): string | number | boolean {
    if (value === 'true') {
        return true;
    }
    if (value === 'false') {
        return false;
    }
    return value;
}

function resolveEnumItems(items: EnumItem[]): {
    values: Array<string | number | boolean>;
    descriptions?: string[];
} {
    const descriptions: string[] = [];
    const values = items.map((item) => {
        if (typeof item === 'string') {
            descriptions.push(createTitleFromKey(item));
            return normalizeEnumValue(item);
        }

        descriptions.push(resolveDisplayText(item.label, item.labelI18nKey) ?? String(item.value));
        return normalizeEnumValue(item.value);
    });

    return {
        values,
        descriptions: descriptions.length ? descriptions : undefined,
    };
}

type LegacyConfigItemDisplay = {
    label?: string;
    labelI18nKey?: string;
    descriptionI18nKey?: string;
};

function getConfigItemTitle(item: ICocosConfigurationPropertySchema, key: string): string {
    const legacyItem = item as unknown as LegacyConfigItemDisplay;
    return resolveDisplayText(item.title || legacyItem.label, legacyItem.labelI18nKey) ?? createTitleFromKey(key);
}

function getConfigItemDescription(item: ICocosConfigurationPropertySchema): string | undefined {
    const legacyItem = item as unknown as LegacyConfigItemDisplay;
    return resolveDisplayText(item.description, legacyItem.descriptionI18nKey);
}

function inferEnumType(
    values: Array<string | number | boolean>,
    defaultValue: unknown
): ICocosConfigurationPropertySchema['type'] {
    const types = new Set(values.map((value) => typeof value));
    if (types.size === 1) {
        if (types.has('number')) {
            return 'number';
        }
        if (types.has('boolean')) {
            return 'boolean';
        }
    }

    if (typeof defaultValue === 'number') {
        return 'number';
    }

    if (typeof defaultValue === 'boolean') {
        return 'boolean';
    }

    return 'string';
}

function getDefaultFromSchema(schema: ICocosConfigurationPropertySchema): unknown {
    if (schema.default !== undefined) {
        return schema.default;
    }

    if (schema.type === 'array') {
        return [];
    }

    if (schema.type === 'object') {
        if (!schema.properties) {
            return {};
        }

        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(schema.properties)) {
            result[key] = getDefaultFromSchema(value);
        }
        return result;
    }

    return undefined;
}

export function objectSchema(
    properties?: Record<string, ICocosConfigurationPropertySchema>,
    overrides: Partial<ICocosConfigurationPropertySchema> = {}
): ICocosConfigurationPropertySchema {
    const schema: ICocosConfigurationPropertySchema = {
        type: 'object',
        ...overrides,
    };

    if (properties && Object.keys(properties).length) {
        schema.properties = properties;
    }

    if (schema.default === undefined) {
        schema.default = schema.properties ? getDefaultFromSchema(schema) : {};
    }

    if (!schema.properties && schema.additionalProperties === undefined) {
        schema.additionalProperties = true;
    }

    return schema;
}

export function arraySchema(
    items?: ICocosConfigurationPropertySchema | ICocosConfigurationPropertySchema[],
    overrides: Partial<ICocosConfigurationPropertySchema> = {}
): ICocosConfigurationPropertySchema {
    const schema: ICocosConfigurationPropertySchema = {
        type: 'array',
        default: [],
        ...overrides,
    };

    if (items) {
        schema.items = items;
    }

    return schema;
}

export function inferSchemaFromValue(value: unknown, key: string): ICocosConfigurationPropertySchema {
    const title = createTitleFromKey(key);

    if (Array.isArray(value)) {
        const firstItem = value.find((item) => item !== undefined);
        return arraySchema(
            firstItem === undefined ? undefined : inferSchemaFromValue(firstItem, `${key}.item`),
            { title, default: value }
        );
    }

    if (isPlainObject(value)) {
        const properties = Object.fromEntries(
            Object.entries(value).map(([childKey, childValue]) => [childKey, inferSchemaFromValue(childValue, childKey)])
        );
        return objectSchema(properties, { title, default: value });
    }

    if (typeof value === 'number') {
        return { type: 'number', default: value, title };
    }

    if (typeof value === 'boolean') {
        return { type: 'boolean', default: value, title };
    }

    return { type: 'string', default: value ?? '', title };
}

export function convertConfigItem(
    item: ICocosConfigurationPropertySchema,
    key: string
): ICocosConfigurationPropertySchema {
    const title = getConfigItemTitle(item, key);
    const description = getConfigItemDescription(item);

    switch (item.type) {
    case 'string':
        return {
            type: 'string',
            default: item.default,
            title,
            description,
        };

    case 'number':
        return {
            type: 'number',
            default: item.default,
            title,
            description,
            minimum: item.minimum,
            maximum: item.maximum,
            step: item.step,
        };

    case 'boolean':
        return {
            type: 'boolean',
            default: item.default,
            title,
            description,
        };

    case 'enum': {
        const { values, descriptions } = resolveEnumItems(((item as unknown as { items?: EnumItem[] }).items) ?? []);
        const defaultValue = item.default === undefined ? undefined : normalizeEnumValue(item.default as string | number);
        return {
            type: inferEnumType(values, defaultValue),
            default: defaultValue,
            title,
            description,
            enum: values,
            enumDescriptions: descriptions,
        };
    }

    case 'array': {
        const inferredItem = Array.isArray(item.items)
            ? item.items.filter(hasConfigItemShape).map((subItem, index) => convertConfigItem(subItem, `${key}[${index}]`))
            : hasConfigItemShape(item.items)
                ? convertConfigItem(item.items, `${key}.item`)
                : Array.isArray(item.default) && item.default.length
                    ? inferSchemaFromValue(item.default[0], `${key}.item`)
                    : undefined;

        return arraySchema(inferredItem, {
            default: Array.isArray(item.default) ? item.default : [],
            title,
            description,
        });
    }

    case 'object': {
        const declaredProperties: Record<string, ICocosConfigurationPropertySchema> = {};

        for (const [childKey, childItem] of Object.entries(item.properties ?? {})) {
            if (hasConfigItemShape(childItem)) {
                declaredProperties[childKey] = convertConfigItem(childItem, childKey);
            }
        }

        if (isPlainObject(item.default)) {
            for (const [childKey, childValue] of Object.entries(item.default)) {
                if (!declaredProperties[childKey]) {
                    declaredProperties[childKey] = inferSchemaFromValue(childValue, childKey);
                }
            }
        }

        return objectSchema(
            Object.keys(declaredProperties).length ? declaredProperties : undefined,
            {
                default: item.default,
                title,
                description,
                required: item.required,
                additionalProperties: item.additionalProperties,
            }
        );
    }
    }
}
