import type { IContourPoint } from './contour';

/**
 * 使用与 Creator Editor 相同的 Ramer-Douglas-Peucker 实现简化轮廓。
 */
export function simplifyContour(
    points: readonly IContourPoint[],
    epsilon: number,
): IContourPoint[] {
    if (points.length < 3) {
        return points.map(clonePoint);
    }

    const firstPoint = points[0];
    const lastPoint = points[points.length - 1];
    let index = -1;
    let distance = 0;

    for (let i = 1; i < points.length - 1; i++) {
        const currentDistance = findPerpendicularDistance(points[i], firstPoint, lastPoint);
        if (currentDistance > distance) {
            distance = currentDistance;
            index = i;
        }
    }

    if (distance > epsilon && index > 0) {
        const left = simplifyContour(points.slice(0, index + 1), epsilon);
        const right = simplifyContour(points.slice(index), epsilon);
        return left.slice(0, left.length - 1).concat(right);
    }

    return [clonePoint(firstPoint), clonePoint(lastPoint)];
}

function findPerpendicularDistance(
    point: IContourPoint,
    lineStart: IContourPoint,
    lineEnd: IContourPoint,
): number {
    if (lineStart.x === lineEnd.x) {
        return Math.abs(point.x - lineStart.x);
    }

    const slope = (lineEnd.y - lineStart.y) / (lineEnd.x - lineStart.x);
    const intercept = lineStart.y - slope * lineStart.x;
    return Math.abs(slope * point.x - point.y + intercept) / Math.sqrt(slope * slope + 1);
}

function clonePoint(point: IContourPoint): IContourPoint {
    return { x: point.x, y: point.y };
}
