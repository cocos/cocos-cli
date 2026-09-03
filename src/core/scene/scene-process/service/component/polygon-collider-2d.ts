import { Component, Physics2DUtils, PolygonCollider2D, Sprite, UITransform, Vec2, js } from 'cc';
import type { IProperty } from '../../../@types/public';
import type { Polygon2DPointsSource } from '../../../common/component';
import type { IExtractedImagePixels } from '../../../../assets/image-processing';
import { Rpc } from '../../rpc';
import { traceAlphaContour } from './polygon-collider-2d/contour';
import { simplifyContour } from './polygon-collider-2d/simplify';

export interface IGeneratePolygonPointsResult {
    source: Polygon2DPointsSource;
    points: Vec2[];
}

const DEFAULT_RECT_SIZE = 100;

/**
 * 将通用组件收窄为 PolygonCollider2D。
 */
export function requirePolygonCollider2D(component: Component | null, path: string): PolygonCollider2D {
    if (!component || !component.isValid) {
        throw new Error(`PolygonCollider2D component not found: ${path}`);
    }

    if (!(component instanceof PolygonCollider2D)) {
        const actualType = js.getClassName(component.constructor) || component.constructor?.name || 'unknown';
        throw new Error(
            `Parameter error: component is not cc.PolygonCollider2D: ${path} (received ${actualType})`,
        );
    }

    return component;
}

/**
 * 生成候选顶点，不直接修改组件。
 *
 * Sprite Alpha 分支异步读取源图片并生成轮廓；无有效 Sprite 来源时回退到节点矩形。
 */
export async function generatePolygonPoints(
    collider: PolygonCollider2D,
): Promise<IGeneratePolygonPointsResult> {
    const transform = collider.node.getComponent(UITransform);
    if (!hasUsableTransform(transform)) {
        return {
            source: 'rect-fallback',
            points: generateRectFallbackPoints(collider),
        };
    }

    const sprite = collider.node.getComponent(Sprite);
    if (sprite?.spriteFrame) {
        const points = await generateSpriteAlphaPolygonPoints(collider, sprite, transform);
        if (points) {
            return {
                source: 'sprite-alpha',
                points,
            };
        }
    }

    return {
        source: 'rect-fallback',
        points: generateRectFallbackPoints(collider),
    };
}

/**
 * 初始化新添加的 PolygonCollider2D，不参与通用组件新增生命周期。
 * 生成失败时保留引擎默认 points，避免阻断 Add Component。
 */
export async function initializePolygonCollider2DPoints(collider: PolygonCollider2D): Promise<void> {
    try {
        const generated = await generatePolygonPoints(collider);
        validatePolygonPoints(generated.points);
        collider.points = generated.points;
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        console.warn(
            `Failed to initialize PolygonCollider2D.points; keeping the engine default points. ${reason}`,
        );
    }
}

/**
 * 校验提交前的基础几何条件。
 * 首版只覆盖数量、有限数值和环形相邻重复点；复杂自交校验留给算法阶段。
 */
export function validatePolygonPoints(points: readonly Readonly<Vec2>[]): void {
    if (points.length < 3) {
        throw new Error(`Polygon requires at least 3 points, but received ${points.length}.`);
    }

    for (let index = 0; index < points.length; index++) {
        const point = points[index];
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
            throw new Error(`Polygon point ${index} contains a non-finite coordinate.`);
        }

        const next = points[(index + 1) % points.length];
        if (point.x === next.x && point.y === next.y) {
            throw new Error(`Polygon points ${index} and ${(index + 1) % points.length} are adjacent duplicates.`);
        }
    }
}

/**
 * 判断候选点是否会实际改变 points，避免产生空 Undo。
 */
export function arePolygonPointsEqual(
    current: readonly Readonly<Vec2>[],
    candidate: readonly Readonly<Vec2>[],
): boolean {
    return current.length === candidate.length && current.every((point, index) => {
        const other = candidate[index];
        return point.x === other.x && point.y === other.y;
    });
}

/**
 * 使用现有 points Dump 的元素模板编码候选 Vec2[]。
 */
export function createPolygonPointsPropertyDump(
    pointsProperty: unknown,
    points: readonly Readonly<Vec2>[],
): IProperty | null {
    if (!isProperty(pointsProperty) || !pointsProperty.isArray) {
        return null;
    }

    const currentValues = Array.isArray(pointsProperty.value) ? pointsProperty.value : [];
    const elementTemplate = pointsProperty.elementTypeData ?? currentValues[0];
    if (!isProperty(elementTemplate)) {
        return null;
    }

    const dump = cloneDump(pointsProperty);
    dump.value = points.map((point, index) => {
        const item = cloneDump(elementTemplate);
        item.name = String(index);
        item.value = { x: point.x, y: point.y };
        return item;
    });
    return dump;
}

function generateRectFallbackPoints(collider: PolygonCollider2D): Vec2[] {
    const transform = collider.node.getComponent(UITransform);
    const usableTransform = hasUsableTransform(transform) ? transform : null;
    const width = usableTransform?.contentSize.width ?? DEFAULT_RECT_SIZE;
    const height = usableTransform?.contentSize.height ?? DEFAULT_RECT_SIZE;
    const anchorX = usableTransform?.anchorX ?? 0.5;
    const anchorY = usableTransform?.anchorY ?? 0.5;

    const left = -anchorX * width;
    const right = (1 - anchorX) * width;
    const bottom = -anchorY * height;
    const top = (1 - anchorY) * height;

    return [
        new Vec2(left, bottom),
        new Vec2(left, top),
        new Vec2(right, top),
        new Vec2(right, bottom),
    ];
}

async function generateSpriteAlphaPolygonPoints(
    collider: PolygonCollider2D,
    sprite: Sprite,
    transform: UITransform,
): Promise<Vec2[] | null> {
    const spriteFrame = sprite.spriteFrame;
    if (!spriteFrame) {
        throw new Error('SpriteFrame was removed before PolygonCollider2D points could be generated.');
    }

    const spriteFrameUuid = (spriteFrame as { _uuid?: string })._uuid;
    const sourceUuid = spriteFrameUuid?.split('@')[0];
    if (!sourceUuid) {
        return null;
    }

    const rect = spriteFrame.getRect();
    const frameWidth = rect.width;
    const frameHeight = rect.height;
    const rotated = spriteFrame.isRotated();
    let imagePixels: IExtractedImagePixels | null;
    try {
        imagePixels = await Rpc.getInstance().request('assetManager', 'extractImagePixels', [
            sourceUuid,
            {
                rect: {
                    left: rect.x,
                    top: rect.y,
                    width: rotated ? frameHeight : frameWidth,
                    height: rotated ? frameWidth : frameHeight,
                },
                rotation: rotated ? 90 : 0,
            },
        ]) as IExtractedImagePixels | null;
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(
            `Failed to read source image pixels for SpriteFrame "${spriteFrameUuid}" from asset "${sourceUuid}": ${reason}`,
        );
    }
    if (!imagePixels) {
        return null;
    }

    const data = decodeImagePixels(imagePixels);

    let points = traceAlphaContour(data, imagePixels.width, imagePixels.height, true);
    points = simplifyContour(points, collider.threshold);

    if (
        points.length > 0
        && points[0].x === points[points.length - 1].x
        && points[0].y === points[points.length - 1].y
    ) {
        points.length -= 1;
    }

    const width = transform.contentSize.width;
    const height = transform.contentSize.height;
    const result = points.map((point) => new Vec2(
        point.x * width / frameWidth - transform.anchorX * width,
        (frameHeight - point.y) * height / frameHeight - transform.anchorY * height,
    ));

    Physics2DUtils.PolygonSeparator.ForceCounterClockWise(result);
    return result;
}

function hasUsableTransform(transform: UITransform | null): transform is UITransform {
    return !!transform && !(
        transform.contentSize.width === 0
        && transform.contentSize.height === 0
    );
}

function decodeImagePixels(imagePixels: IExtractedImagePixels): Uint8Array {
    if (
        !Number.isInteger(imagePixels.width)
        || imagePixels.width <= 0
        || !Number.isInteger(imagePixels.height)
        || imagePixels.height <= 0
        || imagePixels.channels !== 4
    ) {
        throw new Error('Invalid RGBA image metadata returned by the asset image processor.');
    }

    const binary = atob(imagePixels.dataBase64);
    const data = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) {
        data[index] = binary.charCodeAt(index);
    }

    const expectedLength = imagePixels.width * imagePixels.height * imagePixels.channels;
    if (data.length !== expectedLength) {
        throw new Error(`Invalid RGBA image data length: expected ${expectedLength}, received ${data.length}.`);
    }
    return data;
}

function isProperty(value: unknown): value is IProperty {
    return !!value && typeof value === 'object' && 'value' in value;
}

function cloneDump<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}
