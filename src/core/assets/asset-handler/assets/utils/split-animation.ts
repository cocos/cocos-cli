import { animation, AnimationClip, ObjectCurve, QuatCurve, QuatKeyframeValue, RealCurve, RealKeyframeValue } from 'cc';
import { exoticAnimationTag, RealArrayTrack } from 'cc/editor/exotic-animation';
import { evaluateValueTangent } from './curve-utils';

export function splitAnimation(animationClip: AnimationClip, from: number, to: number) {
    const newClip = new AnimationClip();
    newClip.duration = to - from;
    newClip.enableTrsBlending = animationClip.enableTrsBlending;
    for (const track of animationClip.tracks) {
        const newTrack = cloneTrackWithoutChannels(track);
        const sourceChannels = Array.from(track.channels());
        const targetChannels = Array.from(newTrack.channels());
        sourceChannels.forEach(({ name, curve }, index) => {
            targetChannels[index].name = name;
            const newCurve = targetChannels[index].curve;
            if (curve instanceof RealCurve) {
                splitRealCurve(curve, from, to, newCurve as RealCurve);
            } else if (curve instanceof QuatCurve) {
                splitQuaternionCurve(curve, from, to, newCurve as QuatCurve);
            } else {
                throw new Error('Unknown curve type.');
            }
        });
        newClip.addTrack(track);
    }
    const exoticAnimation = animationClip[exoticAnimationTag];
    if (exoticAnimation) {
        newClip[exoticAnimationTag] = exoticAnimation.split(from, to);
    }
    return newClip;
}

function cloneTrackWithoutChannels(track: animation.Track) {
    switch (true) {
        default:
            throw new Error('Unknown track type.');
        case track instanceof animation.RealTrack: {
            const newTrack = new animation.RealTrack();
            return newTrack;
        }
        case track instanceof animation.QuatTrack: {
            const newTrack = new animation.QuatTrack();
            return newTrack;
        }
        case track instanceof animation.ObjectTrack: {
            const newTrack = new animation.ObjectTrack();
            return newTrack;
        }
        case track instanceof animation.VectorTrack: {
            const newTrack = new animation.VectorTrack();

            newTrack.componentsCount = track.componentsCount;
            return newTrack;
        }
        case track instanceof animation.ColorTrack: {
            const newTrack = new animation.ColorTrack();
            return newTrack;
        }
        case track instanceof RealArrayTrack: {
            const newTrack = new RealArrayTrack();
            newTrack.elementCount = (track as RealArrayTrack).elementCount;
            return newTrack;
        }
    }
}

function splitRealCurve(curve: RealCurve, from: number, to: number, out: RealCurve) {
    const fromIndex = curve.indexOfKeyframe(from);
    const toIndex = curve.indexOfKeyframe(to);
    const copyFrom = fromIndex;
    const copyTo = toIndex;
    const keyframes: [number, Partial<RealKeyframeValue>][] = [...curve.keyframes()].slice(copyFrom, copyTo);
    if (copyFrom !== fromIndex) {
        const { value, tangent } = evaluateBetweenKeyframes(curve, fromIndex, copyFrom, from);
        keyframes.unshift([
            from,
            {
                value,
                interpolationMode: curve.getKeyframeValue(fromIndex).interpolationMode,
                rightTangent: tangent.y,
                rightTangentWeight: tangent.x,
            },
        ]);
    }
    if (copyTo !== toIndex) {
        const { value, tangent } = evaluateBetweenKeyframes(curve, copyTo, toIndex, to);
        keyframes.unshift([
            to,
            {
                value,
                interpolationMode: curve.getKeyframeValue(toIndex).interpolationMode,
                leftTangent: tangent.y,
                leftTangentWeight: tangent.x,
            },
        ]);
    }
    out.assignSorted(keyframes);
    out.preExtrapolation = curve.preExtrapolation;
    out.postExtrapolation = curve.postExtrapolation;
}

function splitQuaternionCurve(curve: QuatCurve, from: number, to: number, out: QuatCurve) {
    const fromIndex = curve.indexOfKeyframe(from);
    const toIndex = curve.indexOfKeyframe(to);
    const copyFrom = fromIndex;
    const copyTo = toIndex;
    const keyframes = [...curve.keyframes()].slice(copyFrom, copyTo);
    if (copyFrom !== fromIndex && fromIndex >= 0) {
        const fromValue = curve.evaluate(from);
        keyframes.unshift([
            from,
            {
                value: fromValue,
                interpolationMode: curve.getKeyframeValue(fromIndex).interpolationMode,
                easingMethod: curve.getKeyframeValue(fromIndex).easingMethod,
            },
        ]);
    }
    if (copyTo !== toIndex && toIndex >= 0) {
        const toValue = curve.evaluate(to);
        keyframes.unshift([
            to,
            {
                value: toValue,
                interpolationMode: curve.getKeyframeValue(toIndex).interpolationMode,
                easingMethod: curve.getKeyframeValue(toIndex).easingMethod,
            },
        ]);
    }
    out.assignSorted(keyframes);
}

function evaluateBetweenKeyframes(curve: RealCurve, from: number, to: number, time: number) {
    const fromTime = curve.getKeyframeTime(from);
    const { value: fromValue, rightTangent: fromTangentY, rightTangentWeight: fromTangentX } = curve.getKeyframeValue(from);

    const toTime = curve.getKeyframeTime(to);
    const { value: toValue, leftTangent: toTangentY, leftTangentWeight: toTangentX } = curve.getKeyframeValue(to);

    return evaluateValueTangent(time, fromTime, fromValue, fromTangentX, fromTangentY, toTime, toValue, toTangentX, toTangentY);
}
