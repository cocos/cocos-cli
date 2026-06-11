import type { Component, Node } from 'cc';
import type { IPropertyValueType, IProperty } from '../@types/public';
import type { IServiceEvents } from '../scene-process/service/core';
import type { IChangeNodeOptions, INodeEvents } from './node';

/**
 * 编辑器使用的组件详细信息，属性值以 IProperty 编码形式呈现，
 * 包含 type、readonly、default 等元信息，用于编辑器 Inspector 面板渲染
 */
export interface IComponent extends IProperty {
    value: {
        enabled: IPropertyValueType;
        uuid: IPropertyValueType;
        name: IPropertyValueType;
    } & Record<string, IPropertyValueType>;
    mountedRoot?: string;
    component_path?: string;
}

/**
 * 添加/创建组件的选项
 */
export interface IAddComponentOptions {
    nodePath: string;
    component: string;
}

/**
 * 删除组件的选项
 */
export interface IRemoveComponentOptions {
    path: string;
}
export interface IRemovedComponentInfo {
    name: string;
    fileID: string;
}

/**
 * 查询组件的选项
 */
export interface IQueryComponentOptions {
    path: string;
}

/**
 * 编辑器设置组件属性的选项
 */
export interface ISetPropertyOptions {
    nodePath: string; // 修改属性的节点路径
    path: string; // 属性挂载对象的搜索路径
    // key: string; // 属性的 key
    dump: IProperty; // 属性 dump 出来的数据
    record?: boolean;// 是否记录undo
}

/**
 * 执行组件方法的选项
 */
export interface IExecuteComponentMethodOptions {
    path: string; // 组件路径，如 'Canvas/cc.Label_1'
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
    'component:remove': [Component];
    'component:set-property': [Component, IChangeNodeOptions];
    'component:added': [Component];
    'component:removed': [Component];
    'component:before-add-component': [string, Node];
    'component:before-remove-component': [Component];
}

/**
 * 组件服务的公开接口，排除了内部方法和事件相关接口
 */
export type IPublicComponentService = Omit<IComponentService, keyof IServiceEvents |
    'init' |
    'unregisterCompMgrEvents' |
    'reset' |
    'queryClasses' |
    'queryFunctionOfNode' |
    'queryComponents' |
    'executeMethod' |
    'hasScript'
>;

/**
 * 组件服务接口，定义了所有组件相关的操作方法
 */
export interface IComponentService extends IServiceEvents {
    /**
     * 添加组件到指定节点，返回添加后的组件信息
     * @param params - 添加组件选项
     * @param params.nodePath - 目标节点路径
     * @param params.component - 组件类名，支持精确匹配（'cc.Label'）和模糊匹配（'label'）
     * @returns 添加成功后的组件信息
     *
     * @example
     * ```ts
     * // 通过节点路径 + 精确组件名
     * const comp = await add({ nodePath: 'Canvas/MyNode', component: 'cc.Label' });
     *
     * // 通过节点路径 + 模糊组件名
     * const comp = await add({ nodePath: 'Canvas/MyNode', component: 'label' });
     * ```
     */
    add(params: IAddComponentOptions): Promise<IComponent>;

    /**
     * 删除指定组件
     * @param params - 删除组件选项
     * @param params.path - 组件路径
     * @returns 删除成功返回 true，失败返回 false
     */
    remove(params: IRemoveComponentOptions): Promise<boolean>;

    /**
     * 设置组件属性（编辑器格式）
     * 通过节点路径 + dump 路径定位，属性为 IProperty 格式
     *
     * @param params - 设置属性选项
     * @returns 设置成功返回 true，失败返回 false
     *
     * @example
     * ```ts
     * await setProperty({
     *     nodePath: 'Canvas/MyNode',
     *     path: '__comps__.0.string',
     *     dump: { value: 'Hello', type: 'String' },
     * });
     * ```
     */
    setProperty(params: ISetPropertyOptions): Promise<boolean>;

    /**
     * 查询组件信息
     * - 传入 IQueryComponentOptions 时，返回 IComponentInfo
     * - 传入 string 时，返回 IComponent
     *
     * @param params - 查询选项或组件路径字符串
     * @returns 如果传入的是 IQueryComponentOptions 时返回 IComponentInfo，如果传入是string时返回 IComponent，未找到返回 null
     *
     * @example
     * ```ts
     * CLI 模式：返回 IComponentInfo（扁平属性）
     * const comp = await query({ path: 'Canvas/cc.Label_1' }) as IComponentInfo;
     *
     * 编辑器模式：直接传 string，这里是uuid，因为与cli重复了，也支持 path 和 url
     * const comp = await query('uuid') as IComponent;
     * ```
     */
    query(params: IQueryComponentOptions | string): Promise<IComponent | null>;

    /**
     * 获取所有已注册的组件类名，包含内置与自定义组件
     * @returns 组件类名数组，如 ['cc.Label', 'cc.Sprite', 'MyCustomComponent']
     */
    queryAll(): Promise<string[]>;

    // ---- 编辑器相关接口 ----

    /**
     * 复位组件，将组件所有属性恢复为默认值
     * @param params - 查询组件选项，用于定位要复位的组件
     * @param params.path - 组件路径
     * @returns 复位成功返回 true，失败返回 false
     */
    reset(params: IQueryComponentOptions): Promise<boolean>;

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
     * @param path - 节点路径
     * @returns 节点上组件的函数信息，节点不存在时返回空对象
     */
    queryFunctionOfNode(path: string): Promise<any>;

    /**
     * 查询所有已注册的组件菜单项
     * @returns 组件菜单项数组，包含类名、类 ID 和菜单路径
     */
    queryComponents(): Promise<Array<{ name: string; cid: string; path: string }>>;

    /**
     * 执行组件上的指定方法
     * @param options - 执行选项
     * @param options.path - 组件路径，如 'Canvas/cc.Label_1'
     * @param options.name - 要执行的方法名，如 'onLoad'、'start'
     * @param options.args - 方法参数列表
     * @returns 执行成功返回 true，失败返回 false
     */
    executeMethod(options: IExecuteComponentMethodOptions): Promise<any>;

    /**
     * 查询指定名称的组件是否已注册（是否存在对应脚本）
     * @param name - 组件类名，如 'cc.Label'
     * @returns 存在返回 true，不存在返回 false
     */
    hasScript(name: string): Promise<boolean>;

    /**
     * 通过 uuid 获取组件的路径
     *
     * @param uuid - 组件的 uuid
     * @returns 组件路径，组件不存在时返回空字符串
     */
    getPathByUuid(uuid: string): string;

    // ---- 内部接口，不对外暴露 ----

    init(): void;
    unregisterCompMgrEvents(): void;
}
