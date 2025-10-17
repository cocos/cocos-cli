
import { DumpInterface } from './dump-interface';
import { realCurveDump } from './real-curve-dump';
import * as cc from 'cc';
import { IProperty } from '../../../../@types/public';

// 即将废弃的数据结构
class AnimationCurveDump implements DumpInterface {
    public encode(object: any, data: IProperty, opts?: any): void {
        realCurveDump.encode(object._internalCurve, data, opts);
    }

    public decode(data: cc.CurveRange, info: any, dump: any, opts?: any): void {
        const type = cc.js.getClassName(data);
        // 引擎为了兼容旧的接口使用方式，curveRange 内将存在使用 RealCurve 封装的 AnimationCurve，界面只会编辑 RealCurve 的新字段，
        // 此时的 dump 数据不需要还原上去，否则由于 dump 顺序的不可控会覆盖用户已修改的数据
        if (type === 'cc.CurveRange') {
            return;
        }
        // @ts-ignore
        const curve = data[info.key]._internalCurve;
        realCurveDump.decodeByDump(dump, curve, opts);
    }
}

export const animationCurveDump = new AnimationCurveDump();
