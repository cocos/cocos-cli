export {};

// Renderer/controller and engine objects are test doubles. GizmoBase,
// SceneUndoManager, SnapshotCommand and ServiceEvents use their real code.
const mockServices = {
    Undo: { beginRecording: jest.fn(), endRecording: jest.fn() },
    Engine: { repaintInEditMode: jest.fn() },
    Operation: { changePointer: jest.fn() },
};

jest.mock('cc', () => {
    class Vec2 {
        constructor(public x = 0, public y = 0) {}
        set(x: number | Vec2, y = 0) {
            if (typeof x === 'number') { this.x = x; this.y = y; }
            else { this.x = x.x; this.y = x.y; }
            return this;
        }
        clone() { return new Vec2(this.x, this.y); }
        add2f(x: number, y: number) { this.x += x; this.y += y; return this; }
    }
    class Vec3 extends Vec2 {
        static ZERO = new Vec3();
        constructor(x = 0, y = 0, public z = 0) { super(x, y); }
        set(x: number | Vec3, y = 0, z = 0) { super.set(x, y); this.z = typeof x === 'number' ? z : x.z; return this; }
        clone() { return new Vec3(this.x, this.y, this.z); }
        static transformMat4(out: Vec3, value: Vec3) { return out.set(value); }
        static transformQuat(out: Vec3, value: Vec3) { return out.set(value); }
    }
    class Size {
        constructor(public width = 100, public height = 80) {}
        set(value: Size) { this.width = value.width; this.height = value.height; return this; }
        clone() { return new Size(this.width, this.height); }
    }
    class Mat4 { static invert(out: Mat4) { return out; } }
    class Color { static RED = new Color(); static YELLOW = new Color(); }
    return {
        Vec2, Vec3, Size, Mat4, Color, Quat: class {}, Node: class {}, Component: class {},
        BoxCollider2D: class {}, CircleCollider2D: class {}, PolygonCollider2D: class {},
        Layers: { Enum: { EDITOR: 1 } }, js: { getClassName: (type: any) => type.name },
    };
});
jest.mock('../scene-process/service/core/decorator', () => ({
    Service: mockServices,
    queryRegisteredService: (name: keyof typeof mockServices) => mockServices[name],
}));
jest.mock('../scene-process/service/gizmo/gizmo-defines', () => ({ registerGizmo: jest.fn() }));
jest.mock('../scene-process/service/gizmo/node/rectangle-controller', () => ({
    RectangleController: class { static RectHandleType: Record<string, string> = { Area: 'area', Right: 'x' }; },
}));
jest.mock('../scene-process/service/gizmo/controller/disc', () => ({
    __esModule: true, default: class { static DiscHandleType: Record<string, string> = { Area: 'area', Right: 'x' }; },
}));
jest.mock('../scene-process/service/gizmo/controller/editable', () => ({ __esModule: true, default: class {} }));
jest.mock('../scene-process/service/gizmo/controller/line', () => ({ __esModule: true, default: class {} }));
jest.mock('../scene-process/service/gizmo/utils/controller-utils', () => ({ __esModule: true, default: {} }));
jest.mock('../scene-process/service/gizmo/utils/controller-shape', () => ({ __esModule: true, default: {} }));
jest.mock('../scene-process/service/gizmo/utils/engine-utils', () => ({}));

const { Vec2, Vec3, Size } = require('cc');
const { SceneUndoManager } = require('../scene-process/service/undo/scene-undo-manager');
const { globalEventEmitter } = require('../scene-process/service/core/global-events');
const gizmoTypes = {
    box: require('../scene-process/service/gizmo/components/box-collider-2d').SelectGizmo,
    circle: require('../scene-process/service/gizmo/components/circle-collider-2d').SelectGizmo,
    polygon: require('../scene-process/service/gizmo/components/polygon-collider-2d').SelectGizmo,
};
type Kind = keyof typeof gizmoTypes;
const primaryProperty = { box: 'size', circle: 'radius', polygon: 'points' };
const nodes = new Map<string, any>();
const gizmos: any[] = [];
const committed: Array<{ nodePath: string; propPath: string }> = [];
let undo: any;
let endGate: Promise<void> | undefined;

function snapshot(target: any) {
    return JSON.parse(JSON.stringify({
        offset: target.offset, size: target.size, radius: target.radius, points: target.points,
    }));
}

function targetFor(kind: Kind, name: string) {
    const node = {
        uuid: name, isValid: true, _components: [] as any[],
        getWorldMatrix: (out: any) => out,
        getWorldScale: (out = new Vec3()) => out.set(1, 1, 1),
        getWorldRotation: (out: any) => out,
        getRotation: (out: any) => out,
    };
    const target: any = { node, isValid: true, editing: true, offset: new Vec2() };
    if (kind === 'box') target.size = new Size();
    if (kind === 'circle') target.radius = 50;
    if (kind === 'polygon') target.points = [new Vec2(), new Vec2(10, 0), new Vec2(0, 10)];
    // A nonzero component index detects accidental use of a hard-coded path.
    node._components = [{}, target];
    nodes.set(name, node);
    return target;
}

function fixture(kind: Kind, name = 'A') {
    const target = targetFor(kind, name);
    const gizmo = new gizmoTypes[kind](target);
    const controller: any = {
        updated: false, edit: true, type: kind === 'polygon' ? 'point' : 'x', delta: new Vec3(),
        points: [], view: {},
        show: jest.fn(), hide: jest.fn(),
        setPosition(value: any) { this.view.center = { x: value.x, y: value.y }; },
        setRotation: jest.fn(),
        updateSize(_center: any, size: any) { this.view.size = JSON.parse(JSON.stringify(size)); },
        updateData(points: any[]) { this.points = points; this.view.points = points.map(p => ({ x: p.x, y: p.y })); },
        getCurHandleType() { return this.type; },
        getDeltaSize() { return this.delta; },
        getDeltaPos() { return this.delta; },
        getDeltaRadius() { return this.delta.x; },
        getHandleData() { return { type: this.type, index: 1, deltaPos: this.delta, hitPos: new Vec3(5, 5, 0) }; },
    };
    const line = () => ({ show: jest.fn(), hide: jest.fn(), updateData: jest.fn() });
    Object.assign(gizmo, {
        _controller: controller, _leftDeleteLine: line(), _rightDeleteLine: line(), _isInitialized: true,
    });
    gizmos.push(gizmo);
    gizmo.show();
    return {
        target, gizmo, controller,
        begin(type = kind === 'polygon' ? 'point' : 'x') {
            controller.type = type;
            controller.updated = false;
            controller.delta = new Vec3();
            gizmo.onControllerMouseDown();
        },
        move(distance: number) {
            controller.updated = true;
            controller.delta = new Vec3(distance, 0, 0);
            gizmo.onControllerMouseMove({ ctrlKey: false, metaKey: false });
        },
        end() {
            // Real controllers clear the active handle before invoking the gizmo.
            controller.type = 'none';
            gizmo.onControllerMouseUp();
        },
    };
}

async function settle() {
    await new Promise<void>(resolve => setImmediate(resolve));
}

beforeEach(() => {
    nodes.clear(); gizmos.length = 0; committed.length = 0; endGate = undefined;
    globalEventEmitter.removeAllListeners();
    (globalThis as any).cc = {};
    (globalThis as any).EditorExtends = { Node: { getNodePath: (node: any) => `Canvas/${node.uuid}` } };
    undo = new SceneUndoManager({
        snapshotAdapter: {
            capture: (uuids: string[]) => new Map(uuids.map(uuid => [uuid, nodes.get(uuid)?._components.map(snapshot) ?? []])),
            apply: (data: Map<string, any[]>) => {
                for (const [uuid, components] of data) {
                    const node = nodes.get(uuid);
                    components.forEach((value, index) => {
                        const target = node?._components[index];
                        if (!target) return;
                        if (value.offset) target.offset = new Vec2(value.offset.x, value.offset.y);
                        if (value.size) target.size = new Size(value.size.width, value.size.height);
                        if (value.radius !== undefined) target.radius = value.radius;
                        if (value.points) target.points = value.points.map((p: any) => new Vec2(p.x, p.y));
                    });
                    globalEventEmitter.emit('node:change', node);
                }
                return { success: true };
            },
            equals: (before: Map<string, any>, after: Map<string, any>) => JSON.stringify([...before]) === JSON.stringify([...after]),
        },
    });
    mockServices.Undo.beginRecording.mockReset().mockImplementation((uuids, options) => undo.beginRecording(uuids, options));
    mockServices.Undo.endRecording.mockReset().mockImplementation(async (id) => {
        const result = undo.endRecording(id);
        const gate = endGate;
        await result;
        if (gate) await gate;
    });
    globalEventEmitter.on('animation:property-committed', (event: any) => committed.push(event));
    globalEventEmitter.on('node:change', (node: any) => {
        for (const gizmo of gizmos) {
            if (gizmo.target?.node === node && gizmo.visible()) gizmo.onNodeChanged();
        }
    });
});

afterEach(async () => {
    await settle();
    globalEventEmitter.removeAllListeners();
    delete (globalThis as any).cc;
    delete (globalThis as any).EditorExtends;
});

describe.each<Kind>(['box', 'circle', 'polygon'])('%s Collider2D integrated undo lifecycle', (kind) => {
    it('restores properties and controller data through one scoped Undo/Redo', async () => {
        const f = fixture(kind);
        const before = snapshot(f.target);
        const viewBefore = JSON.parse(JSON.stringify(f.controller.view));
        f.begin(); f.move(4); f.move(8); f.end();
        await settle();
        const after = snapshot(f.target);
        const viewAfter = JSON.parse(JSON.stringify(f.controller.view));
        expect(undo.getHistoryForTesting()).toHaveLength(1);
        expect(mockServices.Undo.beginRecording).toHaveBeenCalledTimes(1);
        expect(undo.hasActiveRecording()).toBe(false);
        const propPath = `__comps__.1.${primaryProperty[kind]}`;
        expect(await undo.undo({ scope: { propPath } })).toMatchObject({ success: true });
        expect(snapshot(f.target)).toEqual(before);
        expect(f.controller.view).toEqual(viewBefore);
        expect(await undo.redo({ scope: { propPath } })).toMatchObject({ success: true });
        expect(snapshot(f.target)).toEqual(after);
        expect(f.controller.view).toEqual(viewAfter);
    });

    it.each(['click', 'rounded', 'return-to-start'])('does not create empty undo or animation commits for %s', async (mode) => {
        const f = fixture(kind);
        f.begin();
        if (mode === 'rounded') f.move(0.01);
        if (mode === 'return-to-start') { f.move(4); f.move(0); }
        f.end();
        await settle();
        expect(undo.hasActiveRecording()).toBe(false);
        expect(undo.getHistoryForTesting()).toHaveLength(0);
        expect(committed).toHaveLength(0);
    });

    it('keeps consecutive property and Area drags in separate scopes', async () => {
        const f = fixture(kind);
        f.begin(); f.move(4); f.end(); await settle();
        const afterFirst = snapshot(f.target);
        f.begin('area'); f.move(3); f.end(); await settle();
        const history = undo.getHistoryForTesting();
        expect(history).toHaveLength(2);
        expect(history[1].meta.scope).toEqual({ editorType: 'scene', nodePath: 'Canvas/A', propPath: '__comps__.1.offset' });
        expect(committed.map(event => event.propPath)).toEqual([
            `__comps__.1.${primaryProperty[kind]}`, '__comps__.1.offset',
        ]);
        await undo.undo();
        expect(snapshot(f.target)).toEqual(afterFirst);
    });

    it('finishes once on hide and ignores late mouse callbacks', async () => {
        const f = fixture(kind);
        f.begin(); f.move(4);
        const value = snapshot(f.target);
        f.gizmo.hide(); f.gizmo.hide(); f.end(); f.move(20);
        await settle();
        expect(snapshot(f.target)).toEqual(value);
        expect(undo.hasActiveRecording()).toBe(false);
        expect(mockServices.Undo.endRecording).toHaveBeenCalledTimes(1);
        expect(undo.getHistoryForTesting()).toHaveLength(1);
    });

    it.each(['detach', 'replace'])('ends the old recording before target %s without committing to a new target', async (mode) => {
        const f = fixture(kind);
        f.begin(); f.move(4);
        const oldValue = snapshot(f.target);
        const nextTarget = targetFor(kind, 'B');
        const nextValue = snapshot(nextTarget);
        f.gizmo.target = mode === 'detach' ? null : nextTarget;
        await settle();
        expect(undo.hasActiveRecording()).toBe(false);
        f.move(20); f.end();
        await settle();
        expect(snapshot(f.target)).toEqual(oldValue);
        expect(snapshot(nextTarget)).toEqual(nextValue);
        expect(committed).toHaveLength(0);
        expect(mockServices.Undo.endRecording).toHaveBeenCalledTimes(1);
    });

    it.each(['component', 'node', 'removed-from-list'])('stops writing when the %s becomes invalid', async (invalid) => {
        const f = fixture(kind);
        f.begin(); f.move(4);
        const value = snapshot(f.target);
        if (invalid === 'component') f.target.isValid = false;
        if (invalid === 'node') f.target.node.isValid = false;
        if (invalid === 'removed-from-list') f.target.node._components.splice(1, 1);
        f.gizmo.onNodeChanged();
        expect(f.controller.hide).toHaveBeenCalled();
        f.move(20); f.end();
        await settle();
        expect(snapshot(f.target)).toEqual(value);
        expect(undo.hasActiveRecording()).toBe(false);
        expect(committed).toHaveLength(0);
    });

    it('rejects a mouse-down after the component has already been removed', async () => {
        const f = fixture(kind);
        const value = snapshot(f.target);
        f.target.node._components.splice(1, 1);
        f.begin(); f.move(4); f.end();
        await settle();
        expect(snapshot(f.target)).toEqual(value);
        expect(mockServices.Undo.beginRecording).not.toHaveBeenCalled();
        expect(undo.hasActiveRecording()).toBe(false);
        expect(committed).toHaveLength(0);
    });

    it('waits for asynchronous Undo finalization when destroyed during a drag', async () => {
        const f = fixture(kind);
        let release!: () => void;
        endGate = new Promise<void>(resolve => { release = resolve; });
        try {
            f.begin(); f.move(4);
            f.gizmo.destroy(); f.end();
            await settle();
            expect(mockServices.Undo.endRecording).toHaveBeenCalledTimes(1);
            expect(committed).toHaveLength(0);
        } finally { release(); }
        await settle();
        expect(undo.hasActiveRecording()).toBe(false);
        expect(undo.getHistoryForTesting()).toHaveLength(1);
    });

    it('keeps an already-ending drag bound to its old node during asynchronous target replacement', async () => {
        const f = fixture(kind);
        let release!: () => void;
        endGate = new Promise<void>(resolve => { release = resolve; });
        try {
            f.begin(); f.move(4); f.end();
            f.gizmo.target = targetFor(kind, 'B');
            f.end();
            await settle();
            expect(committed).toHaveLength(0);
            expect(mockServices.Undo.endRecording).toHaveBeenCalledTimes(1);
        } finally { release(); }
        await settle();
        expect(committed.length).toBeGreaterThan(0);
        expect(committed.every(event => event.nodePath === 'Canvas/A')).toBe(true);
        expect(undo.hasActiveRecording()).toBe(false);
    });

    it('does not carry old drag state across scene teardown and history reset', async () => {
        const old = fixture(kind);
        old.begin(); old.move(4);
        // GizmoService unmounts targets before destroying pooled gizmos on reload.
        old.gizmo.target = null; old.gizmo.destroy();
        undo.reset();
        const next = fixture(kind, 'B');
        const initial = snapshot(next.target);
        old.move(20); old.end();
        await settle();
        expect(snapshot(next.target)).toEqual(initial);
        expect(undo.hasActiveRecording()).toBe(false);
        expect(undo.getHistoryForTesting()).toHaveLength(0);
        expect(committed).toHaveLength(0);
        next.begin(); next.move(6); next.end(); await settle();
        expect(undo.getHistoryForTesting()).toHaveLength(1);
        expect(undo.getHistoryForTesting()[0].meta.scope.nodePath).toBe('Canvas/B');
    });
});

it.each([false, true])('keeps dynamic Box Alt in one size-scoped snapshot (starts with Alt=%s)', async (startsWithAlt) => {
    const f = fixture('box');
    const before = snapshot(f.target);
    const checkpoint = undo.createCheckpoint();
    f.gizmo.onKeyDown({ altKey: startsWithAlt });
    f.begin(); f.move(4);
    f.gizmo.onKeyDown({ altKey: !startsWithAlt });
    f.move(8);
    f.gizmo.onKeyUp({ altKey: startsWithAlt });
    f.move(12); f.end();
    await settle();
    const after = snapshot(f.target);
    expect(mockServices.Undo.beginRecording).toHaveBeenCalledTimes(1);
    expect(undo.getHistoryForTesting()).toHaveLength(1);
    expect(after.size).not.toEqual(before.size);
    expect(after.offset).not.toEqual(before.offset);
    expect(undo.getHistoryForTesting()[0].meta.scope).toEqual({
        editorType: 'scene', nodePath: 'Canvas/A', propPath: '__comps__.1.size',
    });
    expect(undo.hasScopedDifference(checkpoint, { propPath: '__comps__.1.size' })).toBe(true);
    expect(undo.hasScopedDifference(checkpoint, { propPath: '__comps__.1.offset' })).toBe(false);
    expect(committed.map(event => event.propPath)).toEqual(['__comps__.1.size']);
    expect(await undo.undo({ scope: { propPath: '__comps__.1.offset' } })).toMatchObject({ success: false });
    expect(snapshot(f.target)).toEqual(after);
    await undo.undo({ scope: { propPath: '__comps__.1.size' } });
    expect(snapshot(f.target)).toEqual(before);
    await undo.redo({ scope: { propPath: '__comps__.1.size' } });
    expect(snapshot(f.target)).toEqual(after);
    await undo.discardScopedChangesAfterCheckpoint(checkpoint, { propPath: '__comps__.1.size' });
    expect(snapshot(f.target)).toEqual(before);
    expect(undo.getHistoryForTesting()).toHaveLength(0);
});

it('absorbs a size-scoped Box resize into one animation Undo while preserving its full snapshot', async () => {
    const f = fixture('box');
    const before = snapshot(f.target);
    f.begin(); f.move(8); f.end(); await settle();
    const after = snapshot(f.target);
    expect(after.size).not.toEqual(before.size);
    expect(after.offset).not.toEqual(before.offset);
    const event = committed[0];
    expect(event.propPath).toBe('__comps__.1.size');
    const animationScope = { assetUuid: 'clip-1', editorType: 'animation', mode: 'animation' };
    const animationCommand = {
        meta: { id: 'key-size', label: 'Key size', type: 'animation:test', scope: animationScope, timestamp: 0 },
        undo: jest.fn(async () => ({ success: true })),
        redo: jest.fn(async () => ({ success: true })),
    };
    // Match the single-property scope used by Animation's property-commit path.
    undo.pushWithPrevious(animationCommand, {
        type: 'animation:property-commit',
        scope: animationScope,
        previousScope: { editorType: 'scene', nodePath: event.nodePath, propPath: event.propPath },
        previousTypes: ['recording:snapshot'],
    });
    expect(undo.getHistoryForTesting()).toHaveLength(1);
    expect(await undo.undo({ scope: animationScope })).toMatchObject({ success: true });
    expect(animationCommand.undo).toHaveBeenCalledTimes(1);
    expect(snapshot(f.target)).toEqual(before);
    expect(await undo.redo({ scope: animationScope })).toMatchObject({ success: true });
    expect(animationCommand.redo).toHaveBeenCalledTimes(1);
    expect(snapshot(f.target)).toEqual(after);
});

it.each(['insert', 'delete'])('restores Polygon points after a mouse-down %s operation', async (operation) => {
    const f = fixture('polygon');
    const before = snapshot(f.target);
    if (operation === 'delete') f.gizmo.onKeyDown({ ctrlKey: true, metaKey: false });
    f.begin(operation === 'insert' ? 'line' : 'point');
    const changed = snapshot(f.target);
    expect(f.target.points.length).toBe(operation === 'insert' ? 4 : 2);
    // Deleting a point must not turn the following move into a drag of its neighbor.
    f.move(20);
    expect(snapshot(f.target)).toEqual(changed);
    f.end();
    await settle();
    expect(undo.getHistoryForTesting()).toHaveLength(1);
    expect(committed.map(event => event.propPath)).toEqual(['__comps__.1.points']);
    await undo.undo({ scope: { propPath: '__comps__.1.points' } });
    expect(snapshot(f.target)).toEqual(before);
    await undo.redo();
    expect(snapshot(f.target)).toEqual(changed);
});

it.each<Kind>(['box', 'circle', 'polygon'])('%s Area reuses its offset without allocating temporary offset vectors', async (kind) => {
    const f = fixture(kind);
    f.target.offset.set(0.04, 0.07);
    const before = snapshot(f.target);
    const offset = f.target.offset;
    const clone = jest.spyOn(offset, 'clone');
    const ccModule = require('cc');
    const OriginalVec2 = ccModule.Vec2;
    let construct: jest.SpyInstance | undefined;
    try {
        f.begin('area');
        expect(clone).toHaveBeenCalledTimes(1);
        construct = jest.spyOn(ccModule, 'Vec2').mockImplementation((...args: unknown[]) => new OriginalVec2(...args));
        f.move(0.06); f.move(1.06);
        // Box controller refresh still allocates its existing display-size Vec2.
        expect(construct).toHaveBeenCalledTimes(kind === 'box' ? 2 : 0);
        if (kind === 'box') expect(construct.mock.calls).toEqual([[100, 80], [100, 80]]);
        expect(f.target.offset).toBe(offset);
        // Box rounds the final offset; Circle/Polygon round the delta first.
        expect(offset.x).toBeCloseTo(kind === 'box' ? 1.1 : 1.14);
        expect(offset.y).toBeCloseTo(kind === 'box' ? 0.1 : 0.07);
        f.end(); await settle();
        const after = snapshot(f.target);
        expect(mockServices.Undo.beginRecording).toHaveBeenCalledTimes(1);
        expect(undo.getHistoryForTesting()).toHaveLength(1);
        expect(committed.map(event => event.propPath)).toEqual(['__comps__.1.offset']);
        await undo.undo();
        expect(snapshot(f.target)).toEqual(before);
        await undo.redo();
        expect(snapshot(f.target)).toEqual(after);
    } finally {
        construct?.mockRestore();
        clone.mockRestore();
    }
});

it.each([false, true])('Box resize does not clone offset during movement (Alt=%s)', async (altKey) => {
    const f = fixture('box');
    const before = snapshot(f.target);
    const offset = f.target.offset;
    const clone = jest.spyOn(offset, 'clone');
    try {
        f.gizmo.onKeyDown({ altKey });
        f.begin();
        expect(clone).toHaveBeenCalledTimes(1);
        clone.mockClear();
        f.move(4); f.move(8);
        expect(clone).not.toHaveBeenCalled();
        expect(f.target.offset).toBe(offset);
        expect(offset.x).toBe(altKey ? 0 : 4);
        f.end(); await settle();
        const after = snapshot(f.target);
        expect(mockServices.Undo.beginRecording).toHaveBeenCalledTimes(1);
        expect(undo.getHistoryForTesting()).toHaveLength(1);
        await undo.undo();
        expect(snapshot(f.target)).toEqual(before);
        await undo.redo();
        expect(snapshot(f.target)).toEqual(after);
    } finally {
        clone.mockRestore();
    }
});

it('keeps Circle Area offsets and Undo isolated between nodes', async () => {
    const a = fixture('circle', 'CircleA');
    const b = fixture('circle', 'CircleB');
    a.begin('area'); a.move(4); a.end(); await settle();
    b.begin('area'); b.move(10); b.end(); await settle();
    expect(a.target.offset).toEqual(new Vec2(4, 0));
    expect(b.target.offset).toEqual(new Vec2(10, 0));
    expect(a.target.offset).not.toBe(b.target.offset);
    await undo.undo();
    expect(a.target.offset).toEqual(new Vec2(4, 0));
    expect(b.target.offset).toEqual(new Vec2());
    await undo.redo();
    expect(a.target.offset).toEqual(new Vec2(4, 0));
    expect(b.target.offset).toEqual(new Vec2(10, 0));
    await undo.undo();
    await undo.undo();
    expect(a.target.offset).toEqual(new Vec2());
    expect(b.target.offset).toEqual(new Vec2());
});

it('does not start recording for an unchanged Box move before Alt resize', async () => {
    const f = fixture('box');
    const before = snapshot(f.target);
    const checkpoint = undo.createCheckpoint();
    f.begin(); f.move(0.01);
    expect(mockServices.Undo.beginRecording).not.toHaveBeenCalled();
    f.gizmo.onKeyDown({ altKey: true });
    f.move(4); f.end(); await settle();
    expect(f.target.offset).toEqual(new Vec2());
    expect(undo.getHistoryForTesting()).toHaveLength(1);
    expect(undo.getHistoryForTesting()[0].meta.scope.propPath).toBe('__comps__.1.size');
    expect(undo.hasScopedDifference(checkpoint, { propPath: '__comps__.1.offset' })).toBe(false);
    expect(committed.map(event => event.propPath)).toEqual(['__comps__.1.size']);
    await undo.undo({ scope: { propPath: '__comps__.1.size' } });
    expect(snapshot(f.target)).toEqual(before);
});

it('records only size when Box offset rounds back to its current value', async () => {
    const f = fixture('box');
    f.begin(); f.move(0.06); f.end(); await settle();
    expect(f.target.size.width).toBe(100.1);
    expect(f.target.offset).toEqual(new Vec2());
    expect(undo.getHistoryForTesting()[0].meta.scope.propPath).toBe('__comps__.1.size');
    expect(committed.map(event => event.propPath)).toEqual(['__comps__.1.size']);
});

it('keeps resize scoped to size when rounding changes only offset without an animation commit', async () => {
    const f = fixture('box');
    f.target.offset.x = 0.04;
    const before = snapshot(f.target);
    f.begin(); f.move(0.02); f.end(); await settle();
    const after = snapshot(f.target);
    expect(after.size).toEqual(before.size);
    expect(after.offset).not.toEqual(before.offset);
    expect(undo.getHistoryForTesting()).toHaveLength(1);
    expect(undo.getHistoryForTesting()[0].meta.scope).toEqual({
        editorType: 'scene', nodePath: 'Canvas/A', propPath: '__comps__.1.size',
    });
    expect(committed).toHaveLength(0);
    await undo.undo();
    expect(snapshot(f.target)).toEqual(before);
    await undo.redo();
    expect(snapshot(f.target)).toEqual(after);
});

it.each(['size', 'offset'])('keys only resized size when it has a net change (restored %s)', async (restored) => {
    const f = fixture('box');
    const before = snapshot(f.target);
    f.begin(); f.move(4);
    if (restored === 'offset') f.move(0);
    f.gizmo.onKeyDown({ altKey: true });
    f.move(restored === 'offset' ? 4 : 0);
    f.end(); await settle();
    const after = snapshot(f.target);
    expect(committed.map(event => event.propPath)).toEqual(restored === 'size' ? [] : ['__comps__.1.size']);
    expect(undo.getHistoryForTesting()).toHaveLength(1);
    expect(mockServices.Undo.beginRecording).toHaveBeenCalledTimes(1);
    expect(undo.getHistoryForTesting()[0].meta.scope).toEqual({
        editorType: 'scene', nodePath: 'Canvas/A', propPath: '__comps__.1.size',
    });
    await undo.undo();
    expect(snapshot(f.target)).toEqual(before);
    await undo.redo();
    expect(snapshot(f.target)).toEqual(after);
});

describe.each(['ctrlKey', 'metaKey'])('Polygon mouse modifier synchronization: %s', (modifier) => {
    const released = { ctrlKey: false, metaKey: false };
    const held = { ...released, [modifier]: true };

    it('updates hover feedback without recording and recovers from a missing key-up', async () => {
        const f = fixture('polygon');
        f.gizmo.onControllerMouseMove(held);
        f.gizmo.onControllerHoverIn({ handleName: 'p1', customData: { index: 1 } });
        expect(f.gizmo.isDeletePointKeyDown).toBe(true);
        expect(mockServices.Operation.changePointer).toHaveBeenLastCalledWith('alias');
        expect(f.gizmo._leftDeleteLine.show).toHaveBeenCalled();
        expect(f.gizmo._rightDeleteLine.show).toHaveBeenCalled();
        expect(mockServices.Undo.beginRecording).not.toHaveBeenCalled();

        f.gizmo.onKeyDown(held);
        // No KeyUp is delivered; the next hover event carries the current state.
        f.gizmo.onControllerMouseMove(released);
        expect(f.gizmo.isDeletePointKeyDown).toBe(false);
        expect(mockServices.Operation.changePointer).toHaveBeenLastCalledWith('default');
        expect(f.gizmo._leftDeleteLine.hide).toHaveBeenCalled();
        expect(f.gizmo._rightDeleteLine.hide).toHaveBeenCalled();
        expect(mockServices.Undo.beginRecording).not.toHaveBeenCalled();

        f.begin(); f.move(4); f.end(); await settle();
        expect(f.target.points).toHaveLength(3);
        expect(f.target.points[1]).toEqual(new Vec2(14, 0));
        expect(undo.getHistoryForTesting()).toHaveLength(1);
    });

    it.each([false, true])('uses mouse-down state (delete=%s) instead of stale keyboard state', async (deleteOnDown) => {
        const f = fixture('polygon');
        f.gizmo.onKeyDown(deleteOnDown ? released : held);
        // Click can arrive without a preceding hover event in the scene view.
        f.gizmo.onControllerMouseDown(deleteOnDown ? held : released);
        f.end(); await settle();
        expect(f.target.points).toHaveLength(deleteOnDown ? 2 : 3);
        expect(undo.getHistoryForTesting()).toHaveLength(deleteOnDown ? 1 : 0);
        expect(committed).toHaveLength(deleteOnDown ? 1 : 0);
    });
});
