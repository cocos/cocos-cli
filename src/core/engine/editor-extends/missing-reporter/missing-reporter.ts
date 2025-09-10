'use strict';

export class MissingReporter {

    outputLevel: 'debug' | 'warn' | 'error' = 'debug';

    static INFO_DETAILED = ' Detailed information:\n';

    static getObjectType(obj: any) {
        // @ts-ignore
        if (obj instanceof cc.Component) {
            return 'component';
            // @ts-ignore
        } else if (obj instanceof cc.Prefab) {
            return 'prefab';
            // @ts-ignore
        } else if (obj instanceof cc.SceneAsset) {
            return 'scene';
        } else {
            return 'asset';
        }
    }

    // 这个属性用于 stash 和 report
    missingObjects = new Set();

    // 这个属性用于 stashByOwner 和 reportByOwner
    missingOwners = new Map();

    root: any;

    report() { }
    reportByOwner() { }

    constructor(root?: any) {
        this.root = root;
    }

    reset() {
        this.missingObjects.clear();
        this.missingOwners.clear();
        this.root = null;
    }

    stash(obj: any) {
        this.missingObjects.add(obj);
    }

    /**
     * stashByOwner 和 stash 的区别在于，stash 要求对象中有值，stashByOwner 允许对象的值为空
     * @param {any} [value] - 如果 value 未设置，不会影响提示信息，只不过提示信息可能会不够详细
     */
    stashByOwner(owner: any, propName: any, value: any) {
        let props = this.missingOwners.get(owner);
        if (!props) {
            props = {};
            this.missingOwners.set(owner, props);
        }
        props[propName] = value;
    }

    removeStashedByOwner(owner: any, propName: any) {
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
