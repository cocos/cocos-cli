import {
    IProperty,
} from '../../../../@types/public';

import { DumpInterface } from './dump-interface';
import * as cc from 'cc';

const EDITOR_EXTRAS_TAG = cc.editorExtrasTag || '__editorExtras__';

// valueType 直接使用引擎序列化
class RealCurveDump implements DumpInterface {

    public encode(object: cc.RealCurve, data: IProperty, opts?: any): void {
        data.value = this.encodeByObj(object, opts);

        // HACK 目前曲线新建完无默认数据
        // @ts-ignore
        if (!data.value.keyFrames.length) {
            data.value = data.default;
        }
    }

    public decode(data: cc.CurveRange, info: any, dump: any, opts?: any): void {
        if (dump.value) {
            // @ts-ignore
            const curve = data[info.key] as cc.RealCurve;
            this.decodeByDump(dump, curve, opts);
        }
    }

    public encodeByObj(curve: cc.RealCurve, opts?: any): any {
        try {
            return {
                postExtrap: curve.postExtrapolation,
                preExtrap: curve.preExtrapolation,
                keyFrames: [...curve.keyframes()].map(([time, value]) => {
                    const editorExtras = value[EDITOR_EXTRAS_TAG] || {};
                    return {
                        time,
                        value: value.value,

                        inTangent: value.leftTangent,
                        outTangent: value.rightTangent,

                        inTangentWeight: value.leftTangentWeight,
                        outTangentWeight: value.rightTangentWeight,

                        interpMode: value.interpolationMode,
                        tangentWeightMode: value.tangentWeightMode,
                        tangentMode: editorExtras.tangentMode,
                        broken: editorExtras.broken,
                    };
                }),
            };
        } catch (error) {
            console.warn('Value dump failed.');
            console.warn(error);

            const ctor = opts.ctor;
            const dump = EditorExtends.serialize(new ctor(), { stringify: false, forceInline: true }) as any;
            delete dump.__type__;
            return dump;
        }
    }

    public decodeByDump(dump: any, curve: cc.RealCurve, opts?: any): cc.RealCurve {
        if (dump.value.keyFrames) {
            const keyData = dump.value.keyFrames.map((item: any) => {
                const value: any = {
                    value: item.value,

                    leftTangent: item.inTangent,
                    rightTangent: item.outTangent,

                    interpolationMode: item.interpMode,
                    tangentWeightMode: item.tangentWeightMode,

                    leftTangentWeight: item.inTangentWeight,
                    rightTangentWeight: item.outTangentWeight,
                };
                if (item.tangentMode !== undefined || item.broken !== undefined) {
                    value[EDITOR_EXTRAS_TAG] = {
                        tangentMode: item.tangentMode,
                        broken: item.broken,
                    };
                }
                return [item.time, value];
            });
            curve.assignSorted(keyData);
            curve.postExtrapolation = dump.value.postExtrap;
            curve.preExtrapolation = dump.value.preExtrap;
        }

        return curve;
    }
}

export const realCurveDump = new RealCurveDump();
