import { AnimationClip, math, RealCurve, RealInterpolationMode, RealKeyframeValue } from 'cc';

const { approx } = math;

type CompressionStack = Compression[];

type Compression = RemoveLinearKeysCompression | RemoveTrivialKeysCompression;

interface RemoveLinearKeysCompression {
    type: 'remove-linear-keys';
    maxDiff: number;
}

interface RemoveTrivialKeysCompression {
    type: 'remove-trivial-keys';
    maxDiff: number;
}

export function compressAnimationClip(animationClip: AnimationClip) {
    for (const track of animationClip.tracks) {
        for (const { curve } of track.channels()) {
            if (curve instanceof RealCurve) {
                compressRealCurve(curve);
            }
        }
    }
}

function compressRealCurve(curve: RealCurve) {
    if (curve.keyFramesCount < 2) {
        return;
    }
    if (!Array.from(curve.values()).every(({ interpolationMode }) => interpolationMode === RealInterpolationMode.LINEAR)) {
        return;
    }
    const times = Array.from(curve.times());
    const values = Array.from(curve.values()).map(({ value }) => value);
    const compressed = compress(times, values, [
        {
            type: 'remove-linear-keys',
            maxDiff: 1e-4,
        },
        {
            type: 'remove-trivial-keys',
            maxDiff: 1e-4,
        },
    ]);
    curve.assignSorted(compressed.times, compressed.values);
}

function compress(times: number[], values: number[], stack: CompressionStack) {
    for (const compression of stack) {
        switch (compression.type) {
            case 'remove-linear-keys':
                ({ keys: times, values } = removeLinearKeys(times, values, compression.maxDiff));
                break;
            case 'remove-trivial-keys':
                ({ keys: times, values } = removeTrivialKeys(times, values, compression.maxDiff));
                break;
        }
    }
    return { times, values };
}

/**
 * Removes keys which are linear interpolations of surrounding keys.
 * @param keys Input keys.
 * @param values Input values.
 * @param maxDiff Max error.
 * @returns The new keys `keys` and new values `values`.
 */
function removeLinearKeys(keys: number[], values: number[], maxDiff = 1e-3) {
    const nKeys = keys.length;

    if (nKeys < 3) {
        return {
            keys: keys.slice(),
            values: values.slice(),
        };
    }

    const removeFlags = new Array<boolean>(nKeys).fill(false);
    // We may choose to use different key selection policy?
    // http://nfrechette.github.io/2016/12/07/anim_compression_key_reduction/
    const iLastKey = nKeys - 1;
    for (let iKey = 1; iKey < iLastKey; ++iKey) {
        // Should we select previous non-removed key?
        const iPrevious = iKey - 1;
        const iNext = iKey + 1;
        const { [iPrevious]: previousKey, [iKey]: currentKey, [iNext]: nextKey } = keys;
        const { [iPrevious]: previousValue, [iKey]: currentValue, [iNext]: nextValue } = values;
        const alpha = (currentKey - previousKey) / (nextKey - previousKey);
        const expectedValue = (nextValue - previousValue) * alpha + previousValue;
        if (approx(expectedValue, currentValue, maxDiff)) {
            removeFlags[iKey] = true;
        }
    }

    return filterFromRemoveFlags(keys, values, removeFlags);
}

/**
 * Removes trivial frames.
 * @param keys Input keys.
 * @param values Input values.
 * @param maxDiff Max error.
 * @returns The new keys `keys` and new values `values`.
 */
function removeTrivialKeys(keys: number[], values: number[], maxDiff = 1e-3) {
    const nKeys = keys.length;

    if (nKeys < 2) {
        return {
            keys: keys.slice(),
            values: values.slice(),
        };
    }

    const removeFlags = new Array<boolean>(nKeys).fill(false);
    for (let iKey = 1; iKey < nKeys; ++iKey) {
        // Should we select previous non-removed key?
        const iPrevious = iKey - 1;
        const { [iPrevious]: previousValue, [iKey]: currentValue } = values;
        if (approx(previousValue, currentValue, maxDiff)) {
            removeFlags[iKey] = true;
        }
    }

    return filterFromRemoveFlags(keys, values, removeFlags);
}

function filterFromRemoveFlags(keys: number[], values: number[], removeFlags: boolean[]) {
    const nKeys = keys.length;

    const nRemovals = removeFlags.reduce((n, removeFlag) => (removeFlag ? n + 1 : n), 0);
    if (!nRemovals) {
        return {
            keys: keys.slice(),
            values: values.slice(),
        };
    }

    const nNewKeyframes = nKeys - nRemovals;
    const newKeys = new Array<number>(nNewKeyframes).fill(0.0);
    const newValues = new Array<number>(nNewKeyframes).fill(0.0);
    for (let iNewKeys = 0, iKey = 0; iKey < nKeys; ++iKey) {
        if (!removeFlags[iKey]) {
            newKeys[iNewKeys] = keys[iKey];
            newValues[iNewKeys] = values[iKey];
            ++iNewKeys;
        }
    }

    return {
        keys: newKeys,
        values: newValues,
    };
}
