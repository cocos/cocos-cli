export interface IContourPoint {
    x: number;
    y: number;
}

enum StepDirection {
    NONE,
    UP,
    LEFT,
    DOWN,
    RIGHT,
}

/**
 * 提取 RGBA 数据中左上方第一个非透明连通区域的外轮廓。
 */
export function traceAlphaContour(
    data: Uint8Array,
    width: number,
    height: number,
    loop = true,
): IContourPoint[] {
    const start = findFirstOpaquePixel(data, width, height);
    if (!start) {
        return [];
    }

    let x = start.x;
    let y = start.y;
    let previousStep = StepDirection.NONE;
    const points: IContourPoint[] = [{ x, y }];

    do {
        const nextStep = resolveNextStep(data, width, height, x, y, previousStep);
        previousStep = nextStep;

        switch (nextStep) {
            case StepDirection.UP:
                y--;
                break;
            case StepDirection.LEFT:
                x--;
                break;
            case StepDirection.DOWN:
                y++;
                break;
            case StepDirection.RIGHT:
                x++;
                break;
            default:
                return [];
        }

        if (x >= 0 && x <= width && y >= 0 && y <= height) {
            points.push({ x, y });
        }
    } while (x !== start.x || y !== start.y);

    if (loop) {
        points.push({ x, y });
    }

    return points;
}

function findFirstOpaquePixel(data: Uint8Array, width: number, height: number): IContourPoint | null {
    let offset = 0;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++, offset += 4) {
            if (data[offset + 3] > 0) {
                return { x, y };
            }
        }
    }
    return null;
}

function resolveNextStep(
    data: Uint8Array,
    width: number,
    height: number,
    x: number,
    y: number,
    previousStep: StepDirection,
): StepDirection {
    const width4 = width * 4;
    const index = (y - 1) * width4 + (x - 1) * 4;
    const canLeft = x > 0;
    const canRight = x < width;
    const canDown = y < height;
    const canUp = y > 0;

    const upLeft = canUp && canLeft && data[index + 3] > 0;
    const upRight = canUp && canRight && data[index + 7] > 0;
    const downLeft = canDown && canLeft && data[index + width4 + 3] > 0;
    const downRight = canDown && canRight && data[index + width4 + 7] > 0;

    let state = 0;
    if (upLeft) state |= 1;
    if (upRight) state |= 2;
    if (downLeft) state |= 4;
    if (downRight) state |= 8;

    switch (state) {
        case 1: return StepDirection.UP;
        case 2:
        case 3:
        case 7:
            return StepDirection.RIGHT;
        case 4:
        case 12:
        case 14:
            return StepDirection.LEFT;
        case 5:
        case 13:
            return StepDirection.UP;
        case 6:
            return previousStep === StepDirection.UP ? StepDirection.LEFT : StepDirection.RIGHT;
        case 8:
        case 10:
        case 11:
            return StepDirection.DOWN;
        case 9:
            return previousStep === StepDirection.RIGHT ? StepDirection.UP : StepDirection.DOWN;
        default:
            return StepDirection.NONE;
    }
}
