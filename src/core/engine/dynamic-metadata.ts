import { existsSync, readFileSync } from 'fs';
import path from 'path';
import lodash from 'lodash';
import ts from 'typescript';
import i18n from '../base/i18n';
import type { ICocosConfigurationPropertySchema } from '../configuration/script/metadata';
import { objectSchema, translateMetadataText } from '../configuration/script/metadata';
import type { IEngineConfig } from './@types/config';
import type { IFeatureItem, IModuleItem, ModuleRenderConfig } from './@types/modules';

type Primitive = string | number | boolean;
type FlagValue = boolean | number;
type LocalizationValue = Record<string, unknown>;
export interface IEngineDynamicMetadataSchemas {
    includeModules: ICocosConfigurationPropertySchema;
    flagProperties: Record<string, ICocosConfigurationPropertySchema>;
    flagsObject: ICocosConfigurationPropertySchema;
    macroProperties: Record<string, ICocosConfigurationPropertySchema>;
}

export interface IEngineDynamicConfigDefaults {
    includeModules: string[];
    flags: Record<string, FlagValue>;
    macroConfig: Record<string, Primitive>;
}

export interface IEngineDynamicConfigContribution {
    defaults: IEngineDynamicConfigDefaults;
    metadata: IEngineDynamicMetadataSchemas;
}

export interface IEngineDynamicConfigOptions {
    engineRoot: string;
    fallbackConfig: Pick<IEngineConfig, 'includeModules' | 'flags' | 'macroConfig'>;
}

interface IFeatureDescriptor {
    id: string;
    label: string;
    description?: string;
    default: boolean;
    flags: IFlagDescriptor[];
}

interface IFlagDescriptor {
    key: string;
    label: string;
    description?: string;
    default: FlagValue;
}

interface IMacroDescriptor {
    key: string;
    description?: string;
    default: Primitive;
}

const ENGINE_RENDER_CONFIG_PATH = path.join('editor', 'engine-features', 'render-config.json');
const ENGINE_MACRO_SOURCE_PATH = path.join('cocos', 'core', 'platform', 'macro.ts');

export function getEngineRenderConfig(engineRoot: string): ModuleRenderConfig {
    const renderConfigPath = path.join(engineRoot, ENGINE_RENDER_CONFIG_PATH);
    return JSON.parse(readUtf8File(renderConfigPath)) as ModuleRenderConfig;
}

export function getLocalizedEngineRenderConfig(engineRoot: string): ModuleRenderConfig {
    const locale = i18n._lang ?? 'zh';
    const renderConfig = getEngineRenderConfig(engineRoot);
    const localization = loadLocalization(engineRoot, locale);
    return localizeRenderConfig(renderConfig, localization);
}

export function getEngineDynamicConfigContribution(options: IEngineDynamicConfigOptions): IEngineDynamicConfigContribution {
    try {
        const locale = i18n._lang ?? 'zh';
        const renderConfig = getEngineRenderConfig(options.engineRoot);
        const features = collectFeatureDescriptors(renderConfig);
        const macros = collectMacroDescriptors(options.engineRoot, locale);
        const flagDescriptors = collectFlagDescriptors(features);
        const flagProperties = buildFlagProperties(flagDescriptors);

        return {
            defaults: {
                includeModules: features.filter((feature) => feature.default).map((feature) => feature.id),
                flags: buildFlagDefaults(flagDescriptors),
                macroConfig: buildMacroDefaults(macros),
            },
            metadata: {
                includeModules: buildIncludeModulesSchema(features),
                flagProperties,
                flagsObject: buildFlagsObjectSchema(flagProperties),
                macroProperties: buildMacroProperties(macros),
            },
        };
    } catch (error) {
        console.warn('[Engine] Failed to build dynamic configuration metadata from engine source, fallback to static defaults.', error);
        return createFallbackContribution(options.fallbackConfig);
    }
}

function loadLocalization(engineRoot: string, locale: string): LocalizationValue | undefined {
    const locales = Array.from(new Set([locale, 'zh', 'en']));
    for (const candidate of locales) {
        const localizationPath = path.join(engineRoot, 'editor', 'i18n', candidate, 'localization.js');
        if (!existsSync(localizationPath)) {
            continue;
        }

        try {
            return loadCommonJsModuleFresh(localizationPath) as LocalizationValue;
        } catch (error) {
            console.warn(`[Engine] Failed to load engine localization: ${localizationPath}`, error);
        }
    }

    return undefined;
}

function loadCommonJsModuleFresh(filePath: string): unknown {
    const resolved = require.resolve(filePath);
    delete require.cache[resolved];
    return require(resolved);
}

function collectFeatureDescriptors(
    renderConfig: ModuleRenderConfig
): IFeatureDescriptor[] {
    const descriptors: IFeatureDescriptor[] = [];

    for (const [featureKey, moduleItem] of Object.entries(renderConfig.features)) {
        if (isFeatureGroup(moduleItem)) {
            for (const [optionKey, optionItem] of Object.entries(moduleItem.options)) {
                descriptors.push(createFeatureDescriptor(optionKey, optionItem));
            }
            continue;
        }

        descriptors.push(createFeatureDescriptor(featureKey, moduleItem));
    }

    return descriptors;
}

function isFeatureGroup(moduleItem: IModuleItem): moduleItem is Extract<IModuleItem, { options: Record<string, IFeatureItem> }> {
    return 'options' in moduleItem;
}

function createFeatureDescriptor(
    featureKey: string,
    featureItem: IFeatureItem
): IFeatureDescriptor {
    const flags: IFlagDescriptor[] = [];
    for (const [flagKey, flagItem] of Object.entries(featureItem.flags ?? {})) {
        flags.push({
            key: flagKey,
            label: resolveLocalizationText(flagItem.label, undefined, lodash.startCase(flagKey)) ?? lodash.startCase(flagKey),
            description: resolveLocalizationText(flagItem.description, undefined),
            default: normalizeFlagValue(flagItem.default),
        });
    }

    return {
        id: featureKey,
        label: resolveLocalizationText(featureItem.label, undefined, lodash.startCase(featureKey)) ?? lodash.startCase(featureKey),
        description: resolveLocalizationText(featureItem.description, undefined),
        default: Boolean(featureItem.default),
        flags,
    };
}

function collectFlagDescriptors(features: IFeatureDescriptor[]): IFlagDescriptor[] {
    const propertyMap = new Map<string, IFlagDescriptor>();
    for (const feature of features) {
        for (const flag of feature.flags) {
            if (!propertyMap.has(flag.key)) {
                propertyMap.set(flag.key, { ...flag });
                continue;
            }

            const existing = propertyMap.get(flag.key)!;
            if (!existing.description && flag.description) {
                existing.description = flag.description;
            }
        }
    }

    return Array.from(propertyMap.values());
}

function resolveLocalizationText(
    value: string | undefined,
    localization?: LocalizationValue,
    fallback?: string
): string | undefined {
    if (!value) {
        return fallback;
    }

    if (!value.startsWith('i18n:')) {
        return value;
    }

    const key = value.slice('i18n:'.length);
    const resolved = getByPath(localization, key)
        ?? getByPath(localization, key.split('.').slice(1).join('.'));
    if (typeof resolved === 'string') {
        return resolved;
    }

    const translated = translateMetadataText(value);
    if (translated && translated !== key) {
        return translated;
    }

    return fallback;
}

function localizeRenderConfig(
    renderConfig: ModuleRenderConfig,
    localization?: LocalizationValue
): ModuleRenderConfig {
    return translateRenderConfigValue(renderConfig, localization);
}

function translateRenderConfigValue<T>(value: T, localization?: LocalizationValue): T {
    if (Array.isArray(value)) {
        return value.map((item) => translateRenderConfigValue(item, localization)) as T;
    }

    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>).map(([key, childValue]) => [
                key,
                translateRenderConfigValue(childValue, localization),
            ])
        ) as T;
    }

    if (typeof value === 'string') {
        return translateRenderConfigText(value, localization) as T;
    }

    return value;
}

function translateRenderConfigText(value: string, localization?: LocalizationValue): string {
    if (!value.startsWith('i18n:')) {
        return value;
    }

    return resolveLocalizationText(value, localization, value.slice('i18n:'.length))
        ?? value.slice('i18n:'.length);
}

function getByPath(target: unknown, keyPath: string): unknown {
    if (!target) {
        return undefined;
    }

    const segments = keyPath.split('.');
    let current: unknown = target;
    for (const segment of segments) {
        if (!segment) {
            return undefined;
        }

        if (!current || typeof current !== 'object' || !(segment in current)) {
            return undefined;
        }

        current = (current as Record<string, unknown>)[segment];
    }

    return current;
}

function buildIncludeModulesSchema(features: IFeatureDescriptor[]): ICocosConfigurationPropertySchema {
    return {
        type: 'array',
        default: features.filter((feature) => feature.default).map((feature) => feature.id),
        title: 'i18n:configuration.engine.dynamic.includeModules.title',
        description: 'i18n:configuration.engine.dynamic.includeModules.description',
        items: {
            type: 'string',
            title: 'i18n:configuration.engine.dynamic.includeModules.itemTitle',
            enum: features.map((feature) => feature.id),
            enumDescriptions: features.map((feature) => {
                if (feature.description && feature.description !== feature.label) {
                    return `${feature.label} - ${feature.description}`;
                }
                return feature.label;
            }),
        },
    };
}

function buildFlagProperties(flags: IFlagDescriptor[]): Record<string, ICocosConfigurationPropertySchema> {
    const properties: Record<string, ICocosConfigurationPropertySchema> = {};
    for (const flag of flags) {
        properties[flag.key] = {
            type: inferPrimitiveSchemaType(flag.default),
            default: flag.default,
            title: flag.label,
            description: flag.description,
        };
    }

    return properties;
}

function buildFlagDefaults(flags: IFlagDescriptor[]): Record<string, FlagValue> {
    return Object.fromEntries(
        flags.map((flag) => [flag.key, flag.default])
    );
}

function buildFlagsObjectSchema(
    flagProperties: Record<string, ICocosConfigurationPropertySchema>
): ICocosConfigurationPropertySchema {
    const defaults = Object.fromEntries(
        Object.entries(flagProperties).map(([key, value]) => [key, value.default])
    );

    return objectSchema(flagProperties, {
        default: defaults,
        title: 'i18n:configuration.engine.dynamic.flags.title',
        description: 'i18n:configuration.engine.dynamic.flags.description',
    });
}

function buildMacroProperties(macros: IMacroDescriptor[]): Record<string, ICocosConfigurationPropertySchema> {
    const properties: Record<string, ICocosConfigurationPropertySchema> = {};

    for (const macro of macros) {
        properties[macro.key] = {
            type: inferPrimitiveSchemaType(macro.default),
            default: macro.default,
            title: macro.key,
            description: macro.description,
        };
    }

    return properties;
}

function buildMacroDefaults(macros: IMacroDescriptor[]): Record<string, Primitive> {
    return Object.fromEntries(
        macros.map((macro) => [macro.key, macro.default])
    );
}

function collectMacroDescriptors(engineRoot: string, locale: string): IMacroDescriptor[] {
    const macroPath = path.join(engineRoot, ENGINE_MACRO_SOURCE_PATH);
    const source = readUtf8File(macroPath);
    const sourceFile = ts.createSourceFile(macroPath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const macroDefaults = collectMacroDefaultValues(sourceFile);
    const macroInterface = sourceFile.statements.find((statement): statement is ts.InterfaceDeclaration => {
        return ts.isInterfaceDeclaration(statement) && statement.name.text === 'Macro';
    });

    if (!macroInterface) {
        return [];
    }

    const descriptors: IMacroDescriptor[] = [];
    for (const member of macroInterface.members) {
        if (!ts.isPropertySignature(member) || !member.name) {
            continue;
        }

        const key = getPropertyNameText(member.name);
        if (!key || !macroDefaults.has(key)) {
            continue;
        }

        const docs = extractJSDocTexts(member);
        if (!docs.defaultTag) {
            continue;
        }

        descriptors.push({
            key,
            description: locale === 'en' ? docs.en ?? docs.zh : docs.zh ?? docs.en,
            default: macroDefaults.get(key)!,
        });
    }

    return descriptors;
}

function collectMacroDefaultValues(sourceFile: ts.SourceFile): Map<string, Primitive> {
    const defaults = new Map<string, Primitive>();

    for (const statement of sourceFile.statements) {
        if (!ts.isVariableStatement(statement)) {
            continue;
        }

        for (const declaration of statement.declarationList.declarations) {
            if (!ts.isIdentifier(declaration.name) || declaration.name.text !== 'macro') {
                continue;
            }

            if (!declaration.initializer || !ts.isObjectLiteralExpression(declaration.initializer)) {
                continue;
            }

            for (const property of declaration.initializer.properties) {
                if (!ts.isPropertyAssignment(property) || !property.name) {
                    continue;
                }

                const key = getPropertyNameText(property.name);
                const value = evaluatePrimitiveExpression(property.initializer);
                if (!key || value === undefined) {
                    continue;
                }

                defaults.set(key, value);
            }
        }
    }

    return defaults;
}

function getPropertyNameText(name: ts.PropertyName): string | undefined {
    if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) {
        return name.text;
    }

    return undefined;
}

function evaluatePrimitiveExpression(expression: ts.Expression): Primitive | undefined {
    if (ts.isParenthesizedExpression(expression)) {
        return evaluatePrimitiveExpression(expression.expression);
    }

    if (expression.kind === ts.SyntaxKind.TrueKeyword) {
        return true;
    }

    if (expression.kind === ts.SyntaxKind.FalseKeyword) {
        return false;
    }

    if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
        return expression.text;
    }

    if (ts.isNumericLiteral(expression)) {
        return Number(expression.text);
    }

    if (ts.isPrefixUnaryExpression(expression)) {
        const operand = evaluatePrimitiveExpression(expression.operand);
        if (typeof operand !== 'number') {
            return undefined;
        }

        if (expression.operator === ts.SyntaxKind.MinusToken) {
            return -operand;
        }

        if (expression.operator === ts.SyntaxKind.PlusToken) {
            return operand;
        }
    }

    return undefined;
}

function extractJSDocTexts(node: ts.Node): {
    zh?: string;
    en?: string;
    defaultTag?: string;
} {
    const result: {
        zh?: string;
        en?: string;
        defaultTag?: string;
    } = {};

    for (const tag of ts.getJSDocTags(node)) {
        const name = tag.tagName.text;
        const comment = normalizeDocText(flattenTagComment(tag.comment));
        if (!comment) {
            continue;
        }

        if (name === 'zh') {
            result.zh = comment;
        } else if (name === 'en') {
            result.en = comment;
        } else if (name === 'default') {
            result.defaultTag = comment;
        }
    }

    return result;
}

function flattenTagComment(comment: ts.JSDocTag['comment']): string | undefined {
    if (!comment) {
        return undefined;
    }

    if (typeof comment === 'string') {
        return comment;
    }

    if (Array.isArray(comment)) {
        return comment.map((part) => typeof part === 'string' ? part : part.text).join('');
    }

    return undefined;
}

function normalizeDocText(text: string | undefined): string | undefined {
    if (!text) {
        return undefined;
    }

    return text.replace(/\r\n/g, '\n').trim();
}

function readUtf8File(filePath: string): string {
    return readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
}

function normalizeFlagValue(value: unknown): FlagValue {
    if (typeof value === 'number') {
        return value;
    }

    return Boolean(value);
}

function normalizePrimitiveValue(value: unknown): Primitive {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }

    return Boolean(value);
}

function inferPrimitiveSchemaType(value: Primitive): ICocosConfigurationPropertySchema['type'] {
    if (typeof value === 'number') {
        return 'number';
    }

    if (typeof value === 'boolean') {
        return 'boolean';
    }

    return 'string';
}

function normalizeFallbackConfig(
    fallbackConfig: Pick<IEngineConfig, 'includeModules' | 'flags' | 'macroConfig'>
): IEngineDynamicConfigDefaults {
    return {
        includeModules: [...(fallbackConfig.includeModules ?? [])],
        flags: Object.fromEntries(
            Object.entries(fallbackConfig.flags ?? {}).map(([key, value]) => [key, value])
        ),
        macroConfig: Object.fromEntries(
            Object.entries(fallbackConfig.macroConfig ?? {}).map(([key, value]) => [key, normalizePrimitiveValue(value)])
        ),
    };
}

function createFallbackContribution(
    fallbackConfig: Pick<IEngineConfig, 'includeModules' | 'flags' | 'macroConfig'>
): IEngineDynamicConfigContribution {
    const normalizedFallback = normalizeFallbackConfig(fallbackConfig);
    const flagProperties = Object.fromEntries(
        Object.entries(normalizedFallback.flags).map(([key, value]) => [key, {
            type: typeof value === 'number' ? 'number' : 'boolean',
            default: value,
            title: key,
        } satisfies ICocosConfigurationPropertySchema])
    );

    const macroProperties = Object.fromEntries(
        Object.entries(normalizedFallback.macroConfig).map(([key, value]) => [key, {
            type: inferPrimitiveSchemaType(value),
            default: value,
            title: key,
        } satisfies ICocosConfigurationPropertySchema])
    );

    return {
        defaults: normalizedFallback,
        metadata: {
            includeModules: {
                type: 'array',
                default: normalizedFallback.includeModules,
                title: 'i18n:configuration.engine.dynamic.includeModules.title',
                description: 'i18n:configuration.engine.dynamic.includeModules.description',
                items: {
                    type: 'string',
                    title: 'i18n:configuration.engine.dynamic.includeModules.itemTitle',
                },
            },
            flagProperties,
            flagsObject: buildFlagsObjectSchema(flagProperties),
            macroProperties,
        },
    };
}
