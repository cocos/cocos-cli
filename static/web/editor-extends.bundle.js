(async function() {
function _mergeNamespaces(n, m) {
	m.forEach(function (e) {
		e && typeof e !== 'string' && !Array.isArray(e) && Object.keys(e).forEach(function (k) {
			if (k !== 'default' && !(k in n)) {
				var d = Object.getOwnPropertyDescriptor(e, k);
				Object.defineProperty(n, k, d.get ? d : {
					enumerable: true,
					get: function () { return e[k]; }
				});
			}
		});
	});
	return Object.freeze(n);
}

var commonjsGlobal = typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

function getDefaultExportFromCjs (x) {
	return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
}

function getAugmentedNamespace(n) {
  if (n.__esModule) return n;
  var f = n.default;
	if (typeof f == "function") {
		var a = function a () {
			if (this instanceof a) {
        return Reflect.construct(f, arguments, this.constructor);
			}
			return f.apply(this, arguments);
		};
		a.prototype = f.prototype;
  } else a = {};
  Object.defineProperty(a, '__esModule', {value: true});
	Object.keys(n).forEach(function (k) {
		var d = Object.getOwnPropertyDescriptor(n, k);
		Object.defineProperty(a, k, d.get ? d : {
			enumerable: true,
			get: function () {
				return n[k];
			}
		});
	});
	return a;
}

var editorExtends = {};

var missingClassReporter = {};

var _eeStubEmpty = {};

var _eeStubEmpty$1 = /*#__PURE__*/Object.freeze({
	__proto__: null,
	'default': _eeStubEmpty
});

var require$$4 = /*@__PURE__*/getAugmentedNamespace(_eeStubEmpty$1);

var objectWalker = {};

Object.defineProperty(objectWalker, "__esModule", { value: true });
objectWalker.ObjectWalker = objectWalker.ObjectWalkerBehavior = void 0;
objectWalker.walk = walk;
objectWalker.walkProperties = walkProperties;
objectWalker.getNextProperty = getNextProperty;
// ObjectWalkerBehavior
class ObjectWalkerBehavior {
    walk(obj, key, val) { }
    root;
    constructor(root) {
        this.root = root;
    }
    parseObject(val) {
        if (Array.isArray(val)) {
            this.forEach(val);
        }
        else {
            const klass = val.constructor;
            if (val instanceof cc.Asset || // skip Asset
                (klass !== Object && !cc.js.getClassId(val, false)) // skip non-serializable or other type objects
            ) {
                if (val !== this.root) {
                    return;
                }
            }
            const props = klass && klass.__props__;
            if (props) {
                // CCClass or fastDefine
                this.parseCCClass(val, klass, props);
            }
            else {
                this.forIn(val);
            }
        }
    }
    parseCCClass(val, klass, props) {
        const attrs = cc.Class.Attr.getClassAttrs(klass);
        for (let i = 0; i < props.length; i++) {
            const prop = props[i];
            if (attrs[prop + cc.Class.Attr.DELIMETER + 'serializable'] === false) {
                continue;
            }
            this.walk(val, prop, val[prop]);
        }
    }
    forIn(val) {
        for (const key in val) {
            if (
            // eslint-disable-next-line no-prototype-builtins
            val.hasOwnProperty(key) &&
                (key.charCodeAt(0) !== 95 || key.charCodeAt(1) !== 95) // not starts with __
            ) {
                this.walk(val, key, val[key]);
            }
        }
    }
    forEach(val) {
        for (let i = 0, len = val.length; i < len; ++i) {
            this.walk(val, '' + i, val[i]);
        }
    }
}
objectWalker.ObjectWalkerBehavior = ObjectWalkerBehavior;
// ObjectWalker
// Traverse all objects recursively.
// Each object will be navigated only once in the value parameter in callback.
class ObjectWalker$2 extends ObjectWalkerBehavior {
    iteratee;
    parsedObjects;
    parsedKeys;
    ignoreParent;
    ignoreSubPrefabHelper;
    walked = new Set();
    constructor(root, iteratee, options) {
        super(root);
        this.iteratee = iteratee;
        this.parsedObjects = [];
        this.parsedKeys = [];
        this.walked.add(root);
        this.ignoreParent = options && options.ignoreParent;
        this.ignoreSubPrefabHelper = options && options.ignoreSubPrefabHelper;
        if (this.ignoreParent) {
            if (this.root instanceof cc.Component) {
                this.ignoreParent = this.root.node;
            }
            else if (this.root instanceof cc.Node) {
                this.ignoreParent = this.root;
            }
            else {
                return cc.error('can only ignore parent of scene node');
            }
        }
        this.parseObject(root);
    }
    walk(obj, key, val) {
        const isObj = val && typeof val === 'object';
        if (isObj) {
            if (this.walked.has(val)) {
                return;
            }
            if (this.ignoreParent) {
                if (val instanceof cc.Node) {
                    if (!val.isChildOf(this.ignoreParent)) {
                        return;
                    }
                }
                else if (val instanceof cc.Component) {
                    if (!val.node.isChildOf(this.ignoreParent)) {
                        return;
                    }
                }
            }
            if (this.ignoreSubPrefabHelper && val instanceof cc._PrefabInfo && val.root !== obj) {
                return;
            }
            this.walked.add(val);
            this.iteratee(obj, key, val, this.parsedObjects, this.parsedKeys);
            this.parsedObjects.push(obj);
            this.parsedKeys.push(key);
            this.parseObject(val);
            this.parsedObjects.pop();
            this.parsedKeys.pop();
        }
    }
}
objectWalker.ObjectWalker = ObjectWalker$2;
// FACADE
/**
 * Traverse all objects recursively
 * @param {Object} root
 * @param {Function} iteratee
 * @param {Object} iteratee.object
 * @param {String} iteratee.property
 * @param {Object} iteratee.value - per object will be navigated ONLY once in this parameter
 * @param {Object[]} iteratee.parsedObjects - parsed object path, NOT contains the "object" parameter
 */
function walk(root, iteratee) {
    new ObjectWalker$2(root, iteratee);
}
const staticDummyWalker = new ObjectWalkerBehavior(null);
// enumerate properties not recursively
function doWalkProperties(obj, iteratee) {
    const SKIP_INVALID_TYPES_EVEN_IF_ROOT = null;
    staticDummyWalker.root = SKIP_INVALID_TYPES_EVEN_IF_ROOT;
    staticDummyWalker.walk = iteratee;
    staticDummyWalker.parseObject(obj);
}
/**
 * Traverse all object's properties recursively
 * @param {Object}   root
 * @param {Function} iteratee
 * @param {Object}     iteratee.object
 * @param {String}     iteratee.property - per object property will be navigated ONLY once in this parameter
 * @param {Object}     iteratee.value - per object may be navigated MORE than once in this parameter
 * @param {Object[]}   iteratee.parsedObjects - parsed object path, NOT contains the "object" parameter
 * @param {Object}   [options]
 * @param {Boolean}    [options.dontSkipNull = false]
 */
function walkProperties(root, iteratee, options) {
    const dontSkipNull = options && options.dontSkipNull;
    new ObjectWalker$2(root, function (obj, key, value, parsedObjects) {
        // 如果 value 已经遍历过，ObjectWalker 不会枚举其余对象对 value 的引用
        // 所以这里拿到 value 后自己再枚举一次 value 内的引用
        const noPropToWalk = !value || typeof value !== 'object';
        if (noPropToWalk) {
            return;
        }
        parsedObjects.push(obj);
        doWalkProperties(value, function (obj, key, val) {
            const isObj = typeof val === 'object';
            if (isObj) {
                if (dontSkipNull || val) {
                    iteratee(obj, key, val, parsedObjects);
                }
            }
        });
        parsedObjects.pop();
    }, options);
}
function getNextProperty(parsedObjects, parsingObject, object) {
    let nextObj;
    const i = parsedObjects.lastIndexOf(object);
    if (i === parsedObjects.length - 1) {
        nextObj = parsingObject;
    }
    else if (0 <= i && i < parsedObjects.length - 1) {
        nextObj = parsedObjects[i + 1];
    }
    else {
        return '';
    }
    let foundKey = '';
    doWalkProperties(object, function (obj, key, val) {
        if (val === nextObj) {
            foundKey = key;
        }
    });
    return foundKey;
}

var missingReporter = {};

Object.defineProperty(missingReporter, "__esModule", { value: true });
missingReporter.MissingReporter = void 0;
class MissingReporter {
    outputLevel = 'debug';
    static INFO_DETAILED = ' Detailed information:\n';
    static getObjectType(obj) {
        // @ts-ignore
        if (obj instanceof cc.Component) {
            return 'component';
            // @ts-ignore
        }
        else if (obj instanceof cc.Prefab) {
            return 'prefab';
            // @ts-ignore
        }
        else if (obj instanceof cc.SceneAsset) {
            return 'scene';
        }
        else {
            return 'asset';
        }
    }
    // 这个属性用于 stash 和 report
    missingObjects = new Set();
    // 这个属性用于 stashByOwner 和 reportByOwner
    missingOwners = new Map();
    root;
    report() { }
    reportByOwner() { }
    constructor(root) {
        this.root = root;
    }
    reset() {
        this.missingObjects.clear();
        this.missingOwners.clear();
        this.root = null;
    }
    stash(obj) {
        this.missingObjects.add(obj);
    }
    /**
     * stashByOwner 和 stash 的区别在于，stash 要求对象中有值，stashByOwner 允许对象的值为空
     * @param {any} [value] - 如果 value 未设置，不会影响提示信息，只不过提示信息可能会不够详细
     */
    stashByOwner(owner, propName, value) {
        let props = this.missingOwners.get(owner);
        if (!props) {
            props = {};
            this.missingOwners.set(owner, props);
        }
        props[propName] = value;
    }
    removeStashedByOwner(owner, propName) {
        const props = this.missingOwners.get(owner);
        if (props) {
            if (propName in props) {
                const id = props[propName];
                delete props[propName];
                if (Object.keys(props).length) {
                    return id;
                }
                // for (var k in props) {
                //     // still has props
                //     return id;
                // }
                // empty
                this.missingOwners.delete(owner);
                return id;
            }
        }
        return undefined;
    }
}
missingReporter.MissingReporter = MissingReporter;

var utils = {};

function commonjsRequire(path) {
	throw new Error('Could not dynamically require "' + path + '". Please configure the dynamicRequireTargets or/and ignoreDynamicRequires option of @rollup/plugin-commonjs appropriately for this require call to work.');
}

var file = {};

(function (exports) {
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.resolveFileNameConflict = void 0;
	exports.getName = getName;
	exports.trashItem = trashItem;
	exports.requireFile = requireFile;
	exports.removeCache = removeCache;
	const fs_1 = require$$4;
	const fs_extra_1 = require$$4;
	const path_1 = require$$4;
	/**
	 * 检查文件在指定文件夹中是否存在，如果存在则通过追加数字后缀的方式生成一个唯一的文件名。
	 * @param targetFolder 目标文件夹的路径。
	 * @param fileName 需要检查存在的文件名。
	 * @returns 返回一个唯一的文件名字符串。
	 */
	const resolveFileNameConflict = (targetFolder, fileName) => {
	    // 如果fileName为空，抛出错误
	    if (!fileName)
	        throw new Error(`fileName is empty`);
	    // 获取文件扩展名
	    const fileExt = (0, path_1.extname)(fileName);
	    // 获取文件的基础名（不包括扩展名）
	    let fileBase = (0, path_1.basename)(fileName, fileExt);
	    // 循环检查直到找到一个不存在的文件名
	    while ((0, fs_1.existsSync)((0, path_1.join)(targetFolder, `${fileBase}${fileExt}`))) {
	        if ((/(\d+)$/.test(fileBase))) {
	            fileBase = fileBase.replace(/^(.+?)(\d+)?$/, ($, $1, $2) => {
	                let num;
	                if (!$2) {
	                    // 如果是纯数字的话 $2 是为 undefined，$1 自增就行
	                    let num = parseInt($1, 10);
	                    num += 1;
	                    return num.toString();
	                }
	                num = parseInt($2, 10);
	                num += 1;
	                // 返回更新后的文件名
	                return `${$1}${num.toString().padStart($2.length, '0')}`;
	            });
	        }
	        else {
	            // 如果原文件名不包含数字后缀，则添加-001作为后缀
	            fileBase = `${fileBase}-001`;
	        }
	    }
	    // 返回最终生成的唯一文件名
	    return `${fileBase}${fileExt}`;
	};
	exports.resolveFileNameConflict = resolveFileNameConflict;
	/**
	 * 初始化一个可用的文件名
	 * Initializes a available filename
	 * 返回可用名称的文件路径
	 * Returns the file path with the available name
	 *
	 * @param file 初始文件路径 Initial file path
	 */
	function getName(file) {
	    if (!(0, fs_1.existsSync)(file)) {
	        return file;
	    }
	    const dir = (0, path_1.dirname)(file);
	    const fileName = (0, path_1.basename)(file);
	    const newFileName = (0, exports.resolveFileNameConflict)(dir, fileName);
	    return (0, path_1.join)(dir, newFileName);
	}
	async function trashItem(file) {
	    // TODO
	    // const trash = await import('sudo-trash');
	    // return await trash.trash(file);
	    await (0, fs_extra_1.remove)(file);
	}
	function requireFile(file, options) {
	    // TODO
	    return commonjsRequire(file);
	}
	function removeCache(file) {
	    delete require.cache[file];
	    // TODD
	}
	
} (file));

var uuid = {};

function createHash() {
                            var data = '';
                            return {
                                update: function(d) { data += d; return this; },
                                digest: function() { return data.substring(0, 32); }
                            };
                        }
                        var _eeStubCrypto = { createHash: createHash };

var _eeStubCrypto$1 = /*#__PURE__*/Object.freeze({
	__proto__: null,
	createHash: createHash,
	'default': _eeStubCrypto
});

var require$$0$1 = /*@__PURE__*/getAugmentedNamespace(_eeStubCrypto$1);

function v4() {
                            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                                var r = Math.random() * 16 | 0;
                                return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
                            });
                        }
                        var _eeStubUuid = { v4: v4 };

var _eeStubUuid$1 = /*#__PURE__*/Object.freeze({
	__proto__: null,
	'default': _eeStubUuid,
	v4: v4
});

var require$$1 = /*@__PURE__*/getAugmentedNamespace(_eeStubUuid$1);

var __importDefault$2 = (commonjsGlobal && commonjsGlobal.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(uuid, "__esModule", { value: true });
uuid.NonUuidMark = void 0;
uuid.compressUUID = compressUUID;
uuid.compressHex = compressHex;
uuid.decompressUUID = decompressUUID;
uuid.isUUID = isUUID;
uuid.getUuidFromLibPath = getUuidFromLibPath;
uuid.generate = generate;
uuid.nameToSubId = nameToSubId;
const crypto_1 = require$$0$1;
const node_uuid_1 = __importDefault$2(require$$1);
const Base64KeyChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const AsciiTo64 = new Array(128);
for (let i = 0; i < 128; ++i) {
    AsciiTo64[i] = 0;
}
for (let i = 0; i < 64; ++i) {
    AsciiTo64[Base64KeyChars.charCodeAt(i)] = i;
}
const Reg_Dash = /-/g;
const Reg_Uuid = /^[0-9a-fA-F-]{36}$/;
const Reg_NormalizedUuid = /^[0-9a-fA-F]{32}$/;
const Reg_CompressedUuid = /^[0-9a-zA-Z+/]{22,23}$/;
const Reg_CompressedSubAssetUuid = /^([0-9a-zA-Z+/]{22,23})((@[0-9a-fA-F]{5,})+)+$/;
const Reg_subAssetUuid = /([^@]{32,36})((@[0-9a-fA-F]{5,})+)+$/;
const Reg_UuidInLibPath = /.*[/\\][0-9a-fA-F]{2}[/\\]([0-9a-fA-F-]{8,}((@[0-9a-fA-F]{5,})+)?).*/;
// 加了这个标记后，字符串就不可能会是 uuid 了。
uuid.NonUuidMark = '.';
// 压缩后的 uuid 可以减小保存时的尺寸，但不能做为文件名（因为无法区分大小写并且包含非法字符）。
// 默认将 uuid 的后面 27 位压缩成 18 位，前 5 位保留下来，方便调试。
// fc991dd7-0033-4b80-9d41-c8a86a702e59 -> fc9913XADNLgJ1ByKhqcC5Z
// 如果启用 min 则将 uuid 的后面 30 位压缩成 20 位，前 2 位保留不变。
// fc991dd7-0033-4b80-9d41-c8a86a702e59 -> fcmR3XADNLgJ1ByKhqcC5Z
/*
 * @param {Boolean} [min=false]
 */
function compressUUID(uuid, min) {
    const result = uuid.match(Reg_subAssetUuid);
    if (!result) {
        return compressNormalUuid(uuid, min);
    }
    uuid = result[1];
    return compressNormalUuid(uuid, min) + result[2];
}
function compressNormalUuid(uuid, min) {
    if (Reg_Uuid.test(uuid)) {
        uuid = uuid.replace(Reg_Dash, '');
    }
    else if (!Reg_NormalizedUuid.test(uuid)) {
        return uuid;
    }
    const reserved = (min === true) ? 2 : 5;
    return compressHex(uuid, reserved);
}
function compressHex(hexString, reservedHeadLength) {
    const length = hexString.length;
    let i;
    if (typeof reservedHeadLength !== 'undefined') {
        i = reservedHeadLength;
    }
    else {
        i = length % 3;
    }
    const head = hexString.slice(0, i);
    const base64Chars = [];
    while (i < length) {
        const hexVal1 = parseInt(hexString[i], 16);
        const hexVal2 = parseInt(hexString[i + 1], 16);
        const hexVal3 = parseInt(hexString[i + 2], 16);
        base64Chars.push(Base64KeyChars[(hexVal1 << 2) | (hexVal2 >> 2)]);
        base64Chars.push(Base64KeyChars[((hexVal2 & 3) << 4) | hexVal3]);
        i += 3;
    }
    return head + base64Chars.join('');
}
function decompressUUID(uuid) {
    const result = uuid.match(Reg_CompressedSubAssetUuid);
    if (!result) {
        return decompressNormalUuid(uuid);
    }
    uuid = result[1];
    return decompressNormalUuid(uuid) + result[2];
}
function decompressNormalUuid(str) {
    if (str.length === 23) {
        // decode base64
        const hexChars = [];
        for (let i = 5; i < 23; i += 2) {
            const lhs = AsciiTo64[str.charCodeAt(i)];
            const rhs = AsciiTo64[str.charCodeAt(i + 1)];
            hexChars.push((lhs >> 2).toString(16));
            hexChars.push((((lhs & 3) << 2) | rhs >> 4).toString(16));
            hexChars.push((rhs & 0xF).toString(16));
        }
        //
        str = str.slice(0, 5) + hexChars.join('');
    }
    else if (str.length === 22) {
        // decode base64
        const hexChars = [];
        for (let i = 2; i < 22; i += 2) {
            const lhs = AsciiTo64[str.charCodeAt(i)];
            const rhs = AsciiTo64[str.charCodeAt(i + 1)];
            hexChars.push((lhs >> 2).toString(16));
            hexChars.push((((lhs & 3) << 2) | rhs >> 4).toString(16));
            hexChars.push((rhs & 0xF).toString(16));
        }
        //
        str = str.slice(0, 2) + hexChars.join('');
    }
    else {
        return str;
    }
    return [str.slice(0, 8), str.slice(8, 12), str.slice(12, 16), str.slice(16, 20), str.slice(20)].join('-');
}
function isUUID(str) {
    return Reg_CompressedUuid.test(str) || Reg_NormalizedUuid.test(str) || Reg_Uuid.test(str) || Reg_subAssetUuid.test(str);
}
// 从路径中提取 uuid
// 支持类似 ".../5b/5b9cbc23-76b3-41ff-9953-4219fdbea72c/Fontin-SmallCaps.ttf" 这样的
function getUuidFromLibPath(path) {
    const matches = path.match(Reg_UuidInLibPath);
    if (matches) {
        return encodeURI(matches[1]);
    }
    return '';
}
function generate(compress = true) {
    const uuid = node_uuid_1.default.v4();
    return compress ? compressUUID(uuid, compress) : uuid;
}
const _extendIndex = [
    1, 2, 3, 4, 5,
    7, 8, 9, 10, 11, 12, 13, 14, 15,
    17, 18, 19, 20, 21, 22, 23, 24,
    26, 27, 28, 29, 30,
];
/**
 * 从一个名字转换成一个 id
 * 这是个有损压缩，并不能够还原成原来的名字
 * 注意：此方法需要和 asset-db 保持一致
 * @param id
 * @param extend
 */
function nameToSubId(name, extend = 0) {
    const md5 = (0, crypto_1.createHash)('md5').update(name).digest('hex');
    let id = md5[0] + md5[6] + md5[16] + md5[25] + md5[31];
    for (let i = 0; i < extend; i++) {
        id += md5[_extendIndex[i]];
    }
    return id;
}

var path = {};

(function (exports) {
	var __createBinding = (commonjsGlobal && commonjsGlobal.__createBinding) || (Object.create ? (function(o, m, k, k2) {
	    if (k2 === undefined) k2 = k;
	    var desc = Object.getOwnPropertyDescriptor(m, k);
	    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
	      desc = { enumerable: true, get: function() { return m[k]; } };
	    }
	    Object.defineProperty(o, k2, desc);
	}) : (function(o, m, k, k2) {
	    if (k2 === undefined) k2 = k;
	    o[k2] = m[k];
	}));
	var __setModuleDefault = (commonjsGlobal && commonjsGlobal.__setModuleDefault) || (Object.create ? (function(o, v) {
	    Object.defineProperty(o, "default", { enumerable: true, value: v });
	}) : function(o, v) {
	    o["default"] = v;
	});
	var __importStar = (commonjsGlobal && commonjsGlobal.__importStar) || (function () {
	    var ownKeys = function(o) {
	        ownKeys = Object.getOwnPropertyNames || function (o) {
	            var ar = [];
	            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
	            return ar;
	        };
	        return ownKeys(o);
	    };
	    return function (mod) {
	        if (mod && mod.__esModule) return mod;
	        var result = {};
	        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
	        __setModuleDefault(result, mod);
	        return result;
	    };
	})();
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.format = exports.parse = exports.delimiter = exports.sep = exports.extname = exports.basename = exports.dirname = exports.relative = exports.isAbsolute = exports.resolve = exports.resolveToUrl = exports.resolveToRaw = exports.unregister = exports.register = void 0;
	exports.basenameNoExt = basenameNoExt;
	exports.slash = slash;
	exports.stripSep = stripSep;
	exports.stripExt = stripExt;
	exports.contains = contains;
	exports.normalize = normalize;
	const Path = __importStar(require$$4);
	const path_1 = require$$4;
	/**
	 * 返回一个不含扩展名的文件名
	 * @param path
	 */
	function basenameNoExt(path) {
	    return Path.basename(path, Path.extname(path));
	}
	/**
	 * 将 \ 统一换成 /
	 * @param path
	 */
	function slash(path) {
	    return path.replace(/\\/g, '/');
	}
	/**
	 * 去除路径最后的斜杆，返回一个不带斜杆的路径
	 * @param path
	 */
	function stripSep(path) {
	    path = Path.normalize(path);
	    let i;
	    for (i = path.length - 1; i >= 0; --i) {
	        if (path[i] !== Path.sep) {
	            break;
	        }
	    }
	    return path.substring(0, i + 1);
	}
	/**
	 * 删除一个路径的扩展名
	 * @param path
	 */
	function stripExt(path) {
	    const extname = Path.extname(path);
	    return path.substring(0, path.length - extname.length);
	}
	/**
	 * 判断路径 pathA 是否包含 pathB
	 * pathA = foo/bar,         pathB = foo/bar/foobar, return true
	 * pathA = foo/bar,         pathB = foo/bar,        return true
	 * pathA = foo/bar/foobar,  pathB = foo/bar,        return false
	 * pathA = foo/bar/foobar,  pathB = foobar/bar/foo, return false
	 * @param pathA
	 * @param pathB
	 */
	function contains(pathA, pathB) {
	    pathA = stripSep(pathA);
	    pathB = stripSep(pathB);
	    if (process.platform === 'win32') {
	        pathA = pathA.toLowerCase();
	        pathB = pathB.toLowerCase();
	    }
	    //
	    if (pathA === pathB) {
	        return true;
	    }
	    // never compare files
	    if (Path.dirname(pathA) === Path.dirname(pathB)) {
	        return false;
	    }
	    if (pathA.length < pathB.length && pathB.indexOf(pathA + Path.sep) === 0) {
	        return true;
	    }
	    return false;
	}
	/**
	 * 格式化路径
	 * 如果是 Windows 平台，需要将盘符转成小写进行判断
	 * @param path
	 */
	function normalize(path) {
	    path = Path.normalize(path);
	    if (process.platform === 'win32') {
	        if (/^[a-z]/.test(path[0]) && !/electron.asar/.test(path)) {
	            path = path[0].toUpperCase() + path.substr(1);
	        }
	    }
	    return path;
	}
	class FileUrlManager {
	    static urlMap = {};
	    /**
	     * 注册某个协议信息
	     * @param protocol
	     * @param protocolInfo
	     */
	    register(protocol, protocolInfo) {
	        if (!FileUrlManager.urlMap) {
	            FileUrlManager.urlMap = {};
	        }
	        if (FileUrlManager.urlMap[protocol] || protocol === 'file') {
	            console.warn(`[UI-File] Register protocol(${protocol}) failed! protocol(${protocol}) has exist!`);
	            return false;
	        }
	        FileUrlManager.urlMap[protocol] = protocolInfo;
	        return true;
	    }
	    /**
	     * 反注册某个协议信息
	     * @param protocol 协议头
	     */
	    unregister(protocol) {
	        delete FileUrlManager.urlMap[protocol];
	        return true;
	    }
	    getAllFileProtocol() {
	        return Object.keys(FileUrlManager.urlMap).map((protocol) => {
	            return {
	                protocol,
	                label: FileUrlManager.urlMap[protocol].label,
	                path: FileUrlManager.urlMap[protocol].path,
	            };
	        });
	    }
	    // 转成未处理过的（不带协议）
	    resolveToRaw(url) {
	        const matchInfo = url.match(/^([a-zA-z]*):\/\/(.*)$/);
	        if (matchInfo) {
	            const relPath = matchInfo[2].replace(/\\/g, '/');
	            const info = this.getProtocalInfo(matchInfo[1]);
	            if (info) {
	                return (0, path_1.join)(info.path, relPath);
	            }
	        }
	        return url;
	    }
	    // 转成带协议的地址格式
	    resolveToUrl(raw, protocol) {
	        if (!raw || !(0, exports.isAbsolute)(raw) || !protocol) {
	            return '';
	        }
	        const info = this.getProtocalInfo(protocol);
	        if (!info) {
	            return '';
	        }
	        return info.protocol + '://' + (0, exports.relative)(info.path, raw).replace(/\\/g, '/');
	    }
	    getProtocalInfo(protocol) {
	        if (!FileUrlManager.urlMap[protocol]) {
	            return undefined;
	        }
	        return {
	            protocol,
	            ...FileUrlManager.urlMap[protocol],
	        };
	    }
	}
	const fileUrlManager = new FileUrlManager();
	// 使用 bind 绑定 this 上下文
	exports.register = fileUrlManager.register.bind(fileUrlManager);
	exports.unregister = fileUrlManager.unregister.bind(fileUrlManager);
	exports.resolveToRaw = fileUrlManager.resolveToRaw.bind(fileUrlManager);
	exports.resolveToUrl = fileUrlManager.resolveToUrl.bind(fileUrlManager);
	exports.resolve = Path.resolve;
	exports.isAbsolute = Path.isAbsolute;
	exports.relative = Path.relative;
	exports.dirname = Path.dirname;
	exports.basename = Path.basename;
	exports.extname = Path.extname;
	exports.sep = Path.sep;
	exports.delimiter = Path.delimiter;
	exports.parse = Path.parse;
	exports.format = Path.format;
	
} (path));

var url = {};

Object.defineProperty(url, "__esModule", { value: true });
url.getDocUrl = getDocUrl;
const urls = {
    manual: 'https://docs.cocos.com/creator/manual/zh/',
    api: 'https://docs.cocos.com/creator/api/zh/'
};
/**
 * 快捷获取文档路径
 * @param relativeUrl
 * @param type
 */
function getDocUrl(relativeUrl, type = 'manual') {
    if (!relativeUrl) {
        return '';
    }
    return new URL(relativeUrl, urls[type]).href;
}

var math = {};

Object.defineProperty(math, "__esModule", { value: true });
math.clamp = clamp;
math.clamp01 = clamp01;
math.add = add;
math.sub = sub;
math.multi = multi;
math.divide = divide;
math.toFixed = toFixed;
/**
 * 取给定边界范围的值
 * Take the value of the given boundary range
 * @param {number} val
 * @param {number} min
 * @param {number} max
 */
function clamp(val, min, max) {
    return Math.min.call(null, Math.max.call(null, val, min), max);
}
/**
 * 将给定的数值限制在0到1的范围内。
 * @param val 需要限制的数值。
 * @returns 返回限制后的数值，确保在0到1之间。
 */
function clamp01(val) {
    return clamp(val, 0, 1);
}
/**
 * 加法函数
 * 入参：函数内部转化时会先转字符串再转数值，因而传入字符串或 number 均可
 * 返回值：arg1 加上 arg2 的精确结果
 * @param {number|string} arg1
 * @param {number|string} arg2
 */
function add(arg1, arg2) {
    arg1 = toValidNumber(arg1);
    arg2 = toValidNumber(arg2);
    const { maxPow, num1, num2 } = _computeMaxPow(arg1, arg2);
    return (num1 + num2) / maxPow;
}
/**
 * 减法函数
 * 入参：函数内部转化时会先转字符串再转数值，因而传入字符串或 number 均可
 * 返回值：arg1 减 arg2的精确结果
 * @param {number|string} arg1
 * @param {number|string} arg2
 */
function sub(arg1, arg2) {
    arg1 = toValidNumber(arg1);
    arg2 = toValidNumber(arg2);
    const { maxPow, num1, num2 } = _computeMaxPow(arg1, arg2);
    return (num1 - num2) / maxPow;
}
/**
 * 乘法函数
 * @param arg1
 * @param arg2
 * @returns
 */
function multi(arg1, arg2) {
    arg1 = toValidNumber(arg1);
    arg2 = toValidNumber(arg2);
    const { maxPow, num1, num2 } = _computeMaxPow(arg1, arg2);
    return num1 * num2 / maxPow / maxPow;
}
/**
 * 除法函数
 * @param arg1
 * @param arg2
 * @returns
 */
function divide(arg1, arg2) {
    arg1 = toValidNumber(arg1);
    arg2 = toValidNumber(arg2);
    if (!arg2) {
        return arg1 > 0 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
    }
    const { num1, num2 } = _computeMaxPow(arg1, arg2);
    return num1 / num2;
}
function toValidNumber(str) {
    str = Number(str);
    // 需要判断是否是无限大或者是无限小
    if (typeof str === 'number' && !Number.isNaN(str) && isFinite(str)) {
        return str;
    }
    throw new Error(`Invalid params ${str}`);
}
/**
 * 计算两个数值小数点位数的最大位数与10的乘积,与最大精度
 * 入参：函数内部转化时会先转字符串再转数值，因而传入字符串或number均可
 * 返回值：
 * @param {number|string} arg1
 * @param {number|string} arg2
 */
function _computeMaxPow(arg1, arg2) {
    let maxPreci;
    const str1 = toNonExponential(arg1);
    const str2 = toNonExponential(arg2);
    const r1 = _comPreci(str1);
    const r2 = _comPreci(str2);
    maxPreci = Math.max(r1, r2);
    const maxPow = Math.pow(10, maxPreci);
    if (maxPreci > 20) {
        maxPreci = 20;
    }
    const num1 = Number(str1.replace('.', '') + Array(maxPreci - r1).fill(0).join(''));
    const num2 = Number(str2.replace('.', '') + Array(maxPreci - r2).fill(0).join(''));
    return {
        maxPow,
        maxPreci,
        num1,
        num2,
    };
}
/**
 * 移除科学计数法，转为正常的小数点形式
 * @param num
 * @returns
 */
function toNonExponential(num) {
    const m = num.toExponential().match(/\d(?:\.(\d*))?e([+-]\d+)/);
    return num.toFixed(Math.max(0, (m[1] || '').length - Number(m[2])));
}
/**
 * 计算数值的精度（小数点位数）
 * 返回值：该数值的小数点位数
 * @param {Number || String} value
 */
function _comPreci(value) {
    let rang;
    try {
        rang = value.split('.')[1].length;
    }
    catch (error) {
        rang = 0;
    }
    return rang;
}
/**
 * 保留小数点
 * @param val
 * @param num
 */
function toFixed(val, num) {
    return parseFloat((Math.round(val * Math.pow(10, num)) / Math.pow(10, num)).toFixed(num));
}

var parse = {};

Object.defineProperty(parse, "__esModule", { value: true });
parse.compareVersion = compareVersion;
/**
 * return result of versionMax > versionMin，其中仅支持纯数字版本，最高支持三位数版本号：333.666.345
 * @example (3.6.2, 3.7.0) => false; (3.9.0, 3.8.0) => true; (3.8.0, 3.8.0) => false;
 * @param versionMax
 * @param versionMin
 * @param split
 */
function compareVersion(versionMax, versionMin, split = '.') {
    if (typeof versionMax !== 'string' || typeof versionMin !== 'string') {
        throw new Error(`invalid param: ${versionMax}, ${versionMin}`);
    }
    versionMax = versionMax.replace(split, '').padStart(3, '0');
    versionMin = versionMin.replace(split, '').padStart(3, '0');
    return Number(versionMax) > Number(versionMin);
}

var process$1 = {};

Object.defineProperty(process$1, "__esModule", { value: true });
process$1.quickSpawn = quickSpawn;
const child_process_1 = require$$4;
/**
* 快速开启子进程
* @param command
* @param cmdParams
* @param options
* @returns
*/
function quickSpawn(command, cmdParams, options = {
    downGradeLog: true,
    onlyPrintWhenError: true,
    prefix: '',
}) {
    return new Promise((resolve, reject) => {
        options.prefix = options.prefix || '';
        const child = (0, child_process_1.spawn)(command, cmdParams, {
            cwd: options?.cwd || undefined,
            env: options?.env,
            ...options,
        });
        let outputData = '';
        function output(type, data) {
            if (options.onlyPrintWhenError) {
                outputData += data;
                return;
            }
            if (type === 'log' && options.downGradeLog) {
                type = 'debug';
            }
            else if (type === 'warn' && options.downGradeWaring) {
                type = 'log';
            }
            else if (type === 'error' && options.downGradeError) {
                type = 'warn';
            }
            console[type](options.prefix + data.toString());
        }
        if (options.logLevel !== undefined && options.logLevel >= 0) {
            child.stdout.on('data', (data) => {
                output('log', data);
            });
        }
        if (options.logLevel !== undefined && options.logLevel >= 1) {
            child.stderr.on('data', (err) => {
                const error = err.toString();
                // 过滤掉空或只有换行的报错
                if (!error || error === '\n') {
                    return;
                }
                output('error', err);
            });
        }
        child.on('close', (code) => {
            if (code !== 0) {
                reject(options.prefix + `Child process exit width code ${code}: ${command} ${cmdParams.toString()}`);
            }
            else {
                resolve(true);
            }
        });
        child.on('error', (err) => {
            outputData && console.debug(options.prefix + 'child process output: ', { outputData });
            console.error(options.prefix + `child process error: ${command} ${cmdParams.toString()}`);
            reject(err);
        });
        child.on('exit', (code) => {
            !options.onlyPrintWhenError && console.debug(options.prefix + `Child process exit width code ${code}`);
        });
    });
}

var __createBinding$2 = (commonjsGlobal && commonjsGlobal.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault$2 = (commonjsGlobal && commonjsGlobal.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar$2 = (commonjsGlobal && commonjsGlobal.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding$2(result, mod, k[i]);
        __setModuleDefault$2(result, mod);
        return result;
    };
})();
Object.defineProperty(utils, "__esModule", { value: true });
const File = __importStar$2(file);
const UUID = __importStar$2(uuid);
const Path = __importStar$2(path);
const Url = __importStar$2(url);
const Math$1 = __importStar$2(math);
const Parse = __importStar$2(parse);
const Process = __importStar$2(process$1);
utils.default = {
    UUID,
    File,
    Path,
    Url,
    Math: Math$1,
    Parse,
    Process,
};

(function (exports) {
	var __createBinding = (commonjsGlobal && commonjsGlobal.__createBinding) || (Object.create ? (function(o, m, k, k2) {
	    if (k2 === undefined) k2 = k;
	    var desc = Object.getOwnPropertyDescriptor(m, k);
	    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
	      desc = { enumerable: true, get: function() { return m[k]; } };
	    }
	    Object.defineProperty(o, k2, desc);
	}) : (function(o, m, k, k2) {
	    if (k2 === undefined) k2 = k;
	    o[k2] = m[k];
	}));
	var __setModuleDefault = (commonjsGlobal && commonjsGlobal.__setModuleDefault) || (Object.create ? (function(o, v) {
	    Object.defineProperty(o, "default", { enumerable: true, value: v });
	}) : function(o, v) {
	    o["default"] = v;
	});
	var __importStar = (commonjsGlobal && commonjsGlobal.__importStar) || (function () {
	    var ownKeys = function(o) {
	        ownKeys = Object.getOwnPropertyNames || function (o) {
	            var ar = [];
	            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
	            return ar;
	        };
	        return ownKeys(o);
	    };
	    return function (mod) {
	        if (mod && mod.__esModule) return mod;
	        var result = {};
	        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
	        __setModuleDefault(result, mod);
	        return result;
	    };
	})();
	var __importDefault = (commonjsGlobal && commonjsGlobal.__importDefault) || function (mod) {
	    return (mod && mod.__esModule) ? mod : { "default": mod };
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.MissingClass = exports.MissingClassReporter = void 0;
	const _ = __importStar(require$$4);
	const ps = __importStar(require$$4);
	const ObjectWalker = __importStar(objectWalker);
	const assetdb = __importStar(require$$4);
	const missing_reporter_1 = missingReporter;
	const utils_1 = __importDefault(utils);
	function report(parsingOwner, classId, asset, url) {
	    const assetType = missing_reporter_1.MissingReporter.getObjectType(asset);
	    const assetName = url && ps.basename(url);
	    if (asset instanceof cc.SceneAsset || asset instanceof cc.Prefab) {
	        let info;
	        let component;
	        let node;
	        if (parsingOwner instanceof cc.Component) {
	            component = parsingOwner;
	            node = component.node;
	        }
	        else if (cc.Node.isNode(parsingOwner)) {
	            node = parsingOwner;
	        }
	        const IN_LOCATION = assetName ? ` in ${assetType} "${assetName}"` : '';
	        let detailedClassId = classId;
	        let isScript = false;
	        if (component) {
	            let compName = cc.js.getClassName(component);
	            // missing property type
	            if (component instanceof cc._MissingScript) {
	                isScript = true;
	                detailedClassId = compName = component._$erialized.__type__;
	            }
	            info = `Class "${classId}" used by component "${compName}"${IN_LOCATION} is missing or invalid.`;
	        }
	        else if (node) {
	            // missing component
	            isScript = true;
	            info = `Script "${classId}" attached to "${node.name}"${IN_LOCATION} is missing or invalid.`;
	        }
	        else {
	            return;
	        }
	        info += missing_reporter_1.MissingReporter.INFO_DETAILED;
	        try {
	            let child = node;
	            let path = child.name;
	            while (child.parent && !(child.parent instanceof cc.Scene)) {
	                child = child.parent;
	                path = `${child.name}/${path}`;
	            }
	            info += `Node path: "${path}"\n`;
	        }
	        catch (error) { }
	        if (url) {
	            info += `Asset url: "${url}"\n`;
	        }
	        if (isScript && utils_1.default.UUID.isUUID(detailedClassId)) {
	            const scriptUuid = utils_1.default.UUID.decompressUUID(detailedClassId);
	            try {
	                const scriptInfo = assetdb.queryMissingInfo(scriptUuid.match(/[^@]*/)[0]);
	                if (scriptInfo) {
	                    info += `Script file: "${scriptInfo.path}"\n`;
	                    info += `Script deleted time: "${new Date(scriptInfo.removeTime).toLocaleString()}"\n`;
	                }
	            }
	            catch (error) { }
	            info += `Script UUID: "${scriptUuid}"\n`;
	            info += `Class ID: "${detailedClassId}"\n`;
	        }
	        info.slice(0, -1); // remove last '\n'
	        console.error(info);
	    }
	}
	async function reportByWalker(value, obj, parsedObjects, asset, url, classId) {
	    classId = classId || (value._$erialized && value._$erialized.__type__);
	    let parsingOwner;
	    if (obj instanceof cc.Component || cc.Node.isNode(obj)) {
	        parsingOwner = obj;
	    }
	    else {
	        parsingOwner = _.findLast(parsedObjects, (x) => (x instanceof cc.Component || cc.Node.isNode(x)));
	    }
	    await report(parsingOwner, classId, asset, url);
	}
	// MISSING CLASS REPORTER
	class MissingClassReporter extends missing_reporter_1.MissingReporter {
	    report() {
	        ObjectWalker.walk(this.root, (obj, key, value, parsedObjects) => {
	            if (this.missingObjects.has(value)) {
	                reportByWalker(value, obj, parsedObjects, this.root);
	            }
	        });
	    }
	    reportByOwner() {
	        let rootUrl;
	        let info;
	        if (this.root instanceof cc.Asset) {
	            try {
	                // @ts-ignore
	                const Manager = globalThis.Manager;
	                // @ts-ignore
	                if (Manager && Manager.assetManager) {
	                    info = Manager.assetManager.queryAssetInfo(this.root._uuid);
	                }
	                else {
	                    // info = pkg.execSync('asset-db', 'queryAssetInfo', this.root._uuid);
	                }
	            }
	            catch (error) {
	                console.error(error);
	                info = null;
	            }
	            rootUrl = info ? info.path : null;
	        }
	        ObjectWalker.walkProperties(this.root, (obj, key, value, parsedObjects) => {
	            const props = this.missingOwners.get(obj);
	            if (props && (key in props)) {
	                const typeId = props[key];
	                reportByWalker(value, obj, parsedObjects, this.root, rootUrl, typeId);
	            }
	        }, {
	            dontSkipNull: true,
	        });
	    }
	}
	exports.MissingClassReporter = MissingClassReporter;
	// 用这个模块来标记找不到脚本的对象
	exports.MissingClass = {
	    reporter: new MissingClassReporter(),
	    classFinder(id, owner, propName) {
	        const cls = cc.js.getClassById(id);
	        if (cls) {
	            return cls;
	        }
	        else if (id) {
	            console.warn(`Missing class: ${id}`);
	            exports.MissingClass.hasMissingClass = true;
	            exports.MissingClass.reporter.stashByOwner(owner, propName, id);
	        }
	        return null;
	    },
	    hasMissingClass: false,
	    reportMissingClass(asset) {
	        if (!asset._uuid) {
	            return;
	        }
	        if (exports.MissingClass.hasMissingClass) {
	            exports.MissingClass.reporter.root = asset;
	            exports.MissingClass.reporter.reportByOwner();
	            exports.MissingClass.hasMissingClass = false;
	        }
	    },
	    reset() {
	        exports.MissingClass.reporter.reset();
	    },
	};
	// @ts-ignore
	exports.MissingClass.classFinder.onDereferenced = function (curOwner, curPropName, newOwner, newPropName) {
	    const id = exports.MissingClass.reporter.removeStashedByOwner(curOwner, curPropName);
	    if (id) {
	        exports.MissingClass.reporter.stashByOwner(newOwner, newPropName, id);
	    }
	};
	
} (missingClassReporter));

var missingObjectReporter = {};

var __createBinding$1 = (commonjsGlobal && commonjsGlobal.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault$1 = (commonjsGlobal && commonjsGlobal.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar$1 = (commonjsGlobal && commonjsGlobal.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding$1(result, mod, k[i]);
        __setModuleDefault$1(result, mod);
        return result;
    };
})();
Object.defineProperty(missingObjectReporter, "__esModule", { value: true });
missingObjectReporter.MissingObjectReporter = void 0;
const missing_reporter_1 = missingReporter;
const _ = __importStar$1(require$$4);
const ps = __importStar$1(require$$4);
const ObjectWalker$1 = __importStar$1(objectWalker);
const assetdb = __importStar$1(require$$4);
class MissingObjectReporter extends missing_reporter_1.MissingReporter {
    doReport(obj, value, parsedObjects, rootUrl, inRootBriefLocation) {
        let parsingOwner;
        if (obj instanceof cc.Component || obj instanceof cc.Asset) {
            parsingOwner = obj;
        }
        else {
            parsingOwner = _.findLast(parsedObjects, (x) => (x instanceof cc.Component || x instanceof cc.Asset));
        }
        let byOwner = '';
        if (parsingOwner instanceof cc.Component) {
            const ownerType = missing_reporter_1.MissingReporter.getObjectType(parsingOwner);
            byOwner = ` by ${ownerType} "${cc.js.getClassName(parsingOwner)}"`;
        }
        else {
            parsingOwner = _.findLast(parsedObjects, (x) => (x instanceof cc.Node));
            if (parsingOwner) {
                byOwner = ` by node "${parsingOwner.name}"`;
            }
        }
        let info;
        const valueIsUrl = typeof value === 'string';
        if (valueIsUrl) {
            info = `Asset "${value}" used${byOwner}${inRootBriefLocation} is missing.`;
        }
        else {
            let targetType = cc.js.getClassName(value);
            if (targetType.startsWith('cc.')) {
                targetType = targetType.slice(3);
            }
            if (value instanceof cc.Asset) {
                // missing asset
                info = `The ${targetType} used${byOwner}${inRootBriefLocation} is missing.`;
            }
            else {
                // missing object
                info = `The ${targetType} referenced${byOwner}${inRootBriefLocation} is invalid.`;
            }
        }
        info += missing_reporter_1.MissingReporter.INFO_DETAILED;
        if (parsingOwner instanceof cc.Component) {
            parsingOwner = parsingOwner.node;
        }
        try {
            if (parsingOwner instanceof cc.Node) {
                let node = parsingOwner;
                let path = node.name;
                while (node.parent && !(node.parent instanceof cc.Scene)) {
                    node = node.parent;
                    path = `${node.name}/${path}`;
                }
                info += `Node path: "${path}"\n`;
            }
        }
        catch (error) { }
        if (rootUrl) {
            info += `Asset url: "${rootUrl}"\n`;
        }
        if (value instanceof cc.Asset && value._uuid) {
            try {
                const assetInfo = assetdb.queryMissingInfo(value._uuid.match(/[^@]*/)[0]);
                if (assetInfo) {
                    info += `Asset file: "${assetInfo.path}"\n`;
                    info += `Asset deleted time: "${new Date(assetInfo.removeTime).toLocaleString()}"\n`;
                }
            }
            catch (error) { }
            // info = pkg.execSync('asset-db', 'queryAssetInfo', this.root._uuid);
            info += `Missing uuid: "${value._uuid}"\n`;
        }
        info.slice(0, -1); // remove last '\n'
        // 因为报错很多，用户会觉得是编辑器不稳定，所以暂时隐藏错误
        if (console[this.outputLevel]) {
            console[this.outputLevel](info);
        }
        else {
            console.warn(info);
        }
    }
    report() {
        let rootUrl;
        let info;
        if (this.root instanceof cc.Asset) {
            try {
                // @ts-ignore
                const Manager = globalThis.Manager;
                if (Manager && Manager.assetManager) {
                    info = Manager.assetManager.queryAssetInfo(this.root._uuid);
                }
                else {
                    // info = pkg.execSync('asset-db', 'queryAssetInfo', this.root._uuid);
                }
            }
            catch (error) {
                console.error(error);
                info = null;
            }
            rootUrl = info ? info.path : null;
        }
        const rootType = missing_reporter_1.MissingReporter.getObjectType(this.root);
        const inRootBriefLocation = rootUrl ? ` in ${rootType} "${ps.basename(rootUrl)}"` : '';
        ObjectWalker$1.walk(this.root, (obj, key, value, parsedObjects, parsedKeys) => {
            if (this.missingObjects.has(value)) {
                this.doReport(obj, value, parsedObjects, rootUrl, inRootBriefLocation);
            }
        });
    }
    reportByOwner() {
        let rootUrl;
        let info;
        if (this.root instanceof cc.Asset) {
            try {
                // @ts-ignore
                const Manager = globalThis.Manager;
                if (Manager && Manager.assetDBManager.ready) {
                    info = Manager.assetManager.queryAssetInfo(this.root._uuid);
                }
                else {
                    // info = pkg.execSync('asset-db', 'queryAssetInfo', this.root._uuid);
                }
            }
            catch (error) {
                console.error(error);
                info = null;
            }
            rootUrl = info ? info.path : null;
        }
        const rootType = missing_reporter_1.MissingReporter.getObjectType(this.root);
        const inRootBriefLocation = rootUrl ? ` in ${rootType} "${ps.basename(rootUrl)}"` : '';
        ObjectWalker$1.walkProperties(this.root, (obj, key, actualValue, parsedObjects) => {
            const props = this.missingOwners.get(obj);
            if (props && (key in props)) {
                const reportValue = props[key];
                this.doReport(obj, reportValue || actualValue, parsedObjects, rootUrl, inRootBriefLocation);
            }
        }, {
            dontSkipNull: true,
        });
    }
}
missingObjectReporter.MissingObjectReporter = MissingObjectReporter;

// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

var objectCreate = Object.create || objectCreatePolyfill;
var objectKeys = Object.keys || objectKeysPolyfill;
var bind = Function.prototype.bind || functionBindPolyfill;

function EventEmitter() {
  if (!this._events || !Object.prototype.hasOwnProperty.call(this, '_events')) {
    this._events = objectCreate(null);
    this._eventsCount = 0;
  }

  this._maxListeners = this._maxListeners || undefined;
}
var events = EventEmitter;

// Backwards-compat with node 0.10.x
EventEmitter.EventEmitter = EventEmitter;

EventEmitter.prototype._events = undefined;
EventEmitter.prototype._maxListeners = undefined;

// By default EventEmitters will print a warning if more than 10 listeners are
// added to it. This is a useful default which helps finding memory leaks.
var defaultMaxListeners = 10;

var hasDefineProperty;
try {
  var o = {};
  if (Object.defineProperty) Object.defineProperty(o, 'x', { value: 0 });
  hasDefineProperty = o.x === 0;
} catch (err) { hasDefineProperty = false; }
if (hasDefineProperty) {
  Object.defineProperty(EventEmitter, 'defaultMaxListeners', {
    enumerable: true,
    get: function() {
      return defaultMaxListeners;
    },
    set: function(arg) {
      // check whether the input is a positive number (whose value is zero or
      // greater and not a NaN).
      if (typeof arg !== 'number' || arg < 0 || arg !== arg)
        throw new TypeError('"defaultMaxListeners" must be a positive number');
      defaultMaxListeners = arg;
    }
  });
} else {
  EventEmitter.defaultMaxListeners = defaultMaxListeners;
}

// Obviously not all Emitters should be limited to 10. This function allows
// that to be increased. Set to zero for unlimited.
EventEmitter.prototype.setMaxListeners = function setMaxListeners(n) {
  if (typeof n !== 'number' || n < 0 || isNaN(n))
    throw new TypeError('"n" argument must be a positive number');
  this._maxListeners = n;
  return this;
};

function $getMaxListeners(that) {
  if (that._maxListeners === undefined)
    return EventEmitter.defaultMaxListeners;
  return that._maxListeners;
}

EventEmitter.prototype.getMaxListeners = function getMaxListeners() {
  return $getMaxListeners(this);
};

// These standalone emit* functions are used to optimize calling of event
// handlers for fast cases because emit() itself often has a variable number of
// arguments and can be deoptimized because of that. These functions always have
// the same number of arguments and thus do not get deoptimized, so the code
// inside them can execute faster.
function emitNone(handler, isFn, self) {
  if (isFn)
    handler.call(self);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self);
  }
}
function emitOne(handler, isFn, self, arg1) {
  if (isFn)
    handler.call(self, arg1);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self, arg1);
  }
}
function emitTwo(handler, isFn, self, arg1, arg2) {
  if (isFn)
    handler.call(self, arg1, arg2);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self, arg1, arg2);
  }
}
function emitThree(handler, isFn, self, arg1, arg2, arg3) {
  if (isFn)
    handler.call(self, arg1, arg2, arg3);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].call(self, arg1, arg2, arg3);
  }
}

function emitMany(handler, isFn, self, args) {
  if (isFn)
    handler.apply(self, args);
  else {
    var len = handler.length;
    var listeners = arrayClone(handler, len);
    for (var i = 0; i < len; ++i)
      listeners[i].apply(self, args);
  }
}

EventEmitter.prototype.emit = function emit(type) {
  var er, handler, len, args, i, events;
  var doError = (type === 'error');

  events = this._events;
  if (events)
    doError = (doError && events.error == null);
  else if (!doError)
    return false;

  // If there is no 'error' event listener then throw.
  if (doError) {
    if (arguments.length > 1)
      er = arguments[1];
    if (er instanceof Error) {
      throw er; // Unhandled 'error' event
    } else {
      // At least give some kind of context to the user
      var err = new Error('Unhandled "error" event. (' + er + ')');
      err.context = er;
      throw err;
    }
  }

  handler = events[type];

  if (!handler)
    return false;

  var isFn = typeof handler === 'function';
  len = arguments.length;
  switch (len) {
      // fast cases
    case 1:
      emitNone(handler, isFn, this);
      break;
    case 2:
      emitOne(handler, isFn, this, arguments[1]);
      break;
    case 3:
      emitTwo(handler, isFn, this, arguments[1], arguments[2]);
      break;
    case 4:
      emitThree(handler, isFn, this, arguments[1], arguments[2], arguments[3]);
      break;
      // slower
    default:
      args = new Array(len - 1);
      for (i = 1; i < len; i++)
        args[i - 1] = arguments[i];
      emitMany(handler, isFn, this, args);
  }

  return true;
};

function _addListener(target, type, listener, prepend) {
  var m;
  var events;
  var existing;

  if (typeof listener !== 'function')
    throw new TypeError('"listener" argument must be a function');

  events = target._events;
  if (!events) {
    events = target._events = objectCreate(null);
    target._eventsCount = 0;
  } else {
    // To avoid recursion in the case that type === "newListener"! Before
    // adding it to the listeners, first emit "newListener".
    if (events.newListener) {
      target.emit('newListener', type,
          listener.listener ? listener.listener : listener);

      // Re-assign `events` because a newListener handler could have caused the
      // this._events to be assigned to a new object
      events = target._events;
    }
    existing = events[type];
  }

  if (!existing) {
    // Optimize the case of one listener. Don't need the extra array object.
    existing = events[type] = listener;
    ++target._eventsCount;
  } else {
    if (typeof existing === 'function') {
      // Adding the second element, need to change to array.
      existing = events[type] =
          prepend ? [listener, existing] : [existing, listener];
    } else {
      // If we've already got an array, just append.
      if (prepend) {
        existing.unshift(listener);
      } else {
        existing.push(listener);
      }
    }

    // Check for listener leak
    if (!existing.warned) {
      m = $getMaxListeners(target);
      if (m && m > 0 && existing.length > m) {
        existing.warned = true;
        var w = new Error('Possible EventEmitter memory leak detected. ' +
            existing.length + ' "' + String(type) + '" listeners ' +
            'added. Use emitter.setMaxListeners() to ' +
            'increase limit.');
        w.name = 'MaxListenersExceededWarning';
        w.emitter = target;
        w.type = type;
        w.count = existing.length;
        if (typeof console === 'object' && console.warn) {
          console.warn('%s: %s', w.name, w.message);
        }
      }
    }
  }

  return target;
}

EventEmitter.prototype.addListener = function addListener(type, listener) {
  return _addListener(this, type, listener, false);
};

EventEmitter.prototype.on = EventEmitter.prototype.addListener;

EventEmitter.prototype.prependListener =
    function prependListener(type, listener) {
      return _addListener(this, type, listener, true);
    };

function onceWrapper() {
  if (!this.fired) {
    this.target.removeListener(this.type, this.wrapFn);
    this.fired = true;
    switch (arguments.length) {
      case 0:
        return this.listener.call(this.target);
      case 1:
        return this.listener.call(this.target, arguments[0]);
      case 2:
        return this.listener.call(this.target, arguments[0], arguments[1]);
      case 3:
        return this.listener.call(this.target, arguments[0], arguments[1],
            arguments[2]);
      default:
        var args = new Array(arguments.length);
        for (var i = 0; i < args.length; ++i)
          args[i] = arguments[i];
        this.listener.apply(this.target, args);
    }
  }
}

function _onceWrap(target, type, listener) {
  var state = { fired: false, wrapFn: undefined, target: target, type: type, listener: listener };
  var wrapped = bind.call(onceWrapper, state);
  wrapped.listener = listener;
  state.wrapFn = wrapped;
  return wrapped;
}

EventEmitter.prototype.once = function once(type, listener) {
  if (typeof listener !== 'function')
    throw new TypeError('"listener" argument must be a function');
  this.on(type, _onceWrap(this, type, listener));
  return this;
};

EventEmitter.prototype.prependOnceListener =
    function prependOnceListener(type, listener) {
      if (typeof listener !== 'function')
        throw new TypeError('"listener" argument must be a function');
      this.prependListener(type, _onceWrap(this, type, listener));
      return this;
    };

// Emits a 'removeListener' event if and only if the listener was removed.
EventEmitter.prototype.removeListener =
    function removeListener(type, listener) {
      var list, events, position, i, originalListener;

      if (typeof listener !== 'function')
        throw new TypeError('"listener" argument must be a function');

      events = this._events;
      if (!events)
        return this;

      list = events[type];
      if (!list)
        return this;

      if (list === listener || list.listener === listener) {
        if (--this._eventsCount === 0)
          this._events = objectCreate(null);
        else {
          delete events[type];
          if (events.removeListener)
            this.emit('removeListener', type, list.listener || listener);
        }
      } else if (typeof list !== 'function') {
        position = -1;

        for (i = list.length - 1; i >= 0; i--) {
          if (list[i] === listener || list[i].listener === listener) {
            originalListener = list[i].listener;
            position = i;
            break;
          }
        }

        if (position < 0)
          return this;

        if (position === 0)
          list.shift();
        else
          spliceOne(list, position);

        if (list.length === 1)
          events[type] = list[0];

        if (events.removeListener)
          this.emit('removeListener', type, originalListener || listener);
      }

      return this;
    };

EventEmitter.prototype.removeAllListeners =
    function removeAllListeners(type) {
      var listeners, events, i;

      events = this._events;
      if (!events)
        return this;

      // not listening for removeListener, no need to emit
      if (!events.removeListener) {
        if (arguments.length === 0) {
          this._events = objectCreate(null);
          this._eventsCount = 0;
        } else if (events[type]) {
          if (--this._eventsCount === 0)
            this._events = objectCreate(null);
          else
            delete events[type];
        }
        return this;
      }

      // emit removeListener for all listeners on all events
      if (arguments.length === 0) {
        var keys = objectKeys(events);
        var key;
        for (i = 0; i < keys.length; ++i) {
          key = keys[i];
          if (key === 'removeListener') continue;
          this.removeAllListeners(key);
        }
        this.removeAllListeners('removeListener');
        this._events = objectCreate(null);
        this._eventsCount = 0;
        return this;
      }

      listeners = events[type];

      if (typeof listeners === 'function') {
        this.removeListener(type, listeners);
      } else if (listeners) {
        // LIFO order
        for (i = listeners.length - 1; i >= 0; i--) {
          this.removeListener(type, listeners[i]);
        }
      }

      return this;
    };

function _listeners(target, type, unwrap) {
  var events = target._events;

  if (!events)
    return [];

  var evlistener = events[type];
  if (!evlistener)
    return [];

  if (typeof evlistener === 'function')
    return unwrap ? [evlistener.listener || evlistener] : [evlistener];

  return unwrap ? unwrapListeners(evlistener) : arrayClone(evlistener, evlistener.length);
}

EventEmitter.prototype.listeners = function listeners(type) {
  return _listeners(this, type, true);
};

EventEmitter.prototype.rawListeners = function rawListeners(type) {
  return _listeners(this, type, false);
};

EventEmitter.listenerCount = function(emitter, type) {
  if (typeof emitter.listenerCount === 'function') {
    return emitter.listenerCount(type);
  } else {
    return listenerCount.call(emitter, type);
  }
};

EventEmitter.prototype.listenerCount = listenerCount;
function listenerCount(type) {
  var events = this._events;

  if (events) {
    var evlistener = events[type];

    if (typeof evlistener === 'function') {
      return 1;
    } else if (evlistener) {
      return evlistener.length;
    }
  }

  return 0;
}

EventEmitter.prototype.eventNames = function eventNames() {
  return this._eventsCount > 0 ? Reflect.ownKeys(this._events) : [];
};

// About 1.5x faster than the two-arg version of Array#splice().
function spliceOne(list, index) {
  for (var i = index, k = i + 1, n = list.length; k < n; i += 1, k += 1)
    list[i] = list[k];
  list.pop();
}

function arrayClone(arr, n) {
  var copy = new Array(n);
  for (var i = 0; i < n; ++i)
    copy[i] = arr[i];
  return copy;
}

function unwrapListeners(arr) {
  var ret = new Array(arr.length);
  for (var i = 0; i < ret.length; ++i) {
    ret[i] = arr[i].listener || arr[i];
  }
  return ret;
}

function objectCreatePolyfill(proto) {
  var F = function() {};
  F.prototype = proto;
  return new F;
}
function objectKeysPolyfill(obj) {
  for (var k in obj) if (Object.prototype.hasOwnProperty.call(obj, k)) ;
  return k;
}
function functionBindPolyfill(context) {
  var fn = this;
  return function () {
    return fn.apply(context, arguments);
  };
}

var script = {};

Object.defineProperty(script, "__esModule", { value: true });
const events_1$2 = events;
class ScriptManager extends events_1$2.EventEmitter {
    allow = false;
    _map = {};
    /**
     * 将一个 ctor 放到一个脚本注册 class 的数组里
     * @param uuid
     * @param ctor
     */
    add(uuid, ctor) {
        if (!this.allow) {
            return;
        }
        this._map[uuid] = this._map[uuid] || [];
        const index = this._map[uuid].indexOf(ctor);
        if (index !== -1) {
            return;
        }
        this._map[uuid].push(ctor);
    }
    /**
     * 在 uuid 指向的脚本 ctor 数组里删除对应的 ctor
     * @param uuid
     * @param ctor
     */
    remove(uuid, ctor) {
        if (!this.allow) {
            return;
        }
        if (!this._map[uuid]) {
            return;
        }
        const index = this._map[uuid].indexOf(ctor);
        if (index === -1) {
            return;
        }
        this._map[uuid].splice(index);
    }
    /**
     * 获取指定模块内注册的 class 列表
     * @param uuid
     */
    getCtors(uuid) {
        return (this._map[uuid] || []).slice();
    }
}
script.default = ScriptManager;

var node = {};

var nodePathManager = {};

var pathUtils = {};

Object.defineProperty(pathUtils, "__esModule", { value: true });
pathUtils.formatUniqueName = formatUniqueName;
/**
 * 生成唯一名称：无重复时返回原名，有重复时添加 _001, _002, ... 后缀
 * @param baseName - 基础名称
 * @param existingCount - 已存在的同名数量（0 表示无重复）
 */
function formatUniqueName(baseName, existingCount) {
    if (existingCount <= 0) {
        return baseName;
    }
    return `${baseName}_${String(existingCount).padStart(3, '0')}`;
}

Object.defineProperty(nodePathManager, "__esModule", { value: true });
nodePathManager.NodePathManager = void 0;
const path_utils_1$1 = pathUtils;
class NodePathManager {
    _uuidToPath = new Map(); // UUID -> 路径
    _pathToUuid = new Map(); // 路径 -> UUID
    _lowerPathToUuids = new Map(); // 小写路径 -> UUID集合
    _nodeNames = new Map(); // 父节点UUID -> 节点名集合
    /**
        * 清理名称中的非法字符
        */
    _sanitizeName(name) {
        // 移除或替换路径中的非法字符
        return name.replace(/[/\\:*?"<>|]/g, '_');
    }
    /**
     * 生成唯一路径
     */
    generateUniquePath(uuid, name, parentUuid) {
        if (!parentUuid) {
            return '';
        }
        const parentPath = this._uuidToPath.get(parentUuid) || '';
        // 清理名称中的非法路径字符
        const cleanName = this._sanitizeName(name);
        // 检查名称是否唯一，如果不唯一则添加自增后缀
        const finalName = this.ensureUniqueName(parentUuid, cleanName);
        const finalPath = parentPath ? `${parentPath}/${finalName}` : `${finalName}`;
        this.add(uuid, finalPath);
        return finalPath;
    }
    add(uuid, path) {
        this._uuidToPath.set(uuid, path);
        this._pathToUuid.set(path, uuid);
        const lowerPath = path.toLowerCase();
        if (!this._lowerPathToUuids.has(lowerPath)) {
            this._lowerPathToUuids.set(lowerPath, new Set());
        }
        this._lowerPathToUuids.get(lowerPath).add(uuid);
    }
    remove(uuid) {
        const path = this._uuidToPath.get(uuid);
        if (path) {
            this._pathToUuid.delete(path);
            const lowerPath = path.toLowerCase();
            const uuids = this._lowerPathToUuids.get(lowerPath);
            if (uuids) {
                uuids.delete(uuid);
                if (uuids.size === 0) {
                    this._lowerPathToUuids.delete(lowerPath);
                }
            }
        }
        this._uuidToPath.delete(uuid);
        this._nodeNames.delete(uuid);
        const parentUuid = this._getParentUuid(path);
        if (parentUuid && this._nodeNames.has(parentUuid)) {
            const nameSet = this._nodeNames.get(parentUuid);
            const nodeName = path ? path.split('/').pop() : undefined;
            if (nodeName) {
                nameSet.delete(nodeName);
            }
        }
    }
    changeUuid(oldUuid, newUuid) {
        const path = this._uuidToPath.get(oldUuid);
        if (!path) {
            return;
        }
        this._pathToUuid.delete(path);
        this._uuidToPath.delete(oldUuid);
        this._uuidToPath.set(newUuid, path);
        this._pathToUuid.set(path, newUuid);
        const lowerPath = path.toLowerCase();
        if (!this._lowerPathToUuids.has(lowerPath)) {
            this._lowerPathToUuids.set(lowerPath, new Set());
        }
        this._lowerPathToUuids.get(lowerPath).add(newUuid);
        if (this._nodeNames.has(oldUuid)) {
            const nameMap = this._nodeNames.get(oldUuid);
            this._nodeNames.delete(oldUuid);
            this._nodeNames.set(newUuid, nameMap);
        }
    }
    clear() {
        this._uuidToPath.clear();
        this._pathToUuid.clear();
        this._lowerPathToUuids.clear();
        this._nodeNames.clear();
    }
    _getParentUuid(nodePath) {
        if (!nodePath) {
            return undefined;
        }
        const parts = nodePath.split('/');
        if (parts.length <= 1) {
            return undefined; // 已经是根节点或没有父节点
        }
        // 移除最后一个元素（当前节点），然后重新组合
        const parentPath = parts.slice(0, -1).join('/');
        const parentUuid = parentPath ? this._pathToUuid.get(parentPath) : undefined;
        return parentUuid;
    }
    /**
     * 确保节点名称在父节点下唯一
     */
    ensureUniqueName(parentUuid, baseName) {
        const uuid = parentUuid || '';
        if (!this._nodeNames.has(uuid)) {
            this._nodeNames.set(uuid, new Set());
        }
        const nameSet = this._nodeNames.get(uuid);
        if (!nameSet.has(baseName)) {
            nameSet.add(baseName);
            return baseName;
        }
        // 从 _001 开始扫描，复用已删除的名称
        let counter = 1;
        let newName = (0, path_utils_1$1.formatUniqueName)(baseName, counter);
        while (nameSet.has(newName)) {
            counter++;
            newName = (0, path_utils_1$1.formatUniqueName)(baseName, counter);
        }
        nameSet.add(newName);
        return newName;
    }
    getNodeUuid(path) {
        const result = this.getNodeResult(path);
        return result.uuid;
    }
    getNodeResult(path) {
        const result = this._pathToUuid.get(path);
        if (result) {
            return { uuid: result, exactMatch: true };
        }
        const lowerPath = path.toLowerCase();
        const uuids = this._lowerPathToUuids.get(lowerPath);
        if (!uuids || uuids.size === 0) {
            return { error: 'Not found' };
        }
        if (uuids.size > 1) {
            return { error: 'Ambiguous' };
        }
        const uuid = uuids.values().next().value;
        const exactMatch = this._pathToUuid.get(path) === uuid;
        return { uuid, exactMatch };
    }
    getNodePath(uuid) {
        return this._uuidToPath.get(uuid) || '';
    }
    updateUuid(uuid, newName, parentUuid) {
        const oldPath = this._uuidToPath.get(uuid);
        // 生成新的唯一路径
        const newPath = this.generateUniquePath(uuid, newName, parentUuid);
        // 更新路径映射
        this._uuidToPath.set(uuid, newPath);
        this._pathToUuid.delete(oldPath);
        this._pathToUuid.set(newPath, uuid);
        const oldLowerPath = oldPath.toLowerCase();
        const oldUuids = this._lowerPathToUuids.get(oldLowerPath);
        if (oldUuids) {
            oldUuids.delete(uuid);
            if (oldUuids.size === 0) {
                this._lowerPathToUuids.delete(oldLowerPath);
            }
        }
        const newLowerPath = newPath.toLowerCase();
        if (!this._lowerPathToUuids.has(newLowerPath)) {
            this._lowerPathToUuids.set(newLowerPath, new Set());
        }
        this._lowerPathToUuids.get(newLowerPath).add(uuid);
    }
    getNameSet(uuid) {
        if (!this._nodeNames.has(uuid)) {
            return null;
        }
        return this._nodeNames.get(uuid);
    }
}
nodePathManager.NodePathManager = NodePathManager;
nodePathManager.default = new NodePathManager();

var __createBinding = (commonjsGlobal && commonjsGlobal.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (commonjsGlobal && commonjsGlobal.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (commonjsGlobal && commonjsGlobal.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault$1 = (commonjsGlobal && commonjsGlobal.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(node, "__esModule", { value: true });
const events_1$1 = events;
const ObjectWalker = __importStar(objectWalker);
const utils_1 = __importDefault$1(utils);
const node_path_manager_1$1 = __importDefault$1(nodePathManager);
const lodash = require$$4;
class NodeManager extends events_1$1.EventEmitter {
    // 当前在场景树中的节点集合,包括在层级管理器中隐藏的
    allow = false;
    _map = {};
    _parentChildren = new Map(); // 父节点UUID -> 子节点UUID集合
    // 被删除节点集合,为了undo，编辑器不会把Node删除
    // _recycle: { [index: string]: any } = {};
    /**
     * 新增一个节点，当引擎将一个节点添加到场景树中，同时会遍历子节点，递归的调用这个方法。
     * @param uuid
     * @param node
     */
    add(uuid, node) {
        if (!this.allow) {
            return;
        }
        this._map[uuid] = node;
        const parentUuid = node.parent ? node.parent.uuid : undefined;
        // 生成唯一路径
        node_path_manager_1$1.default.generateUniquePath(uuid, node.name, parentUuid);
        // 维护父子关系
        if (parentUuid) {
            if (!this._parentChildren.has(parentUuid)) {
                this._parentChildren.set(parentUuid, new Set());
            }
            this._parentChildren.get(parentUuid).add(uuid);
        }
        try {
            this.emit('add', uuid, node);
        }
        catch (error) {
            console.error(error);
        }
    }
    /**
     * 删除一个节点，当引擎将一个节点从场景树中移除，同时会遍历子节点，递归的调用这个方法。
     * @param uuid
     */
    remove(uuid) {
        if (!this.allow) {
            return;
        }
        if (!this._map[uuid]) {
            return;
        }
        const node = this._map[uuid];
        node_path_manager_1$1.default.remove(uuid);
        // 清理父子关系
        this._cleanupParentRelations(uuid);
        // this._recycle[uuid] = this._map[uuid];
        delete this._map[uuid];
        try {
            this.emit('remove', uuid, node);
        }
        catch (error) {
            console.error(error);
        }
    }
    /**
     * 清空所有数据
     */
    clear() {
        if (!this.allow) {
            return;
        }
        this._map = {};
        node_path_manager_1$1.default.clear();
        this._parentChildren.clear();
        // this._recycle = {};
    }
    /**
     * 更新节点名称和路径
     */
    updateNodeName(uuid, newName) {
        if (!this._map[uuid]) {
            return;
        }
        const node = this._map[uuid];
        // 获取父节点UUID
        const parentUuid = this._getParentUuid(uuid);
        node_path_manager_1$1.default.updateUuid(uuid, newName, parentUuid);
        // 更新节点名称计数
        if (parentUuid) {
            this._updateNameCount(parentUuid, node.name, newName);
        }
        // 更新节点对象的名称
        node.name = newName;
    }
    /**
     * 获取一个节点数据，查的范围包括被删除的节点
     * @param uuid
     */
    getNode(uuid) {
        return this._map[uuid] ?? null;
    }
    getNodeByPath(path) {
        if (path === '/') {
            return cc.director.getScene() ?? null;
        }
        const result = node_path_manager_1$1.default.getNodeResult(path);
        if (result.error === 'Ambiguous') {
            throw new Error(`The path "${path}" is ambiguous. Multiple nodes found with case-insensitive match.`);
        }
        if (result.error === 'Not found') {
            return null;
        }
        if (result.uuid) {
            return this.getNode(result.uuid);
        }
        return null;
    }
    getNodePath(node) {
        if (!node?.uuid) {
            return '';
        }
        const path = node_path_manager_1$1.default.getNodePath(node.uuid);
        if (!path) {
            const scene = cc.director.getScene();
            return node === scene ? '/' : '';
        }
        return path;
    }
    getNodeUuidByPath(path) {
        if (path === '/') {
            const scene = cc.director.getScene();
            return scene ? scene.uuid : null;
        }
        const uuid = node_path_manager_1$1.default.getNodeUuid(path);
        const node = uuid && this.getNode(uuid);
        return node ? node.uuid : null;
    }
    getNodeByPathOrThrow(path) {
        const node = this.getNodeByPath(path);
        if (!node) {
            throw new Error(`找不到路径为 '${path}' 的节点`);
        }
        return node;
    }
    getNodeUuidByPathOrThrow(nodePath) {
        const nodeUuid = this.getNodeUuidByPath(nodePath);
        if (!nodeUuid) {
            throw new Error(`找不到路径为 "${nodePath}" 的节点`);
        }
        return nodeUuid;
    }
    /**
     * 获取所有的节点数据
     */
    getNodes() {
        return this._map;
    }
    /**
     * 获取场景中使用了某个资源的节点
     * @param uuid asset uuid
     */
    getNodesByAsset(uuid) {
        const nodesUuid = [];
        if (!uuid) {
            return nodesUuid;
        }
        ObjectWalker.walkProperties(cc.director.getScene().children, (obj, key, value, parsedObjects) => {
            let isAsset = false;
            if (value._uuid) {
                isAsset = value._uuid.includes(uuid) || utils_1.default.UUID.compressUUID(value._uuid, true).includes(uuid);
            }
            let isScript = false;
            if (value.__scriptUuid) {
                isScript = value.__scriptUuid.includes(uuid) || utils_1.default.UUID.compressUUID(value.__scriptUuid, false).includes(uuid);
            }
            if (isAsset || isScript) {
                const node = lodash.findLast(parsedObjects, (item) => item instanceof cc.Node);
                if (node && !nodesUuid.includes(node.uuid)) {
                    nodesUuid.push(node.uuid);
                }
            }
        }, {
            dontSkipNull: false,
            ignoreSubPrefabHelper: true,
        });
        return nodesUuid;
    }
    /**
     * 获取所有在场景树中的节点数据
     */
    getNodesInScene() {
        return this._map;
    }
    changeNodeUUID(oldUUID, newUUID) {
        if (oldUUID === newUUID) {
            return;
        }
        const node = this._map[oldUUID];
        if (!node) {
            return;
        }
        node._id = newUUID;
        // 更新节点路径
        node_path_manager_1$1.default.changeUuid(oldUUID, newUUID);
        this._map[newUUID] = node;
        delete this._map[oldUUID];
    }
    /**
    * 获取节点的父节点UUID
    */
    _getParentUuid(uuid) {
        for (const [parentUuid, children] of this._parentChildren.entries()) {
            if (children.has(uuid)) {
                return parentUuid;
            }
        }
    }
    /**
     * 清理父子关系
     */
    _cleanupParentRelations(uuid) {
        // 从父节点中移除
        const parentUuid = this._getParentUuid(uuid);
        if (parentUuid) {
            this._parentChildren.get(parentUuid)?.delete(uuid);
            this._updateNameCount(parentUuid, this._map[uuid]?.name, null);
        }
        // 递归清理所有子节点
        const children = this._parentChildren.get(uuid);
        if (children) {
            for (const childUuid of children) {
                this.remove(childUuid);
            }
            this._parentChildren.delete(uuid);
        }
    }
    /**
     * 更新名称计数
     */
    _updateNameCount(parentUuid, oldName, newName) {
        const nameSet = node_path_manager_1$1.default.getNameSet(parentUuid);
        if (!nameSet) {
            return;
        }
        if (oldName) {
            nameSet.delete(oldName);
        }
        if (newName) {
            nameSet.add(newName);
        }
    }
}
node.default = NodeManager;

var component = {};

var __importDefault = (commonjsGlobal && commonjsGlobal.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(component, "__esModule", { value: true });
const events_1 = events;
const node_path_manager_1 = __importDefault(nodePathManager);
const path_utils_1 = pathUtils;
class ComponentManager extends events_1.EventEmitter {
    allow = false;
    // ---- 组件菜单相关 ----
    // 引擎内注册的 menu 列表
    _menus = [];
    _pathToUuid = new Map();
    // 小写路径映射多个原始路径，例如小写路径：a/b/c, 原始路径可能是：a/B/c, A/B/c等
    _caseInsensitivePathMap = new Map();
    _uuidToPath = new Map();
    _addOriginPathToCaseInsensitivePathMap(lowercasePath, originalPaths) {
        if (!this._caseInsensitivePathMap.has(lowercasePath)) {
            this._caseInsensitivePathMap.set(lowercasePath, []);
        }
        this._caseInsensitivePathMap.get(lowercasePath).push(originalPaths);
    }
    /**
     * 添加一个组件的菜单项
     * @param component
     * @param path
     * @param priority
     */
    addMenu(component, path, priority) {
        if (priority === undefined) {
            priority = -1;
        }
        this._menus.push({
            menuPath: path,
            component,
            priority,
        });
        this.emit('add-menu', path);
    }
    /**
     * 删除一个组件的菜单项
     * @param component
     */
    removeMenu(component) {
        for (let i = 0; i < this._menus.length; i++) {
            if (this._menus[i].component !== component) {
                continue;
            }
            const item = this._menus[i];
            this._menus.splice(i--, 1);
            this.emit('delete-menu', item.menuPath);
        }
    }
    /**
     * 查询已经注册的组件菜单项
     */
    getMenus() {
        return this._menus;
    }
    // ---- 组件实例管理 ----
    // component
    _map = {};
    // 被删除的 component
    // _recycle: {[index: string]: any} = {};
    /**
     * 新增一个组件
     * 1. 调用Node的addComponent时会调用此方法
     * 2. Node添加到场景树时，会遍历身上的组件调用此方法
     * @param uuid
     * @param component
     */
    add(uuid, component) {
        if (!this.allow) {
            return;
        }
        this._map[uuid] = component;
        this._mapComponentToPath(component);
        try {
            this.emit('add', uuid, component);
        }
        catch (error) {
            console.error(error);
        }
    }
    _mapComponentToPath(component) {
        const path = this._generateUniquePath(component);
        this._pathToUuid.set(path, component.uuid);
        this._addOriginPathToCaseInsensitivePathMap(path.toLocaleLowerCase(), path);
        this._uuidToPath.set(component.uuid, path);
    }
    _removeComponentPath(uuid) {
        if (!this._uuidToPath.has(uuid)) {
            return;
        }
        const path = this._uuidToPath.get(uuid);
        this._uuidToPath.delete(uuid);
        if (path === undefined || !this._pathToUuid.has(path)) {
            return;
        }
        this._pathToUuid.delete(path);
        const originPaths = this._caseInsensitivePathMap.get(path.toLocaleLowerCase());
        if (originPaths === undefined) {
            return;
        }
        if (originPaths.length === 1) {
            this._caseInsensitivePathMap.delete(path.toLocaleLowerCase());
        }
        else {
            const index = originPaths.indexOf(path);
            if (index > -1) {
                originPaths.splice(index, 1);
            }
        }
    }
    _generateUniquePath(component) {
        const className = cc.js.getClassName(component);
        const nodePath = node_path_manager_1.default.getNodePath(component.node.uuid);
        // 从基础名称开始扫描，复用已删除的名称
        let count = 0;
        let path = `${nodePath}/${(0, path_utils_1.formatUniqueName)(className, count)}`;
        while (this._pathToUuid.has(path)) {
            count++;
            path = `${nodePath}/${(0, path_utils_1.formatUniqueName)(className, count)}`;
        }
        return path;
    }
    /**
     * 删除一个组件
     * 1. 调用Node的_removeComponent时会调用此方法,removeComponent会在下一帧调用_removeComponent,
     * removeComponent会调用一些Component的生命周期函数，而_removeComponent不会。
     * 2. Node添加到场景树时，会遍历身上的组件调用此方法
     * @param uuid
     */
    remove(uuid) {
        if (!this.allow) {
            return;
        }
        if (!this._map[uuid]) {
            return;
        }
        const comp = this._map[uuid];
        this._removeComponentPath(uuid);
        // this._recycle[uuid] = this._map[uuid];
        delete this._map[uuid];
        try {
            this.emit('remove', uuid, comp);
        }
        catch (error) {
            console.error(error);
        }
    }
    /**
     * 清空全部数据
     */
    clear() {
        if (!this.allow) {
            return;
        }
        this._map = {};
        // this._recycle = {};
    }
    /**
     * 获取一个指定的组件
     * @param uuid
     */
    getComponent(uuid) {
        return this._map[uuid] || null;
    }
    _getUuidFromLowercasePath(path) {
        let uuid = '';
        const lowercasePath = path.toLocaleLowerCase();
        if (!this._caseInsensitivePathMap.has(lowercasePath)) {
            return { code: -1, errMsg: `No component found for this path(${path}).`, uuid: '' };
        }
        const originalPaths = this._caseInsensitivePathMap.get(lowercasePath);
        if (originalPaths.length > 1) {
            let paths = '';
            originalPaths.forEach((originalPath, index) => {
                paths += originalPath;
                if (index !== originalPaths.length - 1) {
                    paths += ',';
                }
            });
            return { code: -2, errMsg: `This path contains multiple component paths(${paths}). Please specify which one to use.`, uuid: '' };
        }
        else {
            uuid = this._pathToUuid.get(originalPaths.at(0));
            if (!uuid) {
                throw `Logic error: No corresponding component found.`;
            }
        }
        return { code: 0, errMsg: '', uuid: uuid };
    }
    getComponentFromPath(path) {
        const uuid = this._pathToUuid.get(path);
        if (uuid) {
            return this.getComponent(uuid);
        }
        const index = path.lastIndexOf('/');
        let result = this._getUuidFromLowercasePath(path);
        if (result.code === 0) {
            return this.getComponent(result.uuid);
        }
        else if (result.code === -2) {
            // 这是已经找到路径，但是有多条
            throw result.errMsg;
        }
        else if (result.code === -1) {
            // 异常，表示未找到合适的组件
            const componentName = path.substring(index + 1).toLowerCase();
            const componentPath = path.substring(0, index).toLowerCase();
            if (componentName.startsWith('cc.')) {
                throw `No component found for this path(${path}).`;
            }
            // 添加'cc.',  a/b/c/xxx => a/b/c/cc.xxx
            const newFullPath = componentPath + '/cc.' + componentName;
            result = this._getUuidFromLowercasePath(newFullPath);
            if (result.code === 0) {
                return this.getComponent(result.uuid);
            }
            else if (result.code === -2) {
                throw result.errMsg;
            }
            throw `No component found for this path(${path}).`;
        }
    }
    getPathFromUuid(uuid) {
        return this._uuidToPath.get(uuid) || '';
    }
    /**
     * 获取所有的组件数据
     */
    getComponents() {
        return this._map;
    }
    changeUUID(oldUUID, newUUID) {
        if (oldUUID === newUUID) {
            return;
        }
        const comp = this._map[oldUUID];
        if (!comp) {
            return;
        }
        comp._id = newUUID;
        this._map[newUUID] = comp;
        delete this._map[oldUUID];
    }
}
component.default = ComponentManager;

var serialize = {};

var builder = {};

var _eeStubCc = {};

var _eeStubCc$1 = /*#__PURE__*/Object.freeze({
	__proto__: null,
	'default': _eeStubCc
});

var require$$0 = /*@__PURE__*/getAugmentedNamespace(_eeStubCc$1);

var types = {};

var hasRequiredTypes;

function requireTypes () {
	if (hasRequiredTypes) return types;
	hasRequiredTypes = 1;
	Object.defineProperty(types, "__esModule", { value: true });
	types.CustomClassNode = types.ClassNode = types.DictNode = types.ArrayNode = types.Node = types.TraceableDict = types.TraceableItem = void 0;
	const cc_1 = require$$0;
	const { DICT_JSON_LAYOUT, CLASS_TYPE, CLASS_KEYS, CLASS_PROP_TYPE_OFFSET, CUSTOM_OBJ_DATA_CONTENT, MASK_CLASS, } = cc_1.deserialize._macros;
	class TraceableItem {
	    // dataTypeID: DataTypeID | undefined = undefined;
	    // 引用关系。这里不考虑定义引用对象了，改用两个数组。因为引用对象使用者也会被耦合，而且使用者创建的临时对象会更多
	    tracers = [];
	    keys = [];
	    // get isSerialized (): boolean {
	    //     return this.result !== TraceableItem.NO_RESULT;
	    // };
	    static compareByRefCount(lhs, rhs) {
	        return rhs.tracers.length - lhs.tracers.length;
	    }
	    static NO_RESULT = Object.create(null);
	    // 需要追踪的数据
	    result = TraceableItem.NO_RESULT;
	    constructor() {
	        // this.source = source;
	        // this.serialized = serialized;
	    }
	    traceBy(tracer, key) {
	        this.tracers.push(tracer);
	        this.keys.push(key);
	    }
	    movedTo(index) {
	        for (let i = 0; i < this.tracers.length; i++) {
	            this.tracers[i][this.keys[i]] = index;
	        }
	    }
	}
	types.TraceableItem = TraceableItem;
	class TraceableDict {
	    // 当某个索引将会被延迟赋值时，使用这个字段来占坑
	    static PLACEHOLDER = 0;
	    values = new Map();
	    trace(source, tracer, key) {
	        let item = this.values.get(source);
	        if (!item) {
	            item = new TraceableItem();
	            this.values.set(source, item);
	        }
	        item.traceBy(tracer, key);
	        return item;
	    }
	    traceString(source, tracer, key) {
	        const item = this.trace(source, tracer, key);
	        // if (!item.isSerialized) {
	        item.result = source;
	        // }
	    }
	    get(source) {
	        return this.values.get(source);
	    }
	    getSortedItems() {
	        const array = Array.from(this.values.values());
	        array.sort(TraceableItem.compareByRefCount);
	        return array;
	    }
	    dump(offset = 0) {
	        const array = this.getSortedItems();
	        for (let i = 0; i < array.length; i++) {
	            array[i].movedTo(offset + i);
	        }
	        return array.map((x) => x.result);
	    }
	}
	types.TraceableDict = TraceableDict;
	// 保存场景对象结构，此 Node 非 cc.Node，而是用来表示关系对象关系图中的节点。这些节点会组织成有向有环图。
	class Node {
	    // 自身序列化时需要用的实际类型
	    selfType;
	    // 此对象被引用的次数，决定了是否必须放到 instances，以及后续的优化权重
	    refCount = 0;
	    // 当前节点是否在 instances 中
	    indexed = false;
	    // 当前节点只能放在 instances 中
	    shouldBeIndexed = false;
	    // 当前节点在 instances 中的索引，如果当前节点不在 instances 中则返回持有当前节点的祖先节点的索引
	    _index = -1;
	    get instanceIndex() {
	        return this._index;
	    }
	    set instanceIndex(val) {
	        if (this.indexed) {
	            throw new Error('Should not change instanceIndex on indexed object');
	        }
	        this._index = val;
	    }
	    // 被其它对象引用时的类型
	    get refType() {
	        return this.indexed ? 1 /* DataTypeID.InstanceRef */ : this.selfType;
	    }
	    static compareByRefCount(lhs, rhs) {
	        return rhs.refCount - lhs.refCount;
	    }
	    constructor(dataTypeID) {
	        this.selfType = dataTypeID;
	    }
	    setStatic(key, dataTypeID, data) {
	    }
	    setDynamic(target, key) {
	        ++target.refCount;
	    }
	    static AssetPlaceholderType = 0 /* DataTypeID.SimpleType */;
	    static AssetPlaceholderValue = null;
	    setAssetRefPlaceholderOnIndexed(key) {
	        // 设置会被延迟初始化的资源默认值
	        // 只有不为 AssetRefByInnerObj / Array_AssetRefByInnerObj 的属性才要多设置这个 placeholder
	        // 实际上只有数组需要提前初始化，因为如果赋值顺序不递增，会产生空洞，导致数组退化为字典，影响性能
	        // 类对象在构造函数已经预分配了，不需要在反序列化重新分配
	        // 字典对象不常用就不纠结了
	    }
	    dumpRecursively(refsBuilder) {
	        // 递归调用所有除了 DataTypeID.InstanceRef 类型的关联节点的 dumpRecursively。
	        // 由于所有可能产生循环引用的节点，都提前转换成了 DataTypeID.InstanceRef 类型，
	        // 所以这里直接递归就行，不会死循环。
	    }
	}
	types.Node = Node;
	class ArrayNode extends Node {
	    types;
	    datas;
	    static DeriveTypes = [
	        [0 /* DataTypeID.SimpleType */, 0 /* DataTypeID.SimpleType */],
	        [4 /* DataTypeID.Class */, 9 /* DataTypeID.Array_Class */],
	        [6 /* DataTypeID.AssetRefByInnerObj */, 3 /* DataTypeID.Array_AssetRefByInnerObj */],
	        [1 /* DataTypeID.InstanceRef */, 2 /* DataTypeID.Array_InstanceRef */],
	    ];
	    constructor(length) {
	        super(12 /* DataTypeID.Array */);
	        this.types = new Array(length);
	        this.datas = new Array(length);
	    }
	    setStatic(key, dataTypeID, data) {
	        this.types[key] = dataTypeID;
	        this.datas[key] = data;
	    }
	    setDynamic(target, key) {
	        super.setDynamic(target);
	        this.types[key] = undefined;
	        this.datas[key] = target;
	    }
	    setAssetRefPlaceholderOnIndexed(key) {
	        this.types[key] = Node.AssetPlaceholderType;
	        this.datas[key] = Node.AssetPlaceholderValue;
	    }
	    dumpRecursively(refsBuilder) {
	        // 递归依赖节点
	        for (let i = 0; i < this.datas.length; ++i) {
	            const target = this.datas[i];
	            if (target instanceof Node) {
	                if (target.indexed) {
	                    const refData = refsBuilder.addRef(this, i, target);
	                    if (isFinite(refData)) {
	                        this.types[i] = 1 /* DataTypeID.InstanceRef */;
	                        this.datas[i] = refData;
	                    }
	                    else {
	                        // 先赋值为 null，反序列化后会被 refs 延迟赋值为目标节点
	                        // TODO - 这样可能会导致无法特化为 Array_InstanceRef
	                        this.types[i] = 0 /* DataTypeID.SimpleType */;
	                        this.datas[i] = null;
	                    }
	                }
	                else {
	                    target.instanceIndex = this.instanceIndex;
	                    const data = target.dumpRecursively(refsBuilder);
	                    this.types[i] = target.refType;
	                    this.datas[i] = data;
	                }
	            }
	        }
	        // 特化数组
	        for (let i = 0; i < ArrayNode.DeriveTypes.length; ++i) {
	            const [elementType, arrayType] = ArrayNode.DeriveTypes[i];
	            if (this.types.every((x) => x === elementType)) {
	                this.selfType = arrayType;
	                return this.datas;
	            }
	        }
	        // 混合数组
	        this.selfType = 12 /* DataTypeID.Array */;
	        return [this.datas, ...this.types];
	    }
	}
	types.ArrayNode = ArrayNode;
	class DictNode extends Node {
	    data = [null];
	    json = Object.create(null);
	    dynamics = Object.create(null);
	    constructor() {
	        super(11 /* DataTypeID.Dict */);
	        this.data[DICT_JSON_LAYOUT] = this.json;
	    }
	    setStatic(key, dataTypeID, value) {
	        if (dataTypeID === 0 /* DataTypeID.SimpleType */) {
	            this.json[key] = value;
	        }
	        else {
	            this.data.push(key, dataTypeID, value);
	        }
	    }
	    setDynamic(target, key) {
	        super.setDynamic(target);
	        this.dynamics[key] = target;
	    }
	    dumpRecursively(refsBuilder) {
	        for (const key in this.dynamics) {
	            const target = this.dynamics[key];
	            if (target.indexed) {
	                const refData = refsBuilder.addRef(this, key, target);
	                if (isFinite(refData)) {
	                    this.data.push(key, 1 /* DataTypeID.InstanceRef */, refData);
	                }
	            }
	            else {
	                // 由于所有可能产生循环引用的节点，都提前转换成了 DataTypeID.InstanceRef 类型，
	                // 所以这里直接递归就行，不会死循环
	                target.instanceIndex = this.instanceIndex;
	                const data = target.dumpRecursively(refsBuilder);
	                if (target.refType === 0 /* DataTypeID.SimpleType */) {
	                    this.json[key] = data;
	                }
	                else {
	                    this.data.push(key, target.refType, data);
	                }
	            }
	        }
	        const isSimple = this.data.length === 1;
	        if (isSimple) {
	            this.selfType = 0 /* DataTypeID.SimpleType */;
	            return this.json;
	        }
	        else {
	            return this.data;
	        }
	    }
	}
	types.DictNode = DictNode;
	class ClassNode extends Node {
	    ctor;
	    simpleKeys = new Array();
	    simpleValues = [];
	    advanceds = new Array();
	    // dump 后的结果。dump 后 simpleValues 会被清空，advanceds 中的数据部分也会被删除
	    dumped;
	    // 从数据直接反向生成一个已经调用过 dumpRecursively 的对象
	    static fromData(clazz, mask, data) {
	        const ctor = clazz[CLASS_TYPE];
	        const res = new ClassNode(ctor);
	        res.dumped = data;
	        res.simpleValues = null;
	        const keys = clazz[CLASS_KEYS];
	        const classTypeOffset = clazz[CLASS_PROP_TYPE_OFFSET];
	        const maskTypeOffset = mask[mask.length - 1];
	        let i = MASK_CLASS + 1;
	        for (; i < maskTypeOffset; ++i) {
	            const key = keys[mask[i]];
	            res.simpleKeys.push(key);
	        }
	        for (let i = maskTypeOffset; i < data.length; ++i) {
	            const key = keys[mask[i]];
	            const type = clazz[mask[i] + classTypeOffset];
	            res.advanceds.push(key, type);
	        }
	        return res;
	    }
	    constructor(ctor) {
	        super(4 /* DataTypeID.Class */);
	        this.ctor = ctor;
	    }
	    setStatic(key, dataTypeID, value) {
	        if (dataTypeID === 0 /* DataTypeID.SimpleType */) {
	            this.simpleKeys.push(key);
	            // @ts-ignore
	            this.simpleValues.push(value);
	        }
	        else {
	            this.advanceds.push(key, dataTypeID, value);
	        }
	        // this.metas.push(key, dataTypeID);
	        // this.datas.push(value);
	    }
	    setDynamic(target, key) {
	        super.setDynamic(target);
	        this.advanceds.push(key, undefined, target);
	    }
	    dumpRecursively(refsBuilder) {
	        const advanceds = this.advanceds;
	        const TYPE_OFFSET = 1;
	        const VALUE_OFFSET = 2;
	        // dump children
	        for (let i = advanceds.length - 3; i >= 0; i -= 3) {
	            // let key = this.metas[m];
	            // let type = this.metas[m + 1];
	            const target = advanceds[i + VALUE_OFFSET];
	            if (target instanceof Node) {
	                if (target.indexed) {
	                    const refData = refsBuilder.addRef(this, advanceds[i], target);
	                    if (isFinite(refData)) {
	                        advanceds[i + TYPE_OFFSET] = 1 /* DataTypeID.InstanceRef */;
	                        advanceds[i + VALUE_OFFSET] = refData;
	                    }
	                    else {
	                        // Remove key-type-value tuple from advanceds
	                        advanceds.splice(i, 3);
	                    }
	                }
	                else {
	                    target.instanceIndex = this.instanceIndex;
	                    const dumped = target.dumpRecursively(refsBuilder);
	                    if (target.refType === 0 /* DataTypeID.SimpleType */) {
	                        this.simpleKeys.push(advanceds[i]);
	                        // @ts-ignore
	                        this.simpleValues.push(dumped);
	                        // Remove key-type-value tuple from advanceds
	                        advanceds.splice(i, 3);
	                    }
	                    else {
	                        advanceds[i + TYPE_OFFSET] = target.refType;
	                        advanceds[i + VALUE_OFFSET] = dumped;
	                    }
	                }
	            }
	        }
	        // dump values
	        const mask = TraceableDict.PLACEHOLDER;
	        // 缓存 dumped 对象，等对象都 dump 后再生成 mask 索引。
	        this.dumped = [mask].concat(this.simpleValues);
	        for (let i = 0; i < advanceds.length; i += 3) {
	            this.dumped.push(advanceds[i + VALUE_OFFSET]);
	        }
	        this.simpleValues = null;
	        this.advanceds = this.advanceds.filter((x, index) => index % 3 !== 2);
	        return this.dumped;
	    }
	}
	types.ClassNode = ClassNode;
	class CustomClassNode extends Node {
	    ctor;
	    content;
	    dumped;
	    // 从数据直接反向生成一个已经调用过 dumpRecursively 的对象
	    static fromData(ctor, data) {
	        const content = data[CUSTOM_OBJ_DATA_CONTENT];
	        const res = new CustomClassNode(ctor, content);
	        res.dumped = data;
	        return res;
	    }
	    constructor(ctor, content) {
	        super(10 /* DataTypeID.CustomizedClass */);
	        this.ctor = ctor;
	        this.content = content;
	    }
	    setStatic(key, dataTypeID, value) {
	        throw new Error('Should not set property of CustomClass');
	    }
	    setDynamic(target, key) {
	        throw new Error('Should not set property of CustomClass');
	    }
	    dumpRecursively(refsBuilder) {
	        const CLASS = TraceableDict.PLACEHOLDER;
	        this.dumped = [CLASS, this.content];
	        // 通过保存 dumped 对象，等对象都 dump 后再生成 mask 索引。
	        return this.dumped;
	    }
	}
	types.CustomClassNode = CustomClassNode;
	
	return types;
}

var createClassMask = {};

var hasRequiredCreateClassMask;

function requireCreateClassMask () {
	if (hasRequiredCreateClassMask) return createClassMask;
	hasRequiredCreateClassMask = 1;
	Object.defineProperty(createClassMask, "__esModule", { value: true });
	createClassMask.default = default_1;
	const cc_1 = require$$0;
	const types_1 = requireTypes();
	const { CLASS_PROP_TYPE_OFFSET, MASK_CLASS, OBJ_DATA_MASK, CUSTOM_OBJ_DATA_CLASS, } = cc_1.deserialize._macros;
	// 同一个构造函数，生成的类型可能有多个，每个类型叫作一个 Type。
	class Type {
	    properties = new Map();
	    nodes = new Array();
	    constructor(node) {
	        this.setNodeProperties(node);
	        this.nodes.push(node);
	    }
	    setNodeProperties(node) {
	        const properties = this.properties;
	        for (const simpleKey of node.simpleKeys) {
	            properties.set(simpleKey, 0 /* DataTypeID.SimpleType */);
	        }
	        for (let i = 0; i < node.advanceds.length; i += 2) {
	            const key = node.advanceds[i];
	            properties.set(key, node.advanceds[i + 1]);
	        }
	    }
	    addNode(node) {
	        const properties = this.properties;
	        let lackProperty = false;
	        for (const simpleKey of node.simpleKeys) {
	            if (properties.has(simpleKey)) {
	                if (properties.get(simpleKey) !== 0 /* DataTypeID.SimpleType */) {
	                    // 当前类的某个属性类型和目标对象的不同
	                    return false;
	                }
	            }
	            else {
	                lackProperty = true;
	            }
	        }
	        for (let i = 0; i < node.advanceds.length; i += 2) {
	            const key = node.advanceds[i];
	            if (properties.has(key)) {
	                if (properties.get(key) !== node.advanceds[i + 1]) {
	                    // 当前类的某个属性类型和目标对象的不同
	                    return false;
	                }
	            }
	            else {
	                lackProperty = true;
	            }
	        }
	        if (lackProperty) {
	            // 当前类的属性和类型是目标对象的子集
	            this.setNodeProperties(node);
	            this.nodes.push(node);
	            return true;
	        }
	        else {
	            // 当前类包含了目标对象的所有属性及类型
	            this.nodes.push(node);
	            return true;
	        }
	    }
	    static shouldUseSameMask(rhs) {
	        const lhs = this;
	        const ls = lhs.simpleKeys;
	        const rs = rhs.simpleKeys;
	        const la = lhs.advanceds;
	        const ra = rhs.advanceds;
	        if (ls.length !== rs.length || la.length !== ra.length) {
	            return false;
	        }
	        for (let i = 0; i < ls.length; ++i) {
	            if (ls[i] !== rs[i]) {
	                return false;
	            }
	        }
	        for (let i = 0; i < la.length; i += 2) {
	            if (la[i] !== ra[i]) {
	                return false;
	            }
	        }
	        return true;
	    }
	    dump(classId, sharedClasses, sharedMasks) {
	        // 缓存待生成的属性列表
	        const simples = new types_1.TraceableDict();
	        const advanceds = new types_1.TraceableDict();
	        // 缓存待生成的 mask 数据，由于每个 mask 都有与其完全匹配的对象结构，因此直接使用对象本身做为缓存就行
	        const maskNodes = new Array();
	        // dump mask
	        for (let i = 0; i < this.nodes.length; ++i) {
	            const node = this.nodes[i];
	            const maskNode = maskNodes.find(Type.shouldUseSameMask, node);
	            if (maskNode) {
	                sharedMasks.trace(maskNode, node.dumped, OBJ_DATA_MASK);
	            }
	            else {
	                // new mask
	                const maskData = [types_1.TraceableDict.PLACEHOLDER];
	                for (let i = 0; i < node.simpleKeys.length; ++i) {
	                    const key = node.simpleKeys[i];
	                    simples.traceString(key, maskData, maskData.length);
	                    maskData.push(types_1.TraceableDict.PLACEHOLDER);
	                }
	                const offset = maskData.length;
	                for (let i = 0; i < node.advanceds.length; i += 2) {
	                    const key = node.advanceds[i];
	                    advanceds.traceString(key, maskData, maskData.length);
	                    maskData.push(types_1.TraceableDict.PLACEHOLDER);
	                }
	                maskData.push(offset);
	                sharedClasses.trace(this, maskData, MASK_CLASS);
	                // register mask
	                const item = sharedMasks.trace(node, node.dumped, OBJ_DATA_MASK);
	                item.result = maskData;
	                maskNodes.push(node);
	            }
	        }
	        // dump class
	        const simpleKeys = simples.dump();
	        const advancedKeys = advanceds.dump(simpleKeys.length);
	        const keys = simpleKeys.concat(advancedKeys);
	        const offset = CLASS_PROP_TYPE_OFFSET + 1 - simpleKeys.length;
	        const dataTypes = advancedKeys.map((x) => this.properties.get(x));
	        const classData = [classId, keys, offset, ...dataTypes];
	        sharedClasses.get(this).result = classData;
	    }
	}
	function registerType(types, node) {
	    for (const type of types) {
	        if (type.addNode(node)) {
	            return;
	        }
	    }
	    const type = new Type(node);
	    types.push(type);
	}
	function default_1(classNodes) {
	    const sharedClasses = new types_1.TraceableDict();
	    const sharedMasks = new types_1.TraceableDict();
	    const ctors = new Map();
	    // generate types
	    for (let i = 0; i < classNodes.length; ++i) {
	        const node = classNodes[i];
	        const classId = node.ctor;
	        if (node instanceof types_1.CustomClassNode) {
	            sharedClasses.traceString(classId, node.dumped, CUSTOM_OBJ_DATA_CLASS);
	            continue;
	        }
	        let types = ctors.get(classId);
	        if (!types) {
	            types = [];
	            ctors.set(classId, types);
	        }
	        registerType(types, node);
	    }
	    // generate class/mask
	    for (const [classId, types] of ctors) {
	        // let types = ctors.get(classId) as Type[];
	        for (const type of types) {
	            type.dump(classId, sharedClasses, sharedMasks);
	        }
	    }
	    return {
	        sharedClasses: sharedClasses.dump(),
	        sharedMasks: sharedMasks.dump(),
	    };
	}
	
	return createClassMask;
}

var baseBuilder = {};

var hasRequiredBaseBuilder;

function requireBaseBuilder () {
	if (hasRequiredBaseBuilder) return baseBuilder;
	hasRequiredBaseBuilder = 1;
	Object.defineProperty(baseBuilder, "__esModule", { value: true });
	baseBuilder.Builder = void 0;
	const serialization_1 = require$$0;
	// 通过 builder 的 API，把当前序列化的所有数据传输给 builder，由 builder 生成具体的序列化格式
	class Builder {
	    constructor(options) {
	        this.minify = !!options.minify;
	        this.stringify = !!('stringify' in options ? options.stringify : true);
	        this._useCCON = options.useCCON ?? false;
	    }
	    // // 标记对象处于被多个参数共同引用的状态
	    // markAsSharedObj (obj: any): void;
	    dump() {
	        if (this._useCCON) {
	            return this._dumpAsCCON();
	        }
	        else {
	            return this._dumpAsJson();
	        }
	    }
	    get hasBinaryBuffer() {
	        return this._useCCON;
	    }
	    get mainBufferBuilder() {
	        return this._mainBufferBuilder;
	    }
	    stringify;
	    minify;
	    _mainBufferBuilder = new serialization_1.BufferBuilder();
	    _dumpAsJson() {
	        const mainJsonData = this.finalizeJsonPart();
	        if (this.stringify) {
	            return JSON.stringify(mainJsonData, null, this.minify ? 0 : 2);
	        }
	        else {
	            return mainJsonData;
	        }
	    }
	    _dumpAsCCON() {
	        const json = this.finalizeJsonPart();
	        const { _mainBufferBuilder: mainBufferBuilder } = this;
	        const chunks = mainBufferBuilder.byteLength === 0
	            ? []
	            : [mainBufferBuilder.get()];
	        return new serialization_1.CCON(json, chunks);
	    }
	}
	baseBuilder.Builder = Builder;
	
	return baseBuilder;
}

var hasRequiredBuilder;

function requireBuilder () {
	if (hasRequiredBuilder) return builder;
	hasRequiredBuilder = 1;
	(function (exports) {
		// 实现序列化的运行时数据格式
		// 参考文档：https://github.com/cocos-creator/3d-tasks/tree/master/design-docs/data-structure/data-structures-serialization.md
		var __createBinding = (commonjsGlobal && commonjsGlobal.__createBinding) || (Object.create ? (function(o, m, k, k2) {
		    if (k2 === undefined) k2 = k;
		    var desc = Object.getOwnPropertyDescriptor(m, k);
		    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
		      desc = { enumerable: true, get: function() { return m[k]; } };
		    }
		    Object.defineProperty(o, k2, desc);
		}) : (function(o, m, k, k2) {
		    if (k2 === undefined) k2 = k;
		    o[k2] = m[k];
		}));
		var __setModuleDefault = (commonjsGlobal && commonjsGlobal.__setModuleDefault) || (Object.create ? (function(o, v) {
		    Object.defineProperty(o, "default", { enumerable: true, value: v });
		}) : function(o, v) {
		    o["default"] = v;
		});
		var __importStar = (commonjsGlobal && commonjsGlobal.__importStar) || (function () {
		    var ownKeys = function(o) {
		        ownKeys = Object.getOwnPropertyNames || function (o) {
		            var ar = [];
		            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
		            return ar;
		        };
		        return ownKeys(o);
		    };
		    return function (mod) {
		        if (mod && mod.__esModule) return mod;
		        var result = {};
		        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
		        __setModuleDefault(result, mod);
		        return result;
		    };
		})();
		var __importDefault = (commonjsGlobal && commonjsGlobal.__importDefault) || function (mod) {
		    return (mod && mod.__esModule) ? mod : { "default": mod };
		};
		Object.defineProperty(exports, "__esModule", { value: true });
		exports.FORMAT_VERSION = void 0;
		exports.reduceEmptyArray = reduceEmptyArray;
		exports.getRootData = getRootData;
		const cc_1 = require$$0;
		const cc = __importStar(require$$0);
		const serialization_1 = require$$0;
		const types_1 = requireTypes();
		const create_class_mask_1 = __importDefault(requireCreateClassMask());
		const base_builder_1 = requireBaseBuilder();
		const { EMPTY_PLACEHOLDER, CUSTOM_OBJ_DATA_CLASS, CUSTOM_OBJ_DATA_CONTENT, } = cc_1.deserialize._macros;
		exports.FORMAT_VERSION = 1;
		// 序列化为任意值即可，反序列化时才会解析出来的对象
		const INNER_OBJ_PLACEHOLDER = 0;
		var RefsBuilder;
		(function (RefsBuilder) {
		    class Impl {
		        beforeOffsetRefs = new Array();
		        afterOffsetRefs = new Array();
		        ctx;
		        constructor(ctx) {
		            this.ctx = ctx;
		        }
		        addRef(owner, key, target) {
		            const canRefDirectly = (target.instanceIndex < owner.instanceIndex);
		            if (canRefDirectly) {
		                return target.instanceIndex;
		            }
		            const record = [NaN, key, target.instanceIndex];
		            if (owner.indexed) {
		                record[0 /* Refs.OWNER_OFFSET */] = owner.instanceIndex;
		                this.afterOffsetRefs.push(record);
		                return NaN;
		            }
		            else {
		                record[0 /* Refs.OWNER_OFFSET */] = INNER_OBJ_PLACEHOLDER;
		                this.beforeOffsetRefs.push(record);
		                // 返回对象需要在反序列化过程中赋值给 refs 数组的索引（运行时索引会 * 3）
		                return ~(this.beforeOffsetRefs.length - 1);
		            }
		        }
		        build() {
		            if (this.beforeOffsetRefs.length === 0 && this.afterOffsetRefs.length === 0) {
		                return null;
		            }
		            const offset = this.beforeOffsetRefs.length;
		            const allRefs = this.beforeOffsetRefs.concat(this.afterOffsetRefs);
		            const res = new Array(allRefs.length * 3 /* Refs.EACH_RECORD_LENGTH */ + 1);
		            let i = 0;
		            for (const ref of allRefs) {
		                res[i++] = ref[0 /* Refs.OWNER_OFFSET */];
		                const key = ref[1 /* Refs.KEY_OFFSET */];
		                if (typeof key === 'number') {
		                    res[i++] = ~key;
		                }
		                else {
		                    this.ctx.sharedStrings.traceString(key, res, i++);
		                }
		                res[i++] = ref[2 /* Refs.TARGET_OFFSET */];
		            }
		            res[i] = offset;
		            return res;
		        }
		    }
		    RefsBuilder.Impl = Impl;
		})(RefsBuilder || (RefsBuilder = {}));
		function reduceEmptyArray(array) {
		    return (array && array.length > 0) ? array : EMPTY_PLACEHOLDER;
		}
		class CompiledBuilder extends base_builder_1.Builder {
		    noNativeDep;
		    sharedUuids = new types_1.TraceableDict();
		    sharedStrings = new types_1.TraceableDict();
		    refsBuilder;
		    // 缓存资源使用情况
		    // [item1, key1, uuid1, item2, key2, uuid2, ...]
		    dependAssets = new Array();
		    rootNode;
		    normalNodes = new Array();
		    advancedNodes = new Array();
		    classNodes = new Array();
		    data = new Array(11 /* File.ARRAY_LENGTH */);
		    constructor(options) {
		        super(options);
		        if (options.forceInline) {
		            throw new Error('CompiledBuilder doesn\'t support `forceInline`');
		        }
		        this.noNativeDep = !!('noNativeDep' in options ? options.noNativeDep : true);
		        this.refsBuilder = new RefsBuilder.Impl(this);
		    }
		    // Object Nodes，将来如有复用则会变成 InstanceRef
		    setProperty_Array(owner, ownerInfo, key, options) {
		        const node = new types_1.ArrayNode(options.writeOnlyArray.length);
		        this.advancedNodes.push(node);
		        this.setDynamicProperty(ownerInfo, key, node);
		        return node;
		    }
		    setProperty_Dict(owner, ownerInfo, key, options) {
		        const node = new types_1.DictNode();
		        this.advancedNodes.push(node);
		        this.setDynamicProperty(ownerInfo, key, node);
		        return node;
		    }
		    setProperty_Class(owner, ownerInfo, key, options) {
		        const node = new types_1.ClassNode(options.type);
		        this.normalNodes.push(node);
		        this.classNodes.push(node);
		        this.setDynamicProperty(ownerInfo, key, node);
		        return node;
		    }
		    setProperty_CustomizedClass(owner, ownerInfo, key, options) {
		        const node = new types_1.CustomClassNode(options.type, options.content);
		        this.advancedNodes.push(node);
		        this.classNodes.push(node);
		        this.setDynamicProperty(ownerInfo, key, node);
		        return node;
		    }
		    // parsed
		    setProperty_ParsedObject(ownerInfo, key, valueInfo, formerlySerializedAs) {
		        ownerInfo.setDynamic(valueInfo, key);
		    }
		    // Static Values
		    setProperty_Raw(owner, ownerInfo, key, value, options) {
		        ownerInfo.setStatic(key, 0 /* DataTypeID.SimpleType */, value);
		    }
		    setProperty_ValueType(owner, ownerInfo, key, value, options) {
		        if (!ownerInfo) {
		            throw new Error('CompiledBulider: Not support serializing ValueType as root object.');
		        }
		        const data = (0, serialization_1.serializeBuiltinValueType)(value);
		        if (!data) {
		            // not built-in value type, just serialize as normal class
		            return null;
		        }
		        let dataTypeID = 8 /* DataTypeID.ValueType */;
		        if (options && options.defaultValue instanceof cc.ValueType) {
		            dataTypeID = 5 /* DataTypeID.ValueTypeCreated */;
		        }
		        ownerInfo.setStatic(key, dataTypeID, data);
		        return data;
		    }
		    setProperty_TypedArray(owner, ownerInfo, key, value, options) {
		        if (!(owner instanceof cc.Node) || key !== '_trs') {
		            throw new Error('Not support to serialize TypedArray yet. Can only use TypedArray in TRS.');
		        }
		        if (value.length !== 10) {
		            throw new Error(`TRS ${value} should contains 10 elements.`);
		        }
		        const data = Array.from(value);
		        ownerInfo.setStatic(key, 7 /* DataTypeID.TRS */, data);
		    }
		    setProperty_AssetUuid(owner, ownerInfo, key, uuid, options) {
		        // 先缓存到 dependAssets，最后 ownerItem 如做为嵌套对象将改成 AssetRefByInnerObj
		        const ownerNode = ownerInfo;
		        this.dependAssets.push(ownerNode, key, uuid);
		        if (ownerNode instanceof types_1.CustomClassNode) {
		            ownerNode.shouldBeIndexed = true;
		        }
		    }
		    setRoot(objInfo) {
		        this.rootNode = objInfo;
		    }
		    // markAsSharedObj (obj: any): void {}
		    setDynamicProperty(ownerInfo, key, node) {
		        ownerInfo && ownerInfo.setDynamic(node, key);
		    }
		    collectInstances() {
		        this.normalNodes = this.normalNodes.filter((x) => x.refCount > 1);
		        this.normalNodes.sort(types_1.Node.compareByRefCount);
		        this.advancedNodes = this.advancedNodes.filter((x) => x.shouldBeIndexed || x.refCount > 1);
		        this.advancedNodes.sort(types_1.Node.compareByRefCount);
		        const rootNode = this.rootNode;
		        if (rootNode instanceof types_1.ClassNode) {
		            // root is normal
		            const rootIndex = this.normalNodes.indexOf(rootNode);
		            if (rootIndex !== -1) {
		                this.normalNodes.splice(rootIndex, 1);
		            }
		            this.normalNodes.unshift(rootNode);
		        }
		        else {
		            // root is advanced
		            // @ts-ignore
		            const rootIndex = this.advancedNodes.indexOf(rootNode);
		            if (rootIndex === -1) {
		                // root.refCount <= 1
		                this.advancedNodes.length;
		                // @ts-ignore
		                this.advancedNodes.push(rootNode);
		            }
		        }
		        const normalCount = this.normalNodes.length;
		        for (let i = 0; i < normalCount; ++i) {
		            const obj = this.normalNodes[i];
		            obj.instanceIndex = i;
		            obj.indexed = true;
		        }
		        for (let i = 0; i < this.advancedNodes.length; ++i) {
		            const obj = this.advancedNodes[i];
		            obj.instanceIndex = normalCount + i;
		            obj.indexed = true;
		        }
		        // TODO - 数组尽量特化为 Array_InstanceRef 以加快反序列化性能（但是又会增加索引数量及索引类型）
		        // TODO - 分析引用关系，让相互引用的对象尽量同时反序列化，提升内存命中率。
		        // TODO - 分析引用关系，让被依赖的对象尽量提前序列化，减少 refs 数据量的开销（多生成 owner、key 的索引），以及设置内嵌对象实例到 owner 的开销
		    }
		    // 生成 Instances
		    dumpInstances() {
		        const objCount = this.normalNodes.length + this.advancedNodes.length;
		        const instances = new Array(objCount);
		        const normalCount = this.normalNodes.length;
		        for (let i = 0; i < normalCount; ++i) {
		            const obj = this.normalNodes[i];
		            instances[i] = obj.dumpRecursively(this.refsBuilder);
		        }
		        for (let i = 0; i < this.advancedNodes.length; ++i) {
		            const obj = this.advancedNodes[i];
		            const dumped = obj.dumpRecursively(this.refsBuilder);
		            if (obj instanceof types_1.CustomClassNode) {
		                instances[normalCount + i] = dumped[CUSTOM_OBJ_DATA_CONTENT];
		            }
		            else {
		                instances[normalCount + i] = dumped;
		            }
		        }
		        if (this.rootNode.instanceIndex !== 0 ||
		            typeof instances[instances.length - 1] === 'number' || // 防止最后一个数字被错当 rootInfo
		            !this.noNativeDep) {
		            const rootIndex = this.rootNode.instanceIndex;
		            instances.push(this.noNativeDep ? rootIndex : ~rootIndex);
		        }
		        this.data[5 /* File.Instances */] = instances;
		    }
		    // 生成 InstanceTypes
		    dumpInstanceTypes() {
		        const instanceTypes = this.advancedNodes.map((x) => {
		            if (x instanceof types_1.CustomClassNode) {
		                return x.dumped[CUSTOM_OBJ_DATA_CLASS];
		            }
		            else {
		                return ~x.selfType;
		            }
		        });
		        this.data[6 /* File.InstanceTypes */] = reduceEmptyArray(instanceTypes);
		    }
		    dumpDependUuids() {
		        const innerDepends = {
		            owners: new Array(),
		            keys: new Array(),
		            uuids: new Array(),
		        };
		        const indexedDepends = {
		            owners: new Array(),
		            keys: new Array(),
		            uuids: new Array(),
		        };
		        const array = this.dependAssets;
		        for (let i = 0; i < array.length; i += 3) {
		            const owner = array[i];
		            let key = array[i + 1];
		            const uuid = array[i + 2];
		            let depends;
		            if (owner.indexed) {
		                depends = indexedDepends;
		                owner.setAssetRefPlaceholderOnIndexed(key);
		                depends.owners.push(owner.instanceIndex);
		            }
		            else {
		                depends = innerDepends;
		                owner.setStatic(key, 6 /* DataTypeID.AssetRefByInnerObj */, depends.owners.length);
		                depends.owners.push(INNER_OBJ_PLACEHOLDER);
		            }
		            if (typeof key === 'number') {
		                key = ~key;
		            }
		            depends.keys.push(key);
		            depends.uuids.push(uuid);
		        }
		        this.data[8 /* File.DependObjs */] = innerDepends.owners.concat(indexedDepends.owners);
		        const allKeys = this.data[9 /* File.DependKeys */] = innerDepends.keys.concat(indexedDepends.keys);
		        for (let i = 0; i < allKeys.length; ++i) {
		            const key = allKeys[i];
		            if (typeof key === 'string') {
		                this.sharedStrings.traceString(key, allKeys, i);
		            }
		        }
		        const allUuids = this.data[10 /* File.DependUuidIndices */] = innerDepends.uuids.concat(indexedDepends.uuids);
		        for (let i = 0; i < allUuids.length; ++i) {
		            const uuid = allUuids[i];
		            this.sharedUuids.traceString(uuid, allUuids, i);
		        }
		    }
		    finalizeJsonPart() {
		        // 1. 遍历所有对象，将 root 和所有引用数超过 1 的对象放到 instances 中，同时将数据转换成引用
		        // （如果已经在 instances 中则跳过）
		        this.collectInstances();
		        // 2. 生成资源依赖关系
		        this.dumpDependUuids();
		        // 3. 生成所有对象数据
		        this.dumpInstances();
		        this.data[0 /* File.Version */] = exports.FORMAT_VERSION;
		        // data[File.SharedUuids] = this.dependSharedUuids.dump();
		        // data[File.SharedStrings] = this.sharedStrings.dump();
		        // 4. 生成 SharedClasses 和 SharedMasks
		        const { sharedClasses, sharedMasks } = (0, create_class_mask_1.default)(this.classNodes);
		        this.data[3 /* File.SharedClasses */] = sharedClasses;
		        this.data[4 /* File.SharedMasks */] = reduceEmptyArray(sharedMasks);
		        // 5. 写入 instance 对象类型
		        this.dumpInstanceTypes();
		        this.data[7 /* File.Refs */] = this.refsBuilder.build() || EMPTY_PLACEHOLDER;
		        const strings = this.sharedStrings.dump();
		        this.data[2 /* File.SharedStrings */] = reduceEmptyArray(strings);
		        const uuids = this.sharedUuids.dump();
		        this.data[1 /* File.SharedUuids */] = reduceEmptyArray(uuids);
		        return this.data;
		    }
		}
		exports.default = CompiledBuilder;
		function getRootData(data) {
		    const instances = data[5 /* File.Instances */];
		    if (Array.isArray(instances)) {
		        const rootInfo = instances[instances.length - 1];
		        if (typeof rootInfo === 'number') {
		            return instances[rootInfo >= 0 ? rootInfo : ~rootInfo];
		        }
		        else {
		            return instances[0];
		        }
		    }
		    else {
		        return instances;
		    }
		}
		
	} (builder));
	return builder;
}

var packJsons = {};

var hasRequiredPackJsons;

function requirePackJsons () {
	if (hasRequiredPackJsons) return packJsons;
	hasRequiredPackJsons = 1;
	var __importDefault = (commonjsGlobal && commonjsGlobal.__importDefault) || function (mod) {
	    return (mod && mod.__esModule) ? mod : { "default": mod };
	};
	Object.defineProperty(packJsons, "__esModule", { value: true });
	packJsons.default = packJSONs;
	const cc_1 = require$$0;
	const types_1 = requireTypes();
	const builder_1 = requireBuilder();
	const create_class_mask_1 = __importDefault(requireCreateClassMask());
	const { EMPTY_PLACEHOLDER, CUSTOM_OBJ_DATA_CLASS, ARRAY_ITEM_VALUES, CLASS_PROP_TYPE_OFFSET, MASK_CLASS, OBJ_DATA_MASK, DICT_JSON_LAYOUT, PACKED_SECTIONS, } = cc_1.deserialize._macros;
	function genArrayParser(parser) {
	    return (data, value, classNodes) => {
	        for (let i = 0; i < value.length; ++i) {
	            parser(data, value[i], classNodes);
	        }
	    };
	}
	function parseArray(data, value, classNodes) {
	    const array = value[ARRAY_ITEM_VALUES];
	    for (let i = 0; i < array.length; ++i) {
	        const type = value[i + 1];
	        const op = PARSERS[type];
	        if (op) {
	            op(data, array[i], classNodes);
	        }
	    }
	}
	function parseDict(data, value, classNodes) {
	    for (let i = DICT_JSON_LAYOUT + 1; i < value.length; i += 3) {
	        const type = value[i + 1];
	        const op = PARSERS[type];
	        if (op) {
	            const subValue = value[i + 2];
	            op(data, subValue, classNodes);
	        }
	    }
	}
	function parseClass(data, value, classNodes) {
	    const mask = data[4 /* File.SharedMasks */][value[OBJ_DATA_MASK]];
	    const clazz = data[3 /* File.SharedClasses */][mask[MASK_CLASS]];
	    const node = types_1.ClassNode.fromData(clazz, mask, value);
	    classNodes.push(node);
	    const classTypeOffset = clazz[CLASS_PROP_TYPE_OFFSET];
	    const maskTypeOffset = mask[mask.length - 1];
	    // parse advanced type
	    for (let i = maskTypeOffset; i < value.length; ++i) {
	        const type = clazz[mask[i] + classTypeOffset];
	        const op = PARSERS[type];
	        if (op) {
	            op(data, value[i], classNodes);
	        }
	    }
	}
	function parseCustomClass(data, value, classNodes) {
	    const ctor = data[3 /* File.SharedClasses */][value[CUSTOM_OBJ_DATA_CLASS]];
	    const node = types_1.CustomClassNode.fromData(ctor, value);
	    classNodes.push(node);
	}
	const PARSERS = new Array(13 /* DataTypeID.ARRAY_LENGTH */);
	PARSERS.fill(null);
	PARSERS[4 /* DataTypeID.Class */] = parseClass;
	PARSERS[10 /* DataTypeID.CustomizedClass */] = parseCustomClass;
	PARSERS[12 /* DataTypeID.Array */] = parseArray;
	PARSERS[9 /* DataTypeID.Array_Class */] = genArrayParser(parseClass);
	PARSERS[11 /* DataTypeID.Dict */] = parseDict;
	function parseInstances(data, classNodes) {
	    const sharedClasses = data[3 /* File.SharedClasses */];
	    const instances = data[5 /* File.Instances */];
	    const instanceTypes = data[6 /* File.InstanceTypes */];
	    const instanceTypesLen = instanceTypes === EMPTY_PLACEHOLDER ? 0 : instanceTypes.length;
	    const rootInfo = instances[instances.length - 1];
	    let normalObjectCount = instances.length - instanceTypesLen;
	    if (typeof rootInfo === 'number') {
	        --normalObjectCount;
	    }
	    let insIndex = 0;
	    for (; insIndex < normalObjectCount; ++insIndex) {
	        const eachData = instances[insIndex];
	        parseClass(data, eachData, classNodes);
	    }
	    if (instanceTypes) {
	        for (let typeIndex = 0; typeIndex < instanceTypesLen; ++typeIndex, ++insIndex) {
	            let type = instanceTypes[typeIndex];
	            const eachData = instances[insIndex];
	            if (type >= 0) {
	                // class index for DataTypeID.CustomizedClass
	                const classId = sharedClasses[type];
	                const node = types_1.CustomClassNode.fromData(classId, [type, eachData]);
	                node.instanceIndex = insIndex;
	                classNodes.push(node);
	                // @ts-ignore: 用于将类型更新到对应的 InstanceTypes
	                instanceTypes[typeIndex] = node;
	            }
	            else {
	                // Other
	                type = ~type;
	                const op = PARSERS[type];
	                if (op) {
	                    // @ts-ignore
	                    op(data, eachData, classNodes);
	                }
	            }
	        }
	    }
	}
	function parseJSON(data, packedUuids, packedStrings, classNodes) {
	    const sharedUuids = data[1 /* File.SharedUuids */];
	    const sharedStrings = data[2 /* File.SharedStrings */];
	    // merge uuids
	    const uuidIndices = data[10 /* File.DependUuidIndices */];
	    for (let j = 0; j < uuidIndices.length; ++j) {
	        const uuid = sharedUuids[uuidIndices[j]];
	        packedUuids.traceString(uuid, uuidIndices, j);
	    }
	    // merge strings
	    if (data[7 /* File.Refs */]) {
	        const refs = data[7 /* File.Refs */];
	        const dataLength = refs.length - 1;
	        for (let i = 0; i < dataLength; i += 3 /* Refs.EACH_RECORD_LENGTH */) {
	            const key = refs[i + 1 /* Refs.KEY_OFFSET */];
	            if (key >= 0) {
	                const str = sharedStrings[key];
	                packedStrings.traceString(str, refs, i + 1 /* Refs.KEY_OFFSET */);
	            }
	        }
	    }
	    const dependKeys = data[9 /* File.DependKeys */];
	    for (let i = 0; i < dependKeys.length; ++i) {
	        const key = dependKeys[i];
	        if (key >= 0) {
	            const str = sharedStrings[key];
	            packedStrings.traceString(str, dependKeys, i);
	        }
	    }
	    // merge classes/masks
	    parseInstances(data, classNodes);
	}
	// 此函数会修改传入的 datas
	function packJSONs(datas) {
	    const packedUuids = new types_1.TraceableDict();
	    const packedStrings = new types_1.TraceableDict();
	    const classNodes = new Array();
	    // 重建所有 dump 后的 ClassNode/CustomClassNode
	    for (let i = 0; i < datas.length; ++i) {
	        parseJSON(datas[i], packedUuids, packedStrings, classNodes);
	    }
	    // 重新生成所有 class/mask
	    const { sharedClasses: packedClasses, sharedMasks: packedMasks } = (0, create_class_mask_1.default)(classNodes);
	    for (let i = 0; i < datas.length; ++i) {
	        const data = datas[i];
	        // 更新 InstanceTypes 类型的信息
	        const instanceTypes = data[6 /* File.InstanceTypes */];
	        if (instanceTypes) {
	            for (let i = 0; i < instanceTypes.length; ++i) {
	                const type = instanceTypes[i];
	                if (type instanceof types_1.CustomClassNode) {
	                    instanceTypes[i] = type.dumped[CUSTOM_OBJ_DATA_CLASS];
	                }
	            }
	        }
	        // 抹去原有的共享信息
	        data.splice(0, 5);
	    }
	    // @ts-ignore
	    const res = new Array(PACKED_SECTIONS + 1);
	    res[0 /* File.Version */] = builder_1.FORMAT_VERSION;
	    res[1 /* File.SharedUuids */] = (0, builder_1.reduceEmptyArray)(packedUuids.dump());
	    res[2 /* File.SharedStrings */] = (0, builder_1.reduceEmptyArray)(packedStrings.dump());
	    res[3 /* File.SharedClasses */] = packedClasses;
	    res[4 /* File.SharedMasks */] = (0, builder_1.reduceEmptyArray)(packedMasks);
	    // @ts-ignore
	    res[PACKED_SECTIONS] = datas;
	    return res;
	}
	
	return packJsons;
}

var parser = {};

var dynamicBuilder = {};

var hasRequiredDynamicBuilder;

function requireDynamicBuilder () {
	if (hasRequiredDynamicBuilder) return dynamicBuilder;
	hasRequiredDynamicBuilder = 1;
	Object.defineProperty(dynamicBuilder, "__esModule", { value: true });
	dynamicBuilder.asAsset = asAsset;
	dynamicBuilder.setName = setName;
	dynamicBuilder.findRootObject = findRootObject;
	dynamicBuilder.assert = assert;
	const cc_1 = require$$0;
	const base_builder_1 = requireBaseBuilder();
	class DynamicBuilder extends base_builder_1.Builder {
	    forceInline;
	    // list of serialized data
	    serializedList = [];
	    constructor(options) {
	        super(options);
	        this.forceInline = !!options.forceInline;
	    }
	    setProperty_Array(owner, ownerInfo, key, options) {
	        return this.addObject(options.writeOnlyArray, ownerInfo, key, options.formerlySerializedAs, false);
	    }
	    setProperty_Dict(owner, ownerInfo, key, options) {
	        return this.addObject({}, ownerInfo, key, options?.formerlySerializedAs, false);
	    }
	    addObject(data, ownerInfo, key, formerlySerializedAs, forceIndexed) {
	        let id = -1;
	        let refData = data;
	        const isRoot = !ownerInfo;
	        if ((!this.forceInline && forceIndexed) || isRoot) {
	            id = this.serializedList.length;
	            this.serializedList.push(data);
	            if (!this.forceInline) {
	                refData = { __id__: id };
	            }
	        }
	        if (ownerInfo) {
	            ownerInfo.data[key] = refData;
	            if (formerlySerializedAs) {
	                ownerInfo.data[formerlySerializedAs] = refData;
	            }
	        }
	        return { data, id };
	    }
	    setProperty_Class(owner, ownerInfo, key, options) {
	        const data = {
	            __type__: options.type,
	        };
	        return this.addObject(data, ownerInfo, key, options.formerlySerializedAs, !(options.uniquelyReferenced ?? false));
	    }
	    setProperty_CustomizedClass(owner, ownerInfo, key, options) {
	        const data = {
	            __type__: options.type,
	            content: options.content,
	        };
	        return this.addObject(data, ownerInfo, key, options.formerlySerializedAs, true);
	    }
	    // parsed
	    setProperty_ParsedObject(ownerInfo, key, valueInfo, formerlySerializedAs) {
	        if (!this.forceInline && valueInfo.id >= 0) {
	            // 可索引对象
	            ownerInfo.data[key] = { __id__: valueInfo.id };
	        }
	        else {
	            // 不可索引对象，直接内联数据
	            ownerInfo.data[key] = valueInfo.data;
	        }
	        if (formerlySerializedAs) {
	            ownerInfo.data[formerlySerializedAs] = ownerInfo.data[key];
	        }
	    }
	    // Static Values
	    setProperty_Raw(owner, ownerInfo, key, value, options) {
	        ownerInfo.data[key] = value;
	        if (options?.formerlySerializedAs) {
	            ownerInfo.data[options.formerlySerializedAs] = value;
	        }
	    }
	    setProperty_ValueType(owner, ownerInfo, key, value, options) {
	        const data = {
	            __type__: cc_1.js.getClassId(value, false),
	        };
	        const props = value.constructor.__values__;
	        if (props) {
	            for (let p = 0; p < props.length; p++) {
	                const propName = props[p];
	                data[propName] = value[propName];
	            }
	        }
	        if (ownerInfo) {
	            ownerInfo.data[key] = data;
	            if (options?.formerlySerializedAs) {
	                ownerInfo.data[options.formerlySerializedAs] = data;
	            }
	            return { data, id: -1 };
	        }
	        else {
	            this.serializedList.push(data);
	            return { data, id: 0 };
	        }
	    }
	    setProperty_TypedArray(owner, ownerInfo, key, value, options) {
	        let data;
	        if (this.hasBinaryBuffer) {
	            const isDataView = value instanceof DataView;
	            if (!isDataView) {
	                this.mainBufferBuilder.alignAs(value.constructor.BYTES_PER_ELEMENT);
	            }
	            const offset = this.mainBufferBuilder.append(value);
	            data = {
	                __type__: 'TypedArrayRef',
	                ctor: value.constructor.name,
	                offset,
	                length: isDataView ? value.byteLength : value.length,
	            };
	        }
	        else {
	            data = {
	                __type__: 'TypedArray',
	                ctor: value.constructor.name,
	                array: Array.from(value),
	            };
	        }
	        if (ownerInfo) {
	            ownerInfo.data[key] = data;
	            if (options?.formerlySerializedAs) {
	                ownerInfo.data[options.formerlySerializedAs] = data;
	            }
	        }
	        else {
	            this.serializedList.push(data);
	        }
	    }
	    setProperty_AssetUuid(owner, ownerInfo, key, uuid, options) {
	        ownerInfo.data[key] = { __uuid__: uuid };
	        if (options?.formerlySerializedAs) {
	            ownerInfo.data[options.formerlySerializedAs] = ownerInfo.data[key];
	        }
	        if (options?.expectedType) {
	            ownerInfo.data[key].__expectedType__ = options.expectedType;
	        }
	    }
	    setRoot(objInfo) {
	        assert(objInfo.id === 0, `Wrong root object to serialize, id is ${objInfo.id}`);
	    }
	    finalizeJsonPart() {
	        const serializedList = this.serializedList;
	        let serializedData;
	        if (serializedList.length === 1 && !Array.isArray(serializedList[0])) {
	            serializedData = serializedList[0];
	        }
	        else {
	            serializedData = serializedList;
	        }
	        return serializedData;
	    }
	}
	dynamicBuilder.default = DynamicBuilder;
	/**
	 * Create a pseudo object which will be force serialized as a reference to any asset by specified uuid.
	 */
	function asAsset(uuid, type = cc_1.Asset) {
	    if (!uuid) {
	        (0, cc_1.error)('[EditorExtends.serialize.asAsset] The uuid must be non-nil!');
	        return null;
	    }
	    const pseudoAsset = new type();
	    pseudoAsset._uuid = uuid;
	    return pseudoAsset;
	}
	/**
	 * Set the asset's name directly in JSON object
	 */
	function setName(data, name) {
	    if (Array.isArray(data)) {
	        data[0]._name = name;
	    }
	    else {
	        data._name = name;
	    }
	}
	function findRootObject(data, type) {
	    if (Array.isArray(data)) {
	        for (let i = 0; i < data.length; i++) {
	            const obj = data[i];
	            if (obj.__type__ === type) {
	                return obj;
	            }
	        }
	    }
	    else if (data.__type__ === type) {
	        return data;
	    }
	    return null;
	}
	function assert(condition, message) {
	    if (!condition) {
	        throw new Error(message || 'Assertion failed');
	    }
	}
	
	return dynamicBuilder;
}

var hasRequiredParser;

function requireParser () {
	if (hasRequiredParser) return parser;
	hasRequiredParser = 1;
	// 实现序列化的场景解析逻辑
	var __createBinding = (commonjsGlobal && commonjsGlobal.__createBinding) || (Object.create ? (function(o, m, k, k2) {
	    if (k2 === undefined) k2 = k;
	    var desc = Object.getOwnPropertyDescriptor(m, k);
	    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
	      desc = { enumerable: true, get: function() { return m[k]; } };
	    }
	    Object.defineProperty(o, k2, desc);
	}) : (function(o, m, k, k2) {
	    if (k2 === undefined) k2 = k;
	    o[k2] = m[k];
	}));
	var __setModuleDefault = (commonjsGlobal && commonjsGlobal.__setModuleDefault) || (Object.create ? (function(o, v) {
	    Object.defineProperty(o, "default", { enumerable: true, value: v });
	}) : function(o, v) {
	    o["default"] = v;
	});
	var __importStar = (commonjsGlobal && commonjsGlobal.__importStar) || (function () {
	    var ownKeys = function(o) {
	        ownKeys = Object.getOwnPropertyNames || function (o) {
	            var ar = [];
	            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
	            return ar;
	        };
	        return ownKeys(o);
	    };
	    return function (mod) {
	        if (mod && mod.__esModule) return mod;
	        var result = {};
	        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
	        __setModuleDefault(result, mod);
	        return result;
	    };
	})();
	var __importDefault = (commonjsGlobal && commonjsGlobal.__importDefault) || function (mod) {
	    return (mod && mod.__esModule) ? mod : { "default": mod };
	};
	Object.defineProperty(parser, "__esModule", { value: true });
	parser.Parser = void 0;
	parser.default = serialize;
	const cc_1 = require$$0;
	const cc = __importStar(require$$0);
	const utils_1 = __importDefault(utils);
	// @ts-ignore
	const populate_internal_constants_1 = require$$0;
	const builder_1 = __importDefault(requireBuilder());
	const dynamic_builder_1 = __importDefault(requireDynamicBuilder());
	const { PersistentMask, DontSave, DontDestroy, EditorOnly } = cc_1.CCObject.Flags;
	const getDefault = cc_1.CCClass.getDefault;
	const Attr = cc_1.CCClass.Attr;
	const EDITOR_ONLY = Attr.DELIMETER + 'editorOnly';
	const DEFAULT = Attr.DELIMETER + 'default';
	const FORMERLY_SERIALIZED_AS = Attr.DELIMETER + 'formerlySerializedAs';
	function equalsToDefault(def, value) {
	    if (typeof def === 'function') {
	        try {
	            def = def();
	        }
	        catch (e) {
	            return false;
	        }
	    }
	    if (def === value) {
	        return true;
	    }
	    if (def && value &&
	        typeof def === 'object' && typeof value === 'object' &&
	        def.constructor === value.constructor) {
	        if (def instanceof cc_1.ValueType) {
	            if (def.equals(value)) {
	                return true;
	            }
	        }
	        else if (Array.isArray(def)) {
	            return def.length === 0 && value.length === 0;
	        }
	        else if (def.constructor === Object) {
	            return cc_1.js.isEmptyObject(def) && cc_1.js.isEmptyObject(value);
	        }
	    }
	    return false;
	}
	function isSerializableClass(obj, ctor) {
	    if (!ctor) {
	        return false;
	    }
	    return cc_1.CCClass.isCCClassOrFastDefined(ctor) && !!cc_1.js.getClassId(obj, false);
	}
	// 是否是PrefabInstance中的节点
	function isSyncPrefab(node) {
	    // 1. 在PrefabInstance下的非Mounted节点
	    // 2. 如果Mounted节点是一个PrefabInstance，那它也是一个syncPrefab
	    // @ts-ignore member-access
	    return node?._prefab?.root?._prefab?.instance && (node?._prefab?.instance || !isMountedChild(node));
	}
	// 用于检测当前节点是否是一个PrefabInstance中的Mounted的节点，后面可以考虑优化一下
	function isMountedChild(node) {
	    return !!node[cc_1.editorExtrasTag]?.mountedRoot;
	}
	class Parser {
	    exporting;
	    mustCompresseUuid;
	    discardInvalid;
	    dontStripDefault;
	    missingClassReporter;
	    missingObjectReporter;
	    reserveContentsForAllSyncablePrefab;
	    keepNodeUuid;
	    recordAssetDepends;
	    builder;
	    root;
	    prefabRoot;
	    assetExists;
	    // 为所有对象创建并缓存 IObjParsingInfo，同时防止循环引用
	    parsingInfos = new Map();
	    customExportingCtxCache;
	    _serializationContext;
	    assetDepends;
	    constructor(builder, options) {
	        options = options || {};
	        this.exporting = !!options._exporting;
	        this.mustCompresseUuid = !!options.compressUuid;
	        this.discardInvalid = 'discardInvalid' in options ? !!options.discardInvalid : true;
	        this.dontStripDefault = !this.exporting || ('dontStripDefault' in options ? !!options.dontStripDefault : true);
	        this.missingClassReporter = options.missingClassReporter;
	        this.missingObjectReporter = options.missingObjectReporter;
	        this.reserveContentsForAllSyncablePrefab = !!options.reserveContentsForSyncablePrefab;
	        const customArguments = {};
	        customArguments[cc.Node.reserveContentsForAllSyncablePrefabTag] = this.reserveContentsForAllSyncablePrefab;
	        this._serializationContext = {
	            root: null,
	            toCCON: options.useCCON ?? false,
	            customArguments,
	        };
	        this.builder = builder;
	        this.keepNodeUuid = !!options.keepNodeUuid;
	        this.assetExists = this.missingObjectReporter && Object.create(null);
	        this.customExportingCtxCache = this.exporting ? {
	            _depends: [],
	            dependsOn(propName, uuid) {
	                if (this._compressUuid) {
	                    uuid = utils_1.default.UUID.compressUUID(uuid, true);
	                }
	                this._depends.push(propName, uuid);
	            },
	            _compressUuid: this.mustCompresseUuid,
	        } : null;
	        if (options.recordAssetDepends) {
	            this.recordAssetDepends = options.recordAssetDepends;
	            this.assetDepends = new Set();
	        }
	    }
	    parse(obj) {
	        this.root = obj;
	        if (obj instanceof cc.Prefab) {
	            this.prefabRoot = obj.data;
	            this._serializationContext.root = obj.data;
	        }
	        else {
	            this._serializationContext.root = obj;
	        }
	        const rootInfo = this.parseObjField(null, null, '', obj, null);
	        this.builder.setRoot(rootInfo);
	        // if (obj && typeof obj === 'object' && isSerializableClass(obj, obj.constructor)) {
	        // }
	        // else {
	        //     throw new Error(`Unknown object to serialize: ${obj}`);
	        // }
	        if (this.recordAssetDepends) {
	            this.recordAssetDepends.push(...this.assetDepends);
	        }
	    }
	    checkMissingAsset(asset, uuid) {
	        if (this.missingObjectReporter) {
	            const exists = this.assetExists[uuid];
	            // TODO 这里需要判断一下 db 是否存在对应的资源
	            if (!exists) {
	                this.missingObjectReporter(asset);
	            }
	        }
	    }
	    // 校验是否需要序列化
	    isObjRemoved(val) {
	        if (val instanceof cc_1.CCObject) {
	            // validate obj flags
	            const objFlags = val.objFlags;
	            if (this.exporting && ((objFlags & EditorOnly) ||
	                (populate_internal_constants_1.SERVER_MODE))) {
	                return true;
	            }
	            if (objFlags & DontSave) {
	                if (this.discardInvalid) {
	                    return true;
	                }
	                else {
	                    // live reloading
	                    if (objFlags & DontDestroy) {
	                        // 目前编辑器下的 DontSave 节点往往是常驻节点（DontDestroy），这类节点不需要序列化，因为本身就不需要重新创建。
	                        return true;
	                    }
	                }
	            }
	        }
	        return false;
	    }
	    setParsedObj(ownerInfo, key, val, formerlySerializedAs) {
	        if (val && typeof val === 'object') {
	            let parsingInfo = this.parsingInfos.get(val);
	            if (!parsingInfo && val instanceof cc_1.Asset && this.root instanceof cc_1.Asset) {
	                // Double check uuids to guarantee same-uuid (with main asset loaded from DB) objects that created unexpectedly to use direct reference (non-uuid format).
	                // This way, even if the uuid changes when copying, there is no fear of missing-uuid.
	                if (val._uuid && val._uuid === this.root._uuid) {
	                    parsingInfo = this.parsingInfos.get(this.root);
	                }
	            }
	            if (parsingInfo) {
	                this.builder.setProperty_ParsedObject(ownerInfo, key, parsingInfo, formerlySerializedAs);
	                return true;
	            }
	        }
	        return false;
	    }
	    // 转换为需要序列化的值
	    verifyNotParsedValue(owner, key, val) {
	        const type = typeof val;
	        if (type === 'object') {
	            if (!val) {
	                return null;
	            }
	            if (val instanceof cc_1.CCObject) {
	                if (val instanceof cc_1.Asset) {
	                    const uuid = val._uuid;
	                    if (uuid) {
	                        this.checkMissingAsset(val, uuid);
	                        return val;
	                    }
	                    else {
	                        // 没有 uuid 的 asset 即程序创建的资源，比如一些内建的程序创建的 material，
	                        // 或者是序列化的主资源，但是主资源应该已经在 setParsedObj 处理了。
	                        return null;
	                    }
	                }
	                if (this.discardInvalid) {
	                    if (!val.isValid) {
	                        this.missingObjectReporter?.(val);
	                        return null;
	                    }
	                }
	                else {
	                    // live reloading
	                    // @ts-ignore
	                    if (!val.isRealValid) {
	                        return null;
	                    }
	                }
	                // validate prefab
	                if (cc_1.Node && cc_1.Node.isNode(val)) {
	                    // @ts-ignore member-access
	                    const willBeDiscard = this.canDiscardByPrefabRoot(val) && val !== val._prefab.root;
	                    if (willBeDiscard) {
	                        return null;
	                    }
	                }
	                // validate component in prefab
	                if (val instanceof cc_1.Component) {
	                    // component without mountedRoot info will be discard
	                    const willBeDiscard = val.node && this.canDiscardByPrefabRoot(val.node) && !val[cc_1.editorExtrasTag]?.mountedRoot;
	                    if (willBeDiscard) {
	                        return null;
	                    }
	                }
	            }
	            return val;
	        }
	        else if (type !== 'function') {
	            if (owner instanceof cc_1.CCObject && key === '_objFlags' && val > 0) {
	                return val & PersistentMask;
	            }
	            return val;
	        }
	        else /* function*/ {
	            return null;
	        }
	    }
	    // @ts-ignore
	    canDiscardByPrefabRoot(node) {
	        return !(this.reserveContentsForAllSyncablePrefab || !isSyncPrefab(node) || this.prefabRoot === node);
	    }
	    enumerateClass(owner, ownerInfo, ccclass, customProps) {
	        const attrs = Attr.getClassAttrs(ccclass);
	        const props = customProps || ccclass.__values__;
	        for (let p = 0; p < props.length; p++) {
	            const propName = props[p];
	            let val = owner[propName];
	            if (this.isObjRemoved(val)) {
	                continue;
	            }
	            if (this.exporting) {
	                if (attrs[propName + EDITOR_ONLY]) {
	                    // skip editor only when exporting
	                    continue;
	                }
	                // 这里不用考虑对 PrefabInfo 的剔除，这一块在编辑器中的反序列化时已经实现了
	                // var isPrefabInfo = CCNode && CCNode.isNode(obj) && propName === '_prefab';
	                // if (isPrefabInfo && !isSyncPrefab(obj)) {
	                //     // don't export prefab info in runtime
	                //     continue;
	                // }
	            }
	            const formerlySerializedAs = attrs[propName + FORMERLY_SERIALIZED_AS];
	            if (this.setParsedObj(ownerInfo, propName, val, formerlySerializedAs)) {
	                continue;
	            }
	            val = this.verifyNotParsedValue(owner, propName, val);
	            const defaultValue = getDefault(attrs[propName + DEFAULT]);
	            if (this.exporting && !this.dontStripDefault && equalsToDefault(defaultValue, val)) {
	                continue;
	            }
	            this.parseField(owner, ownerInfo, propName, val, { formerlySerializedAs, defaultValue });
	        }
	        if ((cc_1.Node && owner instanceof cc_1.Node) || (cc_1.Component && owner instanceof cc_1.Component)) {
	            if (this.exporting) {
	                if (!this.keepNodeUuid) {
	                    // @ts-ignore member-access
	                    const usedInPersistRoot = (owner instanceof cc_1.Node && owner._parent instanceof cc.Scene);
	                    if (!usedInPersistRoot) {
	                        return;
	                    }
	                }
	                if (this.prefabRoot) {
	                    return;
	                }
	                // @ts-ignore member-access
	                if (!this.dontStripDefault && !owner._id) {
	                    return;
	                }
	            }
	            // @ts-ignore member-access
	            this.builder.setProperty_Raw(owner, ownerInfo, '_id', owner._id);
	        }
	    }
	    // 重置 TRS 中的缩放
	    // private setTrsOfSyncablePrefabRoot (obj: CCNode) {
	    //     const trs = obj._trs.slice();
	    //     trs[7] = trs[8] = trs[9] = 1; // reset scale.xyz
	    //     if (!Parser.isDefaultTrs(trs)) {
	    //         this.builder.setProperty_TypedArray(obj, '_trs', trs);
	    //     }
	    // }
	    static isDefaultTrs(trs) {
	        return trs[0] === 0 && trs[1] === 0 && trs[2] === 0 && // position.xyz
	            trs[3] === 0 && trs[4] === 0 && trs[5] === 0 && trs[6] === 1 && // quat.xyzw
	            trs[7] === 1 && trs[8] === 1 && trs[9] === 1; // scale.xyz
	    }
	    parseField(owner, ownerInfo, key, val, options) {
	        const type = typeof val;
	        if (type === 'object') {
	            if (!val) {
	                this.builder.setProperty_Raw(owner, ownerInfo, key, null, options);
	                return;
	            }
	            if (val instanceof cc_1.Asset) {
	                if (owner) {
	                    let uuid = val._uuid;
	                    if (this.mustCompresseUuid) {
	                        uuid = utils_1.default.UUID.compressUUID(uuid, true);
	                    }
	                    options = options || {};
	                    options.expectedType = cc_1.js.getClassId(val.constructor);
	                    this.builder.setProperty_AssetUuid(owner, ownerInfo, key, uuid, options);
	                    this.assetDepends?.add(uuid);
	                    return;
	                }
	            }
	            this.parseObjField(owner, ownerInfo, key, val, options);
	        }
	        else if (type !== 'function') {
	            this.builder.setProperty_Raw(owner, ownerInfo, key, val, options);
	        }
	        else /* function*/ {
	            this.builder.setProperty_Raw(owner, ownerInfo, key, null, options);
	        }
	    }
	    parseObjField(owner, ownerInfo, key, val, options) {
	        const ctor = val.constructor;
	        if (isSerializableClass(val, ctor)) {
	            const defaultSerialize = (valueInfo) => {
	                let props = ctor.__values__;
	                if (val._onBeforeSerialize) {
	                    props = val._onBeforeSerialize(props) || props;
	                }
	                // DEBUG: Assert MissingScript __values__ for issue 9878
	                try {
	                    if (ctor === cc_1.cclegacy._MissingScript && (props.length === 0 || props[props.length - 1] !== '_$erialized')) {
	                        cc.error(`The '_$erialized' prop in '${val.name}' is missing. Will force the raw data to be read.`);
	                        cc.error(`    Error props: ['${props}'], raw props: ['${ctor.__values__}']. Please contact jare.`);
	                        props.push('_$erialized');
	                    }
	                }
	                catch (e) {
	                    cc.warn(`Error when checking MissingScript 3, ${e}`);
	                }
	                if (props.length === 0) {
	                    return;
	                }
	                if (props[props.length - 1] !== '_$erialized') {
	                    this.enumerateClass(val, valueInfo, ctor, props);
	                    return;
	                }
	                // DEBUG: Assert MissingScript data for issue 9878
	                try {
	                    if (!val._$erialized) {
	                        cc.error(`The formerly serialized data is not found from '${val.name}'. Please check the previous error report.`);
	                        return;
	                    }
	                }
	                catch (e) {
	                    cc.warn(`Error when checking MissingScript 2, ${e}`);
	                }
	                // 直接写入之前序列化过的数据，用于脚本丢失的情况
	                const serialized = val._$erialized;
	                const type = serialized.__type__;
	                // If is missing script proxy, serialized as original data
	                this.enumerateDict(serialized, valueInfo);
	                // report warning
	                if (this.missingClassReporter) {
	                    this.missingClassReporter(val, type);
	                }
	            };
	            const serializeNormalClass = () => {
	                const opt = (options || {});
	                const type = val._$erialized
	                    ? val._$erialized.__type__
	                    : cc.js.getClassId(ctor, false);
	                opt.type = type;
	                opt.uniquelyReferenced = cc.getSerializationMetadata(ctor)?.uniquelyReferenced;
	                const valueInfo = this.builder.setProperty_Class(owner, ownerInfo, key, opt);
	                this.parsingInfos.set(val, valueInfo);
	                if (!val[cc.serializeTag]) {
	                    defaultSerialize(valueInfo);
	                    return valueInfo;
	                }
	                // DEBUG: Check MissingScript object for issue 9878
	                try {
	                    if (val instanceof cc_1.cclegacy._MissingScript) {
	                        cc.error('Should not declare CustomSerializable on MissingScript. Please contact jare.');
	                        defaultSerialize(valueInfo);
	                        return valueInfo;
	                    }
	                }
	                catch (e) {
	                    cc.warn(`Error when checking MissingScript 1, ${e}`);
	                }
	                const serializationOutput = {
	                    writeProperty: (propertyName, propertyValue) => {
	                        if (this.isObjRemoved(propertyValue)) {
	                            return;
	                        }
	                        else if (this.setParsedObj(valueInfo, propertyName, propertyValue, null)) {
	                            return;
	                        }
	                        else ;
	                        this.parseField(val, valueInfo, propertyName, propertyValue, {});
	                    },
	                    writeThis: () => {
	                        return defaultSerialize(valueInfo);
	                    },
	                    writeSuper: () => {
	                        const superClass = cc_1.js.getSuper(ctor);
	                        if (!superClass) {
	                            return;
	                        }
	                        const superProperties = superClass.__values__;
	                        if (!superProperties) {
	                            return;
	                        }
	                        this.enumerateClass(val, valueInfo, ctor, superProperties);
	                    },
	                };
	                val[cc.serializeTag](serializationOutput, this._serializationContext);
	                return valueInfo;
	            };
	            if (val instanceof cc_1.ValueType) {
	                const valueInfo = this.builder.setProperty_ValueType(owner, ownerInfo, key, val, options);
	                // 不支持多个地方引用同一个 ValueType
	                if (valueInfo) {
	                    return valueInfo;
	                }
	            }
	            // DEBUG: Check MissingScript object for issue 9878
	            try {
	                if (val instanceof cc_1.cclegacy._MissingScript && val._serialize) {
	                    cc.error('Should not declare _serialize on MissingScript. Please contact jare.');
	                    val._serialize = undefined;
	                }
	            }
	            catch (e) {
	                cc.warn(`Error when checking MissingScript 0, ${e}`);
	            }
	            if (!val._serialize) {
	                return serializeNormalClass();
	            }
	            else {
	                const opt = (options || {});
	                opt.content = val._serialize(this.customExportingCtxCache);
	                opt.type = cc.js.getClassId(ctor, false);
	                const valueInfo = this.builder.setProperty_CustomizedClass(owner, ownerInfo, key, opt);
	                this.parsingInfos.set(val, valueInfo);
	                if (this.customExportingCtxCache) {
	                    const depends = this.customExportingCtxCache._depends;
	                    for (let i = 0; i < depends.length; i += 2) {
	                        this.builder.setProperty_AssetUuid(val, valueInfo, depends[i], depends[i + 1], null);
	                        this.assetDepends?.add(depends[i + 1]);
	                    }
	                    // reset customExportingCtxCache
	                    depends.length = 0;
	                }
	                return valueInfo;
	            }
	        }
	        else if (ArrayBuffer.isView(val)) {
	            if (cc_1.Node && cc_1.Node.isNode(owner) && key === '_trs' && Parser.isDefaultTrs(val)) {
	                return null;
	            }
	            this.builder.setProperty_TypedArray(owner, ownerInfo, key, val, options);
	            // 不考虑直接序列化 TypedArray 的情况
	            // 不考虑多个地方引用同一个 TypedArray
	            return null;
	        }
	        else if (ctor && ctor !== Object && !Array.isArray(val)) {
	            if (!owner) {
	                throw new Error(`Unknown object to serialize: ${val}`);
	            }
	            // ts interface 类型的接口类，对应 c++ 的 struct，struct 被绑定后并不是 plain object
	            // 因此，这里优先判断是否是 JSB 绑定对象
	            if (ctor.__isJSB) {
	                const valueInfo = this.builder.setProperty_Dict(owner, ownerInfo, key, options);
	                this.parsingInfos.set(val, valueInfo);
	                this.enumerateBindedDict(val, valueInfo);
	                return valueInfo;
	            }
	            // Not serializable object type, such as Set/Map..., etc.
	            // Use default value rather than null.
	            return null;
	        }
	        else {
	            // check circular reference for primitive objects ([], {}, etc...)
	            // 对于原生 JS 类型，只做循环引用的保护，
	            // 并不保证同个对象的多处引用反序列化后仍然指向同一个对象。
	            // 如果有此需求，应该继承自FObject
	            // var circularReferenced = this.parsingObjs.includes(val);
	            // if (circularReferenced) {
	            //     this.builder.markAsSharedObj(val);
	            // }
	            if (Array.isArray(val)) {
	                const filteredArray = val.filter((x) => !this.isObjRemoved(x));
	                const opt = (options || {});
	                opt.writeOnlyArray = filteredArray;
	                const valueInfo = this.builder.setProperty_Array(owner, ownerInfo, key, opt);
	                this.parsingInfos.set(val, valueInfo);
	                // enumerateArray
	                for (let i = 0; i < filteredArray.length; ++i) {
	                    let element = filteredArray[i];
	                    if (this.setParsedObj(valueInfo, i, element, null)) {
	                        continue;
	                    }
	                    element = this.verifyNotParsedValue(val, i, element);
	                    this.parseField(val, valueInfo, i, element, null);
	                }
	                return valueInfo;
	            }
	            else {
	                const valueInfo = this.builder.setProperty_Dict(owner, ownerInfo, key, options);
	                this.parsingInfos.set(val, valueInfo);
	                this.enumerateDict(val, valueInfo);
	                return valueInfo;
	            }
	        }
	    }
	    enumerateDict(obj, objInfo) {
	        for (const key in obj) {
	            // eslint-disable-next-line no-prototype-builtins
	            if ((obj.hasOwnProperty && !obj.hasOwnProperty(key)) ||
	                (key.charCodeAt(0) === 95 && key.charCodeAt(1) === 95) // starts with __
	                    && key !== '__prefab') {
	                continue;
	            }
	            let val = obj[key];
	            if (this.isObjRemoved(val)) {
	                val = null;
	            }
	            else if (this.setParsedObj(objInfo, key, val, null)) {
	                continue;
	            }
	            else {
	                val = this.verifyNotParsedValue(obj, key, val);
	            }
	            this.parseField(obj, objInfo, key, val, null);
	        }
	    }
	    enumerateBindedDict(obj, objInfo) {
	        for (const key in obj) {
	            // 不能用 hasOwnProperty 来判断，因为 JSB 对象的属性在 prototype 上面
	            if ((key.charCodeAt(0) === 95 && key.charCodeAt(1) === 95) // starts with __
	                && key !== '__prefab') {
	                continue;
	            }
	            let val = obj[key];
	            if (typeof val === 'function') {
	                continue;
	            }
	            if (this.isObjRemoved(val)) {
	                val = null;
	            }
	            else if (this.setParsedObj(objInfo, key, val, null)) {
	                continue;
	            }
	            else {
	                val = this.verifyNotParsedValue(obj, key, val);
	            }
	            this.parseField(obj, objInfo, key, val, null);
	        }
	    }
	}
	parser.Parser = Parser;
	function serialize(obj, options) {
	    options = options || {};
	    let builder;
	    if (options.builder === 'compiled') {
	        options._exporting = true;
	        options.useCCON = false;
	        builder = new builder_1.default(options);
	    }
	    else {
	        builder = new dynamic_builder_1.default(options);
	    }
	    const parser = new Parser(builder, options);
	    parser.parse(obj);
	    obj = null;
	    return builder.dump();
	}
	
	return parser;
}

var hasRequiredSerialize;

function requireSerialize () {
	if (hasRequiredSerialize) return serialize;
	hasRequiredSerialize = 1;
	var __importDefault = (commonjsGlobal && commonjsGlobal.__importDefault) || function (mod) {
	    return (mod && mod.__esModule) ? mod : { "default": mod };
	};
	Object.defineProperty(serialize, "__esModule", { value: true });
	serialize.serialize = serialize$1;
	serialize.serializeCompiled = serializeCompiled;
	const builder_1 = requireBuilder();
	const pack_jsons_1 = __importDefault(requirePackJsons());
	const parser_1 = __importDefault(requireParser());
	const dynamic_builder_1 = requireDynamicBuilder();
	function serialize$1(obj, options) {
	    // console.time('Serialize in dynamic format');
	    options = Object.assign({
	        builder: 'dynamic',
	    }, options);
	    const res = (0, parser_1.default)(obj, options);
	    // console.timeEnd('Serialize in dynamic format');
	    // if (!options.forceInline) {
	    //     // console.time('Serialize by legacy module');
	    //     const expectedRes = serializeLegacy(obj, options);
	    //     // console.timeEnd('Serialize by legacy module');
	    //     if (typeof res === 'string') {
	    //         if (res !== expectedRes) {
	    //             console.warn('Different serialize result, new:');
	    //             console.log(res);
	    //             console.warn('Old:');
	    //             console.log(expectedRes);
	    //             return expectedRes;
	    //         }
	    //     }
	    // }
	    return res;
	}
	serialize$1.asAsset = dynamic_builder_1.asAsset;
	serialize$1.setName = dynamic_builder_1.setName;
	serialize$1.findRootObject = dynamic_builder_1.findRootObject;
	function serializeCompiled(obj, options) {
	    options = Object.assign({
	        builder: 'compiled',
	        dontStripDefault: false,
	    }, options);
	    return (0, parser_1.default)(obj, options);
	}
	serializeCompiled.getRootData = builder_1.getRootData;
	serializeCompiled.packJSONs = pack_jsons_1.default;
	
	return serialize;
}

var deserialize = {};

var hasRequiredDeserialize;

function requireDeserialize () {
	if (hasRequiredDeserialize) return deserialize;
	hasRequiredDeserialize = 1;
	Object.defineProperty(deserialize, "__esModule", { value: true });
	deserialize.deserializeFull = deserializeFull;
	const cc_1 = require$$0;
	/**
	 * 反序列化指定数据，并处理其中涉及的资源引用。
	 * @param serialized 序列化后的数据。
	 * @returns 反序列化的结果。
	 */
	async function deserializeFull(serialized) {
	    const deserializeDetails = new cc_1.deserialize.Details();
	    deserializeDetails.reset();
	    const result = (0, cc_1.deserialize)(serialized, deserializeDetails);
	    const uuidList = deserializeDetails.uuidList;
	    if (!uuidList) {
	        return result;
	    }
	    if (uuidList.some((uuid) => typeof uuid === 'number')) {
	        throw new Error(`Don't know how to handle numeric UUID in ${uuidList}`);
	    }
	    const uuidToAssetMap = {};
	    await Promise.all(uuidList.map((uuid) => new Promise((resolve, reject) => {
	        cc_1.assetManager.loadAny(uuid, (err, asset) => {
	            if (err) {
	                reject(err);
	            }
	            else {
	                uuidToAssetMap[uuid] = asset;
	                resolve();
	            }
	        });
	    })));
	    deserializeDetails.assignAssetsBy((uuid, _) => {
	        if (!(uuid in uuidToAssetMap)) {
	            throw new Error(`Deserialized object is referencing ${uuid} which was not appeared in deserialize details.`);
	        }
	        const asset = uuidToAssetMap[uuid];
	        if (!(asset instanceof cc_1.Asset)) {
	            throw new Error(`Deserialized object is referencing ${uuid} which was appeared in deserialize details but isn't an asset.`);
	        }
	        return asset;
	    });
	    return result;
	}
	
	return deserialize;
}

var geometry = {};

var hasRequiredGeometry;

function requireGeometry () {
	if (hasRequiredGeometry) return geometry;
	hasRequiredGeometry = 1;
	Object.defineProperty(geometry, "__esModule", { value: true });
	geometry.splitBasedOnJoints = geometry.MeshSplitInfo = geometry.calculateTangents = geometry.calculateNormals = void 0;
	geometry.forEachFace = forEachFace;
	geometry.getUintArrayCtor = getUintArrayCtor;
	geometry.calculateNormals = (() => {
	    const { Vec3 } = cc;
	    const p0 = new Vec3();
	    const p1 = new Vec3();
	    const p2 = new Vec3();
	    const e1 = new Vec3();
	    const e2 = new Vec3();
	    const n = new Vec3();
	    return (positions, indices, out = []) => {
	        const nFaces = indices.length / 3;
	        const nVertices = positions.length / 3;
	        const normals = Array(3 * nVertices).fill(0).map(() => new Vec3());
	        for (let iFace = 0; iFace < nFaces; ++iFace) {
	            const i0 = indices[3 * iFace + 0];
	            const i1 = indices[3 * iFace + 1];
	            const i2 = indices[3 * iFace + 2];
	            Vec3.fromArray(p0, positions, i0 * 3);
	            Vec3.fromArray(p1, positions, i1 * 3);
	            Vec3.fromArray(p2, positions, i2 * 3);
	            Vec3.subtract(e1, p1, p0);
	            Vec3.subtract(e2, p2, p0);
	            Vec3.cross(n, e1, e2);
	            Vec3.add(normals[i0], normals[i0], n);
	            Vec3.add(normals[i1], normals[i1], n);
	            Vec3.add(normals[i2], normals[i2], n);
	        }
	        for (let iVertex = 0; iVertex < nVertices; ++iVertex) {
	            Vec3.toArray(out, Vec3.normalize(n, normals[iVertex]), iVertex * 3);
	        }
	        return out;
	    };
	})();
	geometry.calculateTangents = (() => {
	    const { Vec2, Vec3 } = cc;
	    const p0 = new Vec3();
	    const p1 = new Vec3();
	    const p2 = new Vec3();
	    const e1 = new Vec3();
	    const e2 = new Vec3();
	    const w0 = new Vec2();
	    const w1 = new Vec2();
	    const w2 = new Vec2();
	    const t = new Vec3();
	    const b = new Vec3();
	    const v3_1 = new Vec3();
	    const v3_2 = new Vec3();
	    return (positions, indices, normals, uvs, out = []) => {
	        const nFaces = indices.length / 3;
	        const nVertices = positions.length / 3;
	        /// FGED2, Chp. 7.5
	        const tangents = Array(nVertices).fill(0).map(() => new Vec3());
	        const bitangents = Array(nVertices).fill(0).map(() => new Vec3());
	        // Calculate tangent and bitangent for each triangle and add to all three vertices.
	        for (let iFace = 0; iFace < nFaces; ++iFace) {
	            const i0 = indices[iFace * 3 + 0];
	            const i1 = indices[iFace * 3 + 1];
	            const i2 = indices[iFace * 3 + 2];
	            Vec3.fromArray(p0, positions, i0 * 3);
	            Vec3.fromArray(p1, positions, i1 * 3);
	            Vec3.fromArray(p2, positions, i2 * 3);
	            Vec2.fromArray(w0, uvs, i0 * 2);
	            Vec2.fromArray(w1, uvs, i1 * 2);
	            Vec2.fromArray(w2, uvs, i2 * 2);
	            Vec3.subtract(e1, p1, p0);
	            Vec3.subtract(e2, p2, p0);
	            const x1 = w1.x - w0.x;
	            const x2 = w2.x - w0.x;
	            const y1 = w1.y - w0.y;
	            const y2 = w2.y - w0.y;
	            let r = x1 * y2 - x2 * y1;
	            if (r !== 0) {
	                r = 1 / r;
	            }
	            Vec3.multiplyScalar(t, Vec3.subtract(v3_1, Vec3.multiplyScalar(v3_1, e1, y2), Vec3.multiplyScalar(v3_2, e2, y1)), r);
	            Vec3.multiplyScalar(b, Vec3.subtract(v3_1, Vec3.multiplyScalar(v3_1, e2, x1), Vec3.multiplyScalar(v3_2, e1, x2)), r);
	            Vec3.add(tangents[i0], tangents[i0], t);
	            Vec3.add(tangents[i1], tangents[i1], t);
	            Vec3.add(tangents[i2], tangents[i2], t);
	            Vec3.add(bitangents[i0], bitangents[i0], b);
	            Vec3.add(bitangents[i1], bitangents[i1], b);
	            Vec3.add(bitangents[i2], bitangents[i2], b);
	        }
	        // Orthonormalize each tangent and calculate the handedness.
	        for (let iVertex = 0; iVertex < nVertices; ++iVertex) {
	            const t = tangents[iVertex];
	            const b = bitangents[iVertex];
	            const n = Vec3.fromArray(v3_1, normals, iVertex * 3);
	            Vec3.subtract(v3_2, t, Vec3.multiplyScalar(v3_2, n, (Vec3.dot(t, n) / Vec3.dot(n, n)))); // Reject
	            if (Vec3.dot(v3_2, v3_2) == 0) { // The 'perfect symmetry' case
	                if (n.x || n.z) {
	                    Vec3.set(v3_2, n.z, 0, -n.x);
	                }
	                else {
	                    Vec3.set(v3_2, 0, n.x, -n.y);
	                }
	            }
	            Vec3.toArray(out, Vec3.normalize(v3_2, v3_2), iVertex * 4);
	            out[iVertex * 4 + 3] = Vec3.dot(Vec3.cross(v3_2, b, t), n) > 0 ? 1 : -1;
	        }
	        return out;
	    };
	})();
	function forEachFace(indices, primitiveMode, callback) {
	    let faces = 0;
	    const faceIndices = [];
	    switch (primitiveMode) {
	        case ccm.gfx.PrimitiveMode.TRIANGLE_LIST:
	            faces = indices.length / 3;
	            for (let i = 0; i < faces; i++) {
	                faceIndices[0] = indices[i * 3];
	                faceIndices[1] = indices[i * 3 + 1];
	                faceIndices[2] = indices[i * 3 + 2];
	                callback(faceIndices);
	            }
	            break;
	        case ccm.gfx.PrimitiveMode.TRIANGLE_STRIP:
	            faces = indices.length - 2;
	            let rev = 0;
	            for (let i = 0; i < faces; i++) {
	                faceIndices[0] = indices[i - rev];
	                faceIndices[1] = indices[i + rev + 1];
	                faceIndices[2] = indices[i + 2];
	                callback(faceIndices);
	                rev = ~rev;
	            }
	            break;
	        case ccm.gfx.PrimitiveMode.TRIANGLE_FAN:
	            faces = indices.length - 1;
	            const first = indices[0];
	            for (let i = 1; i < faces; i++) {
	                faceIndices[0] = first;
	                faceIndices[1] = indices[i];
	                faceIndices[2] = indices[i + 1];
	                callback(faceIndices);
	            }
	            break;
	        case ccm.gfx.PrimitiveMode.LINE_LIST:
	            faces = indices.length / 2;
	            for (let i = 0; i < faces; i++) {
	                faceIndices[0] = indices[i * 2];
	                faceIndices[1] = indices[i * 2 + 1];
	                callback(faceIndices);
	            }
	            break;
	        case ccm.gfx.PrimitiveMode.LINE_STRIP:
	            faces = indices.length - 1;
	            for (let i = 0; i < faces; i++) {
	                faceIndices[0] = indices[i];
	                faceIndices[1] = indices[i + 1];
	                callback(faceIndices);
	            }
	            break;
	        case ccm.gfx.PrimitiveMode.LINE_LOOP:
	            faces = indices.length;
	            for (let i = 0; i < faces; i++) {
	                faceIndices[0] = indices[i];
	                faceIndices[1] = indices[(i + 1) === faces ? 0 : (i + 1)];
	                callback(faceIndices);
	            }
	            break;
	        case ccm.gfx.PrimitiveMode.POINT_LIST:
	            faces = indices.length;
	            for (let i = 0; i < faces; i++) {
	                faceIndices[0] = indices[i];
	                callback(faceIndices);
	            }
	            break;
	    }
	}
	class MeshSplitInfo {
	    indices = []; // new IB, indexed into original vertices
	    jointSet = new Set(); // new effective joints, indexed into original skeleton
	    // @ts-ignore
	    primitiveMode; // new primitive mode
	    constructor(primitiveMode = ccm.gfx.PrimitiveMode.TRIANGLE_LIST) {
	        this.primitiveMode = primitiveMode;
	    }
	}
	geometry.MeshSplitInfo = MeshSplitInfo;
	geometry.splitBasedOnJoints = (() => {
	    function addFace(target, joints, faceIndices) {
	        for (let i = 0; i < faceIndices.length; i++) {
	            const idx = faceIndices[i];
	            for (let j = 0; j < 4; j++) {
	                target.jointSet.add(joints[idx * 4 + j]);
	            }
	            target.indices.push(idx);
	        }
	    }
	    function testFace(target, joints, faceIndices, capacity) {
	        let counter = 0; // dry run
	        for (let i = 0; i < faceIndices.length; i++) {
	            const idx = faceIndices[i];
	            for (let j = 0; j < 4; j++) {
	                if (!target.jointSet.has(joints[idx * 4 + j])) {
	                    counter++;
	                }
	            }
	        }
	        return target.jointSet.size + counter <= capacity;
	    }
	    return (joints, indices, primitiveMode, capacity) => {
	        // @ts-ignore
	        let prim;
	        switch (primitiveMode) {
	            case ccm.gfx.PrimitiveMode.TRIANGLE_LIST:
	            case ccm.gfx.PrimitiveMode.TRIANGLE_STRIP:
	            case ccm.gfx.PrimitiveMode.TRIANGLE_FAN:
	                prim = ccm.gfx.PrimitiveMode.TRIANGLE_LIST;
	                break;
	            case ccm.gfx.PrimitiveMode.LINE_LIST:
	            case ccm.gfx.PrimitiveMode.LINE_STRIP:
	            case ccm.gfx.PrimitiveMode.LINE_LOOP:
	                prim = ccm.gfx.PrimitiveMode.LINE_LIST;
	                break;
	            case ccm.gfx.PrimitiveMode.POINT_LIST:
	                prim = ccm.gfx.PrimitiveMode.POINT_LIST;
	                break;
	        }
	        if (prim === undefined) {
	            return [];
	        }
	        const primitives = [new MeshSplitInfo(prim)];
	        let primitive = primitives[0];
	        // TODO: be more greedy on merging faces
	        // but need to handle prefab & scene material migrations
	        forEachFace(indices, primitiveMode, (faceIndices) => {
	            if (!testFace(primitive, joints, faceIndices, capacity)) {
	                primitive = new MeshSplitInfo(prim);
	                primitives.push(primitive);
	            }
	            addFace(primitive, joints, faceIndices);
	        });
	        return primitives;
	    };
	})();
	function getUintArrayCtor(maxElement) {
	    if (maxElement < (1 << (Uint8Array.BYTES_PER_ELEMENT * 8))) {
	        return Uint8Array;
	    }
	    if (maxElement < (1 << (Uint16Array.BYTES_PER_ELEMENT * 8))) {
	        return Uint16Array;
	    }
	    return Uint32Array;
	}
	
	return geometry;
}

var prefab = {};

var hasRequiredPrefab;

function requirePrefab () {
	if (hasRequiredPrefab) return prefab;
	hasRequiredPrefab = 1;
	var __importDefault = (commonjsGlobal && commonjsGlobal.__importDefault) || function (mod) {
	    return (mod && mod.__esModule) ? mod : { "default": mod };
	};
	Object.defineProperty(prefab, "__esModule", { value: true });
	prefab.walkNode = walkNode;
	prefab.visitObjTypeReferences = visitObjTypeReferences;
	prefab.addPrefabInfo = addPrefabInfo;
	prefab.checkAndStripNode = checkAndStripNode;
	prefab.addPrefabInstance = addPrefabInstance;
	const cc_1 = require$$0;
	const utils_1 = __importDefault(utils);
	const CompPrefabInfo = cc_1.Prefab._utils.CompPrefabInfo;
	const PrefabInfo = cc_1.Prefab._utils.PrefabInfo;
	const PrefabInstance = cc_1.Prefab._utils.PrefabInstance;
	const DontClearIDComponentNames = ['TerrainRenderable'];
	/**
	 * 递归循环所有的子节点，执行 handle 方法
	 * @param {*} node
	 * @param {*} handle
	 */
	function walkNode(node, handle, isChild = false) {
	    const skipChildren = handle(node, !!isChild);
	    if (skipChildren) {
	        return;
	    }
	    const children = node.children;
	    for (let i = children.length - 1; i >= 0; --i) {
	        walkNode(children[i], handle, true);
	    }
	}
	// 遍历节点下的所有可序列化字段(不含子节点)
	// 只会遍历非空的 object 类型
	function visitObjTypeReferences(node, visitor) {
	    const parseFireClass = (obj, klass) => {
	        klass = klass || obj.constructor;
	        const props = klass.__values__;
	        for (let p = 0; p < props.length; p++) {
	            const key = props[p];
	            const value = obj[key];
	            if (value && typeof value === 'object') {
	                if (Array.isArray(value)) {
	                    for (let i = 0; i < value.length; i++) {
	                        if (cc.isValid(value)) {
	                            visitor(value, '' + i, value[i]);
	                        }
	                    }
	                }
	                else if (cc.isValid(value)) {
	                    visitor(obj, key, value);
	                }
	            }
	        }
	    };
	    for (let c = 0; c < node.components.length; ++c) {
	        const component = node.components[c];
	        parseFireClass(component);
	    }
	}
	function initNodePrefabInfo(node, rootNode, asset) {
	    // @ts-ignore private member access
	    if (!node._prefab) {
	        // @ts-ignore private member access
	        node._prefab = new PrefabInfo();
	    }
	    // @ts-ignore private member access
	    const prefabInfo = node._prefab;
	    if (!prefabInfo) {
	        return null;
	    }
	    prefabInfo.root = rootNode;
	    prefabInfo.asset = asset;
	    return prefabInfo;
	}
	function isPrefabRoot(node) {
	    // @ts-ignore
	    return !!(node._prefab && node._prefab.instance);
	}
	function addPrefabInfo(targetNode, rootNode, asset, opts = {}) {
	    if (!rootNode) {
	        console.error('addPrefabInfo without a rootNode');
	        return;
	    }
	    walkNode(targetNode, (node, isChild) => {
	        if (!node) {
	            return;
	        }
	        // 私有节点不需要添加 prefabInfo 数据
	        if (node.objFlags & cc.Object.Flags.HideInHierarchy) {
	            return;
	        }
	        const isNestedPrefab = isChild && isPrefabRoot(node);
	        // @ts-ignore
	        let prefabInfo = node._prefab;
	        if (prefabInfo) {
	            if (!isNestedPrefab) {
	                prefabInfo.asset = asset;
	                prefabInfo.root = rootNode;
	            }
	            // @ts-ignore
	            const rootPrefabInfo = rootNode._prefab;
	            if (rootPrefabInfo && prefabInfo.instance) {
	                prefabInfo.instance.prefabRootNode = rootNode;
	            }
	        }
	        else {
	            prefabInfo = initNodePrefabInfo(node, rootNode, asset);
	        }
	        if (!prefabInfo) {
	            return;
	        }
	        if (opts.nodeFileIdGenerator) {
	            prefabInfo.fileId = opts.nodeFileIdGenerator(node);
	        }
	        else {
	            prefabInfo.fileId = prefabInfo.fileId ? prefabInfo.fileId : node.uuid;
	        }
	        // 组件也添加 __prefab fileId 属性，以便复用
	        if (node.components && node.components.length) {
	            for (let i = 0; i < node.components.length; i++) {
	                const comp = node.components[i];
	                if (!comp.__prefab) {
	                    comp.__prefab = new CompPrefabInfo();
	                }
	                if (!comp.__prefab) {
	                    continue;
	                }
	                if (opts.compFileIdGenerator) {
	                    comp.__prefab.fileId = opts.compFileIdGenerator(comp, i);
	                }
	                else {
	                    comp.__prefab.fileId = comp.__prefab.fileId ? comp.__prefab.fileId : comp.uuid;
	                }
	            }
	        }
	        if (isNestedPrefab) {
	            return true;
	        }
	    });
	}
	// 清理后需要返回的数据，用于还原
	function checkAndStripNode(node, quiet = undefined) {
	    const clearedReference = {};
	    walkNode(node, function (item) {
	        if (item.objFlags & cc.Object.Flags.HideInHierarchy) {
	            // 私有Node不参与序列化
	            // 友情备注：编辑器小窗预览等用到的节点
	            // hack 处理PrivatePreview的节点，后面大版本删除它
	            // @ts-ignore
	            if (item.isPrivatePreview) {
	                return;
	            }
	            // 目前RichText的PrivateNode会被序列化，所以这里需要处理剃除id的逻辑
	            // TerrainRenderable清掉会导致销毁报错
	            // @ts-ignore
	            item._id = '';
	            for (let c = 0; c < item.components.length; ++c) {
	                const component = item.components[c];
	                if (DontClearIDComponentNames.includes(cc_1.js.getClassName(component))) {
	                    continue;
	                }
	                component._id = '';
	            }
	            return;
	        }
	        // strip other node or components references
	        visitObjTypeReferences(item, function (obj, key, val) {
	            let shouldStrip = false;
	            if (val instanceof cc.Component.EventHandler) {
	                val = val.target;
	            }
	            else if (val instanceof cc.Component) {
	                val = val.node;
	            }
	            if (val && val instanceof cc.Node && !val.isChildOf(node)) {
	                shouldStrip = true;
	            }
	            if (shouldStrip) {
	                if (obj[key] instanceof cc.Component.EventHandler) {
	                    obj[key] = new cc.Component.EventHandler();
	                }
	                else {
	                    // @ts-ignore
	                    if (item._prefab?.fileId && obj.__prefab?.fileId) {
	                        // @ts-ignore
	                        clearedReference[item._prefab.fileId] = {
	                            path: key,
	                            component: obj.__prefab.fileId,
	                            value: obj[key],
	                        };
	                    }
	                    obj[key] = null;
	                }
	                if (!quiet) {
	                    console.warn('Reference "%s" of "%s" to external scene object "%s" can not be saved in prefab asset.', key, obj.name || node.name, val.name);
	                }
	            }
	        });
	        // 清空 prefab 中的 uuid，这些 uuid 不会被用到，不应该保存到 prefab 资源中，以免每次保存资源都发生改变。
	        // @ts-ignore
	        item._id = '';
	        for (let c = 0; c < item.components.length; ++c) {
	            const component = item.components[c];
	            component._id = '';
	        }
	    });
	    return clearedReference;
	}
	function addPrefabInstance(node) {
	    // @ts-ignore
	    const prefabInfo = node._prefab;
	    if (prefabInfo && !prefabInfo.instance) {
	        const prefabInstance = new PrefabInstance();
	        prefabInstance.fileId = utils_1.default.UUID.generate();
	        prefabInfo.instance = prefabInstance;
	    }
	}
	
	return prefab;
}

(function (exports) {
	var __createBinding = (commonjsGlobal && commonjsGlobal.__createBinding) || (Object.create ? (function(o, m, k, k2) {
	    if (k2 === undefined) k2 = k;
	    var desc = Object.getOwnPropertyDescriptor(m, k);
	    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
	      desc = { enumerable: true, get: function() { return m[k]; } };
	    }
	    Object.defineProperty(o, k2, desc);
	}) : (function(o, m, k, k2) {
	    if (k2 === undefined) k2 = k;
	    o[k2] = m[k];
	}));
	var __setModuleDefault = (commonjsGlobal && commonjsGlobal.__setModuleDefault) || (Object.create ? (function(o, v) {
	    Object.defineProperty(o, "default", { enumerable: true, value: v });
	}) : function(o, v) {
	    o["default"] = v;
	});
	var __importStar = (commonjsGlobal && commonjsGlobal.__importStar) || (function () {
	    var ownKeys = function(o) {
	        ownKeys = Object.getOwnPropertyNames || function (o) {
	            var ar = [];
	            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
	            return ar;
	        };
	        return ownKeys(o);
	    };
	    return function (mod) {
	        if (mod && mod.__esModule) return mod;
	        var result = {};
	        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
	        __setModuleDefault(result, mod);
	        return result;
	    };
	})();
	var __importDefault = (commonjsGlobal && commonjsGlobal.__importDefault) || function (mod) {
	    return (mod && mod.__esModule) ? mod : { "default": mod };
	};
	Object.defineProperty(exports, "__esModule", { value: true });
	exports.MissingReporter = exports.PrefabUtils = exports.GeometryUtils = exports.Component = exports.Node = exports.Script = exports.UuidUtils = exports.walkProperties = exports.deserializeFull = exports.serializeCompiled = exports.serialize = void 0;
	exports.init = init;
	exports.emit = emit;
	exports.on = on;
	exports.removeListener = removeListener;
	// MissingReporter
	const missing_class_reporter_1 = missingClassReporter;
	const missing_object_reporter_1 = missingObjectReporter;
	var object_walker_1 = objectWalker;
	Object.defineProperty(exports, "walkProperties", { enumerable: true, get: function () { return object_walker_1.walkProperties; } });
	const utils_1 = __importDefault(utils);
	const events_1 = __importDefault(events);
	if (!events_1.default.prototype.off) {
	    events_1.default.prototype.off = events_1.default.prototype.removeListener;
	}
	const script_1 = __importDefault(script);
	const node_1 = __importDefault(node);
	const component_1 = __importDefault(component);
	exports.UuidUtils = utils_1.default.UUID;
	exports.Script = new script_1.default();
	exports.Node = new node_1.default();
	exports.Component = new component_1.default();
	exports.MissingReporter = {
	    classInstance: missing_class_reporter_1.MissingClass,
	    class: missing_class_reporter_1.MissingClassReporter,
	    object: missing_object_reporter_1.MissingObjectReporter,
	};
	async function init() {
	    const serializeUtils = await Promise.resolve().then(() => __importStar(requireSerialize()));
	    exports.serialize = serializeUtils.serialize;
	    exports.serializeCompiled = serializeUtils.serializeCompiled;
	    exports.deserializeFull = await Promise.resolve().then(() => __importStar(requireDeserialize()));
	    exports.GeometryUtils = await Promise.resolve().then(() => __importStar(requireGeometry()));
	    exports.PrefabUtils = await Promise.resolve().then(() => __importStar(requirePrefab()));
	    exports.Script.allow = true;
	    exports.Node.allow = true;
	    exports.Component.allow = true;
	}
	const event = new events_1.default();
	function emit(name, ...args) {
	    event.emit(name, ...args);
	}
	function on(name, handle) {
	    event.on(name, handle);
	}
	function removeListener(name, handle) {
	    event.removeListener(name, handle);
	}
	
} (editorExtends));

var index = /*@__PURE__*/getDefaultExportFromCjs(editorExtends);

var _ee = /*#__PURE__*/_mergeNamespaces({
	__proto__: null,
	'default': index
}, [editorExtends]);

// Patch UuidUtils aliases (engine uses uuid/compressUuid/decompressUuid/isUuid)
                    if (editorExtends.UuidUtils) {
                        var U = editorExtends.UuidUtils;
                        U.uuid = U.uuid || U.generate;
                        U.compressUuid = U.compressUuid || U.compressUUID;
                        U.decompressUuid = U.decompressUuid || U.decompressUUID;
                        U.isUuid = U.isUuid || U.isUUID;
                    }
                    // Wrap module namespace: override init to avoid inlined cc-dependent code
                    globalThis.EditorExtends = Object.assign({}, _ee, {
                        init: async function() {
                            editorExtends.Component.allow = true;
                            editorExtends.Node.allow = true;
                            editorExtends.Script.allow = true;
                        },
                    });
})();
