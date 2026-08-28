/* global window, globalThis, requestAnimationFrame, cancelAnimationFrame, performance */

/**
 * 预览运行时 Inspect Agent(M1:只读 Hierarchy + selection + 结构 liveness)。
 *
 * 由 previewMain 在 game-boot 跑起启动场景后装配,直接读活 `cc.director` 的场景图,
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
		const taken = new Map();
		for (const comp of comps) {
			if (!comp) {
				continue;
			}
			const base = this._className(comp.constructor) || 'cc.Component';
			let name;
			if (taken.has(base)) {
				const count = taken.get(base) + 1;
				taken.set(base, count);
				name = `${base}_${pad3(count)}`;
			} else {
				taken.set(base, 0);
				name = base;
			}
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
		} else if (!this._applyValueByPath(node, rawPath, dump)) {
			throw new Error(`preview set-property: failed to apply '${rawPath}' on '${nodePath}'`);
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
			// 预览态只读标志(顶层普通布尔,非 IProperty):Inspector 据此禁用 Add Component / 组件·节点 kebab 菜单
			// (组件增删、reset、粘贴等未实现的写操作),避免用户触发后撞到「预览暂不支持」并弹错误 toast(M4 capability)。
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
			__comps__: includeComponents ? comps.filter(c => c).map(c => this._dumpComponent(c, undefined)) : [],
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
				sa.visible = false; // 内置组件(cc.UITransform/cc.Sprite…):隐藏空 Script 行。
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
	 * best-effort 取组件绑定的脚本 uuid(对齐编辑态所读的 __scriptUuid)。
	 * 内置组件(cc.Xxx)无脚本 → ''。用户脚本组件:优先 comp.__scriptUuid(DEV 构建常存在);
	 * 否则用「类 id 形如 uuid 且类名非 cc.* 前缀」的启发式,必要时 decompressUuid 还原完整 uuid。
	 */
	_scriptUuid(comp) {
		if (!comp) {
			return '';
		}
		if (typeof comp.__scriptUuid === 'string' && comp.__scriptUuid) {
			return comp.__scriptUuid;
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
			// 用户脚本组件的 classId 即压缩后的脚本 uuid;还原为标准 uuid 供面板解析。
			if (js && typeof js.decompressUuid === 'function') {
				try {
					return js.decompressUuid(cid) || cid;
				} catch {
					return cid;
				}
			}
			return cid;
		} catch {
			return '';
		}
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
