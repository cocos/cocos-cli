import {
    IProperty,
} from '../../../../@types/public';

import { DumpInterface } from './dump-interface';

class GradientDump implements DumpInterface {
    public encode(object: any, data: IProperty, opts?: any): void {
        // 直接修改 object 会修改到默认值（对象引用问题）
        const dump = JSON.parse(JSON.stringify(object));
        delete dump._color; // _color 值是随机运算的结果，需要去掉

        if (object.colorKeys.length > 0) {
            object.colorKeys.forEach((item: any, index: number) => {
                const color = [];
                color[0] = item.color.r;
                color[1] = item.color.g;
                color[2] = item.color.b;
                dump.colorKeys[index].color = color;
            });
        }
        data.value = dump;
    }

    public decode(data: any, info: any, dump: any, opts?: any): void {
        // 获取需要修改的数据
        const ccType = cc.js.getClassByName('cc.Gradient');
        const gradient = new ccType();
        if (dump.value.alphaKeys.length > 0) {
            for (const item of dump.value.alphaKeys) {
                const AlphaKeyCtor = cc.js.getClassByName('cc.AlphaKey');
                const alphaKey = new AlphaKeyCtor();
                alphaKey.time = item.time;
                alphaKey.alpha = item.alpha;
                gradient.alphaKeys.push(alphaKey);
            }
        }

        if (dump.value.colorKeys.length > 0) {
            for (const item of dump.value.colorKeys) {
                const ColorKeyCtor = cc.js.getClassByName('cc.ColorKey');
                const ColorCtor = cc.js.getClassByName('cc.Color');
                const colorKey = new ColorKeyCtor();
                colorKey.time = item.time;
                item.color && (colorKey.color = new ColorCtor(...item.color));
                gradient.colorKeys.push(colorKey);
            }
        }

        data[info.key] = gradient;
    }
}

export const gradientDump = new GradientDump();
