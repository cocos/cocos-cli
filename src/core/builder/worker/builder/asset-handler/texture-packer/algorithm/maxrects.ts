// Re:
// https://github.com/yi/node-max-rects-bin-pack/blob/master/src/maxrects.coffee
// https://github.com/juj/RectangleBinPack/blob/master/MaxRectsBinPack.cpp

export interface IRect {
    x: number;
    y: number;
    width: number;
    height: number;
    rotated?: boolean;
    clone(): IRect;
}

const BestShortSideFit = 0; ///< -BSSF: Positions the Rectangle against the short side of a free Rectangle into which it fits the best.
const BestLongSideFit = 1; ///< -BLSF: Positions the Rectangle against the long side of a free Rectangle into which it fits the best.
const BestAreaFit = 2; ///< -BAF: Positions the Rectangle into the smallest free Rectangle into which it fits.
const BottomLeftRule = 3; ///< -BL: Does the Tetris placement.
const ContactPointRule = 4; ///< -CP: Choosest the placement where the Rectangle touches other Rectangles as much as possible.
const LeftoverArea = 5;

/**
 * Rect
 */
class Rect implements IRect {
    x: number;
    y: number;
    width: number;
    height: number;
    rotated?: boolean;

    constructor(x: number = 0, y: number = 0, width: number = 0, height: number = 0) {
        this.x = x || 0;
        this.y = y || 0;
        this.width = width || 0;
        this.height = height || 0;
    }

    clone(): IRect {
        return new Rect(this.x, this.y, this.width, this.height);
    }

    static isContainedIn(a: IRect, b: IRect): boolean {
        return a.x >= b.x && a.y >= b.y &&
            a.x + a.width <= b.x + b.width &&
            a.y + a.height <= b.y + b.height;
    }
}

/**
 * MaxRectanglesBinPack
 */
class MaxRectsBinPack {
    binWidth: number = 0;
    binHeight: number = 0;
    allowRotate: boolean = false;
    usedRectangles: IRect[] = [];
    freeRectangles: IRect[] = [];

    constructor(width: number, height: number, allowRotate: boolean = false) {
        this.init(width, height, allowRotate);
    }

    /**
     * Init
     */
    init(width: number, height: number, allowRotate: boolean): void {
        this.binWidth = width;
        this.binHeight = height;
        this.allowRotate = allowRotate || false;

        this.usedRectangles.length = 0;
        this.freeRectangles.length = 0;
        this.freeRectangles.push(new Rect(0, 0, width, height));
    }

    /**
     * Insert a set of rectangles
     * @param rectangles
     * @param method 0~4
     * @return success inserted rectangles
     */
    insertRects(rectangles: IRect[], method: number): IRect[] {
        const res: IRect[] = [];
        while (rectangles.length > 0) {
            let bestScore1 = Infinity;
            let bestScore2 = Infinity;
            let bestRectangleIndex = -1;
            let bestNode = new Rect();

            for (let i = 0; i < rectangles.length; i++) {
                const score1 = { value: 0 };
                const score2 = { value: 0 };
                const newNode = this._scoreRectangle(rectangles[i].width, rectangles[i].height, method, score1, score2);

                if (score1.value < bestScore1 || (score1.value === bestScore1 && score2.value < bestScore2)) {
                    bestScore1 = score1.value;
                    bestScore2 = score2.value;
                    bestNode = newNode;
                    bestRectangleIndex = i;
                }
            }

            if (bestRectangleIndex === -1) {
                return res;
            }

            this._placeRectangle(bestNode);
            const rect = rectangles.splice(bestRectangleIndex, 1)[0];
            rect.x = bestNode.x;
            rect.y = bestNode.y;

            if (rect.width !== rect.height && rect.width === bestNode.height && rect.height === bestNode.width) {
                rect.rotated = !rect.rotated;
            }

            res.push(rect);
        }
        return res;
    }

    private _placeRectangle(node: IRect): void {
        for (let i = 0; i < this.freeRectangles.length; i++) {
            if (this._splitFreeNode(this.freeRectangles[i], node)) {
                this.freeRectangles.splice(i, 1);
                i--;
            }
        }

        this._pruneFreeList();
        this.usedRectangles.push(node);
    }

    private _scoreRectangle(width: number, height: number, method: number, score1: { value: number }, score2: { value: number }): IRect {
        let newNode = new Rect();
        score1.value = Infinity;
        score2.value = Infinity;
        switch (method) {
            case BestShortSideFit:
                newNode = this._findPositionForNewNodeBestShortSideFit(width, height, score1, score2);
                break;
            case BottomLeftRule:
                newNode = this._findPositionForNewNodeBottomLeft(width, height, score1, score2);
                break;
            case ContactPointRule:
                newNode = this._findPositionForNewNodeContactPoint(width, height, score1);
                // todo: reverse
                // @ts-ignore - 保持与 JS 版本一致的行为
                score1 = -score1; // Reverse since we are minimizing, but for contact point score bigger is better.
                break;
            case BestLongSideFit:
                newNode = this._findPositionForNewNodeBestLongSideFit(width, height, score2, score1);
                break;
            case BestAreaFit:
                newNode = this._findPositionForNewNodeBestAreaFit(width, height, score1, score2);
                break;
            case LeftoverArea:
                newNode = this._findPositionForNewNodeLeftoverArea(width, height, score1, score2);
                break;
        }

        // Cannot fit the current Rectangle.
        if (newNode.height === 0) {
            score1.value = Infinity;
            score2.value = Infinity;
        }

        return newNode;
    }

    private _findPositionForNewNodeBottomLeft(width: number, height: number, bestY: { value: number }, bestX: { value: number }): IRect {
        const freeRectangles = this.freeRectangles;
        const bestNode = new Rect();

        bestY.value = Infinity;
        let rect: IRect;
        let topSideY: number;
        for (let i = 0; i < freeRectangles.length; i++) {
            rect = freeRectangles[i];
            // Try to place the Rectangle in upright (non-flipped) orientation.
            if (rect.width >= width && rect.height >= height) {
                topSideY = rect.y + height;
                if (topSideY < bestY.value || (topSideY === bestY.value && rect.x < bestX.value)) {
                    bestNode.x = rect.x;
                    bestNode.y = rect.y;
                    bestNode.width = width;
                    bestNode.height = height;
                    bestY.value = topSideY;
                    bestX.value = rect.x;
                }
            }
            if (this.allowRotate && rect.width >= height && rect.height >= width) {
                topSideY = rect.y + width;
                if (topSideY < bestY.value || (topSideY === bestY.value && rect.x < bestX.value)) {
                    bestNode.x = rect.x;
                    bestNode.y = rect.y;
                    bestNode.width = height;
                    bestNode.height = width;
                    bestY.value = topSideY;
                    bestX.value = rect.x;
                }
            }
        }
        return bestNode;
    }

    private _findPositionForNewNodeBestShortSideFit(width: number, height: number, bestShortSideFit: { value: number }, bestLongSideFit: { value: number }): IRect {
        const freeRectangles = this.freeRectangles;
        const bestNode = new Rect();

        bestShortSideFit.value = Infinity;

        let rect: IRect;
        let leftoverHoriz: number;
        let leftoverVert: number;
        let shortSideFit: number;
        let longSideFit: number;

        for (let i = 0; i < freeRectangles.length; i++) {
            rect = freeRectangles[i];
            // Try to place the Rectangle in upright (non-flipped) orientation.
            if (rect.width >= width && rect.height >= height) {
                leftoverHoriz = Math.abs(rect.width - width);
                leftoverVert = Math.abs(rect.height - height);
                shortSideFit = Math.min(leftoverHoriz, leftoverVert);
                longSideFit = Math.max(leftoverHoriz, leftoverVert);

                if (shortSideFit < bestShortSideFit.value || (shortSideFit === bestShortSideFit.value && longSideFit < bestLongSideFit.value)) {
                    bestNode.x = rect.x;
                    bestNode.y = rect.y;
                    bestNode.width = width;
                    bestNode.height = height;
                    bestShortSideFit.value = shortSideFit;
                    bestLongSideFit.value = longSideFit;
                }
            }
            let flippedLeftoverHoriz: number;
            let flippedLeftoverVert: number;
            let flippedShortSideFit: number;
            let flippedLongSideFit: number;
            if (this.allowRotate && rect.width >= height && rect.height >= width) {
                flippedLeftoverHoriz = Math.abs(rect.width - height);
                flippedLeftoverVert = Math.abs(rect.height - width);
                flippedShortSideFit = Math.min(flippedLeftoverHoriz, flippedLeftoverVert);
                flippedLongSideFit = Math.max(flippedLeftoverHoriz, flippedLeftoverVert);

                if (flippedShortSideFit < bestShortSideFit.value || (flippedShortSideFit === bestShortSideFit.value && flippedLongSideFit < bestLongSideFit.value)) {
                    bestNode.x = rect.x;
                    bestNode.y = rect.y;
                    bestNode.width = height;
                    bestNode.height = width;
                    bestShortSideFit.value = flippedShortSideFit;
                    bestLongSideFit.value = flippedLongSideFit;
                }
            }
        }

        return bestNode;
    }

    private _findPositionForNewNodeBestLongSideFit(width: number, height: number, bestShortSideFit: { value: number }, bestLongSideFit: { value: number }): IRect {
        const freeRectangles = this.freeRectangles;
        const bestNode = new Rect();
        bestLongSideFit.value = Infinity;
        let rect: IRect;

        let leftoverHoriz: number;
        let leftoverVert: number;
        let shortSideFit: number;
        let longSideFit: number;
        for (let i = 0; i < freeRectangles.length; i++) {
            rect = freeRectangles[i];
            // Try to place the Rectangle in upright (non-flipped) orientation.
            if (rect.width >= width && rect.height >= height) {
                leftoverHoriz = Math.abs(rect.width - width);
                leftoverVert = Math.abs(rect.height - height);
                shortSideFit = Math.min(leftoverHoriz, leftoverVert);
                longSideFit = Math.max(leftoverHoriz, leftoverVert);

                if (longSideFit < bestLongSideFit.value || (longSideFit === bestLongSideFit.value && shortSideFit < bestShortSideFit.value)) {
                    bestNode.x = rect.x;
                    bestNode.y = rect.y;
                    bestNode.width = width;
                    bestNode.height = height;
                    bestShortSideFit.value = shortSideFit;
                    bestLongSideFit.value = longSideFit;
                }
            }

            if (this.allowRotate && rect.width >= height && rect.height >= width) {
                leftoverHoriz = Math.abs(rect.width - height);
                leftoverVert = Math.abs(rect.height - width);
                shortSideFit = Math.min(leftoverHoriz, leftoverVert);
                longSideFit = Math.max(leftoverHoriz, leftoverVert);

                if (longSideFit < bestLongSideFit.value || (longSideFit === bestLongSideFit.value && shortSideFit < bestShortSideFit.value)) {
                    bestNode.x = rect.x;
                    bestNode.y = rect.y;
                    bestNode.width = height;
                    bestNode.height = width;
                    bestShortSideFit.value = shortSideFit;
                    bestLongSideFit.value = longSideFit;
                }
            }
        }
        return bestNode;
    }

    private _findPositionForNewNodeBestAreaFit(width: number, height: number, bestAreaFit: { value: number }, bestShortSideFit: { value: number }): IRect {
        const freeRectangles = this.freeRectangles;
        const bestNode = new Rect();
        const requestArea = width * height;

        bestAreaFit.value = Infinity;

        let leftoverHoriz: number;
        let leftoverVert: number;
        let shortSideFit: number;

        for (let i = 0; i < freeRectangles.length; i++) {
            const rect = freeRectangles[i];
            const areaFit = rect.width * rect.height - requestArea;

            // Try to place the Rectangle in upright (non-flipped) orientation.
            if (rect.width >= width && rect.height >= height) {
                leftoverHoriz = rect.width - width;
                leftoverVert = rect.height - height;
                shortSideFit = Math.min(leftoverHoriz, leftoverVert);

                if (areaFit < bestAreaFit.value || (areaFit === bestAreaFit.value && shortSideFit < bestShortSideFit.value)) {
                    bestNode.x = rect.x;
                    bestNode.y = rect.y;
                    bestNode.width = width;
                    bestNode.height = height;
                    bestShortSideFit.value = shortSideFit;
                    bestAreaFit.value = areaFit;
                }
            }

            if (this.allowRotate && rect.width >= height && rect.height >= width) {
                leftoverHoriz = rect.width - height;
                leftoverVert = rect.height - width;
                shortSideFit = Math.min(leftoverHoriz, leftoverVert);

                if (areaFit < bestAreaFit.value || (areaFit === bestAreaFit.value && shortSideFit < bestShortSideFit.value)) {
                    bestNode.x = rect.x;
                    bestNode.y = rect.y;
                    bestNode.width = height;
                    bestNode.height = width;
                    bestShortSideFit.value = shortSideFit;
                    bestAreaFit.value = areaFit;
                }
            }
        }
        return bestNode;
    }

    private _findPositionForNewNodeLeftoverArea(width: number, height: number, bestAreaFit: { value: number }, bestShortSideFit: { value: number }): IRect {
        const freeRectangles = this.freeRectangles;
        const bestNode = new Rect();

        bestAreaFit.value = 0;
        bestShortSideFit.value = 0;

        let rect: IRect;

        let leftoverHoriz: number;
        let leftoverVert: number;
        let shortSideFit: number;
        let areaFit: number;

        for (let i = 0; i < freeRectangles.length; i++) {
            rect = freeRectangles[i];
            areaFit = rect.width * rect.height - width * height;

            // Try to place the Rectangle in upright (non-flipped) orientation.
            if (rect.width >= width && rect.height >= height) {
                leftoverHoriz = Math.abs(rect.width - width);
                leftoverVert = Math.abs(rect.height - height);
                shortSideFit = Math.min(leftoverHoriz, leftoverVert);

                if (areaFit > bestAreaFit.value || (areaFit === bestAreaFit.value && shortSideFit > bestShortSideFit.value)) {
                    bestNode.x = rect.x;
                    bestNode.y = rect.y;
                    bestNode.width = width;
                    bestNode.height = height;
                    bestShortSideFit.value = shortSideFit;
                    bestAreaFit.value = areaFit;
                }
            }

            if (this.allowRotate && rect.width >= height && rect.height >= width) {
                leftoverHoriz = Math.abs(rect.width - height);
                leftoverVert = Math.abs(rect.height - width);
                shortSideFit = Math.min(leftoverHoriz, leftoverVert);

                if (areaFit > bestAreaFit.value || (areaFit === bestAreaFit.value && shortSideFit > bestShortSideFit.value)) {
                    bestNode.x = rect.x;
                    bestNode.y = rect.y;
                    bestNode.width = height;
                    bestNode.height = width;
                    bestShortSideFit.value = shortSideFit;
                    bestAreaFit.value = areaFit;
                }
            }
        }

        bestAreaFit.value = this.binWidth * this.binHeight - bestAreaFit.value;
        bestShortSideFit.value = Math.min(this.binWidth, this.binHeight) - bestShortSideFit.value;

        return bestNode;
    }

    /// Returns 0 if the two intervals i1 and i2 are disjoint, or the length of their overlap otherwise.
    private _commonIntervalLength(i1start: number, i1end: number, i2start: number, i2end: number): number {
        if (i1end < i2start || i2end < i1start) {
            return 0;
        }
        return Math.min(i1end, i2end) - Math.max(i1start, i2start);
    }

    private _contactPointScoreNode(x: number, y: number, width: number, height: number): number {
        const usedRectangles = this.usedRectangles;
        let score = 0;

        if (x === 0 || x + width === this.binWidth) {
            score += height;
        }
        if (y === 0 || y + height === this.binHeight) {
            score += width;
        }
        let rect: IRect;
        for (let i = 0; i < usedRectangles.length; i++) {
            rect = usedRectangles[i];
            if (rect.x === x + width || rect.x + rect.width === x) {
                score += this._commonIntervalLength(rect.y, rect.y + rect.height, y, y + height);
            }
            if (rect.y === y + height || rect.y + rect.height === y) {
                score += this._commonIntervalLength(rect.x, rect.x + rect.width, x, x + width);
            }
        }
        return score;
    }

    private _findPositionForNewNodeContactPoint(width: number, height: number, bestContactScore: { value: number }): IRect {
        const freeRectangles = this.freeRectangles;
        const bestNode = new Rect();

        bestContactScore.value = -1;

        let rect: IRect;
        let score: number;
        for (let i = 0; i < freeRectangles.length; i++) {
            rect = freeRectangles[i];
            // Try to place the Rectangle in upright (non-flipped) orientation.
            if (rect.width >= width && rect.height >= height) {
                score = this._contactPointScoreNode(rect.x, rect.y, width, height);
                if (score > bestContactScore.value) {
                    bestNode.x = rect.x;
                    bestNode.y = rect.y;
                    bestNode.width = width;
                    bestNode.height = height;
                    // @ts-ignore - 保持与 JS 版本一致
                    bestContactScore = score;
                }
            }
            if (this.allowRotate && rect.width >= height && rect.height >= width) {
                score = this._contactPointScoreNode(rect.x, rect.y, height, width);
                if (score > bestContactScore.value) {
                    bestNode.x = rect.x;
                    bestNode.y = rect.y;
                    bestNode.width = height;
                    bestNode.height = width;
                    bestContactScore.value = score;
                }
            }
        }
        return bestNode;
    }

    private _splitFreeNode(freeNode: IRect, usedNode: IRect): boolean {
        const freeRectangles = this.freeRectangles;
        // Test with SAT if the Rectangles even intersect.
        if (usedNode.x >= freeNode.x + freeNode.width || usedNode.x + usedNode.width <= freeNode.x ||
            usedNode.y >= freeNode.y + freeNode.height || usedNode.y + usedNode.height <= freeNode.y) {
            // 没有相交的部分
            return false;
        }
        let newNode: IRect;

        if (usedNode.y > freeNode.y && usedNode.y < freeNode.y + freeNode.height) {
            // usedNode 顶部包含在 freeNode 中间，那就 usedNode 上边拆出 newNode。
            newNode = freeNode.clone();
            newNode.height = usedNode.y - freeNode.y;
            freeRectangles.push(newNode);
        }

        // New node at the bottom side of the used node.
        if (usedNode.y + usedNode.height < freeNode.y + freeNode.height) {
            newNode = freeNode.clone();
            newNode.y = usedNode.y + usedNode.height;
            newNode.height = freeNode.y + freeNode.height - newNode.y;
            freeRectangles.push(newNode);
        }

        // New node at the left side of the used node.
        if (usedNode.x > freeNode.x && usedNode.x < freeNode.x + freeNode.width) {
            newNode = freeNode.clone();
            newNode.width = usedNode.x - freeNode.x;
            freeRectangles.push(newNode);
        }

        // New node at the right side of the used node.
        if (usedNode.x + usedNode.width < freeNode.x + freeNode.width) {
            newNode = freeNode.clone();
            newNode.x = usedNode.x + usedNode.width;
            newNode.width = freeNode.x + freeNode.width - newNode.x;
            freeRectangles.push(newNode);
        }

        return true;
    }

    private _pruneFreeList(): void {
        const freeRectangles = this.freeRectangles;
        for (let i = 0; i < freeRectangles.length; i++) {
            for (let j = i + 1; j < freeRectangles.length; j++) {
                if (Rect.isContainedIn(freeRectangles[i], freeRectangles[j])) {
                    freeRectangles.splice(i, 1);
                    i--;
                    break;
                }
                if (Rect.isContainedIn(freeRectangles[j], freeRectangles[i])) {
                    freeRectangles.splice(j, 1);
                    j--;
                }
            }
        }
    }

    static heuristics = {
        BestShortSideFit,
        BestLongSideFit,
        BestAreaFit,
        BottomLeftRule,
        ContactPointRule,
        LeftoverArea,
    };
}

export default MaxRectsBinPack;
