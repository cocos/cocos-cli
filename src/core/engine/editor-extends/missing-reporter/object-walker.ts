'use strict';

// ObjectWalkerBehavior

export class ObjectWalkerBehavior {
    walk(obj: Record<string, any>, key: string, val: any) { }

    root: any;

    constructor(root: any) {
        this.root = root;
    }

    parseObject(val: any) {
        if (Array.isArray(val)) {
            this.forEach(val);
        } else {
            const klass = val.constructor;

            if (
                val instanceof cc.Asset || // skip Asset
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
            } else {
                this.forIn(val);
            }
        }
    }
    parseCCClass(val: any, klass: any, props: any) {
        const attrs = cc.Class.Attr.getClassAttrs(klass);
        for (let i = 0; i < props.length; i++) {
            const prop = props[i];
            if (attrs[prop + cc.Class.Attr.DELIMETER + 'serializable'] === false) {
                continue;
            }
            this.walk(val, prop, val[prop]);
        }
    }
    forIn(val: any) {
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
    forEach(val: any) {
        for (let i = 0, len = val.length; i < len; ++i) {
            this.walk(val, '' + i, val[i]);
        }
    }
}

// ObjectWalker

// Traverse all objects recursively.
// Each object will be navigated only once in the value parameter in callback.
export class ObjectWalker extends ObjectWalkerBehavior {
    iteratee: any;
    parsedObjects: any;
    parsedKeys: any;
    ignoreParent: any;
    ignoreSubPrefabHelper: any;

    walked = new Set();

    constructor(root: any, iteratee: any, options?: any) {
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
            } else if (this.root instanceof cc.Node) {
                this.ignoreParent = this.root;
            } else {
                return cc.error('can only ignore parent of scene node');
            }
        }

        this.parseObject(root);
    }
    walk(obj: any, key: any, val: any) {
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
                } else if (val instanceof cc.Component) {
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
export function walk(root: any, iteratee: any) {
    new ObjectWalker(root, iteratee);
}

const staticDummyWalker = new ObjectWalkerBehavior(null);

// enumerate properties not recursively
function doWalkProperties(obj: any, iteratee: any) {
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
export function walkProperties(root: any, iteratee: any, options: any) {
    const dontSkipNull = options && options.dontSkipNull;
    new ObjectWalker(
        root,
        function (obj: any, key: any, value: any, parsedObjects: any) {
            // 如果 value 已经遍历过，ObjectWalker 不会枚举其余对象对 value 的引用
            // 所以这里拿到 value 后自己再枚举一次 value 内的引用
            const noPropToWalk = !value || typeof value !== 'object';
            if (noPropToWalk) {
                return;
            }
            parsedObjects.push(obj);
            doWalkProperties(value, function (obj: any, key: any, val: any) {
                const isObj = typeof val === 'object';
                if (isObj) {
                    if (dontSkipNull || val) {
                        iteratee(obj, key, val, parsedObjects);
                    }
                }
            });
            parsedObjects.pop();
        },
        options,
    );
}

export function getNextProperty(parsedObjects: any, parsingObject: any, object: any) {
    let nextObj: any;
    const i = parsedObjects.lastIndexOf(object);
    if (i === parsedObjects.length - 1) {
        nextObj = parsingObject;
    } else if (0 <= i && i < parsedObjects.length - 1) {
        nextObj = parsedObjects[i + 1];
    } else {
        return '';
    }
    let foundKey = '';
    doWalkProperties(object, function (obj: any, key: any, val: any) {
        if (val === nextObj) {
            foundKey = key;
        }
    });
    return foundKey;
}
