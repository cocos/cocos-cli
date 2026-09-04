export {};

const mockAssetRequest = jest.fn();

class MockVec2 {
    constructor(public x = 0, public y = 0) {}
}

class MockNode {
    components: MockComponent[] = [];

    attach<T extends MockComponent>(component: T): T {
        component.node = this;
        this.components.push(component);
        return component;
    }

    getComponent<T>(type: new (...args: any[]) => T): T | null {
        return (this.components.find(component => component instanceof type) as T | undefined) ?? null;
    }
}

class MockComponent {
    isValid = true;
    node!: MockNode;
}

class MockPolygonCollider2D extends MockComponent {
    threshold = 1;
    points = [
        new MockVec2(-1, -1),
        new MockVec2(1, -1),
        new MockVec2(1, 1),
        new MockVec2(-1, 1),
    ];
}

class MockSprite extends MockComponent {
    spriteFrame: MockSpriteFrame | null = null;
}

class MockSpriteFrame {
    _uuid = 'texture-uuid@spriteFrame';

    constructor(
        private readonly rect = { x: 0, y: 0, width: 2, height: 2 },
        private readonly rotated = false,
    ) {}

    getRect() {
        return this.rect;
    }

    isRotated() {
        return this.rotated;
    }
}

class MockUITransform extends MockComponent {
    contentSize = { width: 100, height: 100 };
    anchorX = 0.5;
    anchorY = 0.5;
}

jest.mock('cc', () => ({
    Component: MockComponent,
    PolygonCollider2D: MockPolygonCollider2D,
    Sprite: MockSprite,
    UITransform: MockUITransform,
    Vec2: MockVec2,
    Physics2DUtils: {
        PolygonSeparator: {
            ForceCounterClockWise: jest.fn(),
        },
    },
    js: {
        getClassName: (ctor: { name?: string }) => ctor?.name || '',
    },
}));

jest.mock('../scene-process/rpc', () => ({
    Rpc: {
        getInstance: () => ({ request: mockAssetRequest }),
    },
}));

const polygonModule = () => require('../scene-process/service/component/polygon-collider-2d') as typeof import('../scene-process/service/component/polygon-collider-2d');

describe('PolygonCollider2D regeneration helpers', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockAssetRequest.mockReset();
    });

    it('uses UITransform size and anchor for the rectangle fallback', async () => {
        const node = new MockNode();
        const transform = node.attach(new MockUITransform());
        transform.contentSize = { width: 200, height: 80 };
        transform.anchorX = 0.25;
        transform.anchorY = 0.75;
        const collider = node.attach(new MockPolygonCollider2D());

        const result = await polygonModule().generatePolygonPoints(collider as any);

        expect(result).toEqual({
            source: 'rect-fallback',
            points: [
                { x: -50, y: -60 },
                { x: -50, y: 20 },
                { x: 150, y: 20 },
                { x: 150, y: -60 },
            ],
        });
    });

    it('uses a centered 100x100 rectangle when UITransform is absent', async () => {
        const node = new MockNode();
        const collider = node.attach(new MockPolygonCollider2D());

        const result = await polygonModule().generatePolygonPoints(collider as any);

        expect(result).toMatchObject({
            source: 'rect-fallback',
            points: [
                { x: -50, y: -50 },
                { x: -50, y: 50 },
                { x: 50, y: 50 },
                { x: 50, y: -50 },
            ],
        });
    });

    it('initializes a newly added collider with generated points', async () => {
        const node = new MockNode();
        const transform = node.attach(new MockUITransform());
        transform.contentSize = { width: 40, height: 20 };
        const collider = node.attach(new MockPolygonCollider2D());

        await polygonModule().initializePolygonCollider2DPoints(collider as any);

        expect(collider.points).toEqual([
            { x: -20, y: -10 },
            { x: -20, y: 10 },
            { x: 20, y: 10 },
            { x: 20, y: -10 },
        ]);
    });

    it('keeps engine defaults when add-time point generation fails', async () => {
        const node = new MockNode();
        node.attach(new MockUITransform());
        const sprite = node.attach(new MockSprite());
        sprite.spriteFrame = new MockSpriteFrame();
        const collider = node.attach(new MockPolygonCollider2D());
        const originalPoints = collider.points;
        mockAssetRequest.mockRejectedValue(new Error('decode failed'));
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

        await expect(polygonModule().initializePolygonCollider2DPoints(collider as any)).resolves.toBeUndefined();

        expect(collider.points).toBe(originalPoints);
        expect(warn).toHaveBeenCalledWith(
            expect.stringContaining('keeping the engine default points'),
        );
        warn.mockRestore();
    });

    it('generates Sprite Alpha points through the Node image RPC without changing the component directly', async () => {
        const node = new MockNode();
        const transform = node.attach(new MockUITransform());
        transform.contentSize = { width: 200, height: 100 };
        transform.anchorX = 0.25;
        transform.anchorY = 0.75;
        const sprite = node.attach(new MockSprite());
        sprite.spriteFrame = new MockSpriteFrame({ x: 10, y: 20, width: 2, height: 2 });
        const collider = node.attach(new MockPolygonCollider2D());
        collider.threshold = 0;
        const oldPoints = collider.points.slice();

        const rgba = new Uint8Array(2 * 2 * 4);
        for (let index = 3; index < rgba.length; index += 4) {
            rgba[index] = 255;
        }
        mockAssetRequest.mockResolvedValue({
            dataBase64: Buffer.from(rgba).toString('base64'),
            width: 2,
            height: 2,
            channels: 4,
        });

        const result = await polygonModule().generatePolygonPoints(collider as any);

        expect(result.source).toBe('sprite-alpha');
        expect(result.points.length).toBeGreaterThanOrEqual(3);
        expect(mockAssetRequest).toHaveBeenCalledWith('assetManager', 'extractImagePixels', [
            'texture-uuid',
            {
                rect: { left: 10, top: 20, width: 2, height: 2 },
                rotation: 0,
            },
        ]);
        expect(collider.points).toEqual(oldPoints);
    });

    it('keeps the Editor Marching Squares and RDP behavior in pure helpers', () => {
        const { traceAlphaContour } = require('../scene-process/service/component/polygon-collider-2d/contour');
        const { simplifyContour } = require('../scene-process/service/component/polygon-collider-2d/simplify');
        const rgba = new Uint8Array(2 * 2 * 4);
        for (let index = 3; index < rgba.length; index += 4) {
            rgba[index] = 255;
        }

        const contour = traceAlphaContour(rgba, 2, 2, true);
        const simplified = simplifyContour(contour, 0);

        expect(contour[0]).toEqual(contour[contour.length - 1]);
        expect(simplified.length).toBeGreaterThanOrEqual(4);
    });

    it('swaps the extraction size and rotates packed SpriteFrames', async () => {
        const node = new MockNode();
        node.attach(new MockUITransform());
        const sprite = node.attach(new MockSprite());
        sprite.spriteFrame = new MockSpriteFrame({ x: 3, y: 4, width: 2, height: 3 }, true);
        const collider = node.attach(new MockPolygonCollider2D());
        collider.threshold = 0;

        const rgba = new Uint8Array(2 * 3 * 4);
        for (let index = 3; index < rgba.length; index += 4) {
            rgba[index] = 255;
        }
        mockAssetRequest.mockResolvedValue({
            dataBase64: Buffer.from(rgba).toString('base64'),
            width: 2,
            height: 3,
            channels: 4,
        });

        const result = await polygonModule().generatePolygonPoints(collider as any);

        expect(result.source).toBe('sprite-alpha');
        expect(mockAssetRequest).toHaveBeenCalledWith('assetManager', 'extractImagePixels', [
            'texture-uuid',
            {
                rect: { left: 3, top: 4, width: 3, height: 2 },
                rotation: 90,
            },
        ]);
    });

    it('falls back to the UITransform rectangle when the SpriteFrame source asset cannot be resolved', async () => {
        const node = new MockNode();
        node.attach(new MockUITransform());
        const sprite = node.attach(new MockSprite());
        sprite.spriteFrame = new MockSpriteFrame();
        const collider = node.attach(new MockPolygonCollider2D());
        const originalPoints = collider.points;
        mockAssetRequest.mockResolvedValue(null);

        await expect(polygonModule().generatePolygonPoints(collider as any)).resolves.toEqual({
            source: 'rect-fallback',
            points: [
                { x: -50, y: -50 },
                { x: -50, y: 50 },
                { x: 50, y: 50 },
                { x: 50, y: -50 },
            ],
        });

        expect(collider.points).toBe(originalPoints);
    });

    it('adds SpriteFrame and source asset context when image extraction fails', async () => {
        const node = new MockNode();
        node.attach(new MockUITransform());
        const sprite = node.attach(new MockSprite());
        sprite.spriteFrame = new MockSpriteFrame();
        const collider = node.attach(new MockPolygonCollider2D());
        const originalPoints = collider.points;
        mockAssetRequest.mockRejectedValue(new Error('decode failed'));

        await expect(polygonModule().generatePolygonPoints(collider as any))
            .rejects.toThrow(
                'Failed to read source image pixels for SpriteFrame "texture-uuid@spriteFrame" from asset "texture-uuid": decode failed',
            );

        expect(collider.points).toBe(originalPoints);
    });

    it('validates point count, finite coordinates and cyclic adjacent duplicates', () => {
        const { validatePolygonPoints } = polygonModule();

        expect(() => validatePolygonPoints([new MockVec2(), new MockVec2(1, 0)] as any))
            .toThrow('at least 3 points');
        expect(() => validatePolygonPoints([
            new MockVec2(0, 0),
            new MockVec2(Number.NaN, 0),
            new MockVec2(0, 1),
        ] as any)).toThrow('non-finite coordinate');
        expect(() => validatePolygonPoints([
            new MockVec2(0, 0),
            new MockVec2(1, 0),
            new MockVec2(0, 0),
        ] as any)).toThrow('adjacent duplicates');
        expect(() => validatePolygonPoints([
            new MockVec2(0, 0),
            new MockVec2(1, 0),
            new MockVec2(0, 1),
        ] as any)).not.toThrow();
    });

    it('encodes candidate Vec2 values with the existing points element template', () => {
        const { createPolygonPointsPropertyDump } = polygonModule();
        const property = {
            name: 'points',
            path: '',
            type: 'cc.Vec2',
            isArray: true,
            elementTypeData: {
                name: '',
                path: '',
                type: 'cc.Vec2',
                value: { x: 0, y: 0 },
            },
            value: [],
        };

        const result = createPolygonPointsPropertyDump(property, [
            new MockVec2(-2, 3),
            new MockVec2(4, 5),
            new MockVec2(6, -7),
        ] as any);

        expect(result?.value).toEqual([
            expect.objectContaining({ name: '0', type: 'cc.Vec2', value: { x: -2, y: 3 } }),
            expect.objectContaining({ name: '1', type: 'cc.Vec2', value: { x: 4, y: 5 } }),
            expect.objectContaining({ name: '2', type: 'cc.Vec2', value: { x: 6, y: -7 } }),
        ]);
        expect(property.value).toEqual([]);
    });

    it('distinguishes missing and wrong component types', () => {
        const { requirePolygonCollider2D } = polygonModule();
        const wrong = new MockComponent();

        expect(() => requirePolygonCollider2D(null, '/PolygonNode/cc.PolygonCollider2D'))
            .toThrow('PolygonCollider2D component not found');
        expect(() => requirePolygonCollider2D(wrong as any, '/PolygonNode/cc.Label'))
            .toThrow('Parameter error: component is not cc.PolygonCollider2D');
    });
});
