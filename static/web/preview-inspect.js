/* global window, globalThis, requestAnimationFrame, cancelAnimationFrame, performance, fetch */

/**
 * 预览运行时 Inspect Agent(M1:只读 Hierarchy + selection + 结构 liveness;M5:组件增删/reset/排序/整包粘贴;M6:资产拖拽创建节点)。
 *
 * 装配契约:本文件是运行时库,game.ejs / game-boot.js 都**不**会自动装配它——
 * 生产装配方是 IDE 侧预览 webview(PinK 仓库 PreviewInEditor 分支 previewMain.pink.ts):
 * 先复用 game-boot.js 跑起启动场景,再动态 import 本文件调 createPreviewInspect,
 * 把 agent 经 PreviewSceneApi 挂到宿主 SceneViewBridge(scene:invoke 等)后才 fire view:ready。
 * 普通浏览器预览没有 Hierarchy/Inspector 宿主 UI 消费这些能力,故刻意不装配;
 * IDE 预览时页面内只有这一个实例,也避免了双重装配(两个 agent 同时轮询/抢占 undo)。
 *
 * 装配后直接读活 `cc.director` 的场景图,
 * 产出与编辑器 `node.query-tree` 契约一致的 INodeTreeItem,并以轻量结构快照 diff
 * 广播 node:added/node:removed/node:change,以及 selection 回显事件。
 *
 * 关键约束(对齐 node-path-manager,见 plan「关键约束 4」):
 *  - 主键是 canonical node path(不是 uuid);根 scene 的 path = '/',顶层子节点无前导斜杠;
 *  - 同名兄弟按出现顺序去重:首个不加后缀,其后 `_001`/`_002`(3 位零填充);
 *  - 组件 target 路径 = `节点路径/类名`(M1 不派发 component,故此处只做节点树)。
 *
 * 本文件是手写 ESM(风格对齐 game-boot.js),不依赖 scene-bundle / EditorExtends.serialize
 * ——那些是 M2 dump 的事。M1 完全靠遍历活场景图产出结构。
 */

/** node-path-manager 的非法字符替换规则:`/\:*?"<>|` → `_`。 */
const ILLEGAL_NAME_CHARS = /[/\\:*?"<>|]/g;

/** 结构快照扫描间隔(ms),对齐 plan「变更监听策略」的 ~100–150ms 上限。 */
const STRUCTURE_SCAN_INTERVAL_MS = 150;

/** 预览内 undo 栈上限,防长时间预览下命令无限堆积。 */
const PREVIEW_UNDO_STACK_LIMIT = 100;

/**
 * 类型化创建所需的「类型 → 内置 Prefab」映射的只读路由。
 * 由 CLI 直接输出编辑态的 NODE_CONFIGS(见 game-preview.middleware.ts),避免在此重抄一份而漂移。
 */
const NODE_TYPE_CONFIG_ROUTE = '/scene/node-type-config';

/**
 * 脚本 uuid 形状识别(逐字对齐 editor-extends 的 utils/uuid:Reg_Uuid / Reg_NormalizedUuid /
 * Reg_CompressedUuid / Reg_CompressedSubAssetUuid)。
 *
 * 面板的资源选择器按 **asset-db 里的带短横 uuid** 在候选列表里查名字(`items.find(i => i.uuid === uuid)`),
 * 查不到就渲染红色 "Missing"。而运行时能直接拿到的只有 classId —— 用户脚本组件的 classId 是
 * **压缩后的 uuid**(23 或 22 字符 base64,如 `fc9913XADNLgJ1ByKhqcC5Z`),解压后还是 32 位无短横形式。
 * 因此必须「解压 + 补短横」两步归一,否则 Script 一栏必然显示 Missing。
 */
const REG_UUID_DASHED = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const REG_UUID_NORMALIZED = /^[0-9a-fA-F]{32}$/;
const REG_UUID_COMPRESSED = /^[0-9a-zA-Z+/]{22,23}$/;
/** 压缩 uuid + 子资源后缀(`@xxxxx`),子资源段原样保留。 */
const REG_UUID_COMPRESSED_SUB = /^([0-9a-zA-Z+/]{22,23})((@[0-9a-fA-F]{5,})+)$/;

/** base64 字符 → 6bit 值(compressUUID 用的字母表,与标准 base64 同序)。 */
const UUID_BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const UUID_ASCII_TO_64 = (() => {
	const table = new Array(128).fill(0);
	for (let i = 0; i < 64; i++) {
		table[UUID_BASE64_CHARS.charCodeAt(i)] = i;
	}
	return table;
})();

/** 内置 Canvas Prefab(与编辑态 checkCanvasRequired 的硬编码 uuid 一致)。 */
const CANVAS_PREFAB_UUID_2D = '4c33600e-9ca9-483b-b734-946008261697';
const CANVAS_PREFAB_UUID_3D = 'f773db21-62b8-4540-956a-29bacf5ddbf5';

/** prefab 状态兜底:预览态未加载 prefab 工具,统一按「非 prefab」上报(M2 再补真值)。 */
const DEFAULT_PREFAB_INFO = Object.freeze({	state: 0, // PrefabState.NotAPrefab
	isUnwrappable: false,
	isRevertable: false,
	isApplicable: false,
	isAddedChild: false,
	isNested: false,
	assetUuid: '',
});

/**
 * cc.Class.attr 中可透传到 IProperty 的属性描述字段(对齐 encode.ts 的 attributeProps)。
 * 决定面板控件形态:枚举下拉、单选、位掩码、显示名、分组、多行、步长、滑块、提示、
 * 可动画、单位、弧度、显示顺序。
 */
const PREVIEW_ATTRIBUTE_PROPS = [
	'enumList',
	'radioGroup',
	'bitmaskList',
	'displayName',
	'group',
	'multiline',
	'step',
	'slide',
	'tooltip',
	'animatable',
	'unit',
	'radian',
	'displayOrder',
];

/**
 * @param {{ cc: any, EditorExtends?: any, serverURL?: string }} env
 * @returns {PreviewInspect}
 */
export function createPreviewInspect(env) {
	const cc = env && env.cc;
	if (!cc) {
		throw new Error('preview-inspect: cc namespace is required');
	}
	return new PreviewInspect(cc, env.EditorExtends, env.serverURL);
}

/** 去掉前导斜杠:'/' → '',  '/Canvas' → 'Canvas',  'Canvas/Foo' → 'Canvas/Foo'。 */
function stripLeadingSlashes(path) {
	if (typeof path !== 'string') {
		return '';
	}
	let i = 0;
	while (i < path.length && path[i] === '/') {
		i++;
	}
	return path.slice(i);
}

function sanitizeName(name) {
	const base = typeof name === 'string' && name.length > 0 ? name : 'New Node';
	return base.replace(ILLEGAL_NAME_CHARS, '_');
}

function pad3(n) {
	return String(n).padStart(3, '0');
}

function toPathArray(param) {
	if (!param) {
		return [];
	}
	const value = typeof param === 'object' && 'path' in param ? param.path : param;
	if (Array.isArray(value)) {
		return value.filter(p => typeof p === 'string');
	}
	return typeof value === 'string' ? [value] : [];
}

class PreviewInspect {
	constructor(cc, editorExtends, serverURL) {
		/** @type {any} */
		this._cc = cc;
		this._editorExtends = editorExtends;
		this._serverURL = serverURL;

		/** path(mgr,无前导斜杠;scene 存 '') → cc.Node */
		this._pathToNode = new Map();
		/** uuid → path(mgr) */
		this._uuidToPath = new Map();
		/** uuid → cc.Node */
		this._uuidToNode = new Map();

		/** 已告警过「脚本 uuid 认不出来」的类名,避免每次 dump 都刷日志 */
		this._scriptUuidWarned = new Set();

		/** 选中集合(mgr path;scene 用 '') */
		this._selection = new Set();
		/** mgr path → transform 签名字符串,用于选中节点属性 liveness diff */
		this._selectionPropSig = new Map();

		/** @type {((type: string, payload?: unknown) => void) | null} */
		this._sink = null;
		/** uuid → { parentUuid, siblingIndex, name, active, path } */
		this._snapshot = new Map();
		this._scanTimer = 0;
		this._disposed = false;

		// CCObject 标志位(HideInHierarchy / LockedInEditor)。不同引擎版本挂载位置略有差异,做兜底。
		const flags = (cc.CCObject && cc.CCObject.Flags) || (cc.Object && cc.Object.Flags) || {};
		this._flagHideInHierarchy = flags.HideInHierarchy || 0;
		this._flagLockedInEditor = flags.LockedInEditor || 0;

		// 枚举清单缓存(对齐编辑器 encode.ts):layer 用 cc.Layers.Enum,mobility 用 cc.MobilityMode。
		// 运行时若取不到(空数组)则回退成普通 Number 字段(见 _dumpNode),避免出现空下拉。
		this._layersEnumList = this._buildLayersEnumList();
		this._mobilityEnumList = this._buildMobilityEnumList();

		// ---- M4 结构编辑状态(全部随 stop() 一起丢弃,绝不回写编辑场景)----

		/** 预览独立剪贴板。entries:copy 存 `{uuid, instant}` 离线副本,cut 只存 `{uuid}`。 */
		this._clipboard = { type: 'none', entries: [] };
		/** @type {Array<{ label: string, undo: () => void, redo: () => void }>} */
		this._undoStack = [];
		/** @type {Array<{ label: string, undo: () => void, redo: () => void }>} */
		this._redoStack = [];
		/** @type {{ id: string, label: string, depth: number, commands: any[] } | null} */
		this._undoGroup = null;
		this._groupSequence = 0;
		/** 被删除/被撤销掉的游离节点(未 destroy,等待 undo 复活);stop()/clearHistory() 时销毁。 */
		this._detachedNodes = new Set();
		/** M5:被摘除的组件实例(未 destroy,等待 undo 复活);stop()/clearHistory() 时销毁。 */
		this._detachedComponents = new Set();
		/** `/scene/node-type-config` 的响应缓存 */
		this._nodeTypeConfig = null;
		this._nodeTypeConfigPromise = null;
		/** uuid → 已加载的内置 Prefab 资源 */
		this._prefabCache = new Map();
	}

	// ---- 生命周期 ----------------------------------------------------------

	/** @param {(type: string, payload?: unknown) => void} sink */
	start(sink) {
		this._sink = typeof sink === 'function' ? sink : null;
		this._snapshot = this._takeSnapshot();
		this._scheduleScan();
	}

	stop() {
		this._disposed = true;
		this._sink = null;
		if (this._scanTimer) {
			clearTimeout(this._scanTimer);
			this._scanTimer = 0;
		}
		this._pathToNode.clear();
		this._uuidToPath.clear();
		this._uuidToNode.clear();
		this._selection.clear();
		this._snapshot.clear();
		// 「停止即丢弃」:undo 历史、剪贴板离线副本、被历史持有的游离节点全部销毁,
		// 既保证预览改动不残留、也避免这些脱离场景图的节点泄漏。
		this._undoStack.length = 0;
		this._redoStack.length = 0;
		this._undoGroup = null;
		this._destroyDetachedNodes();
		this._destroyDetachedComponents();
		this._clearClipboard();
		this._prefabCache.clear();
		this._nodeTypeConfig = null;
		this._nodeTypeConfigPromise = null;
	}

	// ---- 查询 --------------------------------------------------------------

	/**
	 * 产出与编辑器 node.query-tree 契约一致的 INodeTreeItem。
	 * @param {{ path?: string } | undefined} params
	 * @returns {object | null}
	 */
	queryNodeTree(params) {
		const scene = this._getScene();
		if (!scene) {
			return null;
		}
		const requested = params && typeof params.path === 'string' ? stripLeadingSlashes(params.path) : '';
		if (requested === '') {
			return this._buildTreeItem(scene, '');
		}
		this._rebuildIndex();
		const node = this._pathToNode.get(requested);
		if (!node || !this._isValid(node)) {
			return null;
		}
		return this._buildTreeItem(node, requested);
	}

	/**
	 * 完整属性 dump(M2:Inspector 读属性)。产出与编辑器 node.query 契约一致的 INode/IScene/IComponent
	 * ——每属性包成 IProperty `{ value, type, ... }`。支持 path 为数组批量、kind=auto(先节点后组件)。
	 * @param {{ path?: string | string[], kind?: string, includeComponents?: boolean } | undefined} params
	 */
	query(params) {
		this._rebuildIndex();
		const path = params && params.path;
		const kind = (params && params.kind) || 'auto';
		const includeComponents = !(params && params.includeComponents === false);
		if (Array.isArray(path)) {
			return path.map(p => this._queryOne(p, kind, includeComponents));
		}
		return this._queryOne(path, kind, includeComponents);
	}

	_queryOne(rawPath, kind, includeComponents) {
		const norm = stripLeadingSlashes(typeof rawPath === 'string' ? rawPath : '');
		if (kind !== 'component') {
			const node = norm === '' ? this._getScene() : this._pathToNode.get(norm);
			if (node && this._isValid(node)) {
				return this._isScene(node) ? this._dumpScene(node) : this._dumpNode(node, norm, includeComponents);
			}
		}
		if (kind === 'auto' || kind === 'component') {
			const comp = this._resolveComponentByPath(norm);
			if (comp) {
				return this._dumpComponent(comp, norm);
			}
		}
		return null;
	}

	/** 组件路径形态 = `节点路径/类名`(含 _NNN 去重)。best-effort:按最后一段类名在父节点上匹配。 */
	_resolveComponentByPath(norm) {
		const slash = norm.lastIndexOf('/');
		const nodePath = slash < 0 ? '' : norm.slice(0, slash);
		const compSeg = slash < 0 ? norm : norm.slice(slash + 1);
		const node = nodePath === '' ? this._getScene() : this._pathToNode.get(nodePath);
		if (!node || !this._isValid(node)) {
			return null;
		}
		// 去掉可能的 _NNN 后缀还原类名。
		const className = compSeg.replace(/_\d{3}$/, '');
		const comps = (node.components) || node._components || [];
		const names = this._componentTargetNames(comps);
		let named = 0;
		for (const comp of comps) {
			if (!comp) {
				continue;
			}
			const name = names[named++];
			const base = this._className(comp.constructor) || 'cc.Component';
			if (name === compSeg || base === className) {
				return comp;
			}
		}
		return null;
	}

	// ---- 写属性(M3:Inspector 改属性 → 写回活 cc 对象)------------------------

	/**
	 * 写单值属性。params = `{ nodePath, path, dump: { type?, value, isArray? } }`;
	 * value 为**裸值**(host 侧已 stripGhostFields):标量/enum 直接给数字/布尔/字符串,
	 * ValueType 给平铺对象(Vec3→`{x,y,z}`、Color→`{r,g,b,a}` 0–255)。
	 *  - `path` 以 `__comps__.{i}.` 前缀 → 定位组件实例 + 组件内子路径;否则为节点属性子路径;
	 *  - 节点 transform(position/scale/rotation)走 cc.Node 的 setter(rotation dump 为欧拉角);
	 *  - ValueType 一律**新建实例**赋回(避免 getter 返回临时对象导致写入丢失);
	 *  - 成功后主动回推一次带完整 dump 的 node:change(source:'engine'),让 Inspector/多选面板
	 *    立即反映写入后的规范值,并同步 transform 签名以免扫描循环把本次写入当作 engine 变更重发。
	 * 定位失败抛 Error(与编辑态 setProperty 返回 false→抛错的语义一致)。
	 * @param {{ nodePath?: string, path?: string, dump?: { type?: string, value?: unknown } }} params
	 */
	setProperty(params) {
		this._rebuildIndex();
		const nodePath = stripLeadingSlashes((params && params.nodePath) || '');
		const rawPath = (params && params.path) || '';
		const dump = (params && params.dump) || {};
		const node = nodePath === '' ? this._getScene() : this._pathToNode.get(nodePath);
		if (!node || !this._isValid(node)) {
			throw new Error(`preview set-property: node not found at '${(params && params.nodePath) || ''}'`);
		}
		// M5:整包组件 dump 写回(Inspector Paste Component Values / Paste Component 第二步)。
		// path 形态 `__comps__.{i}`(无子键)且 dump.value 为对象 → 逐键 best-effort 写入,
		// 跳过不可见属性与序列化骨架键;快照旧值合成单步 undo。
		const compWholeMatch = /^__comps__\.(\d+)$/.exec(rawPath);
		if (compWholeMatch && dump && typeof dump.value === 'object' && dump.value !== null) {
			const wholeComps = (node.components) || node._components || [];
			const wholeComp = wholeComps[Number(compWholeMatch[1])];
			if (!wholeComp || !this._isValid(wholeComp)) {
				throw new Error(`preview set-property: component[${compWholeMatch[1]}] not found on '${nodePath}'`);
			}
			this._asOneCommand('Paste Component Values', () => {
				const snapshot = [];
				for (const key of Object.keys(dump.value)) {
					const propDump = dump.value[key];
					if (!propDump || propDump.visible === false) {
						continue;
					}
					if (key === 'uuid' || key === 'name' || key === '__scriptAsset') {
						continue;
					}
					snapshot.push([key, this._clonePropValue(wholeComp[key])]);
					try {
						this._applyValue(wholeComp, key, propDump);
					} catch {
						// 单个属性写回失败(getter-only 等)不应拖垮其余键。
					}
				}
				this._pushCommand({
					label: 'Paste Component Values',
					undo: () => {
						if (!this._isValid(wholeComp)) { return; }
						for (const [key, old] of snapshot) {
							try { wholeComp[key] = old; } catch { /* 忽略 */ }
						}
					},
					redo: () => {
						if (!this._isValid(wholeComp)) { return; }
						for (const key of Object.keys(dump.value)) {
							const propDump = dump.value[key];
							if (!propDump || propDump.visible === false || key === 'uuid' || key === 'name' || key === '__scriptAsset') {
								continue;
							}
							try { this._applyValue(wholeComp, key, propDump); } catch { /* 忽略 */ }
						}
					},
				});
			});
			this._afterWrite(node, nodePath, rawPath);
			return true;
		}
		const compMatch = /^__comps__\.(\d+)\.(.+)$/.exec(rawPath);
		if (compMatch) {
			const comps = (node.components) || node._components || [];
			const comp = comps[Number(compMatch[1])];
			if (!comp || !this._isValid(comp)) {
				throw new Error(`preview set-property: component[${compMatch[1]}] not found on '${nodePath}'`);
			}
			if (!this._applyValueByPath(comp, compMatch[2], dump)) {
				throw new Error(`preview set-property: failed to apply '${rawPath}' on '${nodePath}'`);
			}
		} else {
			// 改名(Hierarchy 的 Rename 就走这条路径)需要额外记 undo 并重建索引:名字是路径的组成部分,
			// 不重建索引的话后续所有按 path 的定位都会指向旧名。
			const isRename = rawPath === 'name' && !this._isScene(node);
			const oldName = isRename ? node.name : undefined;
			if (!this._applyValueByPath(node, rawPath, dump)) {
				throw new Error(`preview set-property: failed to apply '${rawPath}' on '${nodePath}'`);
			}
			if (isRename && node.name !== oldName) {
				const newName = node.name;
				this._pushCommand({
					label: 'Rename Node',
					undo: () => { if (this._isValid(node)) { node.name = oldName; } },
					redo: () => { if (this._isValid(node)) { node.name = newName; } },
				});
				this._afterWrite(node, nodePath, rawPath);
				this._rebuildIndex();
				this._flushStructure();
				return true;
			}
		}
		this._afterWrite(node, nodePath, rawPath);
		return true;
	}

	/** 按 `.` 分段下钻到父容器 + 末段 key,再 _applyValue 写值。 */
	_applyValueByPath(root, path, dump) {
		const segs = String(path).split('.').filter(s => s.length > 0);
		if (segs.length === 0) {
			return false;
		}
		let holder = root;
		for (let i = 0; i < segs.length - 1; i++) {
			if (holder == null) {
				return false;
			}
			holder = holder[segs[i]];
		}
		if (holder == null) {
			return false;
		}
		return this._applyValue(holder, segs[segs.length - 1], dump);
	}

	/** 把裸值写回 holder[key]:节点 transform 走 setter,ValueType 新建实例,其余标量/enum 直接赋。 */
	_applyValue(holder, key, dump) {
		const type = dump && dump.type;
		const value = dump ? dump.value : undefined;
		// 节点内建 transform:position/scale 走 setter;rotation dump 为欧拉角(cc.Vec3)。
		if (this._cc.Node && holder instanceof this._cc.Node) {
			if (key === 'position') {
				holder.position = this._toVec3(value);
				return true;
			}
			if (key === 'scale') {
				holder.scale = this._toVec3(value);
				return true;
			}
			if (key === 'rotation') {
				holder.eulerAngles = this._toVec3(value);
				return true;
			}
		}
		holder[key] = this._coerceValue(holder[key], value, type);
		return true;
	}

	/** 标量/enum(number/boolean/string/null)原样返回;ValueType 平铺对象按 type/现值构造器新建实例。 */
	_coerceValue(current, value, type) {
		if (value === null || value === undefined || typeof value !== 'object') {
			return value;
		}
		const ctor = this._valueTypeCtor(type) || (current && current.constructor) || null;
		if (ctor) {
			let inst;
			try {
				inst = new ctor();
			} catch {
				inst = null;
			}
			if (inst) {
				for (const k of Object.keys(value)) {
					if (typeof value[k] === 'number') {
						inst[k] = value[k];
					}
				}
				return inst;
			}
		}
		return value;
	}

	/**
	 * 深拷一个属性值,供 undo 快照 / reset 默认值搬运:类实例(ValueType 等)新建实例拷自身可枚举标量,
	 * 纯对象/数组 JSON clone,标量原样。JSON clone 失败(循环引用)时退回原值(best-effort)。
	 */
	_clonePropValue(value) {
		if (value === null || typeof value !== 'object') {
			return value;
		}
		const ctor = value.constructor;
		if (ctor && ctor !== Object && ctor !== Array) {
			let inst = null;
			try {
				inst = new ctor();
			} catch {
				inst = null;
			}
			if (inst) {
				for (const k of Object.keys(value)) {
					const v = value[k];
					if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') {
						inst[k] = v;
					}
				}
				return inst;
			}
		}
		try {
			return JSON.parse(JSON.stringify(value));
		} catch {
			return value;
		}
	}

	/** dump.type(如 'cc.Vec3'/'cc.Color')→ 引擎 ValueType 构造器。 */
	_valueTypeCtor(type) {
		if (!type) {
			return null;
		}
		const map = {
			'cc.Vec2': this._cc.Vec2,
			'cc.Vec3': this._cc.Vec3,
			'cc.Vec4': this._cc.Vec4,
			'cc.Quat': this._cc.Quat,
			'cc.Color': this._cc.Color,
			'cc.Size': this._cc.Size,
			'cc.Rect': this._cc.Rect,
		};
		return map[type] || null;
	}

	/** `{x,y,z}` 裸值 → cc.Vec3(缺失分量按 0)。 */
	_toVec3(value) {
		const v = value || {};
		const x = typeof v.x === 'number' ? v.x : 0;
		const y = typeof v.y === 'number' ? v.y : 0;
		const z = typeof v.z === 'number' ? v.z : 0;
		const V = this._cc.Vec3;
		return V ? new V(x, y, z) : { x, y, z };
	}

	/** 写入后回推:同步 selection transform 签名(防扫描循环重发)+ fire 带完整 dump 的 node:change。 */
	_afterWrite(node, nodePath, rawPath) {
		if (!this._sink || this._isScene(node)) {
			return;
		}
		if (this._selection.has(nodePath)) {
			this._selectionPropSig.set(nodePath, this._transformSignature(node));
		}
		this._emit('node:change', {
			node: this._dumpNode(node, nodePath, true),
			change: { propPath: rawPath, source: 'engine' },
		});
	}

	// ---- 结构编辑(M3:Add Component 实时加组件)---------------------------

	/**
	 * 枚举运行时已注册的 cc.Component 子类,供 Add Component 面板列表使用。
	 * 返回 `Array<{ name, cid, path }>`,与编辑态 `component.query-all` 契约对齐。
	 * 已知限制:菜单分组路径(如 `UI/Sprite`)是编辑器元数据,运行时构建取不到,
	 * 故 path 退化为类名(扁平列表)——不影响「选中并添加」,仅影响分组层级显示。
	 */
	queryComponents() {
		const cc = this._cc;
		const js = cc && cc.js;
		const Component = cc && cc.Component;
		if (!js || !Component) {
			return [];
		}
		const seen = new Set();
		const out = [];
		const consider = ctor => {
			if (typeof ctor !== 'function' || ctor === Component || seen.has(ctor)) {
				return;
			}
			seen.add(ctor);
			let isComp = false;
			try {
				isComp = typeof js.isChildClassOf === 'function'
					? js.isChildClassOf(ctor, Component)
					: ctor.prototype instanceof Component;
			} catch {
				isComp = false;
			}
			if (!isComp) {
				return;
			}
			const name = this._className(ctor);
			if (!name) {
				return;
			}
			let cid = '';
			try {
				cid = (typeof js.getClassId === 'function' && js.getClassId(ctor)) || '';
			} catch {
				cid = '';
			}
			out.push({ name, cid: cid || name, path: name });
		};
		// 运行时类注册表:cid 表 + 名字表(不同引擎版本挂载点略有差异,两张表都扫一遍并去重)。
		const collect = table => {
			if (!table || typeof table !== 'object') {
				return;
			}
			for (const key in table) {
				consider(table[key]);
			}
		};
		collect(js._registeredClassIds);
		collect(js._registeredClassNames);
		out.sort((a, b) => a.name.localeCompare(b.name));
		return out;
	}

	/**
	 * 实时向活场景节点添加组件(临时、不回写磁盘,符合预览「停止即丢弃」约定)。
	 * params = `{ nodePath, component }`;`component` 为类名或 cid,解析成运行时构造器后 `node.addComponent`。
	 * 成功后回推一次带完整 dump 的 node:change(source:'engine'),使 Inspector 重取该节点、刷新组件列表。
	 * 定位/解析/添加失败均抛 Error(与编辑态 add 返回 null→抛错的语义一致)。
	 * @param {{ nodePath?: string, component?: string } | undefined} params
	 */
	addComponent(params) {
		this._rebuildIndex();
		const rawNodePath = (params && params.nodePath) || '';
		const nodePath = stripLeadingSlashes(rawNodePath);
		const component = params && params.component;
		const node = nodePath === '' ? this._getScene() : this._pathToNode.get(nodePath);
		if (!node || !this._isValid(node)) {
			throw new Error(`preview add-component: node not found at '${rawNodePath}'`);
		}
		if (this._isScene(node)) {
			throw new Error('preview add-component: cannot add component to scene root');
		}
		const ctor = this._resolveComponentClass(component);
		if (!ctor) {
			throw new Error(`preview add-component: unknown component '${component}'`);
		}
		let added;
		try {
			added = node.addComponent(ctor);
		} catch (e) {
			throw new Error(`preview add-component: addComponent('${component}') failed: ${(e && e.message) || e}`);
		}
		if (!added) {
			throw new Error(`preview add-component: addComponent('${component}') returned null`);
		}
		// 结构变更:回推带完整 dump 的 node:change,让 Inspector 重取该节点、刷新出新组件。
		this._emit('node:change', {
			node: this._dumpNode(node, nodePath, true),
			change: { propPath: '__comps__', source: 'engine' },
		});
		return this._dumpComponent(added, `${nodePath}/${this._className(added.constructor)}`);
	}

	/**
	 * M5 组件删除(component.remove):摘除但**不 destroy**(对齐节点删除哲学),undo 原位插回复活,
	 * 真正 destroy 推迟到 stop()/clearHistory()。params = `{ path }`,path 为组件 target 路径
	 * (`节点路径/类名_NNN`);成功后回推 node:change(propPath '__comps__'),Inspector 刷新组件列表。
	 * 已知取舍:直接 splice 跳过引擎 removeComponent 的 destroy 调度,best-effort 补 onDisable/onEnable。
	 * @param {{ path?: string } | undefined} params
	 */
	removeComponent(params) {
		this._rebuildIndex();
		const rawPath = (params && params.path) || '';
		const comp = this._resolveComponentByPath(stripLeadingSlashes(rawPath));
		if (!comp || !this._isValid(comp)) {
			throw new Error(`preview remove-component: component not found at '${rawPath}'`);
		}
		const node = comp.node;
		if (!node || !this._isValid(node)) {
			throw new Error(`preview remove-component: owner node not found for '${rawPath}'`);
		}
		this._assertNotScene(node, 'remove-component');
		const nodePath = this._pathOfNode(node);
		const comps = (node.components) || node._components || [];
		const index = comps.indexOf(comp);
		if (index < 0) {
			throw new Error(`preview remove-component: component not attached to '${nodePath}'`);
		}
		const detach = () => {
			const list = (node.components) || node._components || [];
			const at = list.indexOf(comp);
			if (at >= 0) {
				list.splice(at, 1);
			}
			this._detachedComponents.add(comp);
			try {
				if (typeof comp.onDisable === 'function') { comp.onDisable(); }
			} catch { /* 生命周期补偿失败无副作用 */ }
		};
		const attach = () => {
			const list = (node.components) || node._components || [];
			list.splice(Math.min(index, list.length), 0, comp);
			this._detachedComponents.delete(comp);
			try {
				if (comp.enabled && typeof comp.onEnable === 'function') { comp.onEnable(); }
			} catch { /* 生命周期补偿失败无副作用 */ }
		};
		detach();
		this._pushCommand({
			label: 'Remove Component',
			undo: () => { attach(); this._rebuildIndex(); this._emitCompsChange(node, nodePath); },
			redo: () => { detach(); this._rebuildIndex(); this._emitCompsChange(node, nodePath); },
		});
		this._rebuildIndex();
		this._emitCompsChange(node, nodePath);
		return null;
	}

	/**
	 * M5 组件 reset(component.reset):new 临时实例取默认值写回(对齐编辑态 reset 语义),
	 * 跳过 enabled/uuid/name/__scriptAsset 与 readonly 属性;整段合成单步 undo;
	 * 结束 `_afterWrite` 回推 node:change。params = `{ path }`,path 为组件 target 路径。
	 * @param {{ path?: string } | undefined} params
	 */
	resetComponent(params) {
		this._rebuildIndex();
		const rawPath = (params && params.path) || '';
		const comp = this._resolveComponentByPath(stripLeadingSlashes(rawPath));
		if (!comp || !this._isValid(comp)) {
			throw new Error(`preview reset-component: component not found at '${rawPath}'`);
		}
		const ctor = comp.constructor;
		let fresh;
		try {
			fresh = new ctor();
		} catch (e) {
			throw new Error(`preview reset-component: cannot instantiate '${this._className(ctor) || 'cc.Component'}' for defaults: ${(e && e.message) || e}`);
		}
		const node = comp.node;
		const keys = (ctor && ctor.__props__) || [];
		const snapshot = [];
		this._asOneCommand('Reset Component', () => {
			for (const key of keys) {
				if (key === 'enabled' || key === 'uuid' || key === 'name' || key === '__scriptAsset') {
					continue;
				}
				let attrs = {};
				try {
					attrs = this._cc.Class && typeof this._cc.Class.attr === 'function' ? (this._cc.Class.attr(comp, key) || {}) : {};
				} catch {
					attrs = {};
				}
				if (attrs.readonly) {
					continue;
				}
				snapshot.push([key, this._clonePropValue(comp[key])]);
				try {
					comp[key] = this._clonePropValue(fresh[key]);
				} catch {
					// 单个属性写回失败(getter-only 等)不应拖垮其余属性。
				}
			}
			this._pushCommand({
				label: 'Reset Component',
				undo: () => {
					if (!this._isValid(comp)) { return; }
					for (const [key, old] of snapshot) {
						try { comp[key] = old; } catch { /* 忽略 */ }
					}
				},
				redo: () => {
					if (!this._isValid(comp)) { return; }
					for (const [key] of snapshot) {
						try { comp[key] = this._clonePropValue(fresh[key]); } catch { /* 忽略 */ }
					}
				},
			});
		});
		if (node && this._isValid(node) && !this._isScene(node)) {
			const comps = (node.components) || node._components || [];
			const index = comps.indexOf(comp);
			this._afterWrite(node, this._pathOfNode(node), index >= 0 ? `__comps__.${index}` : '__comps__');
		}
		return undefined;
	}

	/**
	 * M5 组件排序(node.move-array-element,path 固定 '__comps__')。
	 * params = `{ nodePath, path, target, offset }`:把 target 位组件移动 offset 位(Inspector Move Up/Down)。
	 * 越界抛错(UI 侧有 enabled 规则,agent 仍防御);undo 为反向交换;组件路径去重后缀依赖顺序,
	 * 交换后重建索引并回推 node:change(propPath '__comps__')。
	 * @param {{ nodePath?: string, path?: string, target?: number, offset?: number } | undefined} params
	 */
	moveArrayElement(params) {
		this._rebuildIndex();
		const p = params || {};
		if (p.path !== '__comps__') {
			throw new Error(`preview move-array-element: only '__comps__' is supported, got '${p.path}'`);
		}
		const node = this._requireNode(p.nodePath, 'move-array-element');
		this._assertNotScene(node, 'move-array-element');
		const nodePath = stripLeadingSlashes((p.nodePath) || '');
		const comps = (node.components) || node._components || [];
		const target = Number(p.target);
		const offset = Number(p.offset);
		const to = target + offset;
		if (!Number.isInteger(target) || !Number.isInteger(offset) || target < 0 || to < 0 || target >= comps.length || to >= comps.length) {
			throw new Error(`preview move-array-element: index out of range (target=${p.target}, offset=${p.offset}, length=${comps.length})`);
		}
		if (target === to) {
			return true;
		}
		const swap = (from, dest) => {
			const list = (node.components) || node._components || [];
			const moved = list.splice(from, 1)[0];
			list.splice(dest, 0, moved);
		};
		swap(target, to);
		this._pushCommand({
			label: offset < 0 ? 'Move Up Component' : 'Move Down Component',
			undo: () => { swap(to, target); this._rebuildIndex(); this._emitCompsChange(node, nodePath); },
			redo: () => { swap(target, to); this._rebuildIndex(); this._emitCompsChange(node, nodePath); },
		});
		this._rebuildIndex();
		this._emitCompsChange(node, nodePath);
		return true;
	}

	/** 组件结构变更后统一回推 node:change(propPath '__comps__'),与 addComponent 的回显模式对齐。 */
	_emitCompsChange(node, nodePath) {
		this._emit('node:change', {
			node: this._dumpNode(node, nodePath, true),
			change: { propPath: '__comps__', source: 'engine' },
		});
	}

	/** 把组件类名或 cid 解析成运行时构造器(getClassByName 优先,回退 getClassById);已是构造器则直接返回。 */
	_resolveComponentClass(component) {
		if (!component) {
			return null;
		}
		if (typeof component === 'function') {
			return component;
		}
		if (typeof component !== 'string') {
			return null;
		}
		const js = this._cc.js;
		let ctor = null;
		if (js && typeof js.getClassByName === 'function') {
			try {
				ctor = js.getClassByName(component);
			} catch {
				ctor = null;
			}
		}
		if (!ctor && js && typeof js.getClassById === 'function') {
			try {
				ctor = js.getClassById(component);
			} catch {
				ctor = null;
			}
		}
		return ctor || null;
	}

	// ---- selection ---------------------------------------------------------

	select(params) {
		this._rebuildIndex();
		const paths = toPathArray(params);
		for (const raw of paths) {
			const norm = stripLeadingSlashes(raw);
			if (!this._selection.has(norm)) {
				this._selection.add(norm);
				this._emit('scene:node-selected', { path: this._displayPath(norm) });
			}
		}
	}

	deselect(params) {
		const paths = toPathArray(params);
		for (const raw of paths) {
			const norm = stripLeadingSlashes(raw);
			if (this._selection.delete(norm)) {
				this._emit('scene:node-deselected', { path: this._displayPath(norm) });
			}
		}
	}

	clearSelection() {
		if (this._selection.size === 0) {
			return;
		}
		this._selection.clear();
		this._emit('scene:selection-cleared');
	}

	getSelection() {
		return [...this._selection].map(norm => this._displayPath(norm));
	}

	// ---- 结构编辑(M4:节点增删改 + 剪贴板 + 预览内独立 undo 栈)---------------
	//
	// 设计要点(与编辑态 service/node 严格对齐,见 plan「关键复用清单」):
	//  - **路径**:每个写操作开头与结尾都 `_rebuildIndex()`,返回路径一律按重建后的索引计算,
	//    避免「同名兄弟后缀按当前顺序重算」造成的路径漂移;
	//  - **事件即时性**:结束时 `_flushStructure()` 同步跑一次现成的 `_diffAndEmit()`,Hierarchy 立刻刷新,
	//    不等 150ms 轮询,也不必为每个操作手写事件载荷;
	//  - **删除不 destroy**:对齐编辑态 `baseRemoveNode`——只 `setParent(null)`,节点引用交给 undo 栈,
	//    以便撤销时原位复活;真正的 destroy 推迟到 `clearHistory()` / `stop()`;
	//  - **停止即丢弃**:undo 栈、剪贴板离线副本、游离节点全部随 `stop()` 一起清理,绝不回写编辑场景。

	/**
	 * 结构写操作后立即产出结构事件(node:added / node:removed / node:change),不等 150ms 轮询。
	 * 直接复用扫描期的 `_diffAndEmit()`,故事件载荷与轮询路径完全一致,Hierarchy 无需区分来源。
	 */
	_flushStructure() {
		try {
			this._diffAndEmit();
		} catch {
			// 事件产出失败不应回滚已经生效的结构改动;下一轮扫描会补发。
		}
	}

	/** '' / '/' → 场景根;其余按 mgr path 查活节点。找不到即抛(与编辑态「节点不存在即抛」一致)。 */
	_requireNode(rawPath, op) {
		const norm = stripLeadingSlashes(typeof rawPath === 'string' ? rawPath : '');
		const node = norm === '' ? this._getScene() : this._pathToNode.get(norm);
		if (!node || !this._isValid(node)) {
			throw new Error(`preview ${op}: node not found at '${typeof rawPath === 'string' ? rawPath : '/'}'`);
		}
		return node;
	}

	/** 场景根不参与结构编辑(删除/移动/复制/改父),与编辑态一致。 */
	_assertNotScene(node, op) {
		if (this._isScene(node)) {
			throw new Error(`preview ${op}: the scene root cannot be modified`);
		}
	}

	/** uuid → 展示路径('/' 表示场景根);当前索引里没有(已删除/游离)时返回 ''。 */
	_pathOfUuid(uuid) {
		const mgrPath = this._uuidToPath.get(uuid);
		return mgrPath === undefined ? '' : this._displayPath(mgrPath);
	}

	_pathOfNode(node) {
		return node ? this._pathOfUuid(node.uuid) : '';
	}

	/** node 是否为 ancestor 的后代(setParent 环检测,对齐 nodeMgr.setParent 的父子关系校验)。 */
	_isDescendantOf(node, ancestor) {
		let cursor = node && node.parent;
		while (cursor) {
			if (cursor === ancestor) {
				return true;
			}
			cursor = cursor.parent;
		}
		return false;
	}

	/** 同级唯一名(镜像编辑态 node-utils.getNodeName:`Node` → `Node-001` → `Node-002`)。 */
	_availableName(name, parent) {
		let candidate = name || 'Node';
		const taken = ((parent && parent.children) || []).map(child => (child && child.name) || '');
		while (taken.includes(candidate)) {
			if (/(\d+)$/.test(candidate)) {
				candidate = candidate.replace(/(\d+)$/, (_all, digits) =>
					String(parseInt(digits, 10) + 1).padStart(digits.length, '0'));
			} else {
				candidate += '-001';
			}
		}
		return candidate;
	}

	// ---- undo 基元 ---------------------------------------------------------

	/** 把节点挂回 parent 的指定兄弟位置;siblingIndex 越界时落到末尾。 */
	_attachNode(node, parent, siblingIndex) {
		if (!this._isValid(node) || !parent || !this._isValid(parent)) {
			return false;
		}
		node.setParent(parent);
		this._detachedNodes.delete(node);
		if (typeof siblingIndex === 'number' && siblingIndex >= 0 && typeof node.setSiblingIndex === 'function') {
			const last = ((parent.children && parent.children.length) || 1) - 1;
			node.setSiblingIndex(Math.min(siblingIndex, last));
		}
		return true;
	}

	/** 摘除但**不 destroy**:引用交给 undo 栈持有,`clearHistory()`/`stop()` 时才真正销毁。 */
	_detachNode(node) {
		if (!this._isValid(node)) {
			return false;
		}
		node.setParent(null);
		this._detachedNodes.add(node);
		return true;
	}

	/** 新建类操作的通用 undo 记录:undo 摘除、redo 原位挂回。必须在 setParent 之后调用。 */
	_recordCreate(node, parent, label) {
		const siblingIndex = this._siblingIndex(node);
		this._pushCommand({
			label,
			undo: () => { this._detachNode(node); },
			redo: () => { this._attachNode(node, parent, siblingIndex); },
		});
	}

	/** 入栈一条命令:group 活跃时收集进 group,否则直接入 undo 栈;任何新命令都清空 redo 栈。 */
	_pushCommand(command) {
		this._redoStack.length = 0;
		if (this._undoGroup) {
			this._undoGroup.commands.push(command);
			return;
		}
		this._undoStack.push(command);
		while (this._undoStack.length > PREVIEW_UNDO_STACK_LIMIT) {
			this._undoStack.shift();
		}
	}

	/**
	 * 把一段写操作合成**单个** undo 步骤。与 host 传入的 group 天然嵌套(begin 只在最外层真正开栈),
	 * 因此 `undo:begin-group` → `node:paste` → `undo:end-group` 的既有调用序列仍然只产出一步。
	 * 同时兼容同步/异步 run:异步失败时同样 cancelGroup 回滚已产生的部分改动。
	 */
	_asOneCommand(label, run) {
		const token = this.beginGroup({ label });
		let result;
		try {
			result = run();
		} catch (error) {
			this.cancelGroup(token);
			throw error;
		}
		if (result && typeof result.then === 'function') {
			return result.then(
				value => { this.endGroup(token); return value; },
				error => { this.cancelGroup(token); throw error; },
			);
		}
		this.endGroup(token);
		return result;
	}

	// ---- undo / redo(预览内独立栈,与编辑器 undo 栈完全隔离)-----------------

	undo() {
		return this._applyHistory(this._undoStack, this._redoStack, 'undo');
	}

	redo() {
		return this._applyHistory(this._redoStack, this._undoStack, 'redo');
	}

	canUndo() {
		return this._undoStack.length > 0;
	}

	canRedo() {
		return this._redoStack.length > 0;
	}

	isGroupActive() {
		return this._undoGroup !== null;
	}

	/** 预览是内存快照,永远「不脏」——编辑器 tab 不得因预览改动变 dirty(停止即丢弃)。 */
	isDirty() {
		return false;
	}

	/** 清空历史:栈里持有的游离节点此时才真正 destroy(它们已不可能再被复活)。 */
	clearHistory() {
		this._undoStack.length = 0;
		this._redoStack.length = 0;
		this._undoGroup = null;
		this._destroyDetachedNodes();
		this._destroyDetachedComponents();
	}

	/**
	 * 取一条命令执行并转移到对侧栈。**任何情况下都不抛**:`IUndoRedoResult` 是结构化结果,
	 * 上层(sceneOps._withUndoGroup / 全局 Ctrl+Z contribution)并不总检查 success,抛异常只会变成噪声。
	 */
	_applyHistory(from, to, kind) {
		if (this._undoGroup) {
			return { success: false, reason: `preview ${kind}: an undo group is still active` };
		}
		const command = from.pop();
		if (!command) {
			return { success: false, reason: `preview ${kind}: history is empty` };
		}
		try {
			if (kind === 'undo') {
				command.undo();
			} else {
				command.redo();
			}
		} catch (error) {
			// 该命令的状态已不可信,丢弃而不是放回栈——避免后续 undo 在坏状态上继续放大问题。
			this._rebuildIndex();
			this._flushStructure();
			return { success: false, reason: `preview ${kind} failed: ${(error && error.message) || error}` };
		}
		to.push(command);
		this._rebuildIndex();
		this._flushStructure();
		return { success: true, label: command.label };
	}

	/** 开一个 undo group;已有活跃 group 时只增加嵌套深度并复用其 id。 */
	beginGroup(options) {
		if (this._undoGroup) {
			this._undoGroup.depth++;
			return this._undoGroup.id;
		}
		this._groupSequence++;
		const id = `preview-undo-group-${this._groupSequence}`;
		this._undoGroup = {
			id,
			label: (options && options.label) || 'Preview Operation',
			depth: 1,
			commands: [],
		};
		return id;
	}

	/** 结束 group:最外层结束时把收集到的命令合成一条复合命令入栈;空 group 不入栈。 */
	endGroup(token) {
		const group = this._undoGroup;
		if (!group) {
			return { success: false, reason: 'preview end-group: no active undo group' };
		}
		if (token && token !== group.id) {
			return { success: false, reason: `preview end-group: unknown group token '${token}'` };
		}
		group.depth--;
		if (group.depth > 0) {
			return { success: true, commandId: group.id, label: group.label };
		}
		this._undoGroup = null;
		const commands = group.commands;
		if (commands.length === 0) {
			return { success: true, commandId: group.id, label: group.label };
		}
		this._pushCommand({
			label: group.label,
			undo: () => {
				for (let i = commands.length - 1; i >= 0; i--) {
					commands[i].undo();
				}
			},
			redo: () => {
				for (const command of commands) {
					command.redo();
				}
			},
		});
		return { success: true, commandId: group.id, label: group.label };
	}

	/** 取消 group:逐条逆序回滚后丢弃。同样不抛,失败信息随结果返回。 */
	cancelGroup(token) {
		const group = this._undoGroup;
		if (!group) {
			return { success: false, reason: 'preview cancel-group: no active undo group' };
		}
		if (token && token !== group.id) {
			return { success: false, reason: `preview cancel-group: unknown group token '${token}'` };
		}
		this._undoGroup = null;
		let reason;
		for (let i = group.commands.length - 1; i >= 0; i--) {
			try {
				group.commands[i].undo();
			} catch (error) {
				reason = `preview cancel-group: rollback failed: ${(error && error.message) || error}`;
			}
		}
		this._rebuildIndex();
		this._flushStructure();
		return reason
			? { success: false, commandId: group.id, reason }
			: { success: true, commandId: group.id, label: group.label };
	}

	// ---- 节点写操作 --------------------------------------------------------

	/**
	 * 类型化创建(node.create-by-type)。`params.path` 是**父节点**路径('' / '/' = 场景根)。
	 * 类型 → 内置 Prefab uuid 的映射来自 CLI 的 `/scene/node-type-config`(直接输出编辑态的 NODE_CONFIGS,
	 * 不在此处重抄一份),`Empty` 走 `new cc.Node()`。Prefab 或其依赖加载失败时降级为空节点 + view:log warn,
	 * 绝不让一次创建失败把菜单/树打挂。
	 * @returns {Promise<object>} INode dump
	 */
	async createNodeByType(params) {
		const p = params || {};
		const nodeType = typeof p.nodeType === 'string' ? p.nodeType : '';
		if (!nodeType) {
			throw new Error('preview create-by-type: nodeType is required');
		}
		const workMode = String(p.workMode || '2d').toLowerCase();
		const config = await this._resolveNodeTypeConfig(nodeType, workMode);
		const canvasRequired = Boolean(p.canvasRequired || config.canvasRequired);
		const label = `Create ${config.name || nodeType}`;
		return this._asOneCommand(label, async () => {
			this._rebuildIndex();
			let parent = this._requireNode(p.path, 'create-by-type');
			const node = await this._instantiateForNodeType(config, nodeType);
			if (canvasRequired) {
				parent = await this._resolveCanvasParent(parent, workMode);
			}
			if (typeof p.name === 'string' && p.name.length > 0) {
				node.name = p.name;
			}
			// 新节点 layer 跟随父级,场景根除外;parent.layer 为 0(None)时不跟随——对齐编辑态 _createNode。
			if (parent.layer && !this._isScene(parent)) {
				this._setLayerDeep(node, parent.layer);
			}
			if (p.position) {
				node.setPosition(this._toVec3(p.position));
			}
			node.setParent(parent, Boolean(p.keepWorldTransform));
			if (!config.assetUuid) {
				// 编辑态在 setParent **之前**调用(此时 parent 还是 null,实际形同空转);
				// 预览这里放到挂载之后,让 Canvas 下的空节点真正拿到 UITransform。
				this._ensureUITransformComponent(node);
			}
			this._recordCreate(node, parent, label);
			this._rebuildIndex();
			this._flushStructure();
			const mgrPath = this._uuidToPath.get(node.uuid);
			return this._dumpNode(node, mgrPath === undefined ? '' : mgrPath, true);
		});
	}

	/**
	 * M6 按资产创建(node.create-by-asset):Hierarchy 接受 Assets 拖拽时预览在活场景实时建节点。
	 * db:// URL 经 CLI `/scene/asset-meta` 换 uuid/type,`_loadAssetByUuid` 加载后按类型装配:
	 *  - `cc.Prefab` → instantiate(摘除 prefab 元数据,预览永不回盘);
	 *  - `cc.SpriteFrame` / `cc.Texture2D` / `cc.ImageAsset` → 新节点 + UITransform + Sprite,并自动补 Canvas 父级
	 *    (Texture 挂临时 SpriteFrame;ImageAsset 先包 Texture2D 再包 SpriteFrame);
	 *  - `cc.AudioClip` → 新节点 + AudioSource;
	 * 其余类型抛「预览暂不支持」清晰错误。父级/name/position/keepWorldTransform 语义对齐 create-by-type。
	 * @param {{ dbURL?: string, path?: string, name?: string, workMode?: string, position?: unknown, keepWorldTransform?: boolean } | undefined} params
	 * @returns {Promise<object>} INode dump
	 */
	async createByAsset(params) {
		const p = params || {};
		const dbURL = typeof p.dbURL === 'string' ? p.dbURL : '';
		if (!dbURL) {
			throw new Error('preview create-by-asset: dbURL is required');
		}
		const meta = await this._loadAssetMeta(dbURL);
		const workMode = String(p.workMode || '2d').toLowerCase();
		const baseName = this._assetNodeName(meta.name) || meta.name || dbURL;
		const label = `Create ${baseName}`;
		return this._asOneCommand(label, async () => {
			this._rebuildIndex();
			let parent = this._requireNode(p.path, 'create-by-asset');
			const asset = await this._loadAssetByUuid(meta.uuid);
			if (!asset) {
				throw new Error(`preview create-by-asset: asset '${dbURL}' resolved to null`);
			}
			const kind = this._className(asset.constructor) || meta.type || '';
			let node;
			if (kind === 'cc.Prefab') {
				node = this._cc.instantiate(asset);
				if (!node) {
					throw new Error(`preview create-by-asset: cc.instantiate('${dbURL}') returned null`);
				}
				this._stripPrefabInfo(node);
			} else if (kind === 'cc.SpriteFrame' || kind === 'cc.Texture2D' || kind === 'cc.ImageAsset') {
				node = await this._buildSpriteNodeForAsset(asset, kind, baseName, meta);
				parent = await this._resolveCanvasParent(parent, workMode);
			} else if (kind === 'cc.AudioClip') {
				node = new this._cc.Node(baseName || 'AudioClip');
				const source = node.addComponent(this._cc.AudioSource);
				if (source) {
					source.clip = asset;
				}
			} else {
				throw new Error(`preview create-by-asset: asset type '${meta.type || kind}' is not supported in preview`);
			}
			if (typeof p.name === 'string' && p.name.length > 0) {
				node.name = p.name;
			}
			// 新节点 layer 跟随父级,场景根除外——对齐 create-by-type / 编辑态 _createNode。
			if (parent.layer && !this._isScene(parent)) {
				this._setLayerDeep(node, parent.layer);
			}
			if (p.position) {
				node.setPosition(this._toVec3(p.position));
			}
			node.setParent(parent, Boolean(p.keepWorldTransform));
			this._recordCreate(node, parent, label);
			this._rebuildIndex();
			this._flushStructure();
			const mgrPath = this._uuidToPath.get(node.uuid);
			return this._dumpNode(node, mgrPath === undefined ? '' : mgrPath, true);
		});
	}

	/**
	 * Sprite/Texture/Image 资产 → 新节点 + UITransform + Sprite(运行期临时对象,停止即丢弃)。
	 *  - `cc.SpriteFrame` 直接挂;
	 *  - `cc.Texture2D` 包临时 SpriteFrame;
	 *  - `cc.ImageAsset`(图片主资产)先包 Texture2D(`texture.image = asset`)再包 SpriteFrame。
	 * 2D 组件类在个别运行时构建里可能被裁剪:Sprite 缺失抛清晰错误,UITransform 缺失则跳过(不撞引擎 nil 断言)。
	 */
	async _buildSpriteNodeForAsset(asset, kind, fallbackName, meta) {
		const cc = this._cc;
		if (!cc.Sprite) {
			throw new Error('preview create-by-asset: cc.Sprite is unavailable in this engine build');
		}
		const node = new cc.Node(fallbackName || 'Sprite');
		if (cc.UITransform) {
			node.addComponent(cc.UITransform);
		}
		const sprite = node.addComponent(cc.Sprite);
		if (sprite) {
			// 优先挂 asset-db 真子资产 SpriteFrame(带资产 uuid):Inspector 的 spriteFrame 属性才能
			// 索引/定位回 Assets;加载不到才退到运行期临时包装(停止即丢弃)。
			let spriteFrame = kind === 'cc.SpriteFrame' ? asset : null;
			if (!spriteFrame) {
				const sub = Array.isArray(meta && meta.subAssets)
					? meta.subAssets.find(s => s && s.type === 'cc.SpriteFrame' && typeof s.uuid === 'string' && s.uuid)
					: null;
				if (sub) {
					try {
						const loaded = await this._loadAssetByUuid(sub.uuid);
						if (loaded && this._className(loaded.constructor) === 'cc.SpriteFrame') {
							spriteFrame = loaded;
						}
					} catch {
						// 子资产加载失败 → 下面的临时包装兜底。
					}
				}
			}
			if (!spriteFrame && cc.SpriteFrame) {
				if (kind === 'cc.Texture2D') {
					spriteFrame = new cc.SpriteFrame();
					spriteFrame.texture = asset;
				} else if (kind === 'cc.ImageAsset' && cc.Texture2D) {
					const texture = new cc.Texture2D();
					texture.image = asset;
					spriteFrame = new cc.SpriteFrame();
					spriteFrame.texture = texture;
				}
			}
			if (spriteFrame) {
				sprite.spriteFrame = spriteFrame;
			}
		}
		return node;
	}

	/** 资产名 → 节点名:去掉尾部扩展后缀(对齐编辑态 create-by-asset 节点命名,GreenBtn.png → GreenBtn)。 */
	_assetNodeName(name) {
		if (typeof name !== 'string' || !name) {
			return '';
		}
		return name.replace(/\.[^.]+$/, '');
	}

	/** `/scene/asset-meta` 只读路由:db:// URL → { uuid, type, name };失败抛可定位错误并允许下次重试。 */
	_loadAssetMeta(dbURL) {
		const url = `${this._serverURL || ''}/scene/asset-meta?dbURL=${encodeURIComponent(dbURL)}`;
		return fetch(url)
			.then(response => {
				if (!response.ok) {
					throw new Error(`HTTP ${response.status}`);
				}
				return response.json();
			})
			.then(json => {
				if (!json || typeof json.uuid !== 'string' || !json.uuid) {
					throw new Error(`asset meta for '${dbURL}' has no uuid`);
				}
				return json;
			})
			.catch(error => {
				throw new Error(`preview create-by-asset: failed to load the asset meta for '${dbURL}': ${(error && error.message) || error}`);
			});
	}

	/** 删除(node.delete):摘除但不 destroy,undo 可原位复活。返回 void。 */
	deleteNode(params) {
		this._rebuildIndex();
		const node = this._requireNode(params && params.path, 'delete');
		this._assertNotScene(node, 'delete');
		const parent = node.parent;
		const siblingIndex = this._siblingIndex(node);
		const command = {
			label: 'Delete Node',
			undo: () => { this._attachNode(node, parent, siblingIndex); },
			redo: () => { this._detachNode(node); },
		};
		command.redo();
		this._pushCommand(command);
		this._rebuildIndex();
		this._flushStructure();
	}

	/**
	 * 改父(node.set-parent,拖拽移动)。环检测在**任何写入之前**全部跑完,避免半途失败留下脏状态。
	 * @returns {string[]} 移动后的展示路径
	 */
	setParent(params) {
		this._rebuildIndex();
		const p = params || {};
		const parent = this._requireNode(p.parentPath, 'set-parent');
		const keepWorldTransform = Boolean(p.keepWorldTransform);
		const nodes = toPathArray(p.paths).map(path => this._requireNode(path, 'set-parent'));
		for (const node of nodes) {
			this._assertNotScene(node, 'set-parent');
			if (parent === node || this._isDescendantOf(parent, node)) {
				throw new Error('preview set-parent: cannot set parent to the node itself or its descendant');
			}
		}
		const records = [];
		for (const node of nodes) {
			const oldParent = node.parent;
			if (!oldParent) {
				continue;
			}
			records.push({ node, oldParent, oldIndex: this._siblingIndex(node) });
			node.setParent(parent, keepWorldTransform);
		}
		if (records.length > 0) {
			this._pushCommand({
				label: 'Move Nodes',
				undo: () => {
					for (let i = records.length - 1; i >= 0; i--) {
						this._attachNode(records[i].node, records[i].oldParent, records[i].oldIndex);
					}
				},
				redo: () => {
					for (const record of records) {
						if (this._isValid(record.node) && this._isValid(parent)) {
							record.node.setParent(parent, keepWorldTransform);
						}
					}
				},
			});
		}
		this._rebuildIndex();
		this._flushStructure();
		return records.map(record => this._pathOfNode(record.node)).filter(Boolean);
	}

	/**
	 * 同级排序(node.reorder)。`params.path` 是**父节点**路径,`target` 是「可见子节点」列表里的下标,
	 * `offset` 是位移量——语义逐行对齐编辑态 nodeMgr.moveArrayElement 的 children 分支:
	 * 目标位置取 `visible[target + offset]` 在**未过滤** children 里的原始下标,越界得 -1(移到末尾)。
	 */
	reorder(params) {
		this._rebuildIndex();
		const p = params || {};
		const parent = this._requireNode(p.path, 'reorder');
		const target = Number(p.target);
		const offset = Number(p.offset);
		if (!Number.isFinite(target) || !Number.isFinite(offset)) {
			return false;
		}
		const raw = (parent.children && parent.children.slice()) || [];
		const visible = this._visibleChildrenWithNames(parent).map(entry => entry[0]);
		const child = visible[target];
		if (!child || typeof child.setSiblingIndex !== 'function') {
			return false;
		}
		const destination = raw.indexOf(visible[target + offset]);
		const before = this._siblingIndex(child);
		child.setSiblingIndex(destination);
		const after = this._siblingIndex(child);
		if (after !== before) {
			this._pushCommand({
				label: 'Reorder Node',
				undo: () => { if (this._isValid(child)) { child.setSiblingIndex(before); } },
				redo: () => { if (this._isValid(child)) { child.setSiblingIndex(destination); } },
			});
		}
		this._rebuildIndex();
		this._flushStructure();
		return true;
	}

	/**
	 * 锁定/解锁(node.change-node-lock):写节点自身 objFlags 的 LockedInEditor 位(与编辑态一致,
	 * 不外挂 map),`_dumpNode` 已读该位。锁定不改变结构快照,故这里逐节点回推带完整 dump 的
	 * node:change(propPath:'locked'),由 Hierarchy 侧刷新锁图标。
	 */
	changeNodeLock(params) {
		this._rebuildIndex();
		const p = params || {};
		const flag = this._flagLockedInEditor;
		if (!flag) {
			throw new Error('preview change-node-lock: the LockedInEditor flag is unavailable in this engine build');
		}
		const locked = Boolean(p.locked);
		const roots = toPathArray(p.paths).map(path => this._requireNode(path, 'change-node-lock'));
		const records = [];
		const visit = node => {
			if (!this._isValid(node)) {
				return;
			}
			const objFlags = this._objFlagsOf(node);
			records.push({ node, objFlags });
			this._setObjFlags(node, locked ? (objFlags | flag) : (objFlags & ~flag));
			if (p.loop) {
				for (const child of (node.children || [])) {
					visit(child);
				}
			}
		};
		for (const root of roots) {
			visit(root);
		}
		if (records.length > 0) {
			this._pushCommand({
				label: locked ? 'Lock Node' : 'Unlock Node',
				undo: () => {
					for (const record of records) {
						this._setObjFlags(record.node, record.objFlags);
					}
					this._emitLockChanges(records);
				},
				redo: () => {
					for (const record of records) {
						this._setObjFlags(record.node, locked ? (record.objFlags | flag) : (record.objFlags & ~flag));
					}
					this._emitLockChanges(records);
				},
			});
		}
		this._rebuildIndex();
		this._emitLockChanges(records);
	}

	_emitLockChanges(records) {
		for (const record of records) {
			if (!this._isValid(record.node)) {
				continue;
			}
			const mgrPath = this._uuidToPath.get(record.node.uuid);
			if (mgrPath !== undefined) {
				this._afterWrite(record.node, mgrPath, 'locked');
			}
		}
	}

	_objFlagsOf(node) {
		const value = node && (node._objFlags != null ? node._objFlags : node.objFlags);
		return value || 0;
	}

	_setObjFlags(node, value) {
		try {
			node.objFlags = value;
			if (this._objFlagsOf(node) === value) {
				return;
			}
		} catch {
			// 部分引擎版本 objFlags 只有 getter,退回写内部字段。
		}
		node._objFlags = value;
	}

	// ---- 剪贴板(预览独立,停止即丢弃)---------------------------------------

	/**
	 * 复制(node.copy):`cc.instantiate` 出**离线副本**存入 stash(思路对齐编辑态 stashInstants),
	 * 之后即便源节点被改动/删除,粘贴出的内容仍是复制那一刻的样子。
	 * @returns {string[]} 被复制节点的当前展示路径
	 */
	copyNodes(params) {
		this._rebuildIndex();
		const nodes = toPathArray(params && params.paths).map(path => this._requireNode(path, 'copy'));
		for (const node of nodes) {
			this._assertNotScene(node, 'copy');
		}
		this._clearClipboard();
		const entries = [];
		for (const node of nodes) {
			const instant = this._cc.instantiate(node);
			if (!instant) {
				continue;
			}
			this._stripPrefabInfo(instant);
			entries.push({ uuid: node.uuid, instant });
		}
		this._clipboard = { type: entries.length > 0 ? 'copy' : 'none', entries };
		return entries.map(entry => this._pathOfUuid(entry.uuid)).filter(Boolean);
	}

	/** 剪切(node.cut):只登记 uuid,不立即摘除;paste 时改为移动(对齐编辑态 _cutUuids)。 */
	cutNodes(params) {
		this._rebuildIndex();
		const paths = toPathArray(params && params.paths);
		const nodes = paths.map(path => this._requireNode(path, 'cut'));
		for (const node of nodes) {
			this._assertNotScene(node, 'cut');
		}
		this._clearClipboard();
		this._clipboard = {
			type: nodes.length > 0 ? 'cut' : 'none',
			entries: nodes.map(node => ({ uuid: node.uuid })),
		};
		return paths;
	}

	/**
	 * 粘贴(node.paste):剪切态走「移动」、复制态走「从 stash 再 instantiate 一份」。
	 * `parentPath` 缺省为场景根。返回新节点(或被移动节点)的展示路径。
	 */
	pasteNodes(params) {
		this._rebuildIndex();
		const p = params || {};
		const parent = this._requireNode(p.parentPath, 'paste');
		if (this._clipboard.type === 'cut') {
			const paths = this._clipboard.entries.map(entry => this._pathOfUuid(entry.uuid)).filter(Boolean);
			this._clipboard = { type: 'none', entries: [] };
			if (paths.length === 0) {
				return [];
			}
			return this.setParent({
				paths,
				parentPath: this._pathOfNode(parent),
				keepWorldTransform: p.keepWorldTransform,
			});
		}
		if (this._clipboard.entries.length === 0) {
			throw new Error('preview paste: no nodes have been copied');
		}
		return this._asOneCommand('Paste Nodes', () => {
			const created = [];
			for (const entry of this._clipboard.entries) {
				const node = this._cc.instantiate(entry.instant);
				if (!node) {
					continue;
				}
				this._stripPrefabInfo(node);
				node.name = this._availableName(node.name, parent);
				// 编辑态 createNodeFromStash 以 keepLayer=true 粘贴,故这里**不**用父级 layer 覆盖副本。
				node.setParent(parent, Boolean(p.keepWorldTransform));
				this._recordCreate(node, parent, 'Paste Nodes');
				created.push(node);
			}
			this._rebuildIndex();
			this._flushStructure();
			return created.map(node => this._pathOfNode(node)).filter(Boolean);
		});
	}

	/** 原地复制(node.duplicate):副本挂在源节点的同一个父级下,名字同级唯一化。 */
	duplicateNodes(params) {
		this._rebuildIndex();
		const nodes = toPathArray(params && params.paths).map(path => this._requireNode(path, 'duplicate'));
		for (const node of nodes) {
			this._assertNotScene(node, 'duplicate');
		}
		return this._asOneCommand('Duplicate Nodes', () => {
			const created = [];
			for (const source of nodes) {
				const parent = source.parent;
				if (!parent) {
					continue;
				}
				const copy = this._cc.instantiate(source);
				if (!copy) {
					continue;
				}
				this._stripPrefabInfo(copy);
				copy.name = this._availableName(source.name, parent);
				copy.setParent(parent);
				this._recordCreate(copy, parent, 'Duplicate Nodes');
				created.push(copy);
			}
			this._rebuildIndex();
			this._flushStructure();
			return created.map(node => this._pathOfNode(node)).filter(Boolean);
		});
	}

	/**
	 * 剪贴板状态(node.query-clipboard-state)。paths 按**当前**索引重算,源节点已删除则被过滤——
	 * 与编辑态 queryClipboardState 完全一致(Paste 因此会置灰,而不是粘出一个孤儿副本)。
	 */
	queryClipboardState() {
		this._rebuildIndex();
		if (this._clipboard.type === 'none' || this._clipboard.entries.length === 0) {
			return { type: 'none', paths: [] };
		}
		return {
			type: this._clipboard.type,
			paths: this._clipboard.entries.map(entry => this._pathOfUuid(entry.uuid)).filter(Boolean),
		};
	}

	/** node.get-path-by-uuid:未知 uuid 返回 ''(与编辑态过滤空串的用法一致)。 */
	getPathByUuid(params) {
		this._rebuildIndex();
		const uuid = typeof params === 'string' ? params : (params && params.uuid);
		return typeof uuid === 'string' ? this._pathOfUuid(uuid) : '';
	}

	_clearClipboard() {
		for (const entry of this._clipboard.entries) {
			const instant = entry.instant;
			if (instant && this._isValid(instant) && typeof instant.destroy === 'function') {
				try {
					instant.destroy();
				} catch {
					// 离线副本销毁失败无副作用,忽略。
				}
			}
		}
		this._clipboard = { type: 'none', entries: [] };
	}

	_destroyDetachedNodes() {
		for (const node of this._detachedNodes) {
			if (node && this._isValid(node) && typeof node.destroy === 'function') {
				try {
					node.destroy();
				} catch {
					// 游离节点销毁失败无副作用,忽略。
				}
			}
		}
		this._detachedNodes.clear();
	}

	/** M5:销毁被摘除的组件实例(best-effort),与 _destroyDetachedNodes 同一清理时机。 */
	_destroyDetachedComponents() {
		for (const comp of this._detachedComponents) {
			if (comp && this._isValid(comp) && typeof comp.destroy === 'function') {
				try {
					comp.destroy();
				} catch {
					// 游离组件销毁失败无副作用,忽略。
				}
			}
		}
		this._detachedComponents.clear();
	}

	// ---- 类型化创建的资源装配 ----------------------------------------------

	/** 类型 → 配置项。`project-type` 与 workMode 不符且存在备选时取第 2 项(对齐 _resolveTypeCreateOptions)。 */
	async _resolveNodeTypeConfig(nodeType, workMode) {
		const table = await this._loadNodeTypeConfig();
		const list = table && table[nodeType];
		if (!Array.isArray(list) || list.length === 0) {
			throw new Error(`preview create-by-type: node type '${nodeType}' is not implemented`);
		}
		let config = list[0];
		const projectType = config['project-type'];
		if (projectType && workMode && projectType !== workMode && list.length > 1) {
			config = list[1];
		}
		return config;
	}

	/** 拉取并缓存 CLI 输出的 NODE_CONFIGS(只读路由);失败时清掉 pending 以便下次重试。 */
	_loadNodeTypeConfig() {
		if (this._nodeTypeConfig) {
			return Promise.resolve(this._nodeTypeConfig);
		}
		if (!this._nodeTypeConfigPromise) {
			const url = `${this._serverURL || ''}${NODE_TYPE_CONFIG_ROUTE}`;
			this._nodeTypeConfigPromise = fetch(url)
				.then(response => {
					if (!response.ok) {
						throw new Error(`HTTP ${response.status}`);
					}
					return response.json();
				})
				.then(json => {
					this._nodeTypeConfig = json;
					return json;
				})
				.catch(error => {
					this._nodeTypeConfigPromise = null;
					throw new Error(`preview create-by-type: failed to load the node type config from ${url}: ${(error && error.message) || error}`);
				});
		}
		return this._nodeTypeConfigPromise;
	}

	/** 无 assetUuid(Empty)→ `new cc.Node`;否则内置 Prefab instantiate,失败降级为空节点 + warn。 */
	async _instantiateForNodeType(config, nodeType) {
		const fallbackName = config.name || nodeType || 'Node';
		if (!config.assetUuid) {
			return new this._cc.Node(fallbackName);
		}
		try {
			const prefab = await this._loadBuiltinPrefab(config.assetUuid);
			const node = this._cc.instantiate(prefab);
			if (!node) {
				throw new Error('cc.instantiate returned null');
			}
			this._stripPrefabInfo(node);
			return node;
		} catch (error) {
			this._emit('view:log', {
				level: 'warn',
				message: `[preview-inspect] create '${nodeType}' fell back to an empty node: ${(error && error.message) || error}`,
			});
			return new this._cc.Node(fallbackName);
		}
	}

	_loadBuiltinPrefab(uuid) {
		const cached = this._prefabCache.get(uuid);
		if (cached && this._isValid(cached)) {
			return Promise.resolve(cached);
		}
		return this._loadAssetByUuid(uuid).then(asset => {
			if (!asset) {
				throw new Error(`asset '${uuid}' resolved to null`);
			}
			this._prefabCache.set(uuid, asset);
			return asset;
		});
	}

	/**
	 * 按 uuid 取内置资源。先试 `assetManager.loadAny`(uuid 命中已注册 bundle 配置时最省事),
	 * 不行再退到「fetch import JSON + loadWithJson」——预览资源路由 `/assets/<bundle>/import/**`
	 * 忽略 bundle 段、遍历全部 library 目录(含 db://internal),故内置 Prefab 的 JSON 可直接按 uuid 取到;
	 * 其依赖即 settings.engine.builtinAssets,预览启动时已被硬性校验非空。
	 */
	_loadAssetByUuid(uuid) {
		const assetManager = this._cc.assetManager;
		if (!assetManager) {
			return Promise.reject(new Error('cc.assetManager is unavailable'));
		}
		return new Promise((resolve, reject) => {
			let settled = false;
			const loadViaJson = () => {
				const url = `${this._serverURL || ''}/assets/general/import/${uuid.slice(0, 2)}/${uuid}.json`;
				fetch(url)
					.then(response => {
						if (!response.ok) {
							throw new Error(`HTTP ${response.status} for ${url}`);
						}
						return response.json();
					})
					.then(json => {
						assetManager.loadWithJson(json, { assetId: uuid }, () => { /* progress */ }, (err, asset) => {
							if (err) {
								reject(err instanceof Error ? err : new Error(String(err)));
							} else {
								resolve(asset);
							}
						});
					})
					.catch(reject);
			};
			try {
				assetManager.loadAny({ uuid }, (err, asset) => {
					if (settled) {
						return;
					}
					settled = true;
					if (!err && asset) {
						resolve(asset);
					} else {
						loadViaJson();
					}
				});
			} catch {
				if (!settled) {
					settled = true;
					loadViaJson();
				}
			}
		});
	}

	/**
	 * canvasRequired 的父级解析(对齐编辑态 checkCanvasRequired + getUICanvasNode 的非 prefab 分支):
	 * 自身/祖先已在 Canvas 下 → 保持原父级;否则取直接子节点里最后一个 Canvas;都没有则创建内置 Canvas。
	 */
	async _resolveCanvasParent(parent, workMode) {
		const canvas = this._findUICanvasNode(parent);
		if (canvas) {
			return canvas;
		}
		const uuid = workMode === '2d' ? CANVAS_PREFAB_UUID_2D : CANVAS_PREFAB_UUID_3D;
		try {
			const prefab = await this._loadBuiltinPrefab(uuid);
			const node = this._cc.instantiate(prefab);
			if (!node) {
				throw new Error('cc.instantiate returned null');
			}
			this._stripPrefabInfo(node);
			node.setParent(parent);
			this._recordCreate(node, parent, 'Create Canvas');
			return node;
		} catch (error) {
			this._emit('view:log', {
				level: 'warn',
				message: `[preview-inspect] auto Canvas creation failed; the new node stays under its original parent: ${(error && error.message) || error}`,
			});
			return parent;
		}
	}

	/** 自身或任一祖先带 cc.Canvas → 返回自身;否则返回最后一个带 cc.Canvas 的直接子节点;都没有 → null。 */
	_findUICanvasNode(node) {
		if (!node) {
			return null;
		}
		if (this._hasCanvasComponent(node)) {
			return node;
		}
		const scene = this._getScene();
		if (node !== scene) {
			let cursor = node.parent;
			while (cursor) {
				if (this._hasCanvasComponent(cursor)) {
					return node;
				}
				if (cursor === scene) {
					break;
				}
				cursor = cursor.parent;
			}
		}
		const children = (node.children && node.children.slice()) || [];
		for (let i = children.length - 1; i >= 0; i--) {
			if (this._hasCanvasComponent(children[i])) {
				return children[i];
			}
		}
		return null;
	}

	_hasCanvasComponent(node) {
		const Canvas = this._cc.Canvas;
		if (!node || !Canvas || typeof node.getComponent !== 'function') {
			return false;
		}
		try {
			return Boolean(node.getComponent(Canvas));
		} catch {
			return false;
		}
	}

	/** 空节点挂在 Canvas 下时补 cc.UITransform(对齐编辑态 nodeMgr.ensureUITransformComponent)。 */
	_ensureUITransformComponent(node) {
		const UITransform = this._cc.UITransform;
		if (!UITransform || !node || (node.children && node.children.length > 0)) {
			return;
		}
		let inside = false;
		let cursor = node.parent;
		while (cursor) {
			if (this._hasCanvasComponent(cursor)) {
				inside = true;
				break;
			}
			cursor = cursor.parent;
		}
		if (!inside) {
			return;
		}
		try {
			if (!node.getComponent(UITransform)) {
				node.addComponent(UITransform);
			}
		} catch {
			// 补组件失败不影响节点已经创建成功的事实。
		}
	}

	_setLayerDeep(node, layer) {
		if (!node) {
			return;
		}
		node.layer = layer;
		for (const child of (node.children || [])) {
			this._setLayerDeep(child, layer);
		}
	}

	/**
	 * 摘掉 prefab 元数据:预览态的创建/复制都当作普通节点(对齐编辑态 create-by-type 的 removePrefabInfo),
	 * 且预览永不序列化回盘,残留的 prefab info 只会让 Inspector 显示错误的关联状态。
	 */
	_stripPrefabInfo(node) {
		if (!node) {
			return;
		}
		try {
			node._prefab = null;
			for (const comp of (node.components || node._components || [])) {
				if (comp) {
					comp.__prefab = null;
				}
			}
		} catch {
			// 只是清理元数据,失败可忽略。
		}
		for (const child of (node.children || [])) {
			this._stripPrefabInfo(child);
		}
	}

	// ---- 结构快照 diff -----------------------------------------------------

	_scheduleScan() {
		if (this._disposed) {
			return;
		}
		this._scanTimer = setTimeout(() => {
			this._scanTimer = 0;
			this._scan();
		}, STRUCTURE_SCAN_INTERVAL_MS);
	}

	_scan() {
		if (this._disposed || !this._sink) {
			return;
		}
		try {
			this._diffAndEmit();
			this._emitSelectionPropChanges();
		} catch {
			// 扫描是尽力而为的附加能力,单帧异常不应终止后续扫描。
		}
		this._scheduleScan();
	}

	_diffAndEmit() {
		const next = this._takeSnapshot();
		const prev = this._snapshot;

		// 新增
		for (const [uuid, info] of next) {
			if (!prev.has(uuid)) {
				this._emit('node:added', { path: this._displayPath(info.path) });
			}
		}
		// 删除
		for (const [uuid, info] of prev) {
			if (!next.has(uuid)) {
				this._emit('node:removed', { path: this._displayPath(info.path) });
			}
		}
		// 移动 / 改父 / 重命名 / 兄弟重排 → 结构性 node:change(触发 Hierarchy re-query)
		for (const [uuid, info] of next) {
			const old = prev.get(uuid);
			if (!old) {
				continue;
			}
			if (old.parentUuid !== info.parentUuid) {
				this._emitStructureChange(info, uuid, 'parent-changed');
			} else if (old.name !== info.name || old.siblingIndex !== info.siblingIndex || old.path !== info.path) {
				this._emitStructureChange(info, uuid, 'child-changed');
			}
		}

		this._snapshot = next;
	}

	_emitStructureChange(info, uuid, type) {
		this._emit('node:change', {
			node: { path: this._displayPath(info.path), uuid },
			change: { type },
		});
	}

	/**
	 * 选中节点属性 liveness(M2):对 selection 内节点做 transform 签名 diff,变化时 dump 全量属性并
	 * fire node:change(带完整 dump + change.propPath),满足 host router 的 property-changed 分流。
	 * 首次见到某选中节点只记签名不广播(避免选中瞬间产生伪变更)。索引由 _diffAndEmit 已重建。
	 */
	_emitSelectionPropChanges() {
		for (const norm of this._selection) {
			const node = norm === '' ? this._getScene() : this._pathToNode.get(norm);
			if (!node || !this._isValid(node) || this._isScene(node)) {
				continue;
			}
			const sig = this._transformSignature(node);
			const prev = this._selectionPropSig.get(norm);
			if (prev !== sig) {
				this._selectionPropSig.set(norm, sig);
				if (prev !== undefined) {
					this._emit('node:change', {
						node: this._dumpNode(node, norm, true),
						change: { propPath: 'position', source: 'engine' },
					});
				}
			}
		}
		for (const key of [...this._selectionPropSig.keys()]) {
			if (!this._selection.has(key)) {
				this._selectionPropSig.delete(key);
			}
		}
	}

	_transformSignature(node) {
		const p = node.position || {};
		const r = node.eulerAngles || {};
		const s = node.scale || {};
		return [
			node.name, node.active, node.layer,
			p.x, p.y, p.z, r.x, r.y, r.z, s.x, s.y, s.z,
		].join(',');
	}

	_takeSnapshot() {
		this._rebuildIndex();
		const snap = new Map();
		for (const [uuid, node] of this._uuidToNode) {
			snap.set(uuid, {
				parentUuid: (node.parent && node.parent.uuid) || '',
				siblingIndex: this._siblingIndex(node),
				name: node.name,
				active: !!node.active,
				path: this._uuidToPath.get(uuid) || '',
			});
		}
		return snap;
	}

	// ---- 索引 --------------------------------------------------------------

	_rebuildIndex() {
		this._pathToNode.clear();
		this._uuidToPath.clear();
		this._uuidToNode.clear();
		const scene = this._getScene();
		if (!scene) {
			return;
		}
		this._pathToNode.set('', scene);
		this._uuidToPath.set(scene.uuid, '');
		this._uuidToNode.set(scene.uuid, scene);
		const walk = (node, mgrPath) => {
			for (const [child, name] of this._visibleChildrenWithNames(node)) {
				const childPath = mgrPath === '' ? name : `${mgrPath}/${name}`;
				this._pathToNode.set(childPath, child);
				this._uuidToPath.set(child.uuid, childPath);
				this._uuidToNode.set(child.uuid, child);
				walk(child, childPath);
			}
		};
		walk(scene, '');
	}

	/**
	 * 返回可见子节点(丢弃 HideInHierarchy)及其去重后名字,顺序与 children 一致。
	 * @returns {Array<[any, string]>}
	 */
	_visibleChildrenWithNames(node) {
		const children = (node && node.children) || [];
		const taken = new Map();
		const out = [];
		for (const child of children) {
			if (!child || !this._isValid(child) || this._hasFlag(child, this._flagHideInHierarchy)) {
				continue;
			}
			const base = sanitizeName(child.name);
			let name;
			if (taken.has(base)) {
				const count = taken.get(base) + 1;
				taken.set(base, count);
				name = `${base}_${pad3(count)}`;
			} else {
				taken.set(base, 0);
				name = base;
			}
			out.push([child, name]);
		}
		return out;
	}

	// ---- INodeTreeItem 构造 ------------------------------------------------

	_buildTreeItem(node, mgrPath) {
		const isScene = this._isScene(node);
		let name = node.name;
		if ((!name || name.length === 0) && isScene) {
			name = 'Scene';
		}
		const children = this._visibleChildrenWithNames(node).map(([child, childName]) => {
			const childPath = mgrPath === '' ? childName : `${mgrPath}/${childName}`;
			return this._buildTreeItem(child, childPath);
		});
		return {
			name,
			active: !!node.active,
			locked: this._hasFlag(node, this._flagLockedInEditor),
			type: this._typeName(node),
			uuid: node.uuid,
			children,
			prefab: DEFAULT_PREFAB_INFO,
			parent: (node.parent && node.parent.uuid) || '',
			path: isScene ? '/' : mgrPath,
			isScene,
			readonly: false,
			components: this._buildComponents(node),
		};
	}

	_buildComponents(node) {
		const comps = (node && node.components) || node._components || [];
		const out = [];
		for (const comp of comps) {
			if (!comp) {
				continue;
			}
			const ctor = comp.constructor;
			const className = this._className(ctor) || 'cc.Component';
			out.push({
				isCustom: !className.startsWith('cc.'),
				type: className,
				value: comp.uuid,
				extends: this._inheritanceChain(ctor),
			});
		}
		return out;
	}

	_inheritanceChain(ctor) {
		const chain = [];
		let cur = ctor;
		let guard = 0;
		while (cur && guard++ < 50) {
			const name = this._className(cur);
			if (!name || name === 'Object') {
				break;
			}
			chain.push(name);
			if (name === 'cc.Component' || name === 'cc.Object') {
				break;
			}
			cur = cur.$super || Object.getPrototypeOf(cur);
		}
		return chain;
	}

	// ---- dump 元信息辅助(对齐编辑器 encode.ts)------------------------------

	/** 从 cc.Layers.Enum 生成 layer 枚举清单(对齐 encode.ts:70-75)。运行时取不到则返回空数组。 */
	_buildLayersEnumList() {
		const Layers = this._cc.Layers;
		const list = [];
		if (Layers && Layers.Enum) {
			for (const key of Object.keys(Layers.Enum)) {
				const value = Layers.Enum[key];
				if (typeof value === 'number') {
					list.push({ name: key, value });
				}
			}
			list.sort((a, b) => a.value - b.value);
		}
		return list;
	}

	/** 从 cc.MobilityMode 生成 mobility 枚举清单(对齐 encode.ts:77-79)。运行时取不到则返回空数组。 */
	_buildMobilityEnumList() {
		const MobilityMode = this._cc.MobilityMode;
		const list = [];
		if (MobilityMode) {
			for (const key of Object.keys(MobilityMode)) {
				const value = MobilityMode[key];
				if (typeof value === 'number') {
					list.push({ name: key, value });
				}
			}
		}
		return list;
	}

	/** 把 meta 中已定义的字段合并进 IProperty(用于给内置属性补 enumList/default/displayName 等)。 */
	_withMeta(prop, meta) {
		if (meta) {
			for (const key of Object.keys(meta)) {
				if (meta[key] !== undefined) {
					prop[key] = meta[key];
				}
			}
		}
		return prop;
	}

	/**
	 * 逐属性填充 `.path`(语义对齐 encode.ts:197-214)。
	 * 这是「预览态改属性生效」的关键:面板 web 侧无 path 会直接早退,setProperty 不会发出。
	 * - 顶层 IProperty(形如 {type,value}):path = key
	 * - 组件(includeComponents):comp.path = '__comps__.{i}';comp.value[key].path = '__comps__.{i}.{key}'
	 */
	_fillDumpPaths(data, includeComponents) {
		for (const [key, val] of Object.entries(data)) {
			if (val && typeof val === 'object' && !Array.isArray(val) && 'type' in val && 'value' in val) {
				val.path = key;
			}
		}
		if (includeComponents && Array.isArray(data.__comps__)) {
			data.__comps__.forEach((comp, index) => {
				if (!comp) {
					return;
				}
				comp.path = '__comps__.' + index;
				if (comp.value && typeof comp.value === 'object' && !Array.isArray(comp.value)) {
					for (const [key, prop] of Object.entries(comp.value)) {
						if (prop && typeof prop === 'object' && !Array.isArray(prop) && 'type' in prop && 'value' in prop) {
							prop.path = '__comps__.' + index + '.' + key;
						}
					}
				}
			});
		}
		return data;
	}

	/** 组件 editor 附加数据(尽力而为:运行时能拿到 icon/help 就给,拿不到给空串;对齐 encode.ts:352-363)。 */
	_componentEditor(ctor, comp) {
		return {
			inspector: (ctor && ctor._inspector) || '',
			icon: (ctor && ctor._icon) || '',
			help: (ctor && ctor._help) || '',
			_showTick:
				typeof comp.start === 'function' ||
				typeof comp.update === 'function' ||
				typeof comp.lateUpdate === 'function' ||
				typeof comp.onEnable === 'function' ||
				typeof comp.onDisable === 'function',
		};
	}

	// ---- INode / IComponent 完整 dump(IProperty 形态)------------------------

	_dumpNode(node, mgrPath, includeComponents) {
		const comps = (node.components) || node._components || [];
		// layer/mobility 尽量对齐编辑态的枚举下拉;运行时取不到枚举清单时回退成普通 Number 字段,避免空下拉。
		const layerProp = this._layersEnumList.length
			? this._withMeta(this._prop(node.layer, 'Enum'), { enumList: this._layersEnumList, default: 1073741824, displayName: 'Layer', animatable: false })
			: this._withMeta(this._prop(node.layer, 'Number'), { displayName: 'Layer', animatable: false });
		const mobilityVal = node.mobility != null ? node.mobility : 0;
		const mobilityProp = this._mobilityEnumList.length
			? this._withMeta(this._prop(mobilityVal, 'Enum'), { enumList: this._mobilityEnumList, default: 0, displayName: 'Mobility' })
			: this._withMeta(this._prop(mobilityVal, 'Number'), { displayName: 'Mobility' });
		const data = {
			path: mgrPath,
			__type__: this._typeName(node),
			// 预览态只读标志(顶层普通布尔,非 IProperty):M5 起组件级写操作(增删/reset/排序/整包粘贴)已支持,
			// Inspector 据此在预览态显示组件 kebab 菜单;该标志此后仅门控节点级菜单(node.reset-property 等仍不支持)。
			readonly: true,
			name: this._withMeta(this._prop(node.name, 'String'), { displayName: 'Name', animatable: false }),
			// active/locked 用作 section 头部复选框(visible:false 不作为字段单独渲染),对齐 encode.ts:88-89。
			active: this._withMeta(this._prop(!!node.active, 'Boolean'), { displayName: 'Active', visible: false }),
			locked: this._withMeta(this._prop(this._hasFlag(node, this._flagLockedInEditor), 'Boolean'), { displayName: 'Locked', animatable: false, visible: false }),
			position: this._withMeta(this._propValueType(node.position, 'cc.Vec3'), { displayName: 'Position', default: { x: 0, y: 0, z: 0 } }),
			rotation: this._withMeta(this._propValueType(node.eulerAngles, 'cc.Vec3'), { displayName: 'Rotation', default: { x: 0, y: 0, z: 0 } }),
			scale: this._withMeta(this._propValueType(node.scale, 'cc.Vec3'), { displayName: 'Scale', default: { x: 1, y: 1, z: 1 } }),
			mobility: mobilityProp,
			layer: layerProp,
			uuid: this._withMeta(this._prop(node.uuid, 'String'), { displayName: 'UUID', animatable: false }),
			parent: this._propRef(node.parent, 'cc.Node'),
			children: this._visibleChildrenWithNames(node).map(([child]) => this._propRef(child, 'cc.Node')),
			__comps__: includeComponents ? this._dumpComponentsWithPaths(comps, mgrPath) : [],
		};
		// 关键:逐属性填 path(含组件属性),否则面板 web 侧无 path 会早退、setProperty 不发出。
		return this._fillDumpPaths(data, includeComponents);
	}

	_dumpScene(scene) {
		const data = {
			name: this._withMeta(this._prop(scene.name || 'Scene', 'String'), { displayName: 'Name' }),
			active: this._withMeta(this._prop(!!scene.active, 'Boolean'), { displayName: 'Active', visible: false }),
			locked: this._withMeta(this._prop(false, 'Boolean'), { displayName: 'Locked', visible: false }),
			uuid: this._withMeta(this._prop(scene.uuid, 'String'), { displayName: 'UUID', visible: false }),
			autoReleaseAssets: this._withMeta(this._prop(!!scene.autoReleaseAssets, 'Boolean'), { displayName: 'Auto Release Assets' }),
			children: this._visibleChildrenWithNames(scene).map(([child]) => this._propRef(child, 'cc.Node')),
			parent: '',
			isScene: true,
			__type__: 'cc.Scene',
			_globals: {},
		};
		return this._fillDumpPaths(data, false);
	}

	/**
	 * 同级去重的组件 target 名(`ClassName` / `ClassName_001`),与 comps 数组的非空组件顺序一一对应。
	 * `_dumpNode`(节点 dump 挂 component_path)与 `_resolveComponentByPath`(按 target 路径反查组件)共用,
	 * 保证面板挂的路径与菜单定位用的路径永不漂移。
	 */
	_componentTargetNames(comps) {
		const taken = new Map();
		const names = [];
		for (const comp of comps) {
			if (!comp) {
				continue;
			}
			const base = this._className(comp.constructor) || 'cc.Component';
			if (taken.has(base)) {
				const count = taken.get(base) + 1;
				taken.set(base, count);
				names.push(`${base}_${pad3(count)}`);
			} else {
				taken.set(base, 0);
				names.push(base);
			}
		}
		return names;
	}

	/** M5:逐个带 target 路径(`节点路径/ClassName_NNN`)dump 组件,供 Inspector kebab 菜单直接用 component_path 驱动 remove/reset 等。 */
	_dumpComponentsWithPaths(comps, mgrPath) {
		const names = this._componentTargetNames(comps);
		const prefix = mgrPath ? `${mgrPath}/` : '';
		const out = [];
		let named = 0;
		for (const comp of comps) {
			if (!comp) {
				continue;
			}
			out.push(this._dumpComponent(comp, `${prefix}${names[named++]}`));
		}
		return out;
	}

	_dumpComponent(comp, path) {
		const ctor = comp.constructor;
		const className = this._className(ctor) || 'cc.Component';
		// enabled/uuid/name 是组件序列化骨架(对齐编辑态 encodeComponent 的 visible:false):
		// enabled 供 section 头部复选框读取,uuid/name 不作为字段单独渲染,否则会像预览降级那样外露成原始行。
		const value = {
			enabled: this._withMeta(this._prop(!!comp.enabled, 'Boolean'), { visible: false }),
			uuid: this._withMeta(this._prop(comp.uuid, 'String'), { visible: false }),
			name: this._withMeta(this._prop(className, 'String'), { visible: false }),
		};
		// 遍历序列化 props(与编辑器 encodeComponent 一致:含 _xxx,按 attrs.visible 过滤)。
		const props = (ctor && ctor.__props__) || [];
		for (const key of props) {
			if (key === 'enabled' || key === 'uuid' || key === 'name') {
				continue;
			}
			let attrs = {};
			try {
				attrs = this._cc.Class && typeof this._cc.Class.attr === 'function' ? (this._cc.Class.attr(comp, key) || {}) : {};
			} catch {
				attrs = {};
			}
			// 函数式 visible(如 cc.Label 的 outline/shadow/font 子字段 visible:()=>this._enableOutline)
			// 必须以组件实例求值(对齐 encode.ts _checkFuncAttribute),否则这些编辑态本应隐藏的条件字段会全部外露。
			const vis = this._evalVisible(attrs, comp);
			if (vis === false) {
				continue;
			}
			try {
				const encoded = this._encodeProp(comp[key], attrs);
				// 面板标签取自 dump.displayName ?? dump.name ?? propertyKey;但组件专属面板(如 cc.Label.tsx)
				// 调 DumpField 时不传 propertyKey,只能靠 dump.name。编辑态 encode.ts 给每个 prop 都写了 name,
				// 预览这里必须对齐,否则专属面板里的属性标签会整列空白。
				encoded.name = key;
				// _decorate 只透传布尔 visible;函数式已在上面求值,这里把结果覆盖回去(undefined 则删除,面板默认可见)。
				if (vis === undefined) {
					delete encoded.visible;
				} else {
					encoded.visible = vis;
				}
				value[key] = encoded;
			} catch {
				// 单个属性(可能是抛异常的 getter/循环引用)编码失败不应拖垮整个组件 dump。
			}
		}
		// __scriptAsset:cc.Component 基类的只读 getter(@displayName('Script') @type(Script)),
		// DEV/预览构建下进入 __props__,被上面当普通 null 引用编码 → 内置组件也外露成 "Script" Null/Create 行。
		// 对齐编辑态 encodeComponent(encode.ts:365-379):无脚本则隐藏,有脚本则填脚本 uuid + displayOrder:-999。
		if (Object.prototype.hasOwnProperty.call(value, '__scriptAsset')) {
			const scriptUuid = this._scriptUuid(comp);
			const sa = value.__scriptAsset || {};
			if (scriptUuid) {
				sa.value = { uuid: scriptUuid };
				sa.type = (sa.type && sa.type !== 'Unknown') ? sa.type : 'cc.Script';
				sa.extends = (sa.extends && sa.extends.length) ? sa.extends : ['cc.Script', 'cc.Asset'];
				sa.visible = true;
				sa.displayOrder = -999;
			} else {
				// 内置组件(cc.UITransform/cc.Sprite…)本就无脚本:隐藏空 Script 行。
				// 但用户脚本组件走到这里说明 uuid 没认出来(classId 不是 uuid 形状),
				// 静默隐藏会让人以为面板漏了字段,故按类名去重告警一次。
				sa.visible = false;
				if (className && className.indexOf('cc.') !== 0 && !this._scriptUuidWarned.has(className)) {
					this._scriptUuidWarned.add(className);
					this._emit('view:log', {
						level: 'warn',
						message: `[preview-inspect] cannot resolve script asset uuid for '${className}'; the Script row is hidden`,
					});
				}
			}
			value.__scriptAsset = sa;
		}
		const dump = {
			type: className,
			value,
			extends: this._inheritanceChain(ctor),
			// cid 用于面板选择组件专属渲染器 / kebab 菜单;缺失会退回通用面板。
			cid: (comp.__cid__) || (ctor && ctor.__cid__) || '',
			readonly: false,
			visible: true,
			editor: this._componentEditor(ctor, comp),
		};
		if (path) {
			dump.component_path = path;
		}
		return dump;
	}

	/**
	 * best-effort 取组件绑定的脚本 uuid,并归一成 **asset-db 的带短横形式**。
	 *
	 * 内置组件(cc.Xxx)无脚本 → ''。用户脚本组件:优先 `comp.__scriptUuid`(编辑器构建才注入),
	 * 否则取 classId —— 用户脚本的 classId 就是压缩后的脚本 uuid(editor-extends 的 MissingReporter
	 * 也是这么反查的:`isUUID(classId)` → `decompressUUID(classId)`)。
	 *
	 * 两侧都要过 `_normalizeAssetUuid`:压缩形式解压出来是 32 位无短横 uuid,而面板的资源选择器是拿
	 * asset-db 的**带短横** uuid 做严格相等匹配的,少这一步 Script 一栏就会红字 "Missing"。
	 */
	_scriptUuid(comp) {
		if (!comp) {
			return '';
		}
		if (typeof comp.__scriptUuid === 'string' && comp.__scriptUuid) {
			// 编辑器构建注入的值通常已是带短横 uuid;仍过一遍归一,避免个别构建给的是压缩形式。
			return this._normalizeAssetUuid(comp.__scriptUuid);
		}
		try {
			const ctor = comp.constructor;
			const className = this._className(ctor) || '';
			if (!className || className.indexOf('cc.') === 0) {
				return ''; // 内置类,无脚本。
			}
			const js = this._cc.js;
			const cid = (js && typeof js.getClassId === 'function') ? js.getClassId(ctor) : (ctor && ctor.__cid__);
			if (typeof cid !== 'string' || !cid) {
				return '';
			}
			return this._normalizeAssetUuid(cid);
		} catch {
			return '';
		}
	}

	/**
	 * 任意 uuid 形态 → asset-db 的带短横 uuid;认不出来则返回 ''(调用方据此隐藏 Script 行,
	 * 而不是丢一个查不到的 uuid 给面板渲染成红字 "Missing")。
	 *
	 * 认得的输入:带短横 36 位(原样)、32 位无短横(补短横)、22/23 位压缩 base64(解压 + 补短横),
	 * 以及上述压缩形式带 `@子资源` 后缀。解压这一步的输出形态随实现来源而变:本地移植版给出 32 位
	 * 无短横,而预览页加载的 `EditorExtends.UuidUtils.decompressUUID` 给出 36 位带短横——两种都要认。
	 * `ccclass('Foo')` 这种手写类名的 classId 不是 uuid 形状 → ''。
	 */
	_normalizeAssetUuid(raw) {
		if (typeof raw !== 'string' || !raw) {
			return '';
		}
		// 子资源后缀原样保留(脚本资源不会有,但同一归一函数也被别处复用时才不会踩坑)。
		let suffix = '';
		let body = raw;
		const sub = raw.match(REG_UUID_COMPRESSED_SUB);
		if (sub) {
			body = sub[1];
			suffix = sub[2];
		}
		if (REG_UUID_DASHED.test(body)) {
			return body + suffix;
		}
		if (REG_UUID_COMPRESSED.test(body)) {
			body = this._decompressUuid(body);
		}
		// `_decompressUuid` 的返回形态随实现来源而变:本地移植版产出 32 位无短横(走下面的
		// normalized 分支补短横);但预览页会加载 editor-extends.bundle.js,其 `UuidUtils.decompressUUID`
		// 直接返回 **36 位带短横**形式(逐字对齐引擎 decompressNormalUuid 末尾的 join('-'))。
		// 旧实现解压后只判 32 位无短横,带短横形态匹配不上 → 漏判成 '' → `_scriptUuid` 返回空 →
		// Script 行被隐藏。这正是「Preview in Editor 后挂自定义脚本的节点 Script 一栏消失、编辑态正常」
		// 的根因(编辑态 encode.ts 直接读引擎注入的 __scriptUuid,不经此函数)。故解压后再判一次 dashed。
		if (REG_UUID_DASHED.test(body)) {
			return body + suffix;
		}
		if (REG_UUID_NORMALIZED.test(body)) {
			return `${body.slice(0, 8)}-${body.slice(8, 12)}-${body.slice(12, 16)}-${body.slice(16, 20)}-${body.slice(20, 32)}${suffix}`;
		}
		return '';
	}

	/**
	 * 压缩 uuid(22/23 位 base64)→ uuid(32 位无短横 或 36 位带短横,取决于实现来源)。
	 *
	 * 优先用 EditorExtends 的权威实现(预览页会加载 editor-extends.bundle.js,`UuidUtils.decompressUUID`
	 * 可用,返回 **36 位带短横**形式),缺失时用本地移植版(逐字对齐 decompressNormalUuid 的 hex 部分,
	 * 返回 **32 位无短横**)。两种返回形态都由调用方 `_normalizeAssetUuid` 兜住(解压后复判 dashed / normalized),
	 * 故不因 EditorExtends 缺席或其返回形态差异而失效。
	 */
	_decompressUuid(compressed) {
		const authoritative = this._editorExtends && this._editorExtends.UuidUtils;
		if (authoritative && typeof authoritative.decompressUUID === 'function') {
			try {
				const out = authoritative.decompressUUID(compressed);
				if (typeof out === 'string' && out) {
					return out;
				}
			} catch {
				/* 落到本地实现 */
			}
		}
		// 23 位:前 5 位保留 + 后 18 位 base64 解成 27 个 hex;22 位(min):前 2 位保留 + 后 20 位解成 30 个 hex。
		const keep = compressed.length === 23 ? 5 : 2;
		const hexChars = [];
		for (let i = keep; i < compressed.length; i += 2) {
			const lhs = UUID_ASCII_TO_64[compressed.charCodeAt(i)];
			const rhs = UUID_ASCII_TO_64[compressed.charCodeAt(i + 1)];
			hexChars.push((lhs >> 2).toString(16));
			hexChars.push((((lhs & 3) << 2) | (rhs >> 4)).toString(16));
			hexChars.push((rhs & 0xF).toString(16));
		}
		return compressed.slice(0, keep) + hexChars.join('');
	}

	// ---- IProperty 编码 -----------------------------------------------------

	_prop(value, type) {
		return { value, type };
	}

	_propValueType(vt, type) {
		return { value: this._valueTypeToPlain(vt), type };
	}

	_propRef(node, type) {
		return { value: { uuid: (node && node.uuid) || '' }, type };
	}

	_encodeProp(value, attrs) {
		let prop;
		if (attrs && (attrs.type === 'Enum' || attrs.enumList)) {
			prop = { value: typeof value === 'number' ? value : 0, type: 'Enum' };
			if (attrs.enumList) {
				prop.enumList = attrs.enumList;
			}
			return this._decorate(prop, attrs);
		}
		// 位掩码(改动六):对齐 encode.ts:439-440(!ctor && attrs.type 用字符串覆写),BitMask 值是 number,
		// 缺此分支会退化成普通数字框而非位掩码多选(如 Camera.visibility、Light 阴影 flags)。
		if (attrs && (attrs.type === 'BitMask' || attrs.bitmaskList)) {
			prop = { value: typeof value === 'number' ? value : 0, type: 'BitMask' };
			if (attrs.bitmaskList) {
				prop.bitmaskList = attrs.bitmaskList;
			}
			return this._decorate(prop, attrs);
		}
		// 数组(改动六):对齐 encode.ts,设 isArray + 逐元素编码。面板 getElementType 靠 isArray
		// 路由到 Array 控件;缺 isArray 的数组值会落到 'Unknown'(cc.MeshRenderer 的 Materials
		// = sharedMaterials 返回数组,即因此退化成 "Unknown Type")。
		if (Array.isArray(value)) {
			const elemCtor = attrs && attrs.ctor;
			const arr = [];
			for (let i = 0; i < value.length; i++) {
				const item = value[i];
				// 元素类型:非空取自身构造器,空引用沿用父级 @type 的元素 ctor(如 [Material])。
				const itemAttrs = { ctor: (item && item.constructor) || elemCtor };
				arr.push(this._encodeProp(item, itemAttrs));
			}
			prop = { value: arr, type: this._className(elemCtor) || 'Unknown', isArray: true };
			const decorated = this._decorate(prop, attrs);
			// 面板 getElementType 对数组:若 default 存在且非数组会强制判成 'Unknown'(dump-field L158)。
			// _decorate 只透传标量/null 型 default,对数组属性无意义且会踩此陷阱,故一律去掉。
			if (decorated.default !== undefined && !Array.isArray(decorated.default)) {
				delete decorated.default;
			}
			return decorated;
		}
		const t = typeof value;
		if (t === 'number') {
			prop = { value, type: 'Number' };
		} else if (t === 'string') {
			prop = { value, type: 'String' };
		} else if (t === 'boolean') {
			prop = { value, type: 'Boolean' };
		} else if (value == null) {
			// 空引用:运行时构建裁剪了编辑器元数据,但 attrs.ctor(反序列化所需,如 cc.Material/cc.SpriteFrame/cc.Node)
			// 不受门控。关键在于面板 getElementType 判具体资源子类靠 extends 继承链(含 'cc.Asset' 才提升为资源
			// 选择器),光有 type 不够;且资源选择器读 value.uuid,故 value 归一为 {uuid:''}(对齐编辑态 asset-dump)。
			const refCtor = attrs && attrs.ctor;
			if (refCtor) {
				prop = { value: { uuid: '' }, type: this._className(refCtor) || 'cc.Object', extends: this._inheritanceChain(refCtor) };
			} else {
				prop = { value: null, type: 'Unknown' };
			}
		} else if (this._isValueType(value)) {
			prop = { value: this._valueTypeToPlain(value), type: this._className(value.constructor) || 'cc.ValueType' };
		} else if (this._cc.Node && value instanceof this._cc.Node) {
			prop = { value: { uuid: value.uuid }, type: 'cc.Node', extends: this._inheritanceChain(value.constructor) };
		} else if (this._cc.Component && value instanceof this._cc.Component) {
			prop = { value: { uuid: value.uuid }, type: this._className(value.constructor) || 'cc.Component', extends: this._inheritanceChain(value.constructor) };
		} else if (this._cc.Asset && value instanceof this._cc.Asset) {
			// 非空资源:补 extends(否则 getElementType 落到 'cc.Object' 通用可展开对象,而非资源选择器)。
			prop = { value: { uuid: value._uuid || value.uuid || '' }, type: this._className(value.constructor) || 'cc.Asset', extends: this._inheritanceChain(value.constructor) };
		} else {
			// 嵌套可序列化 @ccclass 对象(改动六):如 cc.ModelBakeSettings(Bake Settings)。
			// 递归子属性成 {key: IProperty},面板据 value 非空 + 未知类型渲染为可展开 cc.Object;
			// 缺递归时裸实例过桥序列化会丢方法/退化,呈现成 "Null" + Create。
			const objCtor = value && value.constructor;
			if (objCtor && Array.isArray(objCtor.__props__)) {
				prop = {
					value: this._encodeNested(value, objCtor),
					type: this._className(objCtor) || 'cc.Object',
					extends: this._inheritanceChain(objCtor),
				};
			} else {
				prop = { value, type: (attrs && attrs.type) || 'Object' };
			}
		}
		return this._decorate(prop, attrs);
	}

	/**
	 * 递归编码嵌套 @ccclass 对象的子属性(键→IProperty),复用组件属性的可见性/标签规则
	 * (对齐 encode.ts 的 __props__ 递归):跳过 visible:false、函数式 visible 以对象为 this 求值、
	 * 每个子属性补 name=key(修标签)。子属性读取/编码失败则跳过,避免中断整体 dump。
	 */
	_encodeNested(obj, ctor) {
		const out = {};
		const props = (ctor && ctor.__props__) || [];
		for (const key of props) {
			let attrs = {};
			try {
				attrs = (this._cc.Class && typeof this._cc.Class.attr === 'function') ? (this._cc.Class.attr(obj, key) || {}) : {};
			} catch {
				attrs = {};
			}
			const vis = this._evalVisible(attrs, obj);
			if (vis === false) {
				continue;
			}
			try {
				const encoded = this._encodeProp(obj[key], attrs);
				encoded.name = key;
				if (vis === undefined) {
					delete encoded.visible;
				} else {
					encoded.visible = vis;
				}
				out[key] = encoded;
			} catch {
				/* 子属性读取/编码失败则跳过 */
			}
		}
		return out;
	}

	_evalVisible(attrs, owner) {
		if (!attrs || attrs.visible === undefined) {
			return undefined;
		}
		if (typeof attrs.visible === 'function') {
			// 条件可见函数以组件实例为 this 求值(对齐 encode.ts 的 _checkFuncAttribute)。
			try {
				return !!attrs.visible.call(owner);
			} catch {
				return undefined;
			}
		}
		return attrs.visible;
	}

	_decorate(prop, attrs) {
		if (!attrs) {
			return prop;
		}
		// 透传 cc.Class.attr 里存在的属性描述(对齐 encode.ts 的 attributeProps),
		// 恢复数值滑块/单位/角度、分组 Tab、字段排序、枚举下拉、多行文本等控件形态。
		for (const name of PREVIEW_ATTRIBUTE_PROPS) {
			if (Object.prototype.hasOwnProperty.call(attrs, name) && attrs[name] !== undefined) {
				prop[name] = attrs[name];
			}
		}
		if (attrs.readonly) {
			prop.readonly = true;
		}
		// 仅有 getter 没有 setter 视为只读(对齐 encode.ts 的 _checkAttributes)。
		if (attrs.hasGetter && !attrs.hasSetter) {
			prop.readonly = true;
		}
		// visible 可能是布尔或函数(条件可见)。函数交由 _dumpComponent 以组件实例求值后覆盖;
		// 这里只透传布尔,避免把函数原样塞进 prop.visible(会被面板当真值)。
		if (typeof attrs.visible === 'boolean') {
			prop.visible = attrs.visible;
		}
		// default 仅透传标量/null(用于 revert/重置判断);对象/函数型 default 可能与 value 类型不匹配,
		// 会被面板判成 Unknown 类型(见 dump-field checkValueMatchType),故谨慎跳过。
		if (attrs.default !== undefined) {
			const dt = typeof attrs.default;
			if (attrs.default === null || dt === 'number' || dt === 'string' || dt === 'boolean') {
				prop.default = attrs.default;
			}
		}
		return prop;
	}

	_isValueType(value) {
		return Boolean(this._cc.ValueType && value instanceof this._cc.ValueType);
	}

	/** ValueType → 纯数值对象(不依赖 EditorExtends.serialize;对齐 value-type-dump.decode 的逐 prop 拷贝)。 */
	_valueTypeToPlain(vt) {
		const out = {};
		if (!vt) {
			return out;
		}
		const ctor = vt.constructor;
		const props = (ctor && ctor.__props__) || [];
		if (props.length) {
			for (const k of props) {
				if (typeof vt[k] === 'number') {
					out[k] = vt[k];
				}
			}
			if (Object.keys(out).length > 0) {
				return out;
			}
		}
		for (const k of ['x', 'y', 'z', 'w', 'r', 'g', 'b', 'a', 'width', 'height']) {
			if (typeof vt[k] === 'number') {
				out[k] = vt[k];
			}
		}
		return out;
	}

	// ---- 引擎适配小工具 ----------------------------------------------------

	_getScene() {
		const director = this._cc.director;
		const scene = director && director.getScene && director.getScene();
		return scene && this._isValid(scene) ? scene : null;
	}

	_isValid(obj) {
		return typeof this._cc.isValid === 'function' ? this._cc.isValid(obj) : !!obj;
	}

	_isScene(node) {
		if (this._cc.Scene && node instanceof this._cc.Scene) {
			return true;
		}
		return this._typeName(node) === 'cc.Scene';
	}

	/** 优先用 cc.js.getClassName(抗压缩混淆),回退 constructor.name。 */
	_typeName(node) {
		const viaClass = this._className(node && node.constructor);
		if (viaClass) {
			return viaClass;
		}
		const ctorName = node && node.constructor && node.constructor.name;
		return ctorName ? `cc.${ctorName}` : 'cc.Node';
	}

	_className(ctor) {
		if (!ctor) {
			return '';
		}
		const js = this._cc.js;
		if (js && typeof js.getClassName === 'function') {
			try {
				return js.getClassName(ctor) || '';
			} catch {
				return '';
			}
		}
		return ctor.name || '';
	}

	_hasFlag(node, flag) {
		if (!flag) {
			return false;
		}
		const objFlags = node && (node._objFlags != null ? node._objFlags : node.objFlags);
		return Boolean((objFlags || 0) & flag);
	}

	_siblingIndex(node) {
		if (node && typeof node.getSiblingIndex === 'function') {
			try {
				return node.getSiblingIndex();
			} catch {
				/* fallthrough */
			}
		}
		const parent = node && node.parent;
		if (parent && parent.children) {
			return parent.children.indexOf(node);
		}
		return -1;
	}

	_displayPath(mgrPath) {
		return mgrPath === '' ? '/' : mgrPath;
	}

	_emit(type, payload) {
		if (this._sink && !this._disposed) {
			this._sink(type, payload);
		}
	}
}
