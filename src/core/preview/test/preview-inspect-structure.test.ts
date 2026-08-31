/**
 * `static/web/preview-inspect.js` 的 M4 结构编辑用例(桩 `cc`)。
 *
 * 这份 agent 跑在预览 iframe 里,是「Preview In Editor 期间 Hierarchy 右键编辑节点」的真正执行者:
 * PinK 侧 `PreviewSceneApi` 只做 dispatch(已由 previewSceneApi.test.ts 钉住),
 * 路径索引、undo 栈、剪贴板、类型化创建这些容易出错的逻辑全在这里。
 *
 * 用桩 `cc`(下面的 StubNode/StubScene + 极简 assetManager)驱动,覆盖:
 *  - 路径编码:非法字符替换、同级重名后缀、HideInHierarchy 过滤;
 *  - create-by-type:Empty / 内置 Prefab / 加载失败降级 / workMode 变体 / canvasRequired 自动补 Canvas;
 *  - delete(摘除不 destroy)、rename、set-parent(含环检测)、reorder、change-node-lock;
 *  - 剪贴板:copy 离线副本、cut 变移动、paste 同级重名唯一化、duplicate;
 *  - 预览内独立 undo 栈:逐操作可撤销、group 合成单步、cancel 回滚、空栈不抛;
 *  - 「停止即丢弃」:stop()/clearHistory() 销毁游离节点与剪贴板副本。
 *
 * 加载方式:该文件是浏览器 ESM(唯一导出 `createPreviewInspect`,且零 import),而本仓库 jest 走
 * ts-jest/CommonJS —— `import()` 会被降级成 `require` 从而在 `export function` 处语法失败。
 * 因此这里读源码、去掉唯一的 `export ` 前缀后用 `new Function` 求值,并把它依赖的唯一外部全局
 * (`fetch`)作为形参注入,不污染全局。
 */

import * as fs from 'fs';
import * as path from 'path';

const AGENT_SOURCE_PATH = path.resolve(__dirname, '../../../../static/web/preview-inspect.js');

const CANVAS_PREFAB_UUID_2D = '4c33600e-9ca9-483b-b734-946008261697';
const CANVAS_PREFAB_UUID_3D = 'f773db21-62b8-4540-956a-29bacf5ddbf5';
const CUBE_UUID = 'cube-uuid-0000';
const BUTTON_UUID = 'button-uuid-00';

/** 与 CLI `/scene/node-type-config` 同形的最小表(真实表的契约由 node-type-config-route.test.ts 钉住)。 */
const NODE_TYPE_TABLE: Record<string, Array<Record<string, unknown>>> = {
    Empty: [{ name: 'Empty' }],
    Cube: [{ name: 'Cube', assetUuid: CUBE_UUID, 'project-type': '3d' }],
    Button: [{ name: 'Button', assetUuid: BUTTON_UUID, canvasRequired: true, 'project-type': '2d' }],
    Canvas: [
        { name: 'Canvas', assetUuid: CANVAS_PREFAB_UUID_2D, 'project-type': '2d' },
        { name: 'Canvas', assetUuid: CANVAS_PREFAB_UUID_3D, 'project-type': '3d' },
    ],
};

// ---- 桩引擎 --------------------------------------------------------------

let uuidSequence = 0;

class StubComponent {
    public node: StubNode | null = null;
    public enabled = true;
    public uuid = `comp-${++uuidSequence}`;
}
class StubCanvas extends StubComponent { }
class StubUITransform extends StubComponent { }

class StubNode {
    public uuid = `node-${++uuidSequence}`;
    public parent: StubNode | null = null;
    public children: StubNode[] = [];
    public active = true;
    public layer = 1073741824;
    public _objFlags = 0;
    public _components: StubComponent[] = [];
    public _destroyed = false;
    public _prefab: unknown = { fake: true };
    public position = { x: 0, y: 0, z: 0 };
    public eulerAngles = { x: 0, y: 0, z: 0 };
    public scale = { x: 1, y: 1, z: 1 };

    constructor(public name = 'New Node') { }

    get components(): StubComponent[] {
        return this._components;
    }

    setParent(parent: StubNode | null): void {
        if (this.parent) {
            const index = this.parent.children.indexOf(this);
            if (index >= 0) {
                this.parent.children.splice(index, 1);
            }
        }
        this.parent = parent;
        if (parent) {
            parent.children.push(this);
        }
    }

    getSiblingIndex(): number {
        return this.parent ? this.parent.children.indexOf(this) : -1;
    }

    /** 对齐 cc.Node:先摘出再插入,越界(含 -1)落到末尾。 */
    setSiblingIndex(index: number): void {
        if (!this.parent) {
            return;
        }
        const siblings = this.parent.children;
        const from = siblings.indexOf(this);
        if (from < 0) {
            return;
        }
        siblings.splice(from, 1);
        if (index < 0 || index >= siblings.length) {
            siblings.push(this);
        } else {
            siblings.splice(index, 0, this);
        }
    }

    getComponent(type: any): StubComponent | null {
        return this._components.find(comp => comp instanceof type) || null;
    }

    addComponent(type: any): StubComponent {
        const comp = new type();
        comp.node = this;
        this._components.push(comp);
        return comp;
    }

    setPosition(value: any): void {
        this.position = { x: value.x, y: value.y, z: value.z };
    }

    destroy(): boolean {
        this._destroyed = true;
        return true;
    }
}

class StubScene extends StubNode { }

function cloneNode(source: StubNode): StubNode {
    const copy = new StubNode(source.name);
    copy.layer = source.layer;
    copy._objFlags = source._objFlags;
    copy.position = { ...source.position };
    for (const comp of source._components) {
        copy.addComponent(comp.constructor as any);
    }
    for (const child of source.children.slice()) {
        cloneNode(child).setParent(copy);
    }
    return copy;
}

/** 桩「内置 Prefab」:只需带一个模板节点,`cc.instantiate` 据此产出实例。 */
function makePrefab(template: StubNode): any {
    return { __prefabNode__: template, _destroyed: false };
}

interface IWorldOptions {
    /** uuid → 桩 Prefab;未登记的 uuid 会走 loadAny 失败 → import JSON 404 → 降级路径。 */
    assets?: Record<string, any>;
    /** `/scene/node-type-config` 的响应;null 表示该路由 404。 */
    table?: unknown;
    /** `/scene/asset-meta` 的响应表:dbURL → { uuid, type, name, subAssets? };未登记的 dbURL 404。 */
    assetMeta?: Record<string, { uuid: string; type: string; name: string; subAssets?: Array<{ uuid: string; type: string; name: string }> }>;
}

interface IWorld {
    agent: any;
    scene: StubScene;
    cc: any;
    events: Array<{ type: string; payload: any }>;
    loadedUuids: string[];
    /** 建好初始树之后再 start,避免基线快照缺节点导致首次 flush 误报 node:added。 */
    start(): void;
    node(name: string, parent: StubNode): StubNode;
    childNames(parent: StubNode): string[];
    eventsOf(type: string): any[];
}

const liveAgents: any[] = [];

function loadAgentFactory(fetchImpl: unknown): (env: any) => any {
    const source = fs.readFileSync(AGENT_SOURCE_PATH, 'utf8');
    const exportsFound = source.match(/^export /gm) || [];
    // 只允许唯一导出:一旦有人加了第二个 export,下面的裸 new Function 求值就不再成立,必须显式失败。
    if (exportsFound.length !== 1) {
        throw new Error(`preview-inspect.js is expected to have exactly 1 top-level export, found ${exportsFound.length}`);
    }
    const body = `${source.replace(/^export function /m, 'function ')}\nreturn { createPreviewInspect };`;
    const evaluate = new Function('fetch', body) as (f: unknown) => { createPreviewInspect: (env: any) => any };
    return evaluate(fetchImpl).createPreviewInspect;
}

function createWorld(options: IWorldOptions = {}): IWorld {
    const assets = options.assets || {};
    const table = 'table' in options ? options.table : NODE_TYPE_TABLE;
    const loadedUuids: string[] = [];
    const events: Array<{ type: string; payload: any }> = [];
    const scene = new StubScene('Scene');

    const fetchImpl = async (url: string): Promise<any> => {
        if (url.endsWith('/scene/node-type-config')) {
            return table === null
                ? { ok: false, status: 404, json: async () => ({}) }
                : { ok: true, status: 200, json: async () => table };
        }
        if (url.includes('/scene/asset-meta')) {
            const metaTable = options.assetMeta || {};
            const dbURL = decodeURIComponent(url.split('dbURL=')[1] || '');
            const info = metaTable[dbURL];
            return info
                ? { ok: true, status: 200, json: async () => info }
                : { ok: false, status: 404, json: async () => ({ error: `asset not found: ${dbURL}` }) };
        }
        // 内置资源的 import JSON 兜底路径:桩里一律 404,让「loadAny 失败」直接走到降级分支。
        return { ok: false, status: 404, json: async () => ({}) };
    };

    const cc: any = {
        Node: StubNode,
        Scene: StubScene,
        Canvas: StubCanvas,
        UITransform: StubUITransform,
        Vec3: class Vec3 {
            constructor(public x = 0, public y = 0, public z = 0) { }
        },
        Object: { Flags: { HideInHierarchy: 1 << 9, LockedInEditor: 1 << 8 } },
        director: { getScene: () => scene },
        isValid: (obj: any) => Boolean(obj) && !obj._destroyed,
        js: {
            getClassName: (ctor: any) => {
                if (typeof ctor !== 'function' || !ctor.name) {
                    return '';
                }
                if (ctor === StubScene) {
                    return 'cc.Scene';
                }
                if (ctor === StubNode) {
                    return 'cc.Node';
                }
                return `cc.${String(ctor.name).replace(/^Stub/, '')}`;
            },
        },
        instantiate: (target: any) => {
            if (target && target.__prefabNode__) {
                return cloneNode(target.__prefabNode__);
            }
            return target instanceof StubNode ? cloneNode(target) : null;
        },
        assetManager: {
            loadAny: ({ uuid }: { uuid: string }, callback: (err: unknown, asset?: unknown) => void) => {
                loadedUuids.push(uuid);
                const asset = assets[uuid];
                callback(asset ? null : new Error(`asset '${uuid}' is not registered`), asset);
            },
            loadWithJson: (
                _json: unknown,
                _options: unknown,
                _progress: unknown,
                complete: (err: unknown, asset?: unknown) => void,
            ) => complete(new Error('loadWithJson is not supported in the stub')),
        },
    };

    const createPreviewInspect = loadAgentFactory(fetchImpl);
    const agent = createPreviewInspect({ cc, serverURL: 'http://localhost:7456' });
    liveAgents.push(agent);

    return {
        agent,
        scene,
        cc,
        events,
        loadedUuids,
        start: () => agent.start((type: string, payload: unknown) => events.push({ type, payload })),
        node: (name: string, parent: StubNode) => {
            const created = new StubNode(name);
            created.setParent(parent);
            return created;
        },
        childNames: (parent: StubNode) => parent.children.map(child => child.name),
        eventsOf: (type: string) => events.filter(event => event.type === type).map(event => event.payload),
    };
}

afterEach(() => {
    // 每个 agent 的 start() 都挂了 150ms 轮询定时器;不 stop 会把句柄留到进程退出。
    while (liveAgents.length > 0) {
        try {
            liveAgents.pop().stop();
        } catch {
            /* 已 stop 过,忽略 */
        }
    }
});

// ---- 路径索引 ------------------------------------------------------------

describe('preview-inspect 路径索引', () => {
    it('非法字符替换为 _、同级重名加 _00N 后缀(与编辑态编码规则一致)', () => {
        const world = createWorld();
        const first = world.node('Foo', world.scene);
        const second = world.node('Foo', world.scene);
        const weird = world.node('a/b:c*d', world.scene);
        world.start();

        expect(world.agent.getPathByUuid(first.uuid)).toBe('Foo');
        expect(world.agent.getPathByUuid(second.uuid)).toBe('Foo_001');
        expect(world.agent.getPathByUuid(weird.uuid)).toBe('a_b_c_d');
    });

    it('HideInHierarchy 节点不进索引;场景根是 "/";未知 uuid 返回空串', () => {
        const world = createWorld();
        const hidden = world.node('Hidden', world.scene);
        hidden._objFlags = world.cc.Object.Flags.HideInHierarchy;
        world.start();

        expect(world.agent.getPathByUuid(hidden.uuid)).toBe('');
        expect(world.agent.getPathByUuid(world.scene.uuid)).toBe('/');
        expect(world.agent.getPathByUuid('no-such-uuid')).toBe('');
    });
});

// ---- 类型化创建 ----------------------------------------------------------

describe('preview-inspect create-by-type', () => {
    it('Empty 走 new cc.Node:挂到目标父级、继承 layer、即时发出 node:added、可撤销', async () => {
        const world = createWorld();
        const parent = world.node('Parent', world.scene);
        parent.layer = 42;
        world.start();

        const dump = await world.agent.createNodeByType({ path: 'Parent', nodeType: 'Empty', name: 'Hero' });

        expect(dump.path).toBe('Parent/Hero');
        expect(world.childNames(parent)).toEqual(['Hero']);
        expect(parent.children[0].layer).toBe(42);
        // 不等 150ms 轮询:写操作末尾同步 flush 一次。
        expect(world.eventsOf('node:added')).toEqual([{ path: 'Parent/Hero' }]);
        expect(world.agent.canUndo()).toBe(true);

        const undo = world.agent.undo();
        expect(undo).toEqual({ success: true, label: 'Create Empty' });
        expect(parent.children).toHaveLength(0);
        expect(world.agent.redo()).toEqual({ success: true, label: 'Create Empty' });
        expect(world.childNames(parent)).toEqual(['Hero']);
    });

    it('Canvas 下的空节点自动补 UITransform', async () => {
        const world = createWorld();
        const canvas = world.node('Canvas', world.scene);
        canvas.addComponent(StubCanvas);
        world.start();

        await world.agent.createNodeByType({ path: 'Canvas', nodeType: 'Empty' });

        expect(canvas.children[0].getComponent(StubUITransform)).toBeTruthy();
    });

    it('内置 Prefab 类型走 instantiate,不产生降级 warn', async () => {
        const template = new StubNode('Cube');
        const world = createWorld({ assets: { [CUBE_UUID]: makePrefab(template) } });
        world.start();

        const dump = await world.agent.createNodeByType({ path: '/', nodeType: 'Cube' });

        expect(dump.path).toBe('Cube');
        expect(world.childNames(world.scene)).toEqual(['Cube']);
        // prefab 元数据必须摘掉:预览永不回盘,残留会让 Inspector 显示错误的关联状态。
        expect(world.scene.children[0]._prefab).toBeNull();
        expect(world.eventsOf('view:log')).toEqual([]);
    });

    it('Prefab 加载失败降级为空节点 + view:log warn,创建本身仍然成功', async () => {
        const world = createWorld(); // 未登记任何资源 → loadAny 失败 → import JSON 404
        world.start();

        const dump = await world.agent.createNodeByType({ path: '/', nodeType: 'Cube' });

        expect(dump.path).toBe('Cube');
        expect(world.childNames(world.scene)).toEqual(['Cube']);
        const logs = world.eventsOf('view:log');
        expect(logs).toHaveLength(1);
        expect(logs[0].level).toBe('warn');
        expect(logs[0].message).toContain("create 'Cube' fell back to an empty node");
        // 降级也必须留下 undo 记录,否则用户撤销不掉这个节点。
        expect(world.agent.canUndo()).toBe(true);
    });

    it('workMode 与 project-type 不符且存在备选时取第 2 项(Canvas 的 2d/3d 变体)', async () => {
        const world = createWorld({
            assets: {
                [CANVAS_PREFAB_UUID_2D]: makePrefab(new StubNode('Canvas2D')),
                [CANVAS_PREFAB_UUID_3D]: makePrefab(new StubNode('Canvas3D')),
            },
        });
        world.start();

        await world.agent.createNodeByType({ path: '/', nodeType: 'Canvas', workMode: '3d' });

        expect(world.loadedUuids).toEqual([CANVAS_PREFAB_UUID_3D]);
        expect(world.childNames(world.scene)).toEqual(['Canvas3D']);
    });

    it('canvasRequired 在无 Canvas 场景下自动补 Canvas,且整体只算一步 undo', async () => {
        const canvasTemplate = new StubNode('Canvas');
        canvasTemplate.addComponent(StubCanvas);
        const world = createWorld({
            assets: {
                [CANVAS_PREFAB_UUID_2D]: makePrefab(canvasTemplate),
                [BUTTON_UUID]: makePrefab(new StubNode('Button')),
            },
        });
        world.start();

        const dump = await world.agent.createNodeByType({ path: '/', nodeType: 'Button', workMode: '2d' });

        expect(dump.path).toBe('Canvas/Button');
        expect(world.childNames(world.scene)).toEqual(['Canvas']);
        expect(world.childNames(world.scene.children[0])).toEqual(['Button']);

        // 自动补的 Canvas 与 Button 由 _asOneCommand 合成单步:一次 Ctrl+Z 应把两者一起撤掉。
        expect(world.agent.undo().success).toBe(true);
        expect(world.scene.children).toHaveLength(0);
        expect(world.agent.canUndo()).toBe(false);
    });

    it('未实现的类型 / 缺 nodeType 直接抛,且不留下空 undo 步骤', async () => {
        const world = createWorld();
        world.start();

        await expect(world.agent.createNodeByType({ path: '/', nodeType: 'NoSuchType' }))
            .rejects.toThrow(/is not implemented/);
        await expect(world.agent.createNodeByType({ path: '/' })).rejects.toThrow(/nodeType is required/);
        expect(world.agent.canUndo()).toBe(false);
    });

    it('node-type-config 路由不可用时抛出可定位的错误,并允许下次重试', async () => {
        const world = createWorld({ table: null });
        world.start();

        await expect(world.agent.createNodeByType({ path: '/', nodeType: 'Empty' }))
            .rejects.toThrow(/failed to load the node type config/);
        // pending promise 已被清掉 → 再试一次仍然是「重新请求后失败」,而不是拿到脏缓存。
        await expect(world.agent.createNodeByType({ path: '/', nodeType: 'Empty' }))
            .rejects.toThrow(/failed to load the node type config/);
    });
});

// ---- 删除 / 改名 --------------------------------------------------------

describe('preview-inspect delete / rename', () => {
    it('delete 只摘除不 destroy,发出 node:removed,undo 原位复活', () => {
        const world = createWorld();
        const parent = world.node('Parent', world.scene);
        world.node('A', parent);
        const target = world.node('B', parent);
        world.node('C', parent);
        world.start();

        world.agent.deleteNode({ path: 'Parent/B' });

        expect(world.childNames(parent)).toEqual(['A', 'C']);
        // 关键:节点没被 destroy,引用交给 undo 栈持有(对齐编辑态 baseRemoveNode)。
        expect(target._destroyed).toBe(false);
        expect(world.eventsOf('node:removed')).toEqual([{ path: 'Parent/B' }]);

        expect(world.agent.undo()).toEqual({ success: true, label: 'Delete Node' });
        expect(world.childNames(parent)).toEqual(['A', 'B', 'C']);
    });

    it('删除场景根 / 不存在的路径都抛错', () => {
        const world = createWorld();
        world.start();

        expect(() => world.agent.deleteNode({ path: '/' })).toThrow(/scene root cannot be modified/);
        expect(() => world.agent.deleteNode({ path: 'Ghost' })).toThrow(/node not found/);
    });

    it('rename(set-property name)重建索引并单独记 undo', () => {
        const world = createWorld();
        const parent = world.node('Parent', world.scene);
        const target = world.node('A', parent);
        world.start();

        world.agent.setProperty({ nodePath: 'Parent/A', path: 'name', dump: { type: 'String', value: 'Renamed' } });

        expect(target.name).toBe('Renamed');
        // 名字是路径的一部分:不重建索引,后续所有按 path 的定位都会指向旧名。
        expect(world.agent.getPathByUuid(target.uuid)).toBe('Parent/Renamed');
        expect(world.agent.undo()).toEqual({ success: true, label: 'Rename Node' });
        expect(target.name).toBe('A');
        expect(world.agent.getPathByUuid(target.uuid)).toBe('Parent/A');
    });
});

// ---- 移动 / 排序 / 锁定 -------------------------------------------------

describe('preview-inspect set-parent / reorder / lock', () => {
    it('set-parent 返回移动后的路径,undo 回到原父级与原兄弟位置', () => {
        const world = createWorld();
        const from = world.node('From', world.scene);
        const to = world.node('To', world.scene);
        world.node('X', from);
        const moved = world.node('A', from);
        world.start();

        const paths = world.agent.setParent({ paths: ['From/A'], parentPath: 'To' });

        expect(paths).toEqual(['To/A']);
        expect(world.childNames(to)).toEqual(['A']);
        expect(world.agent.undo()).toEqual({ success: true, label: 'Move Nodes' });
        expect(world.childNames(from)).toEqual(['X', 'A']);
        expect(moved.getSiblingIndex()).toBe(1);
    });

    it('set-parent 环检测在任何写入之前完成(自身/后代做父级都抛且不留脏状态)', () => {
        const world = createWorld();
        const root = world.node('Root', world.scene);
        world.node('Child', root);
        world.start();

        expect(() => world.agent.setParent({ paths: ['Root'], parentPath: 'Root/Child' }))
            .toThrow(/cannot set parent to the node itself or its descendant/);
        expect(() => world.agent.setParent({ paths: ['Root'], parentPath: 'Root' }))
            .toThrow(/cannot set parent to the node itself or its descendant/);

        expect(world.childNames(world.scene)).toEqual(['Root']);
        expect(world.childNames(root)).toEqual(['Child']);
        expect(world.agent.canUndo()).toBe(false);
    });

    it('reorder 的 path 是父节点路径,target/offset 语义对齐编辑态,可撤销', () => {
        const world = createWorld();
        const parent = world.node('Parent', world.scene);
        world.node('A', parent);
        world.node('B', parent);
        world.node('C', parent);
        world.start();

        expect(world.agent.reorder({ path: 'Parent', target: 0, offset: 2 })).toBe(true);

        expect(world.childNames(parent)).toEqual(['B', 'C', 'A']);
        expect(world.agent.undo()).toEqual({ success: true, label: 'Reorder Node' });
        expect(world.childNames(parent)).toEqual(['A', 'B', 'C']);
    });

    it('reorder 参数非法时返回 false 而不抛', () => {
        const world = createWorld();
        const parent = world.node('Parent', world.scene);
        world.node('A', parent);
        world.start();

        expect(world.agent.reorder({ path: 'Parent', target: 'x', offset: 0 })).toBe(false);
        expect(world.agent.reorder({ path: 'Parent', target: 99, offset: 0 })).toBe(false);
        expect(world.agent.canUndo()).toBe(false);
    });

    it('change-node-lock 写节点自身 objFlags 的 LockedInEditor 位,回推 node:change(propPath:locked)', () => {
        const world = createWorld();
        const target = world.node('A', world.scene);
        const child = world.node('Inner', target);
        world.start();
        const flag = world.cc.Object.Flags.LockedInEditor;

        world.agent.changeNodeLock({ paths: ['A'], locked: true, loop: true });

        expect(target._objFlags & flag).toBe(flag);
        expect(child._objFlags & flag).toBe(flag);
        const changes = world.eventsOf('node:change');
        expect(changes).toHaveLength(2);
        expect(changes[0].change).toEqual({ propPath: 'locked', source: 'engine' });
        expect(changes[0].node.locked.value).toBe(true);

        expect(world.agent.undo()).toEqual({ success: true, label: 'Lock Node' });
        expect(target._objFlags & flag).toBe(0);
        expect(child._objFlags & flag).toBe(0);
    });
});

// ---- 剪贴板 ------------------------------------------------------------

describe('preview-inspect 剪贴板', () => {
    it('copy 存离线副本:源节点被删除后仍可粘贴,clipboard-state 的 paths 按当前索引过滤', () => {
        const world = createWorld();
        const parent = world.node('Parent', world.scene);
        world.node('A', parent);
        world.start();

        expect(world.agent.copyNodes({ paths: ['Parent/A'] })).toEqual(['Parent/A']);
        expect(world.agent.queryClipboardState()).toEqual({ type: 'copy', paths: ['Parent/A'] });

        world.agent.deleteNode({ path: 'Parent/A' });
        // 源节点已不在树上:Paste 依旧可用,但 paths 被过滤(与编辑态一致,避免显示幽灵路径)。
        expect(world.agent.queryClipboardState()).toEqual({ type: 'copy', paths: [] });

        expect(world.agent.pasteNodes({ parentPath: 'Parent' })).toEqual(['Parent/A']);
        expect(world.childNames(parent)).toEqual(['A']);
    });

    it('paste 到仍有同名兄弟的父级时唯一化名字,并可整体撤销', () => {
        const world = createWorld();
        const parent = world.node('Parent', world.scene);
        world.node('A', parent);
        world.start();

        world.agent.copyNodes({ paths: ['Parent/A'] });
        const pasted = world.agent.pasteNodes({ parentPath: 'Parent' });

        expect(pasted).toEqual(['Parent/A-001']);
        expect(world.childNames(parent)).toEqual(['A', 'A-001']);
        expect(world.agent.undo()).toEqual({ success: true, label: 'Paste Nodes' });
        expect(world.childNames(parent)).toEqual(['A']);
    });

    it('cut + paste 是移动(不产生新节点),且剪贴板被消费', () => {
        const world = createWorld();
        const from = world.node('From', world.scene);
        const to = world.node('To', world.scene);
        const moved = world.node('A', from);
        world.start();

        expect(world.agent.cutNodes({ paths: ['From/A'] })).toEqual(['From/A']);
        expect(world.agent.queryClipboardState()).toEqual({ type: 'cut', paths: ['From/A'] });

        expect(world.agent.pasteNodes({ parentPath: 'To' })).toEqual(['To/A']);
        expect(to.children).toHaveLength(1);
        expect(to.children[0]).toBe(moved);
        expect(from.children).toHaveLength(0);
        // 剪切是一次性的:粘贴后剪贴板必须清空,否则第二次粘贴会粘出幽灵。
        expect(world.agent.queryClipboardState()).toEqual({ type: 'none', paths: [] });
    });

    it('空剪贴板 paste 抛错;copy/cut 场景根抛错', () => {
        const world = createWorld();
        world.node('A', world.scene);
        world.start();

        expect(() => world.agent.pasteNodes({ parentPath: '/' })).toThrow(/no nodes have been copied/);
        expect(() => world.agent.copyNodes({ paths: ['/'] })).toThrow(/scene root cannot be modified/);
        expect(() => world.agent.cutNodes({ paths: ['/'] })).toThrow(/scene root cannot be modified/);
    });

    it('duplicate 把副本挂在源节点同一父级下并顺次唯一化名字', () => {
        const world = createWorld();
        const parent = world.node('Parent', world.scene);
        world.node('A', parent);
        world.start();

        expect(world.agent.duplicateNodes({ paths: ['Parent/A'] })).toEqual(['Parent/A-001']);
        expect(world.agent.duplicateNodes({ paths: ['Parent/A'] })).toEqual(['Parent/A-002']);
        expect(world.childNames(parent)).toEqual(['A', 'A-001', 'A-002']);

        expect(world.agent.undo()).toEqual({ success: true, label: 'Duplicate Nodes' });
        expect(world.childNames(parent)).toEqual(['A', 'A-001']);
    });
});

// ---- 预览内独立 undo 栈 -------------------------------------------------

describe('preview-inspect 预览内独立 undo 栈', () => {
    it('group 把多个写操作合成单步(嵌套 begin 只在最外层开栈)', () => {
        const world = createWorld();
        const parent = world.node('Parent', world.scene);
        world.node('A', parent);
        world.node('B', parent);
        world.start();

        const token = world.agent.beginGroup({ label: 'Batch Delete' });
        expect(world.agent.isGroupActive()).toBe(true);
        // host 侧 sceneOps 也会开 group,嵌套时必须复用同一个 id。
        expect(world.agent.beginGroup({ label: 'Inner' })).toBe(token);
        world.agent.deleteNode({ path: 'Parent/A' });
        world.agent.deleteNode({ path: 'Parent/B' });
        expect(world.agent.endGroup(token)).toEqual({ success: true, commandId: token, label: 'Batch Delete' });
        expect(world.agent.isGroupActive()).toBe(true);
        expect(world.agent.endGroup(token)).toEqual({ success: true, commandId: token, label: 'Batch Delete' });

        expect(parent.children).toHaveLength(0);
        expect(world.agent.undo()).toEqual({ success: true, label: 'Batch Delete' });
        expect(world.childNames(parent)).toEqual(['A', 'B']);
        expect(world.agent.canUndo()).toBe(false);
    });

    it('cancel-group 逐条逆序回滚且不入栈', () => {
        const world = createWorld();
        const parent = world.node('Parent', world.scene);
        world.node('A', parent);
        world.start();

        const token = world.agent.beginGroup({ label: 'Attempt' });
        world.agent.deleteNode({ path: 'Parent/A' });
        expect(world.agent.cancelGroup(token)).toEqual({ success: true, commandId: token, label: 'Attempt' });

        expect(world.childNames(parent)).toEqual(['A']);
        expect(world.agent.canUndo()).toBe(false);
    });

    it('group 未结束时 undo/redo 返回 success:false;非法 token 与无 group 也只返回结构化结果', () => {
        const world = createWorld();
        world.start();

        expect(world.agent.endGroup('nope')).toEqual({ success: false, reason: 'preview end-group: no active undo group' });
        expect(world.agent.cancelGroup()).toEqual({ success: false, reason: 'preview cancel-group: no active undo group' });

        const token = world.agent.beginGroup({ label: 'Open' });
        expect(world.agent.undo().success).toBe(false);
        expect(world.agent.redo().success).toBe(false);
        expect(world.agent.endGroup('wrong-token').success).toBe(false);
        world.agent.endGroup(token);
    });

    it('空栈 undo/redo 不抛,返回 history is empty;新命令清空 redo 栈', () => {
        const world = createWorld();
        const parent = world.node('Parent', world.scene);
        world.node('A', parent);
        world.start();

        expect(world.agent.undo()).toEqual({ success: false, reason: 'preview undo: history is empty' });
        expect(world.agent.redo()).toEqual({ success: false, reason: 'preview redo: history is empty' });

        world.agent.deleteNode({ path: 'Parent/A' });
        world.agent.undo();
        expect(world.agent.canRedo()).toBe(true);
        // 撤销后又做了新操作 → redo 分支必须丢弃。
        world.agent.setProperty({ nodePath: 'Parent/A', path: 'name', dump: { type: 'String', value: 'A2' } });
        expect(world.agent.canRedo()).toBe(false);
    });

    it('isDirty 恒 false:预览改动绝不让编辑器 tab 变 dirty(停止即丢弃)', () => {
        const world = createWorld();
        const parent = world.node('Parent', world.scene);
        world.node('A', parent);
        world.start();

        world.agent.deleteNode({ path: 'Parent/A' });

        expect(world.agent.isDirty()).toBe(false);
    });
});

// ---- 停止即丢弃 --------------------------------------------------------

describe('preview-inspect 停止即丢弃', () => {
    it('stop() 销毁被 undo 栈持有的游离节点与剪贴板离线副本,并清空历史', () => {
        const world = createWorld();
        const parent = world.node('Parent', world.scene);
        const deleted = world.node('A', parent);
        world.node('B', parent);
        world.start();

        world.agent.copyNodes({ paths: ['Parent/B'] });
        const stashed = (world.agent as any)._clipboard.entries[0].instant;
        world.agent.deleteNode({ path: 'Parent/A' });

        world.agent.stop();

        expect(deleted._destroyed).toBe(true);
        expect(stashed._destroyed).toBe(true);
        expect(world.agent.canUndo()).toBe(false);
        expect(world.agent.canRedo()).toBe(false);
    });

    it('clearHistory() 同样销毁游离节点(它们已不可能被复活)', () => {
        const world = createWorld();
        const parent = world.node('Parent', world.scene);
        const deleted = world.node('A', parent);
        world.start();

        world.agent.deleteNode({ path: 'Parent/A' });
        world.agent.clearHistory();

        expect(deleted._destroyed).toBe(true);
        expect(world.agent.canUndo()).toBe(false);
    });

    it('stop() 之后不再发事件(sink 已解绑,轮询定时器已清)', () => {
        const world = createWorld();
        const parent = world.node('Parent', world.scene);
        world.node('A', parent);
        world.start();

        world.agent.stop();
        const before = world.events.length;
        world.node('Late', parent);
        (world.agent as any)._flushStructure();

        expect(world.events.length).toBe(before);
    });
});

// ---- M5 组件操作 --------------------------------------------------------

class StubLabel extends StubComponent {
    public content = 'hello';
    public fontSize = 20;
    public offset = { x: 1, y: 2 };
    public _destroyed = false;
    destroy(): boolean {
        this._destroyed = true;
        return true;
    }
}
(StubLabel as any).__props__ = ['content', 'fontSize', 'offset'];

class StubBadge extends StubComponent { }

describe('preview-inspect M5 组件操作', () => {
    it('removeComponent 摘除不 destroy、发 node:change(__comps__)、undo 原位复活', () => {
        const world = createWorld();
        const ui = world.node('UI', world.scene);
        const label = ui.addComponent(StubLabel) as StubLabel;
        ui.addComponent(StubBadge);
        world.start();

        world.agent.removeComponent({ path: 'UI/cc.Label' });

        expect(ui._components).toHaveLength(1);
        expect(ui._components[0]).toBeInstanceOf(StubBadge);
        expect(label._destroyed).toBe(false); // 摘除不 destroy,等待 undo 复活
        const changes = world.eventsOf('node:change');
        expect(changes[changes.length - 1].change).toEqual({ propPath: '__comps__', source: 'engine' });
        expect(world.agent.canUndo()).toBe(true);

        expect(world.agent.undo()).toEqual({ success: true, label: 'Remove Component' });
        expect(ui._components).toHaveLength(2);
        expect(ui._components[0]).toBe(label); // 原位复活
        expect(world.agent.redo()).toEqual({ success: true, label: 'Remove Component' });
        expect(ui._components).toHaveLength(1);
        expect(ui._components[0]).toBeInstanceOf(StubBadge);
    });

    it('removeComponent 对不存在的组件抛可定位错误,且不留 undo 步骤', () => {
        const world = createWorld();
        world.node('UI', world.scene);
        world.start();

        expect(() => world.agent.removeComponent({ path: 'UI/cc.Label' })).toThrow(/component not found/);
        expect(world.agent.canUndo()).toBe(false);
    });

    it('stop() 销毁被摘除的游离组件(停止即丢弃)', () => {
        const world = createWorld();
        const ui = world.node('UI', world.scene);
        const label = ui.addComponent(StubLabel) as StubLabel;
        world.start();

        world.agent.removeComponent({ path: 'UI/cc.Label' });
        world.agent.stop();

        expect(label._destroyed).toBe(true);
    });

    it('resetComponent 恢复临时默认值并合成单步 undo;undo 还原改值', () => {
        const world = createWorld();
        const ui = world.node('UI', world.scene);
        const label = ui.addComponent(StubLabel) as StubLabel;
        world.start();

        label.content = 'changed';
        label.fontSize = 99;
        world.agent.resetComponent({ path: 'UI/cc.Label' });

        expect(label.content).toBe('hello');
        expect(label.fontSize).toBe(20);
        expect(world.agent.undo()).toEqual({ success: true, label: 'Reset Component' });
        expect(label.content).toBe('changed');
        expect(label.fontSize).toBe(99);
        expect(world.agent.canUndo()).toBe(false);
    });

    it('moveArrayElement 交换组件顺序、undo 反交换;越界与非 __comps__ 路径直接抛', () => {
        const world = createWorld();
        const ui = world.node('UI', world.scene);
        const label = ui.addComponent(StubLabel);
        const badge = ui.addComponent(StubBadge);
        world.start();

        world.agent.moveArrayElement({ nodePath: 'UI', path: '__comps__', target: 0, offset: 1 });
        expect(ui._components[0]).toBe(badge);
        expect(ui._components[1]).toBe(label);

        expect(world.agent.undo().success).toBe(true);
        expect(ui._components[0]).toBe(label);
        expect(ui._components[1]).toBe(badge);

        expect(() => world.agent.moveArrayElement({ nodePath: 'UI', path: '__comps__', target: 1, offset: 1 })).toThrow(/out of range/);
        expect(() => world.agent.moveArrayElement({ nodePath: 'UI', path: 'children', target: 0, offset: 1 })).toThrow(/__comps__/);
    });

    it('节点 dump 的组件带 component_path(同级去重),kebab 菜单可据此直接定位 remove/reset', () => {
        const world = createWorld();
        const ui = world.node('UI', world.scene);
        ui.addComponent(StubLabel);
        ui.addComponent(StubLabel);
        ui.addComponent(StubBadge);
        world.start();

        const dump = world.agent.query({ path: 'UI' });
        expect(dump.__comps__.map((c: any) => c.component_path)).toEqual([
            'UI/cc.Label',
            'UI/cc.Label_001',
            'UI/cc.Badge',
        ]);

        // 回归:面板用 dump 里的 component_path 调菜单操作,必须命中同名去重后的正确实例。
        world.agent.resetComponent({ path: dump.__comps__[1].component_path });
        const label2 = ui._components[1] as StubLabel;
        expect(label2.content).toBe('hello');
        world.agent.removeComponent({ path: dump.__comps__[1].component_path });
        expect(ui._components).toHaveLength(2);
        expect(ui._components[1]).toBeInstanceOf(StubBadge);
    });

    it('setProperty 整包形态逐键应用 visible 键、跳过 visible:false 与骨架键,undo 还原', () => {
        const world = createWorld();
        const ui = world.node('UI', world.scene);
        const label = ui.addComponent(StubLabel) as StubLabel;
        const originalUuid = label.uuid;
        world.start();

        world.agent.setProperty({
            nodePath: 'UI',
            path: '__comps__.0',
            dump: {
                value: {
                    content: { type: 'String', value: 'pasted' },
                    fontSize: { type: 'Number', value: 32 },
                    offset: { type: 'cc.Vec2', value: { x: 7, y: 8 }, visible: false },
                    uuid: { type: 'String', value: 'comp-evil' },
                },
            },
        });

        expect(label.content).toBe('pasted');
        expect(label.fontSize).toBe(32);
        expect(label.offset).toEqual({ x: 1, y: 2 }); // visible:false 跳过
        expect(label.uuid).toBe(originalUuid); // 骨架键跳过

        expect(world.agent.undo().success).toBe(true);
        expect(label.content).toBe('hello');
        expect(label.fontSize).toBe(20);
    });
});

// ---- M6 按资产创建 ------------------------------------------------------

class StubPrefab {
    public _destroyed = false;
    constructor(public __prefabNode__: StubNode) { }
}
class StubSprite extends StubComponent {
    public spriteFrame: unknown = null;
}
class StubSpriteFrame {
    public _destroyed = false;
    public texture: unknown = null;
}
class StubAudioClip {
    public _destroyed = false;
}
class StubImageAsset {
    public _destroyed = false;
}
class StubTexture2D {
    public _destroyed = false;
    public image: unknown = null;
}
class StubAudioSource extends StubComponent {
    public clip: unknown = null;
}
class StubMaterial {
    public _destroyed = false;
}

describe('preview-inspect M6 按资产创建', () => {
    it('Prefab 拖拽:instantiate + 摘 prefab 元数据 + 即时 node:added + 可撤销', async () => {
        const uuid = 'hero-prefab-uuid';
        const world = createWorld({
            assets: { [uuid]: new StubPrefab(new StubNode('Hero')) },
            assetMeta: { 'db://assets/hero.prefab': { uuid, type: 'cc.Prefab', name: 'hero' } },
        });
        const canvas = world.node('Canvas', world.scene);
        world.start();

        const dump = await world.agent.createByAsset({ dbURL: 'db://assets/hero.prefab', path: 'Canvas' });

        expect(dump.path).toBe('Canvas/Hero');
        expect(canvas.children).toHaveLength(1);
        expect(canvas.children[0]._prefab).toBeNull(); // 预览永不回盘,prefab 元数据必须摘掉
        expect(world.eventsOf('node:added')).toEqual([{ path: 'Canvas/Hero' }]);
        expect(world.agent.undo().success).toBe(true);
        expect(canvas.children).toHaveLength(0);
    });

    it('SpriteFrame 拖拽:新节点 + UITransform + Sprite,2d 自动补 Canvas 父级', async () => {
        const world = createWorld({
            assets: {
                [CANVAS_PREFAB_UUID_2D]: makePrefab(new StubNode('Canvas2D')),
                'sf-uuid': new StubSpriteFrame(),
            },
            assetMeta: { 'db://assets/logo.spriteFrame': { uuid: 'sf-uuid', type: 'cc.SpriteFrame', name: 'logo' } },
        });
        world.cc.Sprite = StubSprite;
        world.cc.SpriteFrame = StubSpriteFrame;
        world.start();

        const dump = await world.agent.createByAsset({ dbURL: 'db://assets/logo.spriteFrame', path: '/', workMode: '2d' });

        expect(world.childNames(world.scene)).toEqual(['Canvas2D']);
        const canvas = world.scene.children[0];
        expect(world.childNames(canvas)).toEqual(['logo']);
        const spriteNode = canvas.children[0];
        expect(spriteNode.getComponent(StubUITransform)).toBeTruthy();
        const sprite = spriteNode.getComponent(StubSprite) as StubSprite;
        expect(sprite).toBeTruthy();
        expect(sprite.spriteFrame).toBeInstanceOf(StubSpriteFrame);
        expect(dump.path).toBe('Canvas2D/logo');
    });

    it('AudioClip 拖拽:新节点 + AudioSource 挂 clip', async () => {
        const clip = new StubAudioClip();
        const world = createWorld({
            assets: { 'clip-uuid': clip },
            assetMeta: { 'db://assets/bgm.mp3': { uuid: 'clip-uuid', type: 'cc.AudioClip', name: 'bgm' } },
        });
        world.cc.AudioSource = StubAudioSource;
        world.start();

        await world.agent.createByAsset({ dbURL: 'db://assets/bgm.mp3', path: '/' });

        const node = world.scene.children[0];
        expect(node.name).toBe('bgm');
        const source = node.getComponent(StubAudioSource) as StubAudioSource;
        expect(source).toBeTruthy();
        expect(source.clip).toBe(clip);
    });

    it('ImageAsset 拖拽:节点名去扩展后缀,spriteFrame 优先挂 asset-db 真子资产(可索引回 Assets)', async () => {
        const image = new StubImageAsset();
        const realSf = new StubSpriteFrame();
        const world = createWorld({
            assets: {
                [CANVAS_PREFAB_UUID_2D]: makePrefab(new StubNode('Canvas2D')),
                'img-uuid': image,
                'img-uuid@f9941': realSf,
            },
            assetMeta: {
                'db://assets/tex/GreenBtn.png': {
                    uuid: 'img-uuid',
                    type: 'cc.ImageAsset',
                    name: 'GreenBtn.png',
                    subAssets: [{ uuid: 'img-uuid@f9941', type: 'cc.SpriteFrame', name: 'spriteFrame' }],
                },
            },
        });
        world.cc.Sprite = StubSprite;
        world.cc.SpriteFrame = StubSpriteFrame;
        world.cc.Texture2D = StubTexture2D;
        world.start();

        await world.agent.createByAsset({ dbURL: 'db://assets/tex/GreenBtn.png', path: '/', workMode: '2d' });

        const canvas = world.scene.children[0];
        const spriteNode = canvas.children[0];
        expect(spriteNode.name).toBe('GreenBtn'); // 扩展后缀去掉
        const sprite = spriteNode.getComponent(StubSprite) as StubSprite;
        expect(sprite).toBeTruthy();
        expect(sprite.spriteFrame).toBe(realSf); // 真子资产,非临时包装
    });

    it('ImageAsset 缺 spriteFrame 子资产时:回退 Texture2D → SpriteFrame 两层临时包装', async () => {
        const image = new StubImageAsset();
        const world = createWorld({
            assets: {
                [CANVAS_PREFAB_UUID_2D]: makePrefab(new StubNode('Canvas2D')),
                'img-uuid': image,
            },
            assetMeta: { 'db://assets/tex/logo.png': { uuid: 'img-uuid', type: 'cc.ImageAsset', name: 'logo' } },
        });
        world.cc.Sprite = StubSprite;
        world.cc.SpriteFrame = StubSpriteFrame;
        world.cc.Texture2D = StubTexture2D;
        world.start();

        await world.agent.createByAsset({ dbURL: 'db://assets/tex/logo.png', path: '/', workMode: '2d' });

        const canvas = world.scene.children[0];
        const spriteNode = canvas.children[0];
        expect(spriteNode.name).toBe('logo');
        const sprite = spriteNode.getComponent(StubSprite) as StubSprite;
        expect(sprite).toBeTruthy();
        const sf = sprite.spriteFrame as StubSpriteFrame;
        expect(sf).toBeInstanceOf(StubSpriteFrame);
        expect(sf.texture).toBeInstanceOf(StubTexture2D);
        expect((sf.texture as StubTexture2D).image).toBe(image);
    });

    it('不支持的类型抛可定位错误,且不留 undo 步骤', async () => {
        const world = createWorld({
            assets: { 'mat-uuid': new StubMaterial() },
            assetMeta: { 'db://assets/m.material': { uuid: 'mat-uuid', type: 'cc.Material', name: 'm' } },
        });
        world.start();

        await expect(world.agent.createByAsset({ dbURL: 'db://assets/m.material' }))
            .rejects.toThrow(/not supported in preview/);
        expect(world.agent.canUndo()).toBe(false);
    });

    it('asset-meta 路由缺失时抛可定位错误,允许下次重试', async () => {
        const world = createWorld(); // 未登记任何 assetMeta → 404
        world.start();

        await expect(world.agent.createByAsset({ dbURL: 'db://assets/nope.prefab' }))
            .rejects.toThrow(/failed to load the asset meta/);
        expect(world.agent.canUndo()).toBe(false);
    });
});
