'use strict';

/**
 * Compare dotted numeric versions segment by segment.
 * @example compareVersion('3.6.2', '3.7.0') => -1
 * @example compareVersion('3.9.0', '3.8.0') => 1
 * @example compareVersion('3.8.0', '3.8.0') => 0
 * @param versionLeft
 * @param versionRight
 * @param split
 */
export function compareVersion(versionLeft: string, versionRight: string, split = '.') {
    if (typeof versionLeft !== 'string' || typeof versionRight !== 'string') {
        throw new Error(`invalid param: ${versionLeft}, ${versionRight}`);
    }

    const leftParts = versionLeft.split(split).map((part) => Number.parseInt(part, 10) || 0);
    const rightParts = versionRight.split(split).map((part) => Number.parseInt(part, 10) || 0);
    const maxLength = Math.max(leftParts.length, rightParts.length);

    for (let i = 0; i < maxLength; i++) {
        const leftValue = leftParts[i] ?? 0;
        const rightValue = rightParts[i] ?? 0;

        if (leftValue !== rightValue) {
            return leftValue - rightValue;
        }
    }

    return 0;
}
