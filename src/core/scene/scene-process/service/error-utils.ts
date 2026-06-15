const DOWNLOAD_FAILED_RE = /^download failed: .*\/([\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}(?:@[^.]+)?)\.json/i;

export async function enrichMissingDependencyError(
    errInfo: string,
    ownerAsset: string,
    queryAssetInfo?: (uuid: string) => Promise<{ url?: string } | null>,
    querySubAssetName?: (mainUuid: string, subId: string) => Promise<string | null>,
): Promise<string> {
    const result = DOWNLOAD_FAILED_RE.exec(errInfo);
    if (!result) {
        return `The asset ${ownerAsset} cannot be loaded because a dependent asset is missing. Detail: ${errInfo}`;
    }
    const missingUuid = result[1];
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
