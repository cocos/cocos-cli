import {
    Asset,
    assetManager,
    CCClass,
    CCObject,
    Component,
    editorExtrasTag,
    instantiate,
    js,
    Node,
    Prefab,
    Scene,
    Terrain,
    ValueType,
    Widget,
    isValid,
} from 'cc';
import { prefabUtils } from './utils';
import { componentOperation, IComponentPrefabData } from './component';
import { promisify } from 'util';
import { isEditorNode, isPartOfNode } from '../node/node-utils';
import { Service, ServiceEvents } from '../core';
import { IChangeNodeOptions, IEditorEvents, NodeEventType } from '../../../common';
import { Rpc } from '../../rpc';
import { TimerUtil } from './timer-util';

const nodeMgr = EditorExtends.Node;
const compMgr = EditorExtends.Component;

type PrefabInfo = Prefab._utils.PrefabInfo;
const PrefabInfo = Prefab._utils.PrefabInfo;
type PropertyOverrideInfo = Prefab._utils.PropertyOverrideInfo;
const PropertyOverrideInfo = Prefab._utils.PropertyOverrideInfo;
type PrefabInstance = Prefab._utils.PrefabInstance;
type CompPrefabInfo = Prefab._utils.CompPrefabInfo;
const CompPrefabInfo = Prefab._utils.CompPrefabInfo;
type TargetInfo = Prefab._utils.TargetInfo;
const TargetInfo = Prefab._utils.TargetInfo;
type TargetOverrideInfo = Prefab._utils.TargetOverrideInfo;
const TargetOverrideInfo = Prefab._utils.TargetOverrideInfo;

// scale 默认不 override，因为模型往往缩放有问题，这样重导后就直接生效了
const RootReservedProperty = ['_name', '_lpos', '_lrot', '_euler'];
const compKey = '_components';

interface IDiffPropertyInfo {
    pathKeys: string[]; // 相对于节点或组件的属性查找路径
    value: any; // 修改后的值
}

// 在 diff 比较剔除的一些属性
const diffExcludePropMap: { [key: string]: string[] } = {
    'cc.Node': ['_objFlags', '_parent', '_children', '_components', '_prefab', editorExtrasTag],
    'cc.Component': ['node', '_objFlags', editorExtrasTag],
};

function getDiffExcludeProps(ctor: Function) {
    let props: string[] = [];
    Object.keys(diffExcludePropMap).forEach((key) => {
        const ccKls = js.getClassByName(key);
        if (ccKls && js.isChildClassOf(ctor, ccKls)) {
            props = props.concat(diffExcludePropMap[key]);
        }
    });

    return props;
}

interface INodePrefabData {
    prefabInfo: PrefabInfo | null;
}

interface IAppliedTargetOverrideInfo {
    sourceUUID?: string;
    sourceInfo: TargetInfo | null;
    propertyPath: string[];
    targetUUID?: string;
    targetInfo: TargetInfo | null;
}

interface IApplyPrefabInfo {
    nodeUUID: string;
    mountedChildrenInfoMap: Map<string[], INodePrefabData>;
    mountedComponentsInfoMap: Map<string[], IComponentPrefabData>;
    propertyOverrides: PropertyOverrideInfo[];
    removedComponents: TargetInfo[];
    oldPrefabNodeData: any;
    targetOverrides: IAppliedTargetOverrideInfo[];
}

// class ApplyPrefabCommand extends SceneUndoCommand {
//     public applyPrefabInfo: IApplyPrefabInfo | null = null;
//     private _undoFunc: Function;
//     private _redoFunc: Function;
//     constructor(undoFunc: Function, redoFunc: Function) {
//         super();
//         this._undoFunc = undoFunc;
//         this._redoFunc = redoFunc;
//     }
//
//     public async undo() {
//         if (this.applyPrefabInfo) {
//             await this._undoFunc(this.applyPrefabInfo);
//         }
//     }
//
//     public async redo() {
//         if (this.applyPrefabInfo) {
//             await this._redoFunc(this.applyPrefabInfo.nodeUUID);
//         }
//     }
// }
//
// // 创建预制体的自定义 undo
// // 创建前的节点 uuid 和创建后的节点 uuid 数据不一样
// class CreatePrefabCommand extends SceneUndoCommand {
//     public async undo() {
//         await this.applyData(this.undoData);
//     }
//
//     public async redo() {
//         await this.applyData(this.redoData);
//     }
// }
//
// class RevertPrefabCommand extends CreatePrefabCommand {
//     tag = 'RevertPrefabCommand';
// }


class NodeOperation {
    public assetToNodesMap: Map<string, Node[]> = new Map(); // 存储 prefab 资源和场景节点的关系表
    public isRemovingMountedChildren = false;

    _timerUtil = new TimerUtil();

    public onSceneOpened() {
        this.assetToNodesMap.clear();
        componentOperation.clearCompCache();
        prefabUtils.clearCache();
        for (const uuid in nodeMgr.getNodes()) {
            const node = nodeMgr.getNode(uuid);

            // 场景节点特殊处理
            if (node instanceof Scene) {
                return;
            }

            if (node && !isEditorNode(node)) {
                this.checkToAddPrefabAssetMap(node);
                node.components.forEach((comp) => {
                    componentOperation.cacheComp(comp);
                });
            }
        }
    }

    public onNodeRemoved(node: Node) {
        const prefabInfo = node['_prefab'];
        const prefabInstance = prefabInfo?.instance;
        if (prefabInstance && prefabInfo?.asset) {
            const nodes = this.assetToNodesMap.get(prefabInfo.asset._uuid);
            if (nodes) {
                const index = nodes.indexOf(node);
                if (index >= 0) {
                    nodes.splice(index, 1);
                }
            }
        }
    }

    // 修改 PrefabInstance 中节点数据，要保存在最外层的 PrefabInstance中
    private checkToAddOverrides(node: Node, inPropPath: string, root: Node | null) {
        const prefabInfo = prefabUtils.getPrefab(node);
        if (!node || !isValid(node) || (prefabInfo && !isValid(prefabInfo.asset))) {
            return;
        }

        if (!inPropPath) {
            return;
        }

        const propPath = inPropPath.replace(/^__comps__/, compKey);
        const pathKeys: string[] = (propPath || '').split('.');

        let comp: Component | null = null;

        // 路径里有 __comps__ 就说明是组件
        if (inPropPath !== propPath && pathKeys[0] === compKey) {
            comp = (node[pathKeys[0]] as any)[pathKeys[1]];
        }

        // 检测是否是 PrefabAsset 中的普通节点（非嵌套 Prefab 中的节点）
        const isNormalPrefabNode = prefabInfo && !prefabInfo.root?.['_prefab']?.instance;

        // 普通节点或者 mountedComponent，只需要判断是否要加 TargetOverride（在普通节点的 Component 引用到 Prefab 里的 Node 或 Component 时）
        if (!prefabInfo || isNormalPrefabNode || (comp && prefabUtils.isMountedComponent(comp))) {
            if (root) {
                // 不能用 getDiffPropertyInfos 来判断引用，因为获取到的 differInfo 的属性路径是与修改的值不一样的，比如自定义类型数组 #13612
                // const comparedComp = componentOperation.getCachedComp(comp.uuid);
                // if (!comparedComp) {
                //     console.error(`can't get compared component of ${comp.name}`);
                //     return;
                // }
                // @ts-ignore
                // const diffInfos = this.getDiffPropertyInfos(comp, comparedComp, [],
                //          this.isInTargetOverrides.bind(this, comp, root._prefab?.targetOverrides)); // 利用偏函数传入预设参数
                // if (diffInfos && diffInfos.length > 0) {
                //     for (let i = 0; i < diffInfos.length; i++) {
                //         const info = diffInfos[i];
                //         this.checkToAddTargetOverride(comp, info, root);
                //     }
                // }
                this.addTargetOverrideWithModifyPath(node, pathKeys, root);
            }
        }
        // 如果改了组件，且 path 长度只有 2，则是设置了整个组件
        else if (comp && pathKeys.length === 2) {
            // @ts-ignore
            const props: string[] = comp.constructor.__props__;
            props.forEach((prop) => {
                const attr = cc.Class.attr(comp, prop);
                if (attr.visible !== false) {
                    this.checkToAddPropertyOverrides(node, [...pathKeys, prop], root);
                }
            });
        } else {
            this.checkToAddPropertyOverrides(node, pathKeys, root);
        }
    }

    /**
     * 一些组件，引擎内部会有数据更新操作，但没有统一处理，比如 lod\widget 的更新
     * 针对这些组件，需要在节点变化时，更新 override 数据
     * @param node
     * @param propPath
     * @param root
     */
    public updateSpecialComponent(node: Node, propPath: string, root: Node | Scene | null) {
        // 有可能存在节点被删除了，但是还出发了 updateSpecialComponent
        if (!node.isValid) return;

        if (propPath === 'position') {
            // 更新一下 widget
            const widget = node.getComponent(Widget);
            if (widget && !prefabUtils.isMountedComponent(widget)) {
                const index = node.components.indexOf(widget);
                const props: Record<string, string> = {
                    isAlignLeft: 'left',
                    isAlignRight: 'right',
                    isAlignHorizontalCenter: 'horizontalCenter',
                    isAlignTop: 'top',
                    isAlignBottom: 'bottom',
                    isAbsoluteVerticalCenter: 'verticalCenter',
                };
                Object.keys(props).forEach((key: string) => {
                    // @ts-ignore
                    if (widget[key]) {
                        this.checkToAddPropertyOverrides(node, ['_components', `${index}`, props[key]], root);
                    }
                });
            }
        }
    }

    public onAddNode(node: Node) {
        const parentNode = node.parent;

        if (!parentNode) {
            return;
        }

        this.updateChildrenData(parentNode);
        this.createReservedPropertyOverrides(node);
    }

    public onNodeAdded(node: Node) {
        this.checkToAddPrefabAssetMap(node);

        if (Service.Editor.getCurrentEditorType() === 'prefab') {
            // prefab 模式下添加节点，需要都加 Prefab 相关的信息
            const prefabInfo = prefabUtils.getPrefab(node);
            const rootNode = Service.Editor.getRootNode() as Node;
            if (!rootNode) {
                return;
            }
            const rootPrefabInfo = prefabUtils.getPrefab(rootNode);
            if (!rootPrefabInfo) {
                return;
            }
            if (prefabInfo?.instance) {
                // 如果是嵌套预制体添加，它本身是有 prefabRootNode 的，不要去改变它
                prefabInfo.instance.prefabRootNode = prefabInfo.instance.prefabRootNode ?? rootPrefabInfo.root;
            } else {
                // 非 PrefabInstance 节点才需要添加或更新 PrefabInfo
                if (!prefabInfo || !prefabInfo.root?.['_prefab']?.instance) {
                    if (rootPrefabInfo.root) {
                        prefabUtils.addPrefabInfo(node, rootPrefabInfo.root, rootPrefabInfo.asset);
                    } else {
                        console.warn('root of PrefabInfo is null, set to root node');
                        // 将 root 指向自己
                        rootPrefabInfo.root = rootNode;
                        prefabUtils.addPrefabInfo(node, rootPrefabInfo.root, rootPrefabInfo.asset);
                    }
                }
            }
        }
    }

    /**
     * 当一个组件需要引用到别的 PrefabInstance 中的
     * @param target 要检查的组件
     * @param diffInfo 差异数据
     * @param root 根节点
     * @returns
     */
    public checkToAddTargetOverride(target: Component, diffInfo: IDiffPropertyInfo, root: Node | null): boolean {
        if (!(target instanceof Component)) {
            return false;
        }

        const propValue = diffInfo.value;

        // @ts-ignore
        const rootPrefabInfo = root['_prefab'];
        // 设置 Component 的某个属性为空，需要判断是否清除 TargetOverrides
        if ((propValue === null || propValue === undefined) && target) {
            prefabUtils.removeTargetOverride(rootPrefabInfo, target, diffInfo.pathKeys);
            return false;
        }

        let checkNode: Node | null = null;
        if (propValue instanceof Node) {
            checkNode = propValue;
        } else if (propValue instanceof Component) {
            checkNode = propValue.node;
        }

        if (!checkNode) {
            return false;
        }

        const checkPrefabInfo = prefabUtils.getPrefab(checkNode);
        if (!checkPrefabInfo) {
            return false;
        }

        // 向上查找 PrefabInstance 路径
        const outMostPrefabInstanceInfo = prefabUtils.getOutMostPrefabInstanceInfo(checkNode);
        const outMostPrefabInstanceNode: Node | null = outMostPrefabInstanceInfo.outMostPrefabInstanceNode;
        if (!outMostPrefabInstanceNode) {
            return false;
        }

        if (propValue instanceof Node && outMostPrefabInstanceNode === propValue) {
            // 最外的 Instance 根节点，不需要通过 TargetOverrides 来重新映射了，直接存场景索引就可以找到
            prefabUtils.removeTargetOverride(rootPrefabInfo, target, diffInfo.pathKeys);
            return false;
        }

        const targetPath: string[] = outMostPrefabInstanceInfo.targetPath;

        // @ts-ignore
        const outMostPrefabInstance: Prefab._utils.PrefabInstance | undefined = outMostPrefabInstanceNode['_prefab']?.instance;

        if (outMostPrefabInstance) {
            targetPath.splice(0, 1); // 不需要存最外层的 PrefabInstance 的 fileID
            // 只处理component
            if (propValue instanceof Node) {
                // @ts-ignore
                const prefabInfo = propValue['_prefab'];
                if (prefabInfo && prefabInfo.fileId) {
                    targetPath.push(prefabInfo.fileId);
                } else {
                    console.error(`can't get fileId of prefab node: ${propValue.name}`);
                    return false;
                }
            } else if (propValue instanceof Component) {
                // @ts-ignore
                const compPrefabInfo = propValue.__prefab;
                if (compPrefabInfo && compPrefabInfo.fileId) {
                    targetPath.push(compPrefabInfo.fileId);
                } else {
                    // 非 mounted 的 component 才需要报错
                    if (!prefabUtils.getMountedRoot(propValue)) {
                        console.error(`can't get fileId of prefab component: ${propValue.name} in node: ${propValue.node.name}`);
                    }
                    return false;
                }
            }

            // get root prefabInfo
            // scene or root in prefabAsset
            if (!root) {
                return false;
            }

            // @ts-ignore
            if (!root['_prefab']) {
                // @ts-ignore
                root['_prefab'] = prefabUtils.createPrefabInfo(root.uuid);
            }

            // @ts-ignore
            const rootPrefabInfo = root['_prefab']!;
            const targetOverride = prefabUtils.getTargetOverride(rootPrefabInfo, target, diffInfo.pathKeys);
            if (targetOverride) {
                prefabUtils.fireBeforeChangeMsg(root);
                targetOverride.target = outMostPrefabInstanceNode;
                const targetInfo = new TargetInfo();
                targetInfo.localID = targetPath;
                targetOverride.targetInfo = targetInfo;
                prefabUtils.fireChangeMsg(root);
                return true;
            }
        }

        return false;
    }

    // 对比当前节点和对应预制体原始资源中的数据的差异
    private checkToAddPropertyOverrides(node: Node, pathKeys: string[], root: Node | null) {
        // 获取节点所属预制体的相关信息
        const propertyOverrideLocation = prefabUtils.getPropertyOverrideLocationInfo(node, pathKeys);

        if (!propertyOverrideLocation) {
            return;
        }

        const outMostPrefabInstanceNode = propertyOverrideLocation.outMostPrefabInstanceNode;
        if (!outMostPrefabInstanceNode) {
            return;
        }
        // @ts-ignore
        const outMostPrefabInfo = outMostPrefabInstanceNode['_prefab'];
        if (!outMostPrefabInfo || !outMostPrefabInfo.asset) {
            return;
        }

        const outMostPrefabInstance = outMostPrefabInfo?.instance;
        if (!outMostPrefabInstance) {
            return;
        }

        const curTarget = propertyOverrideLocation.target;

        const mountedRoot = prefabUtils.getMountedRoot(curTarget);
        // 如果修改的是一个在当前上下文下的 mounted 节点或组件，就不需要写 overrides，因为 mounted 的节点或组件本身就会被序列化
        if (mountedRoot && mountedRoot === outMostPrefabInstanceNode) {
            return;
        }

        const localID = propertyOverrideLocation.targetPath;
        const assetRootNode: Node | undefined = prefabUtils.getPrefabAssetNodeInstance(outMostPrefabInfo);
        if (!assetRootNode) {
            return;
        }

        const targetInAsset = prefabUtils.getTarget(localID, assetRootNode);

        if (!targetInAsset) {
            console.debug(`can't find item: ${curTarget.name} in prefab asset ${outMostPrefabInfo.asset._uuid}`);
            return;
        }

        const propOverrides = prefabUtils.getPropertyOverridesOfTarget(outMostPrefabInstance, localID);
        const diffInfos = this.getDiffPropertyInfos(curTarget, targetInAsset, [], this.isInPropertyOverrides.bind(this, propOverrides)); // 利用偏函数传入预设参数

        // 清除以前用 setter 记录下的数据
        // prefabUtil.removePropertyOverride(outMostPrefabInstance, localID, propertyOverrideLocation.relativePathKeys);
        if (diffInfos && diffInfos.length > 0) {
            prefabUtils.fireBeforeChangeMsg(propertyOverrideLocation.outMostPrefabInstanceNode);

            for (let i = 0; i < diffInfos.length; i++) {
                const info = diffInfos[i];

                if (curTarget instanceof Component && this.checkToAddTargetOverride(curTarget, info, root)) {
                    continue;
                }
                const propOverride = prefabUtils.getPropertyOverride(outMostPrefabInstance, localID, info.pathKeys);
                propOverride.value = info.value;
            }
            if (root) {
                // diffPropertyInfos 获取到的差异信息,有些情况会漏掉，直接比较最准确
                this.addTargetOverrideWithModifyPath(node, pathKeys, root);
            }
            prefabUtils.fireChangeMsg(propertyOverrideLocation.outMostPrefabInstanceNode);
        }
    }

    // 是否已经在 TargetOverride 记录中
    private isInTargetOverrides(source: Component, targetOverrides: TargetOverrideInfo[] | null, pathKeys: string[]) {
        if (!targetOverrides) {
            return false;
        }
        return prefabUtils.isInTargetOverrides(targetOverrides, source, pathKeys);
    }

    // 是否在 PropertyOverrides 中
    private isInPropertyOverrides(propertyOverrides: PropertyOverrideInfo[], pathKeys: string[]) {
        return prefabUtils.isInPropertyOverrides(pathKeys, propertyOverrides);
    }

    /**
     * 对比得到两个 ccClass 的差异数据
     * @param curTarget 对比的对象
     * @param comparedTarget 被比较的对象
     * @param propPathKeys 当前对象的属性路径数组
     * @param isModifiedFunc 用于判断属性是否被修改的方法
     * @returns
     */
    private getDiffPropertyInfos(
        curTarget: any,
        comparedTarget: any,
        propPathKeys: string[],
        isModifiedFunc: Function,
    ): null | IDiffPropertyInfo[] {
        if (!curTarget) {
            return null;
        }

        const curTargetCtor = curTarget.constructor;
        const comparedTargetCtor = comparedTarget.constructor;

        if (!curTargetCtor || !comparedTargetCtor || curTargetCtor !== comparedTargetCtor) {
            return null;
        }

        // @ts-ignore
        const props = curTargetCtor.__values__; // 可序列化的属性都放在这里边
        const excludeProps = getDiffExcludeProps(curTargetCtor);

        let diffPropertyInfos: IDiffPropertyInfo[] = [];
        props.map((key: string) => {
            if (excludeProps.includes(key)) {
                return;
            }

            const attr = CCClass.attr(curTargetCtor, key);
            if (attr.serializable === false) {
                return;
            }

            const curPropValue = curTarget[key];
            const comparedPropValue = comparedTarget[key];

            const infos = this.handleDiffPropertyInfos(curPropValue, comparedPropValue, key, propPathKeys, isModifiedFunc);
            diffPropertyInfos = diffPropertyInfos.concat(infos);
        });

        return diffPropertyInfos;
    }

    private handleDiffPropertyInfos(
        curPropValue: any,
        comparedPropValue: any,
        propName: string,
        propPathKeys: string[],
        isModifiedFunc: Function,
    ) {
        let diffPropertyInfos: IDiffPropertyInfo[] = [];

        const pathKeys = propPathKeys.concat(propName);
        const diffProp: IDiffPropertyInfo = {
            pathKeys,
            value: curPropValue,
        };
        if (curPropValue === null || curPropValue === undefined) {
            if (curPropValue !== comparedPropValue || isModifiedFunc(pathKeys)) {
                diffPropertyInfos.push(diffProp);
            }
        } else {
            if (comparedPropValue === null || comparedPropValue === undefined || isModifiedFunc(pathKeys)) {
                diffPropertyInfos.push(diffProp);
            } else {
                // 两个需要对比的值都非空，需要进行更详细的对比
                if (Array.isArray(curPropValue)) {
                    // 数组长度发生变化，需要记录
                    const lengthPathKeys = pathKeys.concat('length');
                    if (curPropValue.length !== comparedPropValue.length || isModifiedFunc(lengthPathKeys)) {
                        const lengthDiffProp: IDiffPropertyInfo = {
                            pathKeys: lengthPathKeys,
                            value: curPropValue.length,
                        };
                        diffPropertyInfos.push(lengthDiffProp);
                    }

                    for (let i = 0; i < curPropValue.length; i++) {
                        const infos = this.handleDiffPropertyInfos(curPropValue[i], comparedPropValue[i], '' + i, pathKeys, isModifiedFunc);
                        if (infos && infos.length > 0) {
                            diffPropertyInfos = diffPropertyInfos.concat(infos);
                        }
                    }
                } else if (typeof curPropValue === 'object') {
                    if (curPropValue instanceof Node) {
                        // @ts-ignore
                        const prefabInfo = curPropValue['_prefab'];
                        // 普通节点用 uuid 比较，prefab 用 fileId 比较（可能会有相同，之后再 fix）
                        if (
                            (prefabInfo && prefabInfo.fileId !== comparedPropValue['_prefab']?.fileId) ||
                            curPropValue.uuid !== comparedPropValue.uuid
                        ) {
                            diffPropertyInfos.push(diffProp);
                        }
                    } else if (curPropValue instanceof Component) {
                        // 普通组件组件用 uuid 比较，prefab 用 fileId 比较（可能会有相同，之后再 fix）
                        if (
                            (curPropValue.__prefab && curPropValue.__prefab.fileId !== comparedPropValue.__prefab?.filedId) ||
                            curPropValue.uuid !== comparedPropValue.uuid
                        ) {
                            diffPropertyInfos.push(diffProp);
                        }
                    } else if (curPropValue instanceof ValueType) {
                        if (!curPropValue.equals(comparedPropValue) || isModifiedFunc(pathKeys)) {
                            diffPropertyInfos.push(diffProp);
                        }
                    } else if (curPropValue instanceof Asset) {
                        if (curPropValue._uuid !== comparedPropValue._uuid || isModifiedFunc(pathKeys)) {
                            diffPropertyInfos.push(diffProp);
                        }
                    } else if (CCClass.isCCClassOrFastDefined(curPropValue.constructor)) {
                        const infos = this.getDiffPropertyInfos(curPropValue, comparedPropValue, pathKeys, isModifiedFunc);
                        if (infos && infos.length > 0) {
                            diffPropertyInfos = diffPropertyInfos.concat(infos);
                        }
                    }
                } else {
                    // primitive type
                    if (curPropValue !== comparedPropValue || isModifiedFunc(pathKeys)) {
                        diffPropertyInfos.push(diffProp);
                    }
                }
            }
        }

        return diffPropertyInfos;
    }

    /**
     * 直接通过修改节点路径来判断添加 targetOverride 信息
     * @param node 修改的节点
     * @param pathKeys 属性键值路径
     * @param root
     */
    private addTargetOverrideWithModifyPath(node: Node, pathKeys: string[], root: Node) {
        let value = node;
        let comp: Component | null = null;
        for (let index = 0; index < pathKeys.length; index++) {
            const key = pathKeys[index];
            if (!value) break;
            // @ts-ignore
            value = value[key];
            if (index === 1 && pathKeys[0] === '_components') {
                // 组件必然是_components[x]开头
                // @ts-ignore
                comp = value;
            }
        }
        if (value !== node && comp) {
            // 必须移除掉组件的路径，因为targetOverrideInfo是存的comp而不是node
            pathKeys.shift();
            pathKeys.shift();
            this.checkToAddTargetOverride(comp, { pathKeys: pathKeys, value: value }, root);
        }
    }

    private checkToAddPrefabAssetMap(node: Node) {
        // @ts-ignore
        const prefabInfo = node['_prefab'];
        const prefabInstance = prefabInfo?.instance;
        if (prefabInstance && prefabInfo?.asset) {
            let nodes = this.assetToNodesMap.get(prefabInfo.asset._uuid);
            if (!nodes) {
                nodes = [];
                this.assetToNodesMap.set(prefabInfo.asset._uuid, nodes);
            }

            if (!nodes.includes(node)) {
                nodes.push(node);
            }
        }
    }

    public onNodeChangedInGeneralMode(node: Node, opts: IChangeNodeOptions, root: Node | Scene | null) {
        if (!opts) {
            return;
        }

        if (opts.type === NodeEventType.CHILD_CHANGED) {
            this.updateChildrenData(node);
            return;
        } else if (opts.type === NodeEventType.PARENT_CHANGED) {
            if (Service.Editor.getCurrentEditorType() === 'prefab') {
                const prefabInstance = node['_prefab']?.instance;
                if (prefabInstance) {
                    prefabInstance.prefabRootNode = root as Node;
                }
            }
        }

        if (opts.propPath === 'children' && opts.type === NodeEventType.MOVE_ARRAY_ELEMENT) {
            // 不记录 children 的变动值到 override 中
            return;
        }

        // 修改 PrefabInstance 中节点数据，要保存在最外层的 PrefabInstance中
        if (opts.propPath) {
            const key = node.uuid + '|' + opts.propPath;
            this._timerUtil.callFunctionLimit(key, this.checkToAddOverrides.bind(this), node, opts.propPath, root);
        }

        this._timerUtil.callFunctionLimit(node.uuid, this.updateSpecialComponent.bind(this), node, opts.propPath, root);
    }

    /**
     * 判断是否是需要保留的 PropertyOverride
     * @param propOverride Prefab 实例
     * @param prefabRootFileId prefab 根节点的 FileId
     */
    public isReservedPropertyOverrides(propOverride: Prefab._utils.PropertyOverrideInfo, prefabRootFileId: string) {
        const targetInfo = propOverride.targetInfo;
        if (targetInfo?.localID.length === 1 && targetInfo.localID[0] === prefabRootFileId) {
            const propPath = propOverride.propertyPath;
            if (propPath.length === 1 && RootReservedProperty.includes(propPath[0])) {
                return true;
            }
        }

        return false;
    }

    /**
     * 移除实例的 PropertyOverrides，保留一些一般不需要和 PrefabAsset 自动同步的覆盖
     * @param prefabInstance Prefab 实例
     * @param prefabRootFileId prefab 根节点的 FileId
     */
    public removeModifiedPropertyOverrides(prefabInstance: PrefabInstance, prefabRootFileId: string) {
        const reservedPropertyOverrides = [];
        for (let i = 0; i < prefabInstance.propertyOverrides.length; i++) {
            const propOverride = prefabInstance.propertyOverrides[i];
            if (this.isReservedPropertyOverrides(propOverride, prefabRootFileId)) {
                reservedPropertyOverrides.push(propOverride);
            }
        }

        prefabInstance.propertyOverrides = reservedPropertyOverrides;
    }

    // 处理嵌套节点的 Override，要从场景的 instance 写到 prefab 资源中的嵌套子节点上的 instance 的 override 中
    public applyMountedChildren(node: Node) {
        const rootNode: Node = node;
        const prefabInfo = prefabUtils.getPrefab(rootNode);
        if (!prefabInfo || !prefabInfo.instance) return;

        const prefabInstance = prefabInfo.instance;
        const mountedChildrenMap = new Map<string[], INodePrefabData>();
        const mountedChildren = prefabInstance.mountedChildren;

        for (let i = 0; i < mountedChildren.length; i++) {
            const mountedChildInfo = mountedChildren[i];
            const targetInfo = mountedChildInfo.targetInfo;
            if (!targetInfo) {
                continue;
            }

            // localID 长度大于1，表示是加到了嵌套的 PrefabInstance 节点中去了
            if (targetInfo.localID.length > 1) {
                // 需要将 mounted 的信息加到嵌套的那个 PrefabInstance 中去

                const target = prefabUtils.getTarget(targetInfo.localID, rootNode) as Node;

                // 找下一级的 PrefabInstance
                prefabInfo.instance = undefined;
                const nestedInstPrefabInstanceInfo = prefabUtils.getOutMostPrefabInstanceInfo(target);
                prefabInfo.instance = prefabInstance;

                const nestedInstNode = nestedInstPrefabInstanceInfo.outMostPrefabInstanceNode;
                if (!nestedInstNode) {
                    continue;
                }

                // @ts-ignore
                const nestedInstPrefabInfo = nestedInstNode['_prefab'];
                if (!nestedInstPrefabInfo) {
                    continue;
                }
                const nestedInstPrefabInstance = nestedInstPrefabInfo.instance;
                if (!nestedInstPrefabInstance) {
                    continue;
                }

                const targetPath = nestedInstPrefabInstanceInfo.targetPath.slice();
                const mountedParentPath = nestedInstPrefabInstanceInfo.targetPath.slice(1);
                const targetFileId = prefabUtils.getPrefab(target)?.fileId;
                if (!targetFileId) {
                    continue;
                }
                mountedParentPath.push(targetFileId);
                const nestedMountedChildInfo = prefabUtils.getPrefabInstanceMountedChildren(nestedInstPrefabInstance, mountedParentPath);

                mountedChildInfo.nodes.forEach((mountedNode) => {
                    // @ts-ignore
                    const oldPrefabInfo = mountedNode['_prefab'];
                    prefabUtils.addPrefabInfo(mountedNode, nestedInstNode, nestedInstPrefabInfo.asset);
                    prefabUtils.setMountedRoot(mountedNode, nestedInstNode);
                    // @ts-ignore
                    const mountedNodePrefabInfo = mountedNode['_prefab'];
                    if (!mountedNodePrefabInfo) {
                        return;
                    }
                    // 找到原来的 mounted 节点，在新的 Prefab 下的 LocalID，以便还原时候根据它来查找节点
                    targetPath.push(mountedNodePrefabInfo.fileId);
                    mountedChildrenMap.set(targetPath, { prefabInfo: oldPrefabInfo });
                });

                nestedMountedChildInfo.nodes = nestedMountedChildInfo.nodes.concat(mountedChildInfo.nodes);
            } else {
                // 没有嵌套的的 mounted 节点会直接成为 PrefabAsset 里的节点
                mountedChildInfo.nodes.forEach((mountedNode) => {
                    // @ts-ignore
                    let mountedNodePrefabInfo = prefabUtils.getPrefab(mountedNode);
                    prefabUtils.setMountedRoot(mountedNode, undefined);

                    if (!mountedNodePrefabInfo) {
                        prefabUtils.addPrefabInfo(mountedNode, node, prefabInfo.asset);
                        mountedNodePrefabInfo = prefabUtils.getPrefab(mountedNode);
                    } else {
                        // 非 instance 才要换 asset
                        if (!mountedNodePrefabInfo.instance) {
                            prefabUtils.addPrefabInfo(mountedNode, node, prefabInfo.asset);
                        }
                    }
                    mountedChildrenMap.set([mountedNodePrefabInfo!.fileId], { prefabInfo: null });
                });
            }
        }

        prefabInstance.mountedChildren = [];

        return mountedChildrenMap;
    }

    public applyPropertyOverrides(node: Node) {
        const rootNode: Node = node;

        // @ts-ignore
        const prefabInfo = rootNode['_prefab'];
        if (!prefabInfo) {
            return;
        }
        const prefabInstance = prefabInfo.instance;
        if (!prefabInstance) {
            return;
        }

        const propertyOverrides = prefabInstance.propertyOverrides;
        const reservedPropertyOverrides = [];
        for (let i = 0; i < propertyOverrides.length; i++) {
            const propOverride = propertyOverrides[i];

            // 保留一些一般不需要和 PrefabAsset 自动同步的 override
            if (this.isReservedPropertyOverrides(propOverride, prefabInfo.fileId)) {
                reservedPropertyOverrides.push(propOverride);
                continue;
            }

            const targetInfo = propOverride.targetInfo;
            if (!targetInfo) {
                continue;
            }

            // localID 长度大于1，表示是加到了嵌套的 PrefabInstance 节点中去了
            if (targetInfo.localID.length > 1) {
                // 需要将 mounted 的信息加到嵌套的那个 PrefabInstance 中去
                const target = prefabUtils.getTarget(targetInfo.localID, rootNode);

                if (!target) {
                    continue;
                }

                let targetNode = target;
                if (targetNode instanceof Component) {
                    targetNode = targetNode.node;
                }

                // 找下一级的 PrefabInstance
                prefabInfo.instance = undefined;
                const nestedInstPrefabInstanceInfo = prefabUtils.getOutMostPrefabInstanceInfo(targetNode);
                prefabInfo.instance = prefabInstance;

                const nestedInstNode = nestedInstPrefabInstanceInfo.outMostPrefabInstanceNode;
                if (!nestedInstNode) {
                    continue;
                }

                // @ts-ignore
                const nestedInstPrefabInfo = nestedInstNode['_prefab'];
                if (!nestedInstPrefabInfo) {
                    continue;
                }
                const nestedInstPrefabInstance = nestedInstPrefabInfo.instance;
                if (!nestedInstPrefabInstance) {
                    continue;
                }

                const targetPath = nestedInstPrefabInstanceInfo.targetPath.slice();
                targetPath.splice(0, 1);

                // @ts-ignore
                const targetPrefabInfo = target instanceof Node ? target['_prefab'] : target.__prefab;
                if (!targetPrefabInfo) {
                    continue;
                }
                targetPath.push(targetPrefabInfo.fileId);
                const nestedPropOverride = prefabUtils.getPropertyOverride(nestedInstPrefabInstance, targetPath, propOverride.propertyPath);
                nestedPropOverride.value = propOverride.value;
            } else {
                // 没有嵌套的的 override 数据会直接存到 PrefabAsset 的节点上
            }
        }

        prefabInstance.propertyOverrides = reservedPropertyOverrides;
    }

    // 更新脚本中预制体 child 引用的值到预制体资源
    public applyTargetOverrides(node: Node) {
        const appliedTargetOverrides: TargetOverrideInfo[] = [];
        // 场景节点或 prefab 资源中的根节点
        const sceneRootNode = Service.Editor.getRootNode();
        if (!sceneRootNode) {
            return appliedTargetOverrides;
        }

        const sceneRootNodePrefabInfo = prefabUtils.getPrefab(sceneRootNode);
        if (!sceneRootNodePrefabInfo) {
            return appliedTargetOverrides;
        }

        const prefabInfo = prefabUtils.getPrefab(node);
        if (!prefabInfo) {
            return appliedTargetOverrides;
        }
        const prefabInstance = prefabInfo.instance;
        if (!prefabInstance) {
            return appliedTargetOverrides;
        }

        if (sceneRootNodePrefabInfo.targetOverrides) {
            for (let i = sceneRootNodePrefabInfo.targetOverrides.length - 1; i >= 0; i--) {
                const targetOverride = sceneRootNodePrefabInfo.targetOverrides[i];
                let source = targetOverride.source;
                const sourceNode = source instanceof Component ? source.node : source;
                const sourceInfo = targetOverride.sourceInfo;
                if (sourceInfo) {
                    if (source instanceof Node) {
                        const node = prefabUtils.getTarget(sourceInfo.localID, source);
                        source = node ? node : source;
                    }
                }

                const targetInfo = targetOverride.targetInfo;
                if (!targetInfo) {
                    continue;
                }

                const targetInstance = targetOverride.target?.['_prefab']?.instance;
                if (!targetInstance) {
                    continue;
                }
                const t = targetOverride.target;
                const target = t ? prefabUtils.getTarget(targetInfo.localID, t as Node) : null;
                if (!target) {
                    // Can't find target
                    continue;
                }

                const targetNode = target instanceof Component ? target.node : target;

                if (!sourceNode || !targetNode) {
                    continue;
                }
                // 如果引用和被引用的节点都在 prefab 中，就要把 targetOverride 信息更新掉;
                if (isPartOfNode(sourceNode, node) && isPartOfNode(targetNode, node)) {
                    if (!prefabInfo.targetOverrides) {
                        prefabInfo.targetOverrides = [];
                    }

                    let sourceInAsset = source;

                    const assetTargetOverride = new TargetOverrideInfo();
                    assetTargetOverride.propertyPath = targetOverride.propertyPath;

                    // 更新 source 相关数据
                    const sourceLocalID = sourceInfo?.localID;
                    if (sourceLocalID) {
                        if (targetOverride.source instanceof Node) {
                            const sourceComp = prefabUtils.getTarget(sourceLocalID, targetOverride.source) as Component;
                            if (sourceComp) {
                                sourceInAsset = sourceComp;
                            }
                        }
                    }

                    let targetInAsset = targetOverride.target;
                    // 更新 target 相关数据
                    const assetTargetLocalID = targetInfo.localID;
                    if (assetTargetLocalID) {
                        // 这里和 source 不同的地方是，对 target 的索引是通过 PrefabInstance 的 FileId + 节点/组件的 FileId
                        // source 的索引可以没有 source 所在节点的 PrefabInstance 的 FileId
                        if (targetOverride.target instanceof Node) {
                            const target = prefabUtils.getTarget(assetTargetLocalID, targetOverride.target) as Node;
                            if (target) {
                                targetInAsset = target;
                            }
                        }
                    }

                    prefabInfo.instance = undefined;
                    this.checkToAddTargetOverride(
                        sourceInAsset as Component,
                        {
                            pathKeys: targetOverride.propertyPath,
                            value: targetInAsset,
                        },
                        node,
                    );
                    prefabInfo.instance = prefabInstance;
                    // 清理掉 targetOverride 数据
                    sceneRootNodePrefabInfo.targetOverrides.splice(i, 1);
                }

                appliedTargetOverrides.push(targetOverride);
            }
        }

        return appliedTargetOverrides;
    }

    public applyRemovedComponents(node: Node) {
        const rootNode: Node = node;

        // @ts-ignore
        const prefabInfo = rootNode['_prefab'];
        if (!prefabInfo) {
            return;
        }
        const prefabInstance = prefabInfo.instance;
        if (!prefabInstance) {
            return;
        }

        const assetRootNode = prefabUtils.getPrefabAssetNodeInstance(prefabInfo);
        if (!assetRootNode) {
            return null;
        }

        const removedComponents = prefabInstance.removedComponents;
        for (let i = 0; i < removedComponents.length; i++) {
            const targetInfo = removedComponents[i];
            if (!targetInfo) {
                continue;
            }

            // localID 长度大于1，表示是加到了嵌套的 PrefabInstance 节点中去了
            if (targetInfo.localID.length > 1) {
                const targetCompInAsset = prefabUtils.getTarget(targetInfo.localID, assetRootNode) as Component;
                if (!targetCompInAsset || !targetCompInAsset.__prefab) {
                    continue;
                }

                const targetNodeInAsset = targetCompInAsset.node;
                const targetNodeInAssetPrefabInfo = prefabUtils.getPrefab(targetNodeInAsset);
                if (!targetCompInAsset || !targetNodeInAssetPrefabInfo) {
                    continue;
                }

                // 先在 PrefabAsset 找到删除的 component 所在的节点的 localID，因为删除的 component 在当前
                // PrefabInstance 中已经不在了，无法通过 component 的 FileId 来找了，所以要通过找 node，
                // 然后再找下一层级的 PrefabInstance
                const targetNodeLocalID = targetInfo.localID.slice();
                targetNodeLocalID.pop();
                targetNodeLocalID.push(targetNodeInAssetPrefabInfo.fileId);

                // 在当前 PrefabInstance 中查找节点
                const curTargetNode = prefabUtils.getTarget(targetNodeLocalID, rootNode) as Node;

                // 找下一级的 PrefabInstance
                prefabInfo.instance = undefined;
                const nestedInstPrefabInstanceInfo = prefabUtils.getOutMostPrefabInstanceInfo(curTargetNode);
                prefabInfo.instance = prefabInstance;

                const nestedInstNode = nestedInstPrefabInstanceInfo.outMostPrefabInstanceNode;
                if (!nestedInstNode) {
                    continue;
                }

                const nestedInstPrefabInfo = prefabUtils.getPrefab(nestedInstNode);
                if (!nestedInstPrefabInfo) {
                    continue;
                }
                const nestedInstPrefabInstance = nestedInstPrefabInfo.instance;
                if (!nestedInstPrefabInstance) {
                    continue;
                }

                const targetPath = nestedInstPrefabInstanceInfo.targetPath.slice();
                targetPath.splice(0, 1);
                targetPath.push(targetCompInAsset.__prefab.fileId);
                const newTargetInfo = new TargetInfo();
                newTargetInfo.localID = targetPath;
                nestedInstPrefabInstance.removedComponents.push(newTargetInfo);
            }
        }

        prefabInstance.removedComponents = [];
    }
    protected async waitForSceneLoaded() {
        return new Promise<boolean>((r, _) => {
            Service.Editor.reload({}).then(() => {
                r(true);
            });
        });
    }
    /**
     * 将一个 PrefabInstance 的数据应用到对应的 Asset 资源上
     * @param nodeUUID uuid
     */
    public async applyPrefab(nodeUUID: string) {
        // const command = new ApplyPrefabCommand(this.undoApplyPrefab.bind(this), this.doApplyPrefab.bind(this));
        // const undoID = cce.SceneFacadeManager.beginRecording(nodeUUID, { customCommand: command });
        const appPrefabInfo = await this.doApplyPrefab(nodeUUID);
        if (appPrefabInfo) {
            // command.applyPrefabInfo = appPrefabInfo;
            // cce.SceneFacadeManager.endRecording(undoID);
            // cce.SceneFacadeManager.snapshot());
            // cce.SceneFacadeManager.abortSnapshot();
            // 因为 apply prefab 后一定会触发 soft reload ,要等场景加载完成
            // 防止在切换到 prefab 编辑模式之后才触发 soft reload
            return true;
        } else {
            // cce.SceneFacadeManager.cancelRecording(undoID);
        }

        return false;
    }

    public async doApplyPrefab(nodeUUID: string): Promise<IApplyPrefabInfo | null> {
        await Service.Editor.waitReloading();
        const node = nodeMgr.getNode(nodeUUID);
        if (!node) return null;

        const prefabInfo = prefabUtils.getPrefab(node);

        const prefabInstance = prefabInfo?.instance;
        if (!prefabInstance || !prefabInfo?.asset) return null;

        const asset = prefabInfo.asset;

        // 如果是子资源，则不能应用
        if (prefabUtils.isSubAsset(asset._uuid)) {
            console.warn('can\'t apply data to SubAsset Prefab');
            return null;
        }

        const oldNodeData = asset.data;

        const info = await Rpc.getInstance().request('assetManager', 'queryAssetInfo', [asset._uuid]);
        if (!info) return null;

        // 把非预制体内的节点，更新到预制体信息中
        const mountedChildrenInfoMap = this.applyMountedChildren(node);
        if (!mountedChildrenInfoMap) return null;

        // 把非预制体内的组件，更新到预制体信息中
        const mountedComponentsInfoMap = componentOperation.applyMountedComponents(node);
        if (!mountedComponentsInfoMap) return null;

        const propertyOverrides = prefabInstance.propertyOverrides;
        this.applyPropertyOverrides(node);
        const removedComponents = prefabInstance.removedComponents;
        this.applyRemovedComponents(node);
        const appliedTargetOverrides = this.applyTargetOverrides(node);
        const ret = prefabUtils.generatePrefabDataFromNode(node);
        if (!ret) return null;
        if (ret.clearedReference) {
            this.restoreClearedReference(node, ret.clearedReference);
        }

        return new Promise((resolve) => {
            let finished = false;
            const TIMEOUT_MS = 5000;

            const done = () => {
                if (finished) return;
                finished = true;
                clearTimeout(timer);

                resolve({
                    nodeUUID,
                    mountedChildrenInfoMap,
                    mountedComponentsInfoMap,
                    propertyOverrides,
                    removedComponents,
                    oldPrefabNodeData: oldNodeData,
                    targetOverrides: appliedTargetOverrides,
                });
            };

            // 监听事件
            ServiceEvents.once<IEditorEvents>('editor:reload', () => {
                done();
            });

            // 超时兜底
            const timer = setTimeout(() => {
                console.warn('[doApplyPrefab] editor:reload 未触发');
                done();
            }, TIMEOUT_MS);

            // 保存资源
            Rpc.getInstance().request('assetManager', 'saveAsset', [
                info.source, ret.prefabData,
            ]).then(() => {
                prefabUtils.removePrefabAssetNodeInstanceCache(prefabInfo);
            });
        });
    }

    public async undoApplyPrefab(applyPrefabInfo: IApplyPrefabInfo) {
        await Service.Editor.waitReloading();
        const node = nodeMgr.getNode(applyPrefabInfo.nodeUUID);
        if (!node) {
            return;
        }
        // @ts-ignore
        const prefabInfo = node['_prefab'];
        if (!prefabInfo) {
            return;
        }
        const prefabInstance = prefabInfo.instance;
        if (!prefabInstance) {
            return;
        }

        const asset = prefabInfo.asset;

        if (!asset) {
            return;
        }

        const info = await Rpc.getInstance().request('assetManager', 'queryAssetInfo', [asset._uuid]);
        if (!info) {
            return;
        }

        asset.data = applyPrefabInfo.oldPrefabNodeData;
        const content = EditorExtends.serialize(asset);

        prefabInstance.mountedChildren = [];

        const targetMap = prefabUtils.getTargetMap(node);

        applyPrefabInfo.mountedChildrenInfoMap.forEach((oldNodeData: INodePrefabData, localID: string[]) => {
            const target = Prefab._utils.getTarget(localID, targetMap) as Node;
            if (!target) {
                return;
            }

            prefabUtils.setMountedRoot(target, node);
            // @ts-ignore
            target['_prefab'] = oldNodeData.prefabInfo;

            if (target.parent) {
                this.updateChildrenData(target.parent);
            }
        });

        applyPrefabInfo.mountedComponentsInfoMap.forEach((oldCompData: IComponentPrefabData, localID: string[]) => {
            const target = Prefab._utils.getTarget(localID, targetMap) as Component;
            if (!target) {
                return;
            }

            prefabUtils.setMountedRoot(target, node);
            target.__prefab = oldCompData.prefabInfo;

            if (target.node) {
                componentOperation.updateMountedComponents(target.node);
            }
        });

        prefabInstance.propertyOverrides = applyPrefabInfo.propertyOverrides;
        prefabInstance.removedComponents = applyPrefabInfo.removedComponents;
        // 场景节点或 prefab 资源中的根节点
        const sceneRootNode = Service.Editor.getRootNode();
        if (sceneRootNode) {
            const sceneRootNodePrefabInfo = prefabUtils.getPrefab(sceneRootNode);
            if (sceneRootNodePrefabInfo) {
                if (!sceneRootNodePrefabInfo.targetOverrides) {
                    sceneRootNodePrefabInfo.targetOverrides = [];
                }
                // 还原根节点的targetOverride
                applyPrefabInfo.targetOverrides?.forEach((overrideInfo) => {
                    const targetOverride = new TargetOverrideInfo();
                    if (overrideInfo.sourceUUID) {
                        const node = nodeMgr.getNode(overrideInfo.sourceUUID);
                        if (node) {
                            targetOverride.source = node;
                        } else {
                            const comp = compMgr.getComponent(overrideInfo.sourceUUID);
                            if (comp) {
                                targetOverride.source = comp;
                            }
                        }
                    }

                    targetOverride.sourceInfo = overrideInfo.sourceInfo;
                    if (overrideInfo.targetUUID) {
                        const node = nodeMgr.getNode(overrideInfo.targetUUID);
                        if (node) {
                            targetOverride.target = node;
                        } else {
                            const comp = compMgr.getComponent(overrideInfo.targetUUID);
                            if (comp) {
                                // TODO 这里不可能从组件管理器查找，是为什么这么写
                                // @ts-ignore
                                targetOverride.target = comp;
                            }
                        }
                    }
                    targetOverride.targetInfo = overrideInfo.targetInfo;
                    targetOverride.propertyPath = overrideInfo.propertyPath;

                    sceneRootNodePrefabInfo.targetOverrides?.push(targetOverride);
                });
                Prefab._utils.applyTargetOverrides(sceneRootNode);
            }
        }
        // 场景中使用的 Prefab 节点的 PrefabAsset 变动会重新 load 场景，所以不需要单独去变动节点了。
        await Rpc.getInstance().request('assetManager', 'createAsset', [{
            target: info.source,
            content: content as string,
            overwrite: true
        }]);
        // cce.SceneFacadeManager.abortSnapshot();
    }

    public updateChildrenData(node: Node) {
        if (!node) {
            return;
        }

        // 如果当前正在移除 MountedChildren，则不需要更新这个数据了
        if (this.isRemovingMountedChildren) {
            return;
        }

        // @ts-ignore
        const prefabInfo = node['_prefab'];

        // 如果节点不是一个Prefab就不用往下处理了
        if (!prefabInfo) {
            return;
        }

        // 如果最外层有一个 prefabInstance，就要记录到 prefabInstance 中成为一个 mountedChildren, 还需要保证顺序
        const outMostPrefabInstanceInfo = prefabUtils.getOutMostPrefabInstanceInfo(node);
        const outMostPrefabInstanceNode: Node | null = outMostPrefabInstanceInfo.outMostPrefabInstanceNode;
        if (!outMostPrefabInstanceNode) {
            return;
        }
        const targetPath: string[] = outMostPrefabInstanceInfo.targetPath;
        // @ts-ignore
        const outMostPrefabInfo = outMostPrefabInstanceNode['_prefab'];
        const outMostPrefabInstance: PrefabInstance | undefined = outMostPrefabInfo?.instance;

        if (!outMostPrefabInstanceNode || !outMostPrefabInfo || !outMostPrefabInstance) {
            return;
        }

        const assetRootNode = prefabUtils.getPrefabAssetNodeInstance(outMostPrefabInfo);
        if (!assetRootNode) {
            return;
        }

        targetPath.splice(0, 1); // 不需要存最外层的 PrefabInstance 的 fileID，方便 override 可以在 PrefabInstance 复制后复用
        targetPath.push(prefabInfo.fileId);
        const nodeInAsset: Node | null = prefabUtils.getTarget(targetPath, assetRootNode) as Node;

        if (!nodeInAsset) {
            return;
        }

        const childrenFileIDs = nodeInAsset.children.map((child) => {
            // @ts-ignore
            const prefabInfo = child['_prefab'];
            if (!prefabInfo) {
                return;
            }

            if (prefabInfo.instance) {
                return prefabInfo.instance.fileId;
            } else {
                return prefabInfo.fileId;
            }
        });

        const addedChildren: Node[] = [];

        for (let i = 0; i < node.children.length; i++) {
            const childNode = node.children[i];
            const childPrefabInfo = prefabUtils.getPrefab(childNode);
            const childPrefabInstance = childPrefabInfo?.instance;

            // 可以写入 mountedChildren 的条件：
            // 1. 是一个普通节点
            // 2. 是一个不在别的 Prefab 资源里的新增节点
            if (!childPrefabInfo) {
                addedChildren.push(childNode);
            } else {
                const fileID = childPrefabInstance ? childPrefabInstance.fileId : childPrefabInfo.fileId;
                if (!childrenFileIDs.includes(fileID)) {
                    // 1. mountedRoot 为空表示为新加的节点
                    // 2. mountedRoot 不为空需要查看是不是挂在这个 PrefabInstance 节点下的，因为可能是挂在里层 PrefabInstance 里,这里就不应该重复添加
                    // 3. mountedRoot 不为空，并且 mountedRoot 不是 outMostPrefabInstanceNode 需要进行同步（fix: https://github.com/cocos/3d-tasks/issues/18516）
                    const mountedRoot = prefabUtils.getMountedRoot(childNode);
                    if (!mountedRoot || mountedRoot === outMostPrefabInstanceNode || mountedRoot !== outMostPrefabInstanceNode) {
                        addedChildren.push(childNode);
                    }
                }
            }
        }

        prefabUtils.fireBeforeChangeMsg(outMostPrefabInstanceNode);
        if (addedChildren.length > 0) {
            const addedChildInfo = prefabUtils.getPrefabInstanceMountedChildren(outMostPrefabInstance, targetPath);
            addedChildInfo.nodes = addedChildren;
            addedChildInfo.nodes.forEach((childNode) => {
                prefabUtils.setMountedRoot(childNode, outMostPrefabInstanceNode);
            });
        } else {
            for (let i = 0; i < outMostPrefabInstance.mountedChildren.length; i++) {
                const childInfo = outMostPrefabInstance.mountedChildren[i];
                if (childInfo.isTarget(targetPath)) {
                    childInfo.nodes.forEach((child) => {
                        prefabUtils.setMountedRoot(child, undefined);
                    });
                    outMostPrefabInstance.mountedChildren.splice(i, 1);
                    break;
                }
            }
        }
        prefabUtils.fireChangeMsg(outMostPrefabInstanceNode);
    }

    private isCircularRefPrefabInstance(checkNode: Node, root: Node) {
        // @ts-ignore
        const checkPrefabInfo = checkNode['_prefab'];

        if (!checkPrefabInfo) {
            return false;
        }

        const checkPrefabInstance = checkPrefabInfo.instance;
        if (!checkPrefabInstance) {
            return false;
        }

        if (checkNode === root) {
            return false;
        }

        function checkPrefabAssetEqual(nodeA: Node, nodeB: Node) {
            // @ts-ignore
            const prefabInfoA = nodeA['_prefab'];
            const prefabInstanceA = prefabInfoA?.instance;

            // @ts-ignore
            const prefabInfoB = nodeB['_prefab'];
            const prefabInstanceB = prefabInfoB?.instance;

            if (prefabInstanceA && prefabInstanceB && prefabInfoA?.asset?._uuid === prefabInfoB?.asset?._uuid) {
                return true;
            }

            return false;
        }

        if (checkPrefabAssetEqual(checkNode, root)) {
            return true;
        }

        let parent = checkNode.parent;
        if (!parent) {
            return false;
        }

        while (parent && parent !== root) {
            if (checkPrefabAssetEqual(checkNode, parent)) {
                return true;
            }
            parent = parent.parent;
        }

        return false;
    }

    public canBeMadeToPrefabAsset(node: Node): boolean {
        let hasTerrain = false;
        let hasNestedPrefab = false;
        node.walk((target: Node) => {
            if (target.getComponent(Terrain)) {
                hasTerrain = true;
            }

            if (this.isCircularRefPrefabInstance(target, node)) {
                console.warn(`Circular reference prefab checked: [${target.name}]`);
                hasNestedPrefab = true;
            }
        });

        if (hasTerrain) {
            console.warn('Can\'t create prefabAsset from a node that contains terrain');
            return false;
        }

        if (hasNestedPrefab) {
            console.warn('Can\'t create prefabAsset from a node that contains circular reference prefab');
            return false;
        }

        return true;
    }

    /**
     * 从一个节点生成一个 PrefabAsset
     * @param nodeUUID
     * @param url
     * @param options
     */
    public async createPrefabAssetFromNode(nodeUUID: string, url: string, options = { undo: true, overwrite: true }) {
        await Service.Editor.waitReloading();
        const node = nodeMgr.getNode(nodeUUID);
        if (!node) {
            return null;
        }
        const prefabInfo = prefabUtils.getPrefab(node);

        if (prefabInfo) {
            const { outMostPrefabInstanceNode } = prefabUtils.getOutMostPrefabInstanceInfo(node);
            // 是一个 PrefabAsset 中的子节点并且 PrefabAsset 被实例化了
            if (outMostPrefabInstanceNode !== node && node.isChildOf(outMostPrefabInstanceNode) && !prefabUtils.getMountedRoot(node)) {
                console.warn('can\'t create prefabAsset from a prefabNode inside a prefabInstance');
                return null;
            }
            // 拖拽预制体时，需要更新所有的 propertyOverrides #17622
            const prefabInstance = prefabInfo.instance;
            if (prefabInstance) {
                this.applyPropertyOverrides(node);
            }
        }

        if (!this.canBeMadeToPrefabAsset(node)) {
            return null;
        }

        const ret = prefabUtils.generatePrefabDataFromNode(node);
        if (!ret) return null;

        // 如果本身就是一个 prefab了，那就先从自动监听变动的列表删除，等后面 link 完再 softReload
        if (prefabInfo && prefabInfo.asset) {
            this.assetToNodesMap.delete(prefabInfo.asset._uuid);
        }

        const asset = await Rpc.getInstance().request('assetManager', 'createAsset', [{
            target: url,
            content: ret.prefabData,
            overwrite: options.overwrite,
        }]);
        let assetRootNode: Node | null = null;
        if (asset) {
            let undoID;
            let command;
            const parent = node.parent;
            if (options.undo && parent) {
                // command = new CreatePrefabCommand();
                // undoID = cce.SceneFacadeManager.beginRecording(nodeUUID, { customCommand: command });
                // command.undoData = new Map();
                // command.undoData.set(parent.uuid, cce.Dump.encode.encodeNode(parent));
                // command.undoData.set(nodeUUID, cce.Dump.encode.encodeNode(node));
            }

            assetRootNode = await this.replaceNewPrefabAssetWithClearedReference(node, asset.uuid, ret.clearedReference);

            if (undoID && command && parent) {
                // command.redoData = new Map();
                // command.redoData.set(parent.uuid, cce.Dump.encode.encodeNode(parent));
                // command.redoData.set(assetRootNode.uuid, cce.Dump.encode.encodeNode(assetRootNode));
                // cce.SceneFacadeManager.endRecording(undoID);
            }
        }

        return assetRootNode;
    }

    /**
     *  应用被清理掉的引用数据
     * @param node 预制体实例节点
     * @param clearedReference 被清理掉的引用数据
     */
    public restoreClearedReference(node: Node, clearedReference: Record<string, any>) {
        const targetMap = {};
        Prefab._utils.generateTargetMap(node, targetMap, true);

        // 如果拖拽的是普通节点，还原引用后，要更新 propertyOverrides/targetOverride 信息
        // 如果拖拽的是预制体，由于数据已经存在，所以可以不用更新
        for (const fileID in clearedReference) {
            const data = clearedReference[fileID];
            const localIDs = [data.component];
            const comp = Prefab._utils.getTarget(localIDs, targetMap) as Component;
            if (comp) {
                // @ts-ignore 重新赋值
                comp[data.path] = data.value;
                // 更新 node 数据
                const node = comp.node;
                const index = comp.node.components.indexOf(comp);
                const opt: IChangeNodeOptions = {
                    propPath: `__comps__.${index}.${data.path}`,
                    type: NodeEventType.SET_PROPERTY,
                };
                // 这个方法会更新 propertyOverrides/targetOverride 信息
                this.onNodeChangedInGeneralMode(node, opt, Service.Editor.getRootNode());
            }
        }
    }
    /**
     * 更新预制体资源后,替换场景中的预制体实例,并还原被清理掉的引用数据
     * @param node 待替换的节点
     * @param prefabAsset 新的预制体资源 uuid
     * @param clearedReference 被清除的对外部节点的引用数据
     */
    public async replaceNewPrefabAssetWithClearedReference(node: Node, prefabAsset: string, clearedReference: Record<string, any>) {
        // 移除原来的 node,加载新的预制体作为子节点
        const parent = node.parent;
        if (parent) {
            prefabUtils.fireBeforeChangeMsg(parent);
            const index = node.getSiblingIndex();
            const prefab = await promisify(assetManager.loadAny)(prefabAsset);
            const assetRootNode = instantiate(prefab);
            if (!assetRootNode['_prefab'].instance) {
                assetRootNode['_prefab'].instance = prefabUtils.createPrefabInstance();
            }
            if (node['_prefab'] && node['_prefab'].instance) {
                assetRootNode['_prefab'].instance.fileId = node['_prefab'].instance.fileId;
            }
            this.createReservedPropertyOverrides(assetRootNode);
            // 同步 PropertyOverrides
            this.syncPropertyOverrides(assetRootNode, Service.Editor.getRootNode() as Node);

            this.restoreClearedReference(assetRootNode, clearedReference);

            node.parent = null;
            parent.insertChild(assetRootNode, index);
            prefabUtils.fireChangeMsg(parent);
            return assetRootNode;
        }
    }

    /**
     * 将一个 node 与一个 prefab 关联到一起
     * @param nodeUUID
     * @param {*} assetUuid 关联的资源
     */
    public async linkNodeWithPrefabAsset(nodeUUID: string | Node, assetUuid: string | any) {
        let node: Node | null = null;
        if (typeof nodeUUID === 'string') {
            await Service.Editor.waitReloading();
            node = nodeMgr.getNode(nodeUUID);
        } else {
            node = nodeUUID;
        }

        if (!node) {
            return false;
        }

        let asset: any = assetUuid;
        if (typeof assetUuid === 'string') {
            // asset = cce.prefabUtil.serialize.asAsset(assetUuid);
            asset = await promisify(assetManager.loadAny)(assetUuid);
        }

        if (!asset) {
            console.error(`asset ${assetUuid} doesn't exist`);
            return false;
        }

        const assetRootNode = asset.data;
        if (!assetRootNode || !assetRootNode['_prefab']) {
            return;
        }

        prefabUtils.fireBeforeChangeMsg(node);

        // @ts-ignore
        let prefabInfo = node['_prefab'];
        if (!prefabInfo) {
            prefabInfo = new PrefabInfo();
            // @ts-ignore
            node['_prefab'] = prefabInfo;
        }

        prefabUtils.removePrefabAssetNodeInstanceCache(prefabInfo);
        if (!prefabInfo.instance) {
            const prefabInstance = prefabUtils.createPrefabInstance();

            // @ts-ignore
            const prefabInfo = node['_prefab'];
            if (prefabInfo) {
                // TBD 当 prefabInfo 是新建的时候，root 会为空
                prefabInstance.prefabRootNode = prefabInfo.root;
            }

            // @ts-ignore
            prefabInfo.instance = prefabInstance;
        } else {
            prefabUtils.removeMountedRootInfo(node);
        }

        // 当前根节点的 fileId 同步为 PrefabAsset 根节点的 fileId 后，再创建默认根节点的 PropertyOverride
        prefabInfo.fileId = assetRootNode['_prefab'].fileId;
        prefabInfo.root = node;
        const prefabInstance = prefabInfo?.instance;
        if (prefabInfo && prefabInstance) {
            this.createReservedPropertyOverrides(node);
            // 去掉身上的各种 override,以便重新加载时完全用 PrefabAsset 的数据
            prefabInstance.mountedChildren = [];
            this.removeModifiedPropertyOverrides(prefabInstance, prefabInfo.fileId);
        }

        // @ts-ignore
        prefabInfo.asset = asset;

        prefabUtils.fireChangeMsg(node);

        // 将 PrefabAsset 中的 PrefabInfo 同步到当前要 link 的节点上
        // 这里为了 Undo 能正常工作，不使用 softReload 的方式，需要注意处理好数据的一致性
        this.syncPrefabInfo(assetRootNode, node, node);

        this.checkToAddPrefabAssetMap(node);

        return true;
    }

    /**
     * 把嵌套预制体的 PropertyOverrides 信息更新到新的预制体实例上
     * @param prefabNode 待同步的预制体节点
     * @param rootNode 带有所有预制体实例信息的根节点
     */
    public syncPropertyOverrides(prefabNode: Node, rootNode: Node) {
        // collectInstanceOfRoot
        const roots: Node[] = [];
        prefabUtils.findOutmostPrefabInstanceNodes(rootNode as Node, roots);

        if (roots.length > 0) {
            // collectInstanceOfPrefab
            const instanceNodes = new Map();
            prefabNode.walk((child: any) => {
                if (child['_prefab'] && child['_prefab'].instance) {
                    instanceNodes.set(child['_prefab'].instance.fileId, child);
                }
            });

            // sync property overrides
            for (let index = roots.length - 1; index >= 0; index--) {
                // @ts-ignore
                const prefabInfo = roots[index]['_prefab'];
                const instanceFileId = prefabInfo?.instance?.fileId;
                // @ts-ignore
                const targetFileId = prefabNode['_prefab'].instance?.fileId;
                if (instanceNodes.has(instanceFileId) && prefabInfo?.instance && prefabInfo.instance.propertyOverrides) {
                    // @ts-ignore
                    const targetPropOverrides = prefabNode['_prefab'].instance.propertyOverrides;
                    prefabInfo.instance.propertyOverrides.forEach((props: PropertyOverrideInfo) => {
                        // 部分保留属性不需要重复处理
                        if (!this.isReservedPropertyOverrides(props, prefabInfo.fileId)) {
                            targetPropOverrides.push(props);
                            // @ts-ignore
                            if (instanceFileId !== targetFileId && instanceFileId && props.targetInfo?.localID[0] !== instanceFileId) {
                                props.targetInfo?.localID.unshift(instanceFileId);
                            }
                        }
                    });
                }
            }
            // 需要更新属性
            const targetMap = {};
            Prefab._utils.generateTargetMap(prefabNode, targetMap, true);
            // @ts-ignore
            Prefab._utils.applyPropertyOverrides(prefabNode, prefabNode['_prefab'].instance.propertyOverrides, targetMap);
        }
    }

    // 将 PrefabAsset 中的 Prefab 信息同步到当前的节点上
    public syncPrefabInfo(assetNode: Node, dstNode: Node, rootNode: Node) {
        if (!assetNode || !dstNode || !rootNode) {
            return;
        }

        // @ts-ignore member access
        const srcPrefabInfo = assetNode['_prefab'];

        if (!srcPrefabInfo) {
            return;
        }

        prefabUtils.fireBeforeChangeMsg(dstNode);

        // @ts-ignore member access
        if (!dstNode['_prefab']) {
            // @ts-ignore member access
            dstNode['_prefab'] = new PrefabInfo();
        }

        // @ts-ignore member access
        const dstPrefabInfo = dstNode['_prefab'];

        if (!dstPrefabInfo) {
            return;
        }

        // 嵌套的 prefab 子节点只需要同步一下新的 asset 和 prefabRootNode 就好了
        if (dstPrefabInfo.instance && dstNode !== rootNode) {
            dstPrefabInfo.asset = srcPrefabInfo.asset;
            dstPrefabInfo.instance.prefabRootNode = rootNode;
            prefabUtils.fireChangeMsg(dstNode);
            return;
        }

        dstPrefabInfo.fileId = srcPrefabInfo.fileId;
        dstPrefabInfo.asset = srcPrefabInfo.asset;
        dstPrefabInfo.root = rootNode;

        if (assetNode.components.length !== dstNode.components.length) {
            console.error('Prefab Component doesn\'t match');
            return;
        }

        // copy component fileID
        for (let i = 0; i < assetNode.components.length; i++) {
            const srcComp = assetNode.components[i];
            const dstComp = dstNode.components[i];
            if (srcComp && srcComp.__prefab && dstComp) {
                if (!dstComp.__prefab) {
                    dstComp.__prefab = new CompPrefabInfo();
                }

                dstComp.__prefab!.fileId = srcComp.__prefab.fileId;
            }
        }

        prefabUtils.fireChangeMsg(dstNode);

        // 需要剔除掉私有 Node 的影响
        // 并且假设除去私有节点后，children 顺序和原来一致
        const dstChildren: Node[] = [];
        dstNode.children.forEach((child) => {
            // 去掉不显示的节点
            if (child.objFlags & CCObject.Flags.HideInHierarchy) {
                return;
            }

            dstChildren.push(child);
        });

        if (assetNode.children.length !== dstChildren.length) {
            console.error('Prefab Node doesn\'t match');
            return;
        }

        for (let i = 0; i < assetNode.children.length; i++) {
            const srcChildNode = assetNode.children[i];
            const dstChildNode = dstChildren[i];
            this.syncPrefabInfo(srcChildNode, dstChildNode, rootNode);
        }
    }

    public createReservedPropertyOverrides(node: Node) {
        // @ts-ignore
        const prefabInfo = node['_prefab'];

        const prefabInstance = prefabInfo?.instance;

        if (!prefabInfo || !prefabInstance) {
            return;
        }

        for (let i = 0; i < RootReservedProperty.length; i++) {
            const localID = [prefabInfo.fileId];
            const propPath = [RootReservedProperty[i]];
            const propValue = (node as any)[RootReservedProperty[i]];
            const propOverride = prefabUtils.getPropertyOverride(prefabInstance, localID, propPath);
            propOverride.value = propValue;
        }
    }

    public revertPropertyOverride(propOverride: Prefab._utils.PropertyOverrideInfo, curNodeTargetMap: any, assetTargetMap: any) {
        if (!propOverride || !propOverride.targetInfo) {
            return false;
        }

        const targetInfo = propOverride.targetInfo;
        const assetTarget = Prefab._utils.getTarget(targetInfo.localID, assetTargetMap);
        const curTarget = Prefab._utils.getTarget(targetInfo.localID, curNodeTargetMap);
        if (!assetTarget || !curTarget) {
            // Can't find target
            return false;
        }

        let node: Node | null = null;
        if (curTarget instanceof Node) {
            node = curTarget;
        } else if (curTarget instanceof Component) {
            node = curTarget.node;
        }

        if (!node) {
            return false;
        }

        let assetTargetPropOwner: any = assetTarget;

        let curTargetPropOwner: any = curTarget;
        let curTargetPropOwnerParent: any = curTarget; // 用于记录最后数组所在的object
        let targetPropOwnerName = '';
        const propertyPath = propOverride.propertyPath.slice();
        if (propertyPath.length > 0) {
            const targetPropName = propertyPath.pop();

            if (!targetPropName) {
                return false;
            }

            for (let i = 0; i < propertyPath.length; i++) {
                const propName = propertyPath[i];
                targetPropOwnerName = propName;
                assetTargetPropOwner = assetTargetPropOwner[propName];

                curTargetPropOwnerParent = curTargetPropOwner;
                curTargetPropOwner = curTargetPropOwner[propName];
            }

            prefabUtils.fireBeforeChangeMsg(node);

            curTargetPropOwner[targetPropName] = assetTargetPropOwner[targetPropName];

            // 如果是改数组元素，需要重新赋值一下自己以触发 setter
            if (Array.isArray(curTargetPropOwner) && curTargetPropOwnerParent && targetPropOwnerName) {
                curTargetPropOwnerParent[targetPropOwnerName] = curTargetPropOwner;
            }

            prefabUtils.fireChangeMsg(node);
        } else {
            console.warn('property path is empty');
        }

        return true;
    }

    /**
     * 还原一个 PrefabInstance 的数据为它所关联的 PrefabAsset
     * @param nodeUUID node
     */
    public async revertPrefab(nodeUUID: Node | string) {
        let node: Node | null = null;
        if (typeof nodeUUID === 'string') {
            await Service.Editor.waitReloading();
            node = nodeMgr.getNode(nodeUUID);
        } else {
            node = nodeUUID;
        }

        if (!node) {
            return false;
        }

        // @ts-ignore
        const prefabInfo = node['_prefab'];

        const prefabInstance = prefabInfo?.instance;

        if (!prefabInstance || !prefabInfo?.asset) {
            return false;
        }

        const assetRootNode = instantiate(prefabInfo.asset);

        if (!assetRootNode) {
            return false;
        }

        // @ts-ignore
        const curNodePrefabInfo = node['_prefab'];
        // @ts-ignore
        const assetRootNodePrefabInfo = assetRootNode['_prefab'];
        if (!curNodePrefabInfo || !assetRootNodePrefabInfo) {
            return false;
        }

        const assetTargetMap = {};
        const curNodeTargetMap = {};

        Prefab._utils.generateTargetMap(assetRootNode, assetTargetMap, true);
        Prefab._utils.generateTargetMap(node, curNodeTargetMap, true);

        prefabUtils.fireBeforeChangeMsg(node);

        // const command = new RevertPrefabCommand();
        // const undoID = cce.SceneFacadeManager.beginRecording(node.uuid, { customCommand: command });
        // command.undoData = new Map();
        // command.undoData.set(node.uuid, cce.Dump.encode.encodeNode(node));
        // command.redoData = new Map();
        const reservedPropertyOverrides = [];
        for (let i = 0; i < prefabInstance.propertyOverrides.length; i++) {
            const propOverride = prefabInstance.propertyOverrides[i];
            if (this.isReservedPropertyOverrides(propOverride, prefabInfo.fileId)) {
                reservedPropertyOverrides.push(propOverride);
            } else {
                const target = prefabUtils.getTarget(propOverride.targetInfo?.localID ?? [], node);
                // const node2 = target instanceof Node ? target : target?.node;
                // if (node2 && !command.undoData.has(node2.uuid)) {
                //     command.undoData.set(node2.uuid, cce.Dump.encode.encodeNode(node2));
                // }
                this.revertPropertyOverride(propOverride, curNodeTargetMap, assetTargetMap);
                // if (node2 && !command.redoData.has(node2.uuid)) {
                //     command.redoData.set(node2.uuid, cce.Dump.encode.encodeNode(node2));
                // }
            }
        }

        prefabInstance.propertyOverrides = reservedPropertyOverrides;

        // 去掉额外添加的节点
        this.isRemovingMountedChildren = true; // 用于防止下面移除子节点时去更新mountedChildren里的数据
        for (let i = 0; i < prefabInstance.mountedChildren.length; i++) {
            const addedChildInfo = prefabInstance.mountedChildren[i];
            for (let j = 0; j < addedChildInfo.nodes.length; j++) {
                addedChildInfo.nodes[j].setParent(null);
            }
        }
        prefabInstance.mountedChildren = [];
        this.isRemovingMountedChildren = false;

        componentOperation.isRemovingMountedComponents = true;
        for (let i = 0; i < prefabInstance.mountedComponents.length; i++) {
            const mountedCompInfo = prefabInstance.mountedComponents[i];
            // 逆序，避免组件间有依赖关系导致报错
            const length = mountedCompInfo.components.length;
            for (let j = length - 1; j >= 0; j--) {
                const comp = mountedCompInfo.components[j];
                if (comp && comp.node) {
                    comp.node.removeComponent(comp);
                }
            }
        }
        // 需要立刻执行 removeComponent 操作，否则会延迟到下一帧
        cc.Object._deferredDestroy();
        prefabInstance.mountedComponents = [];
        componentOperation.isRemovingMountedComponents = false;

        componentOperation.isRevertingRemovedComponents = true;
        for (let i = 0; i < prefabInstance.removedComponents.length; i++) {
            const targetInfo = prefabInstance.removedComponents[i];
            const targetCompInAsset = Prefab._utils.getTarget(targetInfo.localID, assetTargetMap) as Component;
            if (!targetCompInAsset) {
                continue;
            }

            const nodeLocalID = targetInfo.localID.slice();
            nodeLocalID.pop();
            // @ts-ignore
            nodeLocalID.push(targetCompInAsset.node['_prefab']?.fileId);
            const compNode = Prefab._utils.getTarget(nodeLocalID, curNodeTargetMap) as Node;
            await componentOperation.cloneComponentToNode(compNode, targetCompInAsset);
        }
        prefabInstance.removedComponents = [];
        componentOperation.isRevertingRemovedComponents = false;
        // command.redoData.set(node.uuid, cce.Dump.encode.encodeNode(node));
        // if (undoID) {
        //     cce.SceneFacadeManager.endRecording(undoID);
        // }
        prefabUtils.fireChangeMsg(node);

        // 因为现在恢复的是私有变量，没有触发 setter，所以暂时只能 softReload 来保证效果正确
        await Service.Editor.reload({});

        return true;
    }

    public removePrefabInfoFromNode(node: Node, removeNested?: boolean) {
        node.children.forEach((child: Node) => {
            // @ts-ignore
            const childPrefabInstance = child['_prefab']?.instance;
            if (childPrefabInstance) {
                // 判断嵌套的 PrefabInstance 是否需要移除
                if (removeNested) {
                    this.removePrefabInfoFromNode(child, removeNested);
                }
            } else {
                this.removePrefabInfoFromNode(child, removeNested);
            }
        });

        prefabUtils.removePrefabInfo(node);
    }

    public removePrefabInfoFromInstanceNode(node: Node, removeNested?: boolean): boolean {
        // @ts-ignore
        const prefabInfo = node['_prefab'];

        if (!prefabInfo) {
            return false;
        }

        const prefabInstance = prefabInfo.instance;
        // 正常情况下只能在 PrefabInstance 上使用 unWrap
        // 如果资源丢失，也可以解除关系
        if (prefabInstance || !prefabInfo.asset) {
            // 移除 mountedRoot 信息
            prefabUtils.removeMountedRootInfo(node);

            // remove prefabInfo
            prefabUtils.walkNode(node, (target, isChild) => {
                // skip root
                if (!isChild) {
                    return false;
                }
                // @ts-ignore
                const targetPrefabInfo = target['_prefab'];
                if (!targetPrefabInfo) {
                    return true;
                }
                const targetPrefabInstance = targetPrefabInfo.instance;
                if (targetPrefabInstance || !targetPrefabInfo.asset) {
                    if (targetPrefabInstance && targetPrefabInstance.prefabRootNode === node) {
                        // 去掉子节点中的 PrefabInstance 的 prefabRootNode 对这个节点的指向
                        targetPrefabInstance.prefabRootNode = undefined;
                        prefabUtils.fireChangeMsg(target);
                    }
                    if (removeNested) {
                        this.removePrefabInfoFromInstanceNode(target);
                    } else {
                        return true;
                    }
                } else {
                    prefabUtils.removePrefabInfo(target);
                }

                return false;
            });

            prefabUtils.removePrefabInfo(node);
            return true;
        }
        return false;
    }

    public removePrefabInstanceAndChangeRoot(node: Node, rootNode: Node, removeNested?: boolean) {
        node.children.forEach((child: Node) => {
            // @ts-ignore
            if (child['_prefab']?.instance) {
                // 判断嵌套的 PrefabInstance 是否需要移除
                if (removeNested) {
                    this.removePrefabInstanceAndChangeRoot(child, rootNode, removeNested);
                }
            } else {
                this.removePrefabInstanceAndChangeRoot(child, rootNode, removeNested);
            }
        });

        // @ts-ignore member access
        const prefabInfo = node['_prefab'];
        if (!prefabInfo) {
            return;
        }

        prefabUtils.fireBeforeChangeMsg(node);

        // @ts-ignore member access
        const rootPrefabInfo = rootNode['_prefab'];
        if (rootPrefabInfo) {
            prefabInfo.root = rootNode;
            prefabInfo.asset = rootPrefabInfo.asset;
        }

        if (prefabInfo.instance) {
            prefabInfo.instance = undefined;
        }

        // 解除嵌套的 Prefab 实例,内部节点退化为当前 Prefab 资源里的节点
        // 需要将它们的 PrefabInfo 中的 FileId 重新设置，否则由同一个资源
        // 实例化出来的多个 Prefab 实例，解除后它们的 FileId 会冲突
        prefabInfo.fileId = node.uuid;
        node.components.forEach((comp) => {
            if (comp.__prefab) {
                comp.__prefab.fileId = comp.uuid;
            }
        });

        prefabUtils.fireChangeMsg(node);
    }

    /**
     * 解除 PrefabInstance 对 PrefabAsset 的关联
     * @param nodeUUID 节点或节点的 UUID
     * @param removeNested 是否递归的解除子节点 PrefabInstance
     */
    public unWrapPrefabInstance(nodeUUID: string | Node, removeNested?: boolean): boolean {
        let node: Node | null = null;
        if (typeof nodeUUID === 'string') {
            node = nodeMgr.getNode(nodeUUID);
        } else {
            node = nodeUUID;
        }

        if (!node) {
            return false;
        }

        // @ts-ignore
        const prefabInfo = node['_prefab'];
        if (!prefabInfo) {
            return false;
        }

        // 正常情况下只能在 PrefabInstance 上使用 unWrap
        // 如果资源丢失，也可以解除关系
        if (prefabInfo.instance || !prefabInfo.asset) {
            return this.removePrefabInfoFromInstanceNode(node, removeNested);
        }
        return false;
    }

    // 在 Prefab 编辑模式下不能移除 prefabInfo，只需要移除 instance
    public unWrapPrefabInstanceInPrefabMode(nodeUUID: string | Node, removeNested?: boolean): boolean {
        let node: Node | null = null;
        if (typeof nodeUUID === 'string') {
            node = nodeMgr.getNode(nodeUUID);
        } else {
            node = nodeUUID;
        }

        if (!node) {
            return false;
        }

        // @ts-ignore
        const prefabInfo = node['_prefab'];
        if (!prefabInfo) {
            return false;
        }

        let rootNode: Node | undefined = node;

        const mountedRoot = prefabUtils.getMountedRoot(node);
        if (mountedRoot) {
            // mounted 的 prefab 节点需要把 root 设置为当前 prefab 的根节点
            rootNode = Service.Editor.getRootNode() as Node;
        } else {
            // @ts-ignore private member access
            if (node.parent && node.parent['_prefab']) {
                // @ts-ignore private member access
                rootNode = node.parent['_prefab'].root;
            }
        }

        if (!rootNode) {
            return false;
        }

        // @ts-ignore
        const rootPrefabInfo = rootNode['_prefab'];
        if (!rootPrefabInfo) {
            return false;
        }

        // 正常情况下只能在 PrefabInstance 上使用 unWrap
        // 如果资源丢失，也可以解除关系
        if (prefabInfo.instance || !prefabInfo.asset) {
            // this.removePrefabInstanceAndChangeRoot(node, rootNode, removeNested);
            this.removePrefabInfoFromInstanceNode(node, removeNested);
            prefabUtils.addPrefabInfo(node, rootNode, rootPrefabInfo.asset);

            // 解决子节点中的 PrefabInstance 的 FileId 冲突
            // 子节点中的 PrefabInstance 的 FileId 可能和当前场景的其它解除 PrefabInstance 的子节点中
            // 的 PrefabInstance 的 FileId 冲突，所以需要重新生成一个
            const instanceRoots: Node[] = [];
            prefabUtils.findOutmostPrefabInstanceNodes(node, instanceRoots);
            instanceRoots.forEach((instanceRoot) => {
                const rootPrefabInstance = instanceRoot?.['_prefab']?.instance;
                if (rootPrefabInstance) {
                    rootPrefabInstance.fileId = prefabUtils.generateUUID();
                    prefabUtils.fireChangeMsg(instanceRoot);
                }
            });
            return true;
        }
        return false;
    }
}

const nodeOperation = new NodeOperation();

export { nodeOperation, INodePrefabData, IApplyPrefabInfo };
