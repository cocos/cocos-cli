import { GlTfAnimationInterpolation } from './glTF.constants';
import * as cc from 'cc';
import { ExoticAnimation } from 'cc/editor/exotic-animation';

type FloatArray = Float32Array | Float64Array;

type NumberArrayOrFloatArray = number[] | FloatArray;

export class GlTFTrsAnimationData {
    public nodes: Record<string, GlTFNodeTrsAnimationData> = {};
    public inputs: FloatArray[] = [];

    public addNodeAnimation(path: string) {
        return (this.nodes[path] ??= new GlTFNodeTrsAnimationData());
    }

    public createExotic() {
        const exoticAnimation = new ExoticAnimation();
        for (const [path, data] of Object.entries(this.nodes)) {
            data.emitExotic(exoticAnimation, path);
        }
        return exoticAnimation;
    }
}

const INPUT_0 = new Float32Array([0.0]);

class GlTFNodeTrsAnimationData {
    public position: GlTFTrsTrackData | null = null;
    public rotation: GlTFTrsTrackData | null = null;
    public scale: GlTFTrsTrackData | null = null;

    public setConstantPosition(v: cc.Vec3) {
        this.position = new GlTFTrsTrackData(GlTfAnimationInterpolation.STEP, INPUT_0, cc.Vec3.toArray(new Float32Array(3), v));
    }

    public setConstantRotation(v: cc.Quat) {
        this.rotation = new GlTFTrsTrackData(GlTfAnimationInterpolation.STEP, INPUT_0, cc.Quat.toArray(new Float32Array(4), v));
    }

    public setConstantScale(v: cc.Vec3) {
        this.scale = new GlTFTrsTrackData(GlTfAnimationInterpolation.STEP, INPUT_0, cc.Vec3.toArray(new Float32Array(3), v));
    }

    public emitExotic(exoticAnimation: ExoticAnimation, path: string) {
        const { position, rotation, scale } = this;
        if (!position && !rotation && !scale) {
            return;
        }
        const exoticNodeAnimation = exoticAnimation.addNodeAnimation(path);
        const fps = 30;
        if (position) {
            const { input, output } = position.toLinearVec3Curve(fps);
            exoticNodeAnimation.createPosition(input, output);
        }
        if (rotation) {
            const { input, output } = rotation.toLinearQuatCurveNormalized(fps);
            exoticNodeAnimation.createRotation(input, output);
        }
        if (scale) {
            const { input, output } = scale.toLinearVec3Curve(fps);
            exoticNodeAnimation.createScale(input, output);
        }
    }
}

export class GlTFTrsTrackData {
    constructor(public interpolation: GlTfAnimationInterpolation, public input: FloatArray, public output: FloatArray) {}

    public toLinearVec3Curve(fps: number) {
        switch (this.interpolation) {
            case GlTfAnimationInterpolation.CUBIC_SPLINE:
                return cubicSplineToLinearCurveData(this.input, this.output, 3, fps);
            case GlTfAnimationInterpolation.STEP:
                return constantToLinearCurveData(this.input, this.output, 3, fps);
            default:
                return { input: this.input, output: this.output };
        }
    }

    public toLinearQuatCurveNormalized(fps: number) {
        // https://github.com/KhronosGroup/glTF/issues/2008
        const result = this.toLinearQuatCurve(fps);
        const { output } = result;
        const q = new cc.Quat();
        for (let iQuat = 0; iQuat < output.length / 4; ++iQuat) {
            cc.Quat.fromArray(q, output, 4 * iQuat);
            cc.Quat.normalize(q, q);
            cc.Quat.toArray(output, q, 4 * iQuat);
        }
        return result;
    }

    public toLinearQuatCurve(fps: number) {
        switch (this.interpolation) {
            case GlTfAnimationInterpolation.CUBIC_SPLINE:
                return cubicSplineToLinearCurveData(this.input, this.output, 4, fps);
            case GlTfAnimationInterpolation.STEP:
                return constantToLinearCurveData(this.input, this.output, 4, fps);
            default:
                return { input: this.input, output: this.output };
        }
    }
}

interface BakeParams {
    startTime: number;
    endTime: number;
    interval: number;
    count: number;
}

function calculateBakeParams(times: FloatArray, fps: number): BakeParams {
    const startTime = times[0];
    const endTime = times[times.length - 1];
    const interval = 1.0 / fps;
    const count = (endTime - startTime) / interval;
    return {
        startTime,
        endTime,
        interval,
        count,
    };
}

function createTimesFromBakeParams(bakeParams: BakeParams, Constructor: Float32ArrayConstructor | Float64ArrayConstructor): FloatArray {
    const { startTime, endTime, interval, count } = bakeParams;
    const result = new Constructor(count);
    for (let i = 0; i < count; i++) {
        result[i] = i === count - 1 ? endTime : startTime + interval * i;
    }
    return result;
}

function constantToLinearCurveData(times: FloatArray, values: FloatArray, components: number, fps: number) {
    if (times.length < 2) {
        return {
            input: times,
            output: values,
        };
    }
    const nValue = values.length / components;
    const bakeParams = calculateBakeParams(times, fps);
    const outputs = new Float32Array(components * bakeParams.count);
    for (let iComponent = 0; iComponent < components; ++iComponent) {
        const curve = new cc.RealCurve();
        curve.assignSorted(
            Array.from(times),
            Array.from({ length: nValue }, (_, iKeyframe) => ({
                value: values[components * iKeyframe + iComponent],
                interpolationMode: cc.RealInterpolationMode.CONSTANT,
            })),
        );
        bake(curve, bakeParams, outputs, components, iComponent);
    }
    return {
        input: createTimesFromBakeParams(bakeParams, Float32Array),
        output: outputs,
    };
}

function cubicSplineToLinearCurveData(times: FloatArray, values: FloatArray, components: number, fps: number) {
    if (times.length < 2) {
        return {
            input: times,
            output: values,
        };
    }
    const nValue = values.length / (components * 3);
    const bakeParams = calculateBakeParams(times, fps);
    const outputs = new Float32Array(components * bakeParams.count);
    for (let iComponent = 0; iComponent < components; ++iComponent) {
        const curve = new cc.RealCurve();
        curve.assignSorted(
            Array.from(times),
            Array.from({ length: nValue }, (_, iKeyframe) => {
                const pComponentFrame = components * 3 * iKeyframe + iComponent;
                const inTangent = values[pComponentFrame + components * 0];
                const dataPoint = values[pComponentFrame + components * 1];
                const outTangent = values[pComponentFrame + components * 2];
                return {
                    value: dataPoint,
                    leftTangent: inTangent,
                    rightTangent: outTangent,
                    interpolationMode: cc.RealInterpolationMode.CUBIC,
                };
            }),
        );
        bake(curve, bakeParams, outputs, components, iComponent);
    }
    return {
        input: createTimesFromBakeParams(bakeParams, Float32Array),
        output: outputs,
    };
}

function bake(curve: cc.RealCurve, bakeParams: BakeParams, output: NumberArrayOrFloatArray, stride: number, offset: number) {
    const { startTime, endTime, interval, count } = bakeParams;
    let time = startTime;
    for (let i = 0; i < count; ++i, time += interval) {
        const value = curve.evaluate(i === count - 1 ? endTime : time);
        output[stride * i + offset] = value;
    }
}
