// https://github.com/finscn/max-rects-packing
// @ts-ignore
import * as ipacker from 'max-rects-packing';
import { MaxRectsBinPack, IRect, Heuristic } from './maxrects';

export interface IInputRect {
    width: number;
    height: number;
    [key: string]: any;
}

export interface IPackedRect extends IInputRect {
    x: number;
    y: number;
    rotated?: boolean;
}

export interface IScorePackResult {
    packedRects: (IRect & { origin: IInputRect })[];
    unpackedRects: (IRect & { origin: IInputRect })[];
    score: number;
    packedArea: number;
    binWidth: number;
    binHeight: number;
    heuristice: number;
}

export interface IAtlasInfo {
    width: number;
    height: number;
    spriteFrameInfos: Array<{
        trim: {
            x: number;
            y: number;
            rotatedWidth: number;
            rotatedHeight: number;
        };
    }>;
}

export class TexturePacker {
    private static getRectsFromInputs(inputs: IInputRect[]): (IRect & { origin: IInputRect })[] {
        return inputs.map((r) => {
            return { width: r.width, height: r.height, origin: r } as IRect & { origin: IInputRect };
        });
    }

    private static getInputsFromRects(rects: (IRect & { origin: IInputRect })[]): IPackedRect[] {
        return rects.map((rect) => {
            const r = rect.origin;
            for (const name in rect) {
                if (name === 'origin') { continue; }
                (r as any)[name] = (rect as any)[name];
            }
            return r as IPackedRect;
        });
    }

    private static scoreMaxRects(inputs: (IRect & { origin: IInputRect })[], binWidth: number, binHeight: number, heuristice: number, allowRotation: boolean, result: IScorePackResult): void {
        // 需要克隆 inputs，不能修改到 inputs 里的数据，否则会影响到后面的遍历
        const pack = new MaxRectsBinPack(binWidth, binHeight, allowRotation);
        const packedRects = pack.insertRects(inputs, heuristice) as (IRect & { origin: IInputRect })[];

        // 已经打包的小图总面积
        let packedArea = 0;
        // 整张大图的面积
        let texArea = 0;
        let texWidth = 0;
        let texHeight = 0;

        for (let i = 0; i < packedRects.length; i++) {
            const rect = packedRects[i];
            packedArea += rect.width * rect.height;

            const right = rect.x + ((rect as any).rotated ? rect.height : rect.width);
            const top = rect.y + ((rect as any).rotated ? rect.width : rect.height);
            if (right > texWidth) { texWidth = right; }
            if (top > texHeight) { texHeight = top; }
        }
        texArea = texWidth * texHeight;

        // 打包好的面积除以大图面积得出分数
        const score = packedArea / texArea;

        // 如果打包的小图面积更大，则可以直接替换掉结果
        // 如果打包的分数更大，那么打包的小图面积也要大于等于结果才可以
        if (packedArea > result.packedArea || (score > result.score && packedArea >= result.packedArea)) {
            result.packedRects = packedRects;
            result.unpackedRects = inputs;
            result.score = score;
            result.packedArea = packedArea;
            result.binWidth = binWidth;
            result.binHeight = binHeight;
            result.heuristice = heuristice;
        }
    }

    private static scoreMaxRectsForAllHeuristics(inputs: IInputRect[], binWidth: number, binHeight: number, allowRotation: boolean, result: IScorePackResult): void {
        for (let i = 0; i <= 5; i++) {
            // TODO: 修复 ContactPointRule 算法，这个算法现在会有重叠的部分
            if (i === 4) { continue; }
            this.scoreMaxRects(TexturePacker.getRectsFromInputs(inputs), binWidth, binHeight, i, allowRotation, result);
        }
    }

    public static ipacker(inputs: IInputRect[], maxWidth: number, maxHeight: number, allowRotation: boolean): IPackedRect[] {
        // @ts-ignore
        const packer = new ipacker.Packer(maxWidth, maxHeight, {
            allowRotate: allowRotation,
        });

        const rects = this.getRectsFromInputs(inputs);
        const result = packer.fit(rects);
        return result.rects.map((rect: any) => {
            return Object.assign(rect.origin, rect.fitInfo);
        });
    }

    public static MaxRects(inputs: IInputRect[], maxWidth: number, maxHeight: number, allowRotation: boolean): IPackedRect[] {
        let area = 0;
        for (let i = 0; i < inputs.length; i++) {
            area += inputs[i].width * inputs[i].height;
        }

        const scorePackResult: IScorePackResult = {
            packedRects: [],
            unpackedRects: [],
            score: -Infinity,
            packedArea: -Infinity,
            binWidth: 0,
            binHeight: 0,
            heuristice: 0,
        };

        // 如果所有小图的总面积大于设置的最大面积，则直接使用 maxWidth maxHeight 测试
        const maxArea = maxWidth * maxHeight;
        if (area < maxArea) {

            // 遍历二次幂宽高，直到大于 maxWidth maxHeight
            // 其中会包括 正方形 和 扁平长方形 的情况
            const startSearchSize = 4;
            for (let testWidth = startSearchSize; testWidth <= maxWidth; testWidth = Math.min(testWidth * 2, maxWidth)) {
                for (let testHeight = startSearchSize; testHeight <= maxHeight; testHeight = Math.min(testHeight * 2, maxHeight)) {
                    const testArea = testWidth * testHeight;
                    if (testArea >= area) {
                        // growArea 会根据测试结果自动增长
                        let growArea = area;

                        // eslint-disable-next-line no-constant-condition
                        while (1) {
                            // 使用测试面积的平方根作为测试宽高
                            const testBinSize = Math.pow(growArea, 0.5);

                            if (testBinSize <= testWidth && testBinSize <= testHeight) {
                                this.scoreMaxRectsForAllHeuristics(inputs, testBinSize, testBinSize, allowRotation, scorePackResult);
                            }
                            this.scoreMaxRectsForAllHeuristics(inputs, growArea / testHeight, testHeight, allowRotation, scorePackResult);
                            this.scoreMaxRectsForAllHeuristics(inputs, testWidth, growArea / testWidth, allowRotation, scorePackResult);

                            // 如果还有小图没有被打包进大图里，则将剩余小图的面积用来扩大测试的面积
                            const unpackedRects = scorePackResult.unpackedRects;
                            if (unpackedRects.length > 0) {
                                let leftArea = 0;
                                for (let i = 0; i < unpackedRects.length; i++) {
                                    leftArea += unpackedRects[i].width * unpackedRects[i].height;
                                }
                                growArea += leftArea / 2;
                            }

                            if (growArea >= testArea || unpackedRects.length === 0) {
                                break;
                            }
                        }
                    }

                    if (testHeight >= maxHeight) { break; }
                }
                if (testWidth >= maxWidth) { break; }
            }
        } else {
            this.scoreMaxRectsForAllHeuristics(inputs, maxWidth, maxHeight, allowRotation, scorePackResult);
        }

        // console.debug(`Best heuristice: ${scorePackResult.heuristice}`);

        return this.getInputsFromRects(scorePackResult.packedRects);
    }
}

// 导出兼容性接口
export const ipacker = TexturePacker.ipacker;
export const MaxRects = TexturePacker.MaxRects;
