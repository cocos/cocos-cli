const ASSET_BASE_TYPE = 'cc.Asset';

export interface IAssetReferenceInfo {
    uuid: string;
    type: string;
    name?: string;
    url?: string;
    imported?: boolean;
    invalid?: boolean;
    extends?: string[];
    subAssets?: Record<string, IAssetReferenceInfo>;
}

export type AssetReferenceInfoQuery = (
    urlOrUuid: string,
) => IAssetReferenceInfo | null | Promise<IAssetReferenceInfo | null>;

export class AssetReferenceValidationError extends Error {
    readonly code = 'INVALID_ASSET_REFERENCE';

    constructor(message: string) {
        super(message);
        this.name = 'AssetReferenceValidationError';
    }
}

export function getExpectedAssetType(propertyDump: any): string | null {
    const typeDump = propertyDump?.isArray ? propertyDump.elementTypeData : propertyDump;
    if (!typeDump || typeof typeDump.type !== 'string') {
        return null;
    }

    const inheritance = Array.isArray(typeDump.extends) ? typeDump.extends : [];
    return typeDump.type === ASSET_BASE_TYPE || inheritance.includes(ASSET_BASE_TYPE)
        ? typeDump.type
        : null;
}

export async function resolveAssetReference(
    value: unknown,
    expectedType: string,
    propertyName: string,
    queryAssetInfo: AssetReferenceInfoQuery,
): Promise<unknown> {
    if (!isAssetReferenceValue(value)) {
        return value;
    }

    const requestedReference = value.uuid;
    if (!requestedReference || requestedReference.startsWith('ui-')) {
        return value;
    }

    const assetInfo = await queryAssetInfo(requestedReference);
    if (!assetInfo) {
        // Historical UUIDs must continue through the shared dump decoder so its
        // existing placeholder behavior remains unchanged. db:// is a new CLI
        // convenience syntax and must resolve before it is sent to the decoder.
        if (requestedReference.startsWith('db://')) {
            throw new AssetReferenceValidationError(
                `Invalid asset reference for property '${propertyName}': '${requestedReference}' cannot be resolved. ` +
                'Refresh the asset database and try again.',
            );
        }
        return value;
    }

    if (isTypeCompatible(assetInfo, expectedType)) {
        return requestedReference === assetInfo.uuid
            ? value
            : { ...value, uuid: assetInfo.uuid };
    }

    const subAssets = collectSubAssets(assetInfo);
    const compatibleSubAssets = subAssets.filter((candidate) => isTypeCompatible(candidate, expectedType));
    if (compatibleSubAssets.length === 1) {
        return { ...value, uuid: compatibleSubAssets[0].uuid };
    }

    const compatibleDescription = compatibleSubAssets.length > 0
        ? compatibleSubAssets.map(describeAsset).join(', ')
        : 'none';
    const availableDescription = subAssets.length > 0
        ? subAssets.map(describeAsset).join(', ')
        : 'none';
    throw new AssetReferenceValidationError(
        `Invalid asset reference for property '${propertyName}': expected ${expectedType}, ` +
        `but '${requestedReference}' is ${assetInfo.type}. Compatible sub-assets: ${compatibleDescription}. ` +
        `Available sub-assets: ${availableDescription}.`,
    );
}

function isAssetReferenceValue(value: unknown): value is { uuid: string; [key: string]: unknown } {
    return Boolean(
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        typeof (value as { uuid?: unknown }).uuid === 'string',
    );
}

function isTypeCompatible(assetInfo: IAssetReferenceInfo, expectedType: string): boolean {
    return assetInfo.type === expectedType || Boolean(assetInfo.extends?.includes(expectedType));
}

function collectSubAssets(assetInfo: IAssetReferenceInfo): IAssetReferenceInfo[] {
    const result: IAssetReferenceInfo[] = [];
    const seen = new Set<string>();

    const visit = (subAssets?: Record<string, IAssetReferenceInfo>) => {
        for (const child of Object.values(subAssets ?? {})) {
            if (!child?.uuid || seen.has(child.uuid)) {
                continue;
            }
            seen.add(child.uuid);
            result.push(child);
            visit(child.subAssets);
        }
    };

    visit(assetInfo.subAssets);
    return result;
}

function describeAsset(assetInfo: IAssetReferenceInfo): string {
    const label = assetInfo.url || assetInfo.name || assetInfo.uuid;
    return `${label} (uuid: ${assetInfo.uuid}, type: ${assetInfo.type})`;
}
