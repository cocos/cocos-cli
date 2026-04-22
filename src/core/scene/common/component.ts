import type { Component, Node } from 'cc';
import type { IPropertyValueType, IProperty } from '../@types/public';
import type { IServiceEvents } from '../scene-process/service/core';
import type { ICompPrefabInfo } from './prefab';
import type { IChangeNodeOptions, INodeEvents } from './node';

/**
 * 组件标识信息，包含组件的基本标识字段
 */
export interface IComponentIdentifier {
    cid: string;
    path: string;
    uuid: string;
    name: string;
    type: string;
    enabled: boolean;
}

/**
 * CLI 使用的组件信息，属性值以扁平的 key-value 形式呈现
 */
export interface IComponent extends IComponentIdentifier {
    properties: { [key: string]: IPropertyValueType };
    prefab: ICompPrefabInfo | null;
}

/**
 * 编辑器使用的组件详细信息，属性值以 IProperty 编码形式呈现，
 * 包含 type、readonly、default 等元信息，用于编辑器 Inspector 面板渲染
 */
export interface IComponentForEditor extends IProperty {
    value: {
        enabled: IPropertyValueType;
        uuid: IPropertyValueType;
        name: IPropertyValueType;
    } & Record<string, IPropertyValueType>;
    mountedRoot?: string;
}

/**
 * 添加/创建组件的选项
 */
export interface IAddComponentOptions {
    nodePathOrUuid: string;
    component: string;
}

/**
 * 删除组件的选项
 */
export interface IRemoveComponentOptions {
    path: string;
}

/**
 * 查询组件的选项
 */
export interface IQueryComponentOptions {
    path: string;
}

/**
 * CLI 设置组件属性的选项
 */
export interface ISetPropertyOptions {
    componentPath: string; // 修改属性的对象的 uuid
    // key: string; // 属性的 key
    properties: {
        [key: string]: null | undefined | number | boolean | string | object | Array<unknown>;
    }; // 属性 dump 出来的数据
    record?: boolean;// 是否记录undo
}

/**
 * 编辑器设置组件属性的选项
 */
export interface ISetPropertyOptionsForEditor {
    uuid: string; // 修改属性的对象的 uuid
    path: string; // 属性挂载对象的搜索路径
    // key: string; // 属性的 key
    dump: IProperty; // 属性 dump 出来的数据
    record?: boolean;// 是否记录undo
}

/**
 * 执行组件方法的选项
 */
export interface IExecuteComponentMethodOptions {
    uuid: string;
    name: string;
    args: any[];
}

/**
 * 查询注册类的过滤选项
 */
export interface IQueryClassesOptions {
    extends?: string | string[];
    excludeSelf?: boolean;
}

/**
 * 组件相关事件类型
 */
export interface IComponentEvents extends INodeEvents {
    'component:add': [Component];
    'component:before-remove': [Component];
    'component:remove': [Component];
    'component:set-property': [Component, IChangeNodeOptions];
    'component:added': [Component];
    'component:removed': [Component];
    'component:before-add-component': [string, Node];
}

/**
 * 组件服务的公开接口，排除了内部方法和事件相关接口
 */
export interface IPublicComponentService extends Omit<IComponentService, keyof IServiceEvents |
    'init' |
    'unregisterCompMgrEvents'
> { }

/**
 * 组件服务接口，定义了所有组件相关的操作方法
 */
export interface IComponentService extends IServiceEvents {
    /**
     * 添加组件到指定节点，返回添加后的组件信息
     * @param params - 添加组件选项
     * @param params.nodePathOrUuid - 目标节点路径或 UUID
     * @param params.component - 组件类名，支持精确匹配（'cc.Label'）和模糊匹配（'label'）
     * @returns 添加成功后的组件信息
     *
     * @example
     * ```ts
     * // 通过节点路径 + 精确组件名
     * const comp = await addComponent({ nodePathOrUuid: 'Canvas/MyNode', component: 'cc.Label' });
     *
     * // 通过节点 UUID + 模糊组件名
     * const comp = await addComponent({ nodePathOrUuid: 'abc-123-uuid', component: 'label' });
     * ```
     */
    addComponent(params: IAddComponentOptions): Promise<IComponent>;

    /**
     * 删除指定组件
     * @param params - 删除组件选项
     * @param params.path - 组件路径，支持路径、UUID 或资源 URL
     * @returns 删除成功返回 true，失败返回 false
     */
    removeComponent(params: IRemoveComponentOptions): Promise<boolean>;

    /**
     * 设置组件属性
     * - CLI 调用时传入 ISetPropertyOptions，通过 componentPath 定位，属性为扁平键值对
     * - 编辑器调用时传入 ISetPropertyOptionsForEditor，通过节点 UUID + dump 路径定位，属性为 IProperty 格式
     *
     * @param params - 设置属性选项，根据调用方不同传入不同类型
     * @returns 设置成功返回 true，失败返回 false
     *
     * @example
     * ```ts
     * // CLI 方式：通过 componentPath 定位，直接传属性键值对
     * await setProperty({
     *     componentPath: 'Canvas/cc.Label_1',
     *     properties: { string: 'Hello', fontSize: 32 },
     * });
     *
     * // 编辑器方式：通过节点 UUID + dump 路径定位，传 IProperty 格式
     * await setProperty({
     *     uuid: 'node-uuid',
     *     path: '__comps__.0.string',
     *     dump: { value: 'Hello', type: 'String' },
     * });
     * ```
     */
    setProperty(params: ISetPropertyOptions | ISetPropertyOptionsForEditor): Promise<boolean>;

    /**
     * 查询组件信息
     * - 传入 IQueryComponentOptions 时，返回 IComponent 或 IComponent
     * - 传入 string 时，返回 IComponentForEditor
     *
     * @param params - 查询选项或组件路径字符串
     * @returns 如果传入的是 IQueryComponentOptions 时返回 IComponent，如果传入是string时返回 IComponentForEditor，未找到返回 null
     *
     * @example
     * ```ts
     * CLI 模式：返回 IComponent（扁平属性）
     * const comp = await queryComponent({ path: 'Canvas/cc.Label_1' }) as IComponent;
     *
     * 编辑器模式：直接传 string，这里是uuid，因为与cli重复了，也支持 path 和 url
     * const comp = await queryComponent('uuid') as IComponentForEditor;
     * ```
     */
    queryComponent(params: IQueryComponentOptions | string): Promise<IComponent | IComponentForEditor | null>;

    /**
     * 获取所有已注册的组件类名，包含内置与自定义组件
     * @returns 组件类名数组，如 ['cc.Label', 'cc.Sprite', 'MyCustomComponent']
     */
    queryAllComponent(): Promise<string[]>;

    // ---- 编辑器相关接口 ----

    /**
     * 创建组件（编辑器使用），与 addComponent 不同的是仅返回是否成功
     * @param params - 添加组件选项
     * @param params.nodePathOrUuid - 目标节点路径或 UUID
     * @param params.component - 组件类名
     * @returns 创建成功返回 true，失败返回 false
     */
    createComponent(params: IAddComponentOptions): Promise<boolean>;

    /**
     * 复位组件，将组件所有属性恢复为默认值
     * @param params - 查询组件选项，用于定位要复位的组件
     * @param params.path - 组件路径，支持路径、UUID 或资源 URL
     * @returns 复位成功返回 true，失败返回 false
     */
    resetComponent(params: IQueryComponentOptions): Promise<boolean>;

    /**
     * 获取所有注册类名，支持按继承关系过滤
     * @param options - 过滤选项，不传则返回所有注册类
     * @param options.extends - 父类名称，只返回继承自该类的子类，支持字符串或字符串数组
     * @param options.excludeSelf - 是否排除父类自身，默认 false
     * @returns 类名对象数组，如 [{ name: 'cc.Label' }, { name: 'cc.Sprite' }]
     *
     * @example
     * ```ts
     * // 查询所有注册类
     * const all = await queryClasses();
     *
     * // 查询 cc.Component 的所有子类（含自身）
     * const comps = await queryClasses({ extends: 'cc.Component' });
     *
     * // 查询 cc.Component 的所有子类（排除自身）
     * const subComps = await queryClasses({ extends: 'cc.Component', excludeSelf: true });
     * ```
     */
    queryClasses(options?: IQueryClassesOptions): Promise<{ name: string }[]>;

    /**
     * 查询指定节点上所有组件暴露的可调用函数
     * @param uuid - 节点 UUID
     * @returns 节点上组件的函数信息，节点不存在时返回空对象
     */
    queryComponentFunctionOfNode(uuid: string): Promise<any>;

    /**
     * 执行组件上的指定方法
     * @param options - 执行选项
     * @param options.uuid - 组件实例的 UUID
     * @param options.name - 要执行的方法名，如 'onLoad'、'start'
     * @param options.args - 方法参数列表
     * @returns 执行成功返回 true，失败返回 false
     */
    executeComponentMethod(options: IExecuteComponentMethodOptions): Promise<boolean>;

    /**
     * 查询指定名称的组件是否已注册（是否存在对应脚本）
     * @param name - 组件类名，如 'cc.Label'
     * @returns 存在返回 true，不存在返回 false
     */
    queryComponentHasScript(name: string): Promise<boolean>;

    // ---- 内部接口，不对外暴露 ----

    init(): void;
    unregisterCompMgrEvents(): void;
}
