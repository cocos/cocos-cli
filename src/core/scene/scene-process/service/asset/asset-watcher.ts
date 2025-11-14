import { Asset, assetManager, CCClass, Constructor, isValid, js, Material, Texture2D, TextureCube } from 'cc';
import { CallbacksInvoker } from './callbacks-invoker';
import { ServiceEvents } from '../core';
import { IAssetEvents } from '../../../common';
import { Rpc } from '../../rpc';

const ASSET_PROPS = 'A$$ETprops';
const DELIMETER = CCClass.Attr.DELIMETER;
const ASSET_PROPS_KEY = ASSET_PROPS + DELIMETER + ASSET_PROPS;

declare class WeakRef {
    constructor (obj: any);
}

declare module 'cc' {
    export interface AssetManager {
        assetListener: CallbacksInvoker;
    }
}

// the asset changed listener
// 这里的回调需要完全由使用者自己维护，AssetLibrary只负责调用。
const assetListener = (assetManager.assetListener = new CallbacksInvoker());

function removeCaches(uuid: string) {
    if (assetManager.assets.has(uuid)) {
        assetManager.releaseAsset(assetManager.assets.get(uuid)!);
    }
}

function getPropertyDescriptorAndOwner(obj: any, name: any) {
    while (obj) {
        const pd = Object.getOwnPropertyDescriptor(obj, name);
        if (pd) {
            return { owner: obj, pd };
        }
        obj = Object.getPrototypeOf(obj);
    }
    return null;
}

/**
 * 替换资源属性的setter，加入事件监听
 * @param ctor 构造函数
 * @param name 属性名
 */
function forceSetterNotify(ctor: Function, name: string) {
    const data = getPropertyDescriptorAndOwner(ctor.prototype, name);
    if (!data) {
        console.warn('Failed to get property descriptor of %s.%s', js.getClassName(ctor), name);
        return;
    }

    if (data.owner._modifiedSetters && data.owner._modifiedSetters.includes(name)) {
        return;
    }
    const pd = data.pd;
    if (pd.configurable === false) {
        console.warn('Failed to register notifier for %s.%s', js.getClassName(ctor), name);
        return;
    }
    if ('value' in pd) {
        console.warn('Cannot watch instance variable of %s.%s', js.getClassName(ctor), name);
        return;
    }

    const setter = pd.set;
    pd.set = function(value: any, forceRefresh?: boolean) {
        // forceRefresh 如果为 true，那么哪怕资源的引用不变，也应该强制更新资源
        // @ts-ignore
        setter.call(this, value, forceRefresh);

        // this指向当前调用set的component
        // @ts-ignore
        if (this._watcherHandle) {
            // 实际保存后的值（鬼知道 setter 里面会做什么）
            // @ts-ignore
            const realUsedValue = this[name];
            const uuids = getUuidsOfPropValue(realUsedValue);

            // @ts-ignore
            this._watcherHandle.changeWatchAsset(name, uuids);
        }
    };
    Object.defineProperty(data.owner, name, pd);

    // 修改过setter后打个标记，防止重复修改setter造成多层嵌套
    if (data.owner._modifiedSetters) {
        data.owner._modifiedSetters.push(name);
    } else {
        data.owner._modifiedSetters = [name];
    }
}

function invokeAssetSetter(obj: any, propName: string, assetOrUrl: any) {
    obj = obj.deref();
    if (!obj) return;
    const pd = js.getPropertyDescriptor(obj, propName);
    let newData = assetOrUrl;

    if (pd && pd.get) {
        const data = pd.get.call(obj);
        if (Array.isArray(data)) {
            for (let i = 0; i < data.length; i++) {
                if (data[i] && assetOrUrl && data[i]._uuid === assetOrUrl._uuid) {
                    data[i] = assetOrUrl;
                }
            }

            newData = data;
        }

        if (pd.set) {
            const forceRefresh = true;

            try {
                // 如果是数组，需要清空该数组，防止数组内判断资源是否修改的判断阻止更新
                if (Array.isArray(data)) {
                    // @ts-ignore
                    pd.set.call(
                        obj,
                        new Array(newData.length).fill(null),
                        // @ts-ignore
                        forceRefresh,
                    );
                }
            } catch (e) {
                console.error(e);
            }
            // @ts-ignore
            pd.set.call(obj, newData, forceRefresh);

            // 发出 asset-refresh的消息
            if (assetOrUrl._uuid) {
                ServiceEvents.emit<IAssetEvents>('asset-refresh', assetOrUrl._uuid);
            }
        }
    } else {
        // animation graph 问题先绕过
        if (obj && obj.constructor && obj.constructor.name === 'AnimationController' && propName === 'graph') {
            obj[propName] = newData;
        }
    }
}

function getUuidsOfPropValue(val: any): any[] {
    const uuids: any[] = [];
    if (Array.isArray(val)) {
        for (const data of val) {
            if (data instanceof Asset && data._uuid) {
                uuids.push(data._uuid);
            }
        }
    } else if (val instanceof Asset && val._uuid) {
        uuids.push(val._uuid);
    }

    return uuids;
}

class AssetWatcher {
    public owner: any = null;
    public watchingInfos: { [index: string]: any } = Object.create(null);

    constructor(owner: any) {
        this.owner = owner;
    }

    public start() {
        const owner = this.owner;
        const ctor = owner.constructor;
        const assetPropsData = CCClass.Attr.getClassAttrs(ctor)[ASSET_PROPS_KEY];

        for (const propPath of assetPropsData.assetProps) {
            const propName = propPath[0];

            forceSetterNotify(ctor, propName);

            const val = owner[propName];
            const uuids = getUuidsOfPropValue(val);
            this.registerListener(uuids, owner, propName);
        }
    }

    public stop() {
        for (const name in this.watchingInfos) {
            if (!(name in this.watchingInfos)) {
                continue;
            }
            const info = this.watchingInfos[name];
            if (info) {
                for (const uuid of info.uuids) {
                    assetListener.off(uuid, info.callback);
                }
            }
        }
        this.watchingInfos = Object.create(null);
    }

    public changeWatchAsset(propName: string, newUuids: []) {
        // unRegister old
        this.unRegisterListener(propName);

        // register new
        if (newUuids.length > 0) {
            this.registerListener(newUuids, this.owner, propName);
        }
    }

    private registerListener(uuids: any[], owner: any, propName: string) {
        this.unRegisterListener(propName);

        const onDirty = invokeAssetSetter.bind(null, new WeakRef(owner), propName);
        for (const uuid of uuids) {
            assetListener.on(uuid, onDirty);
        }

        this.watchingInfos[propName] = {
            uuids,
            callback: onDirty,
        };
    }

    private unRegisterListener(propName: string) {
        const info = this.watchingInfos[propName];

        if (info) {
            for (const uuid of info.uuids) {
                // @ts-ignore
                assetListener.off(uuid, info.callback);
            }

            this.watchingInfos[propName] = undefined;
        }
    }
}

/**
 * 递归遍历一个ccClass，找出所有可编辑的cc.Asset属性路径
 * @param ctor ccClass的构造函数
 * @param propPath 属性路径数组
 * @param parentTypes 已经遍历过的类型，防止循环引用
 */
function parseAssetProps(ctor: any, propPath: string[], parentTypes: string[]): string[][] | null {
    let assetProps: string[][] | null = null;
    // const ctor = obj.constructor;
    // 防止循环引用
    const type = js.getClassName(ctor);
    if (parentTypes.includes(type)) {
        return null;
    }

    // TODO：目前数组的元素如果是一个自定义的ccClass，此处会为空
    if (!ctor.__props__) {
        return null;
    }

    const attrs = CCClass.Attr.getClassAttrs(ctor);
    parentTypes = parentTypes.concat(type);
    for (let i = 0, props = ctor.__props__; i < props.length; i++) {
        const propName = props[i];
        const attrKey = propName + DELIMETER;

        // 需要筛选出是引擎内可编辑的属性
        if (
            (attrs[attrKey + 'hasSetter'] && attrs[attrKey + 'hasGetter']) ||
            // animation graph 问题先绕过
            (ctor.name === 'AnimationController' && propName === 'graph')
        ) {
            const propCtor = attrs[attrKey + 'ctor'];
            const isAssetType = /*propValue instanceof Asset || */js.isChildClassOf(propCtor, Asset);

            const fullPath = propPath.concat(propName);
            if (isAssetType) {
                if (assetProps) {
                    assetProps.push(fullPath);
                } else {
                    assetProps = [fullPath];
                }
            } else if (CCClass._isCCClass(propCtor)) {
                // 递归处理非asset的ccClass

                const props = parseAssetProps(propCtor, fullPath, parentTypes);
                if (props) {
                    if (assetProps) {
                        assetProps = assetProps.concat(props);
                    } else {
                        assetProps = props;
                    }
                }
            }
        }
    }

    return assetProps;
}

interface IAssetPropsData {
    assetProps?: string[][]; // 当前Object中的资源
    nestedAssetProps?: string[][]; // 嵌套在属性中的资源
}

function getAssetPropsData(obj: any) {
    let assetPropsData: IAssetPropsData = CCClass.Attr.getClassAttrs(obj.constructor)[ASSET_PROPS_KEY];
    if (assetPropsData === undefined) {
        const assetProps = parseAssetProps(obj.constructor, [], []);
        assetPropsData = {};
        if (assetProps) {
            for (const propPath of assetProps) {
                if (propPath.length > 1) {
                    if (assetPropsData.nestedAssetProps) {
                        assetPropsData.nestedAssetProps.push(propPath);
                    } else {
                        assetPropsData.nestedAssetProps = [propPath];
                    }
                } else if (propPath.length === 1) {
                    if (assetPropsData.assetProps) {
                        assetPropsData.assetProps.push(propPath);
                    } else {
                        assetPropsData.assetProps = [propPath];
                    }
                }
            }
        }

        CCClass.Attr.setClassAttr(obj.constructor, ASSET_PROPS, ASSET_PROPS, assetPropsData);
    }

    return assetPropsData;
}

/**
 * 根据一个path数组，获得一个属性的值
 * @param obj 对象
 * @param propPath 路径数组
 */
function getPropObj(obj: any, propPath: string[]) {
    let propObj = obj;
    for (let i = 0; i < propPath.length; i++) {
        const path = propPath[i];
        if (propObj) {
            propObj = propObj[path];
        }

        if (!propObj) {
            return null;
        }
    }

    return propObj;
}

/**
 * 遍历第二级的CCAsset
 * @param obj 对象
 * @param callback 回调
 */
function walkNestedAssetProp(obj: any, callback: Function) {
    const assetPropsData = getAssetPropsData(obj);
    if (assetPropsData && assetPropsData.nestedAssetProps) {
        for (const propPath of assetPropsData.nestedAssetProps) {
            const pathKeys = propPath.concat();
            const propName = pathKeys.pop();
            let owner = obj;
            if (pathKeys.length > 0) {
                owner = getPropObj(owner, pathKeys);
                if (owner) {
                    callback(owner);
                }
            }
        }
    }
}

/**
 * 更新所有引用该资源的资源
 * @param uuid 
 * @param asset 
 * @param processedAssets 保存处理过的资源，防止循环引用
 */
function updateAsset(uuid: string, asset: Asset | null, processedAssets: Asset[] = []) {
    if (assetManager.references!.has(uuid)) {
        const references = assetManager.references!.get(uuid)!;
        for (let i = 0, l = references.length; i < l; i++) {
            const reference = references[i];
            const owner_asset = reference[0].deref();
            const owner = reference[1].deref();
            const prop = reference[2];
            if (!owner || !owner_asset) { continue; }
            if (processedAssets.includes(owner_asset)) { continue; }
            if (!isValid(owner_asset, true)) { continue; }
            if (owner_asset instanceof Material && (asset instanceof Texture2D || asset instanceof TextureCube)) {
                owner_asset.setProperty(prop, asset);
            } else {
                owner[prop] = asset;
                owner_asset.onLoaded && owner_asset.onLoaded();
            }
            assetListener.emit(owner_asset._uuid, owner_asset, asset?.uuid);
            processedAssets.push(owner_asset);
            // 引用的资源修改了，需要递归调用
            updateAsset(owner_asset._uuid, owner_asset, processedAssets);
        }
    }
}

class AssetUpdater {

    lockNum = 0;
    timer: any = null;

    lock() {
        this.lockNum++;
        clearTimeout(this.timer);
    }
    unlock() {
        this.lockNum--;
        if (this.lockNum === 0) {
            this.timer = setTimeout(() => {
                this.update();
            }, 400);
        }
    }

    private update() {
        this.queue.forEach((asset, uuid) => {
            // console.log(`更新资源 ${uuid}`);
            if (asset) {
                assetListener.emit(uuid, asset);
            } else {
                assetListener.emit(uuid, null);
                assetListener.off(uuid);
            }
            updateAsset(uuid, asset);
        });
        this.queue.clear();
    }

    queue: Map<string, Asset | null> = new Map();

    add(uuid: string, asset: Asset | null) {
        this.queue.set(uuid, asset);
    }
    remove(uuid: string) {
        this.queue.delete(uuid);
    }

}

class AssetWatcherManager {
    updater: AssetUpdater = new AssetUpdater();

    public initHandle(obj: any) {
        const assetPropsData = getAssetPropsData(obj);

        obj._watcherHandle = assetPropsData && assetPropsData.assetProps ? new AssetWatcher(obj) : undefined;

        walkNestedAssetProp(obj, (owner: any) => {
            this.initHandle(owner);
        });
    }

    public startWatch(obj: any) {
        if (!obj._watcherHandle) {
            this.initHandle(obj);
        }

        if (obj._watcherHandle) {
            obj._watcherHandle.start();
        }

        walkNestedAssetProp(obj, (owner: any) => {
            this.startWatch(owner);
        });
    }

    public stopWatch(obj: any) {
        if (obj._watcherHandle) {
            obj._watcherHandle.stop();
        }

        walkNestedAssetProp(obj, (owner: any) => {
            this.stopWatch(owner);
        });
    }
    protected isTextureCubeSubImageAsset(uuid: string) {
        return uuid.endsWith('@74afd')
            || uuid.endsWith('@8fd34')
            || uuid.endsWith('@bb97f')
            || uuid.endsWith('@7d38f')
            || uuid.endsWith('@e9a6d')
            || uuid.endsWith('@40c10');
    }
    public async onAssetChanged(uuid: string) {
        const info = await Rpc.getInstance().request('assetManager', 'queryAssetInfo', [uuid]);
        if (!info) {
            return;
        }

        // 如果是 texture，则 release 掉所依赖的 ImageAsset
        // TODO: 目前这是个 Hack 方式， 在此issue讨论：https://github.com/cocos-creator/3d-tasks/issues/4503
        if (uuid.endsWith('@6c48a')) {
            const end = uuid.indexOf('@');
            const imageAssetUuid = uuid.substring(0, end);
            removeCaches(imageAssetUuid);
        }

        // 清除textureCube依赖的imageAsset缓存，临时解决方案，相关issue：https://github.com/cocos/3d-tasks/issues/12569

        if (!assetListener.hasEventListener(uuid) && !assetManager.references!.has(uuid) && !this.isTextureCubeSubImageAsset(uuid)) {
            return;
        }

        const oldAsset = assetManager.assets.get(uuid);
        removeCaches(uuid);

        this.updater.lock();
        // console.log(`开始加载 ${uuid} ${info?.name}`);
        assetManager.loadAny(uuid, (err: any, asset: any) => {
            // console.log(`加载结束 ${uuid} ${info?.name}`);
            if (err) {
                this.updater.unlock();
                console.error(err);
                return;
            }

            if (oldAsset && asset && oldAsset.constructor.name !== asset.constructor.name) {
                this.updater.add(uuid, null);
                // assetListener.emit(uuid, null);
                // assetListener.off(uuid);
                // tslint:disable-next-line: max-line-length
                console.warn('The asset type has been modified, and emptied the original reference in the scene.');
            } else {
                this.updater.add(uuid, asset);
                // assetListener.emit(uuid, asset);
            }
            this.updater.unlock();
            // updateAsset(uuid, asset);
        });
    }

    public onAssetDeleted(uuid: string) {
        const oldAsset = assetManager.assets.get(uuid);
        if (oldAsset) {
            const placeHolder = new (oldAsset.constructor as Constructor<Asset>)();
            placeHolder.initDefault(uuid);
            assetListener.emit(uuid, placeHolder);
        }
        removeCaches(uuid);
    }
}

const assetWatcherManager = new AssetWatcherManager();

export { assetWatcherManager };
