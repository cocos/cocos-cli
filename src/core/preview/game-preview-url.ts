/**
 * Build the URL opened by the CLI's external game preview entry.
 * Unflagged URLs remain available to lightweight embedded preview consumers.
 */
export function getExternalGamePreviewUrl(serverUrl: string, scene?: string): string {
    const url = new URL(serverUrl);
    if (scene) {
        url.searchParams.set('scene', scene);
    }
    url.searchParams.set('previewToolbar', '1');
    return url.toString();
}
