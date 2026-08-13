const UUID_PATTERN = '[\\da-f]{8}-[\\da-f]{4}-[\\da-f]{4}-[\\da-f]{4}-[\\da-f]{12}';
const DOWNLOAD_FAILED_RE = new RegExp(`download failed: .*\\/(${UUID_PATTERN}(?:@[^.?\\s/]+)?)\\.(?:json|bin)`, 'i');
const ASSET_FETCH_FAILED_RE = new RegExp(`asset fetch failed\\s*\\(\\s*404\\s*\\)\\s*:\\s*(${UUID_PATTERN}(?:@[^\\s]+)?)`, 'i');

function extractMissingUuid(errInfo: string): string | null {
    const knownFormat = DOWNLOAD_FAILED_RE.exec(errInfo) || ASSET_FETCH_FAILED_RE.exec(errInfo);
    return knownFormat?.[1] ?? null;
}

export async function enrichMissingDependencyError(
    errInfo: string,
    ownerAsset: string,
    queryAssetInfo?: (uuid: string) => Promise<{ url?: string } | null>,
    querySubAssetName?: (mainUuid: string, subId: string) => Promise<string | null>,
): Promise<string> {
    const missingUuid = extractMissingUuid(errInfo);
    if (!missingUuid) {
        return `The asset ${ownerAsset} cannot be loaded. Detail: ${errInfo}`;
    }
    let assetDesc = missingUuid;

    if (queryAssetInfo) {
        try {
            const info = await queryAssetInfo(missingUuid);
            if (info?.url) {
                assetDesc = `"${info.url}" (uuid: ${missingUuid})`;
            } else if (missingUuid.includes('@')) {
                const [mainUuid, subId] = missingUuid.split('@');
                const parentInfo = await queryAssetInfo(mainUuid);
                let subName: string | null = null;
                if (querySubAssetName) {
                    try {
                        subName = await querySubAssetName(mainUuid, subId);
                    } catch {
                        // querySubAssetName may fail if meta is unavailable
                    }
                }
                if (parentInfo?.url && subName) {
                    assetDesc = `"${parentInfo.url}/${subName}" (uuid: ${missingUuid})`;
                } else if (parentInfo?.url) {
                    assetDesc = `"${parentInfo.url}@${subId}" (uuid: ${missingUuid})`;
                } else if (subName) {
                    assetDesc = `"${subName}" (uuid: ${missingUuid})`;
                }
            }
        } catch {
            // asset DB may not resolve missing assets
        }
    }
    return `The asset ${ownerAsset} cannot be loaded because a dependent asset is missing: ${assetDesc}`;
}
