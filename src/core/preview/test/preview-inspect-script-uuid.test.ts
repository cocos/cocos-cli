/**
 * `static/web/preview-inspect.js` 的「组件 Script 一栏 uuid 归一」用例。
 *
 * 背景（真实缺陷）：Preview In Editor 后，挂了自定义脚本的节点在 Inspector 里 Script 一栏红字
 * "Missing"，而同组件的其它引用字段（Button / Label / Node）都正常。
 *
 * 机制：面板的资源选择器（`@pink-ui-kit` ref-picker）用 `items.find(i => i.uuid === dump.value.uuid)`
 * 做**严格相等**匹配，items 来自 asset-db 的 `queryAssets`（两态一致，都是**带短横** uuid）。
 * 编辑态由 `encode.ts` 直接写入 `component.__scriptUuid`；预览运行时没有编辑器注入的这个字段，
 * 只能从 classId 反查 —— 用户脚本的 classId 就是**压缩后**的脚本 uuid。压缩形式（22/23 位 base64）
 * 解压出来又是 **32 位无短横**形式，跟 asset-db 的带短横形式仍然不相等。少任一步 → "Missing"。
 *
 * 本测试钉住三条不变量：
 *  1. 压缩 / 32 位无短横 / 带短横 三种输入都归一到**带短横** 36 位形式（引擎自带的黄金向量）；
 *  2. `EditorExtends.UuidUtils.decompressUUID` 存在时以它为准，缺席时本地移植版给出**相同**结果
 *     （预览页确实会加载 editor-extends.bundle.js，但不能依赖它一定在）；
 *  3. 认不出来的 classId（`ccclass('Foo')` 手写类名）→ 隐藏 Script 行而不是丢一个查不到的 uuid
 *     给面板渲染成红字，并且按类名去重告警一次（静默隐藏会让人以为面板漏字段）。
 *
 * 加载方式与 preview-inspect-structure.test.ts 一致：该文件是零 import 的浏览器 ESM，
 * ts-jest/CommonJS 下 `import()` 会被降级成 `require` 而在 `export function` 处语法失败，
 * 故读源码、去掉唯一的 `export ` 前缀后用 `new Function` 求值。
 */

import * as fs from 'fs';
import * as path from 'path';

const AGENT_SOURCE_PATH = path.resolve(__dirname, '../../../../static/web/preview-inspect.js');

/**
 * 引擎 `utils/uuid` 文档注释里的黄金向量：23 位（普通压缩）与 22 位（min 压缩）两种形态
 * 解压到同一个 uuid。这两串直接抄自引擎实现的 doc comment，是本地移植版的验收基准。
 */
const COMPRESSED_23 = 'fc9913XADNLgJ1ByKhqcC5Z';
const COMPRESSED_22 = 'fcmR3XADNLgJ1ByKhqcC5Z';
const NORMALIZED = 'fc991dd700334b809d41c8a86a702e59';
const DASHED = 'fc991dd7-0033-4b80-9d41-c8a86a702e59';

// ---- 桩引擎 --------------------------------------------------------------

let uuidSequence = 0;

class StubNode {
    public uuid = `node-${++uuidSequence}`;
    public parent: StubNode | null = null;
    public children: StubNode[] = [];
    public active = true;
    public _objFlags = 0;
    public _components: unknown[] = [];
    constructor(public name = 'New Node') { }
    getSiblingIndex(): number {
        return this.parent ? this.parent.children.indexOf(this) : -1;
    }
}
class StubScene extends StubNode { }
class StubComponent {
    public node: StubNode | null = null;
    public enabled = true;
    public uuid = `comp-${++uuidSequence}`;
}

/**
 * 一个「用户脚本组件」：`__props__` 里带 `__scriptAsset`（DEV/预览构建下该 getter 确实进 __props__，
 * 这正是 Script 行会被渲染出来的前提），attrs 给出 `ctor` 以模拟 `@type(Script)`。
 */
function makeScriptComponentClass(className: string, classId: string): any {
    const ctor = class extends StubComponent { };
    Object.defineProperty(ctor, 'name', { value: className.replace(/\W/g, '_') });
    (ctor as any).__props__ = ['__scriptAsset'];
    (ctor as any).__cid__ = classId;
    (ctor as any).__className__ = className;
    return ctor;
}

/**
 * `@type(Script)` 的 ctor：`_encodeProp` 的空引用分支据它产出 type + extends 继承链，
 * 面板 getElementType 靠链里含 'cc.Asset' 才把该行提升成资源选择器（光有 type 不够）。
 */
class StubAsset { }
class StubScriptAsset extends StubAsset { }
const ASSET_CLASS_NAMES = new Map<unknown, string>([
    [StubAsset, 'cc.Asset'],
    [StubScriptAsset, 'cc.Script'],
]);

interface IWorld {
    agent: any;
    events: Array<{ type: string; payload: any }>;
    logs: string[];
}

const liveAgents: any[] = [];

function loadAgentFactory(): (env: any) => any {
    const source = fs.readFileSync(AGENT_SOURCE_PATH, 'utf8');
    const exportsFound = source.match(/^export /gm) || [];
    // 只允许唯一导出：一旦有人加了第二个 export，下面的裸 new Function 求值就不再成立，必须显式失败。
    if (exportsFound.length !== 1) {
        throw new Error(`preview-inspect.js is expected to have exactly 1 top-level export, found ${exportsFound.length}`);
    }
    const body = `${source.replace(/^export function /m, 'function ')}\nreturn { createPreviewInspect };`;
    const evaluate = new Function('fetch', body) as (f: unknown) => { createPreviewInspect: (env: any) => any };
    return evaluate(async () => ({ ok: false, status: 404, json: async () => ({}) })).createPreviewInspect;
}

/**
 * @param editorExtends 传入以模拟预览页已加载 editor-extends.bundle.js；不传则强制走本地移植版。
 */
function createWorld(editorExtends?: unknown): IWorld {
    const scene = new StubScene('Scene');
    const events: Array<{ type: string; payload: any }> = [];

    const cc: any = {
        Node: StubNode,
        Scene: StubScene,
        Component: StubComponent,
        Asset: StubAsset,
        Object: { Flags: { HideInHierarchy: 1 << 9, LockedInEditor: 1 << 8 } },
        director: { getScene: () => scene },
        isValid: (obj: any) => Boolean(obj) && !obj._destroyed,
        js: {
            getClassName: (ctor: any) => ASSET_CLASS_NAMES.get(ctor) || (ctor && ctor.__className__) || (ctor && ctor.name) || '',
            getClassId: (ctor: any) => (ctor && ctor.__cid__) || '',
        },
        // 组件属性 attrs：`__scriptAsset` 是 `@type(Script)` 的空引用，ctor 保证它被编码成资源行。
        Class: {
            attr: (_owner: unknown, key: string) => (key === '__scriptAsset' ? { ctor: StubScriptAsset } : {}),
        },
    };

    const agent = loadAgentFactory()({ cc, EditorExtends: editorExtends, serverURL: 'http://localhost:7456' });
    liveAgents.push(agent);
    agent.start((type: string, payload: unknown) => events.push({ type, payload }));

    return {
        agent,
        events,
        get logs(): string[] {
            return events
                .filter(event => event.type === 'view:log')
                .map(event => String(event.payload && event.payload.message));
        },
    };
}

afterEach(() => {
    // start() 挂了 150ms 轮询定时器；不 stop 会把句柄留到进程退出。
    while (liveAgents.length > 0) {
        try {
            liveAgents.pop().stop();
        } catch {
            /* 已 stop 过，忽略 */
        }
    }
});

// ---- uuid 归一 -----------------------------------------------------------

describe('preview-inspect uuid 归一（Script 一栏不再 Missing）', () => {
    it('本地移植版解压两种压缩形态到同一 32 位无短横 uuid（引擎黄金向量）', () => {
        const world = createWorld(/* 无 EditorExtends：强制走本地实现 */);

        expect(world.agent._decompressUuid(COMPRESSED_23)).toBe(NORMALIZED);
        expect(world.agent._decompressUuid(COMPRESSED_22)).toBe(NORMALIZED);
    });

    it('EditorExtends 在场时以它为准；抛异常则静默回落到本地实现', () => {
        const authoritative = createWorld({ UuidUtils: { decompressUUID: () => 'deadbeef00000000000000000000cafe' } });
        expect(authoritative.agent._decompressUuid(COMPRESSED_23)).toBe('deadbeef00000000000000000000cafe');

        // 权威实现抛错/返回空不能让整栏失效——预览的 EditorExtends 版本不受本仓库控制。
        const broken = createWorld({ UuidUtils: { decompressUUID: () => { throw new Error('boom'); } } });
        expect(broken.agent._decompressUuid(COMPRESSED_23)).toBe(NORMALIZED);
        const empty = createWorld({ UuidUtils: { decompressUUID: () => '' } });
        expect(empty.agent._decompressUuid(COMPRESSED_23)).toBe(NORMALIZED);
    });

    it('EditorExtends.decompressUUID 返回带短横 36 位（真实 editor-extends.bundle.js 形态）也能归一', () => {
        // 真实 editor-extends.bundle.js 的 decompressUUID 末尾 join('-'),产出 **36 位带短横**形式,
        // 而非 32 位无短横(见 cocos-cli/static/web/editor-extends.bundle.js 的 decompressNormalUuid)。
        // 预览页必然加载该 bundle,故这条路径是生产真实命中的路径。旧 _normalizeAssetUuid 解压后
        // 只判 32 位无短横,带短横形态漏判成 '' → _scriptUuid 返回空 → Script 行被隐藏
        // (正是「Preview in Editor 后挂自定义脚本的节点 Script 一栏消失」的回归点)。这里用与真实
        // bundle 完全一致的返回值钉死回归:解压后必须复判 dashed。
        const world = createWorld({ UuidUtils: { decompressUUID: () => DASHED } });

        // _decompressUuid 透传权威返回的带短横串。
        expect(world.agent._decompressUuid(COMPRESSED_23)).toBe(DASHED);
        // _normalizeAssetUuid 必须在解压后复判 dashed,否则这里就会得到 ''(回归前的行为)。
        expect(world.agent._normalizeAssetUuid(COMPRESSED_23)).toBe(DASHED);
        expect(world.agent._normalizeAssetUuid(COMPRESSED_22)).toBe(DASHED);
    });

    it('三种输入形态都归一成带短横 36 位（asset-db 形式）', () => {
        const { agent } = createWorld();

        expect(agent._normalizeAssetUuid(COMPRESSED_23)).toBe(DASHED);
        expect(agent._normalizeAssetUuid(COMPRESSED_22)).toBe(DASHED);
        expect(agent._normalizeAssetUuid(NORMALIZED)).toBe(DASHED);
        // 已是带短横的原样返回（编辑器注入的 __scriptUuid 通常就是这个形态）。
        expect(agent._normalizeAssetUuid(DASHED)).toBe(DASHED);
    });

    it('子资源后缀原样保留在归一结果尾部', () => {
        const { agent } = createWorld();

        expect(agent._normalizeAssetUuid(`${COMPRESSED_23}@6c48a`)).toBe(`${DASHED}@6c48a`);
    });

    it('不是 uuid 形状的输入一律返回空串（调用方据此隐藏 Script 行）', () => {
        const { agent } = createWorld();

        // `ccclass('Test1')` 这种手写类名：长度像压缩 uuid 也不能瞎解压。
        expect(agent._normalizeAssetUuid('Test1')).toBe('');
        expect(agent._normalizeAssetUuid('cc.Sprite')).toBe('');
        expect(agent._normalizeAssetUuid('')).toBe('');
        expect(agent._normalizeAssetUuid(undefined)).toBe('');
        expect(agent._normalizeAssetUuid(123)).toBe('');
        // 32 位但含非 hex 字符。
        expect(agent._normalizeAssetUuid('zz991dd700334b809d41c8a86a702e59')).toBe('');
    });
});

// ---- _scriptUuid 取值来源 ------------------------------------------------

describe('preview-inspect _scriptUuid 取值来源', () => {
    it('优先用编辑器注入的 __scriptUuid，且同样过一遍归一', () => {
        const { agent } = createWorld();
        const Ctor = makeScriptComponentClass('Test1', 'some-non-uuid-cid');
        const comp = new Ctor();
        comp.__scriptUuid = COMPRESSED_23;

        expect(agent._scriptUuid(comp)).toBe(DASHED);
    });

    it('没有 __scriptUuid 时从 classId 反查（用户脚本的 classId 即压缩后的脚本 uuid）', () => {
        const { agent } = createWorld();
        const comp = new (makeScriptComponentClass('Test1', COMPRESSED_23))();

        expect(agent._scriptUuid(comp)).toBe(DASHED);
    });

    it('内置组件（cc.*）直接返回空串，不去碰 classId', () => {
        const { agent } = createWorld();
        // 内置组件的 classId 也可能是短字符串（如 'cc.Sprite' 的注册 id），但类名前缀已足以判定。
        const comp = new (makeScriptComponentClass('cc.Sprite', COMPRESSED_23))();

        expect(agent._scriptUuid(comp)).toBe('');
    });

    it('空组件 / 取不到 classId 时返回空串而不抛', () => {
        const { agent } = createWorld();

        expect(agent._scriptUuid(null)).toBe('');
        expect(agent._scriptUuid(undefined)).toBe('');
        const noCid = new (makeScriptComponentClass('Test1', ''))();
        expect(agent._scriptUuid(noCid)).toBe('');
    });
});

// ---- 端到端：_dumpComponent 的 __scriptAsset 行 ---------------------------

describe('preview-inspect __scriptAsset dump（对齐编辑态 encode.ts）', () => {
    it('认出脚本 uuid：Script 行可见、带短横 uuid、type=cc.Script、displayOrder=-999', () => {
        const { agent } = createWorld();
        const comp = new (makeScriptComponentClass('Test1', COMPRESSED_23))();

        const dump = agent._dumpComponent(comp, 'Node/Test1');
        const sa = dump.value.__scriptAsset;

        expect(dump.type).toBe('Test1');
        expect(sa.visible).toBe(true);
        // 面板拿这个 uuid 去 asset-db 的 items 里做严格相等匹配，形态错一位就是红字 Missing。
        expect(sa.value).toEqual({ uuid: DASHED });
        expect(sa.type).toBe('cc.Script');
        expect(sa.extends).toEqual(['cc.Script', 'cc.Asset']);
        // -999 让 Script 行排在组件所有字段最前面（与编辑态一致）。
        expect(sa.displayOrder).toBe(-999);
    });

    it('EditorExtends 返回带短横 uuid 时 Script 行仍可见（生产回归点：Preview in Editor 后 Script 一栏消失）', () => {
        // 预览页加载的 editor-extends.bundle.js 的 decompressUUID 返回 36 位带短横（见上组同名测试说明）。
        // 走真实 bundle 形态的端到端 _dumpComponent,确保 Script 行可见且 uuid 是带短横。
        const world = createWorld({ UuidUtils: { decompressUUID: () => DASHED } });
        const comp = new (makeScriptComponentClass('MyPlayer', COMPRESSED_23))();

        const sa = world.agent._dumpComponent(comp, 'Node/MyPlayer').value.__scriptAsset;

        // 回归前:_normalizeAssetUuid 解压后漏判 dashed → '' → 走 else 分支 sa.visible=false。
        expect(sa.visible).toBe(true);
        expect(sa.value).toEqual({ uuid: DASHED });
        expect(world.logs.filter(m => m.includes('cannot resolve script asset uuid'))).toHaveLength(0);
    });

    it('内置组件：Script 行隐藏且不告警（本就无脚本，不是异常）', () => {
        const world = createWorld();
        const comp = new (makeScriptComponentClass('cc.Sprite', 'cc.Sprite'))();

        const dump = world.agent._dumpComponent(comp, 'Node/cc.Sprite');

        expect(dump.value.__scriptAsset.visible).toBe(false);
        expect(dump.value.__scriptAsset.value).toEqual({ uuid: '' });
        expect(world.logs).toEqual([]);
    });

    it('用户脚本但 uuid 认不出来：隐藏 Script 行 + 按类名去重告警恰好一次', () => {
        const world = createWorld();
        const Ctor = makeScriptComponentClass('Test1', 'Test1');

        const first = world.agent._dumpComponent(new Ctor(), 'Node/Test1');
        expect(first.value.__scriptAsset.visible).toBe(false);

        // 同类的第二个实例（以及后续每次轮询 dump）不能再刷日志。
        world.agent._dumpComponent(new Ctor(), 'Other/Test1');
        world.agent._dumpComponent(new Ctor(), 'Third/Test1');

        const warnings = world.logs.filter(message => message.includes('cannot resolve script asset uuid'));
        expect(warnings).toHaveLength(1);
        expect(warnings[0]).toContain("'Test1'");

        // 换一个类名要再告警一次（否则第二个坏脚本会被第一个的去重吞掉）。
        world.agent._dumpComponent(new (makeScriptComponentClass('Test2', 'Test2'))(), 'Node/Test2');
        expect(world.logs.filter(m => m.includes('cannot resolve script asset uuid'))).toHaveLength(2);
    });
});
