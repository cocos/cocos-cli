type Bytes = ArrayLike<number>;

type IgnoredBytes = Bytes & { includes(n: number): boolean };

const imageTypePatternTable: Array<{
    mimeType: string;
    pattern: Bytes;
    mask: Bytes;
    ignoredBytes?: IgnoredBytes;
}> = [
    {
        mimeType: 'image/png',
        pattern: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
        mask: [0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff],
    },
    {
        mimeType: 'image/jpeg',
        pattern: [0xff, 0xd8, 0xff],
        mask: [0xff, 0xff, 0xff],
    },
];

function matchMimeTypePattern(input: Bytes, pattern: Bytes, mask: Bytes, ignoredBytes?: IgnoredBytes) {
    // https://mimesniff.spec.whatwg.org/#pattern-matching-algorithm
    // asserts(pattern.length === mask.length);
    if (input.length < mask.length) {
        return false;
    }
    let s = 0;
    if (ignoredBytes) {
        for (; s < input.length; ++s) {
            if (!ignoredBytes.includes(input[s])) {
                break;
            }
        }
    }
    for (let p = 0; p < pattern.length; ++p, ++s) {
        if ((mask[p] & input[s]) !== pattern[p]) {
            return false;
        }
    }
    return true;
}

export function matchImageTypePattern(input: Bytes) {
    // https://mimesniff.spec.whatwg.org/#matching-an-image-type-pattern
    for (const { mimeType, pattern, mask, ignoredBytes } of imageTypePatternTable) {
        if (matchMimeTypePattern(input, pattern, mask, ignoredBytes)) {
            return mimeType;
        }
    }
    return;
}
