import { Component, Node, js, CCClass, Asset, Scene, ValueType } from 'cc';

/**
 * Cocos Creator CCClass 序列化器
 *
 * 这个类专门用于将 Cocos Creator 中的 CCClass 实例（如 Node、Component、Scene 等）
 * 序列化为 JSON 格式，解决游戏对象序列化中的关键问题：
 *
 * 核心功能：
 * 1. 循环引用处理：自动检测并处理对象间的循环引用关系
 * 2. 双模式序列化：支持完整模式和简化模式，平衡性能与数据完整性
 * 3. 路径导航系统：为每个对象生成唯一路径，支持按路径精确查询
 * 4. 智能类型识别：针对不同 CCClass 类型采用最优序列化策略
 *
 * 公共 API 使用示例：
 *
 * ```typescript
 * const serializer = new ClassSerializer();
 *
 * // 1. 完整序列化 - 获取所有详细信息
 * const fullData = serializer.serializeInstance(node, true);
 * const fullJson = serializer.serializeToJSON(node, true);
 *
 * // 2. 简化序列化 - 只获取基础信息和路径引用
 * const simpleData = serializer.serializeInstance(node, false);
 * const simpleJson = serializer.serializeToJSON(node, false);
 *
 * // 3. 按路径查询特定对象的详细信息
 * const componentData = serializer.getObjectByPath(node, "root/components[0]");
 * const propertyData = serializer.getObjectByPath(node, "root/components[0]/target");
 *
 * // 典型使用场景：
 * // - 先用简化模式获取整体结构：const overview = serializer.serializeInstance(scene, false);
 * // - 再按需查询具体对象：const detail = serializer.getObjectByPath(scene, "root/Canvas/components[0]");
 * ```
 *
 * 路径格式说明：
 * - "root" - 根对象
 * - "root/components[0]" - 第一个组件
 * - "root/Canvas" - 名为 Canvas 的子节点
 * - "root/Canvas/components[1]/target" - Canvas 节点第二个组件的 target 属性
 *
 * 序列化模式对比：
 * - intact=true（完整模式）：递归序列化所有子对象，数据完整但体积大
 * - intact=false（简化模式）：只序列化基础属性，复杂对象用路径引用，体积小但需按需查询
 */
export class ClassSerializer {
    // 使用 WeakSet 检测循环引用，防止无限递归
    private processingObjects: WeakSet<any>;

    // 使用 WeakMap 缓存已解析对象的结果，避免重复解析
    private processedResults: WeakMap<any, any>;

    constructor() {
        this.processingObjects = new WeakSet();
        this.processedResults = new WeakMap();
    }

    /**
     * 判断对象是否为 Cocos Creator 的 ValueType（如 Vec2、Vec3、Color 等）
     * ValueType 对象通常包含数值数据，序列化时需要特殊处理
     */
    private isValueType(instance: any): boolean {
        return instance instanceof ValueType;
    }

    // ==================== 公共 API ====================

    /**
     * 将 CCClass 实例序列化为 JSON 字符串
     *
     * @param instance 要序列化的 CCClass 实例（Node、Component、Scene 等）
     * @param intact 序列化模式：
     *               - true: 完整模式，递归序列化所有子对象的详细信息
     *               - false: 简化模式，只序列化基础信息和路径引用
     * @returns 格式化的 JSON 字符串
     */
    public serializeToJSON(instance: any, intact: boolean = true): string {
        const serializedData = this.serializeInstance(instance, intact);
        return JSON.stringify(serializedData, null, 2);
    }

    /**
     * 将 CCClass 实例序列化为 JavaScript 对象
     *
     * 这是核心的序列化方法，根据 intact 参数选择不同的序列化策略：
     * - intact=true: 适用于需要完整数据的场景，但可能产生大量数据
     * - intact=false: 适用于概览和导航场景，数据量小但包含路径信息
     *
     * @param instance 要序列化的实例
     * @param intact 是否完整序列化
     * @returns 序列化后的对象
     */
    public serializeInstance(instance: any, intact: boolean = true): any {
        if (!instance) {
            return null;
        }

        // 验证输入是否为有效的 CCClass 实例
        const targetClass = instance.constructor;
        if (!targetClass || !CCClass._isCCClass(targetClass)) {
            throw new Error('Target is not a valid CCClass');
        }

        // 每次序列化都重置处理状态，防止上次序列化的状态影响本次
        this.processingObjects = new WeakSet();

        // 使用统一的序列化方法，通过detailed参数控制详细程度
        return this.serialize(instance, 'root', new Map(), intact);
    }

    /**
     * 根据路径获取指定对象的详细信息
     *
     * 这个方法实现了"按需加载"的概念：
     * 1. 首先用简化模式获取整体结构和路径信息
     * 2. 然后根据用户需要，按路径获取特定对象的详细信息
     *
     * 路径格式示例：
     * - "root" - 根对象
     * - "root/components[0]" - 第一个组件
     * - "root/components[0]/properties/target" - 第一个组件的 target 属性
     *
     * @param instance 根实例
     * @param path 对象路径（如 "root/components[0]/properties/target"）
     * @returns 指定路径对象的详细信息
     */
    public getObjectByPath(instance: any, path: string): any {
        if (!instance || !path) {
            return null;
        }

        // 重置处理状态
        this.processingObjects = new WeakSet();

        // 解析路径并获取目标对象
        const targetObject = this.resolvePath(instance, path);
        if (!targetObject) {
            return null;
        }

        // 只序列化当前对象，不递归子对象
        return this.serializeSingleObject(targetObject, path);
    }

    // ==================== 简化模式（只获取基础信息+路径） ====================

    /**
     * 统一的序列化核心方法
     *
     * 这是整个序列化系统的核心，根据 detailed 参数选择不同的序列化策略：
     * - detailed=true: 完整递归序列化，适用于需要所有数据的场景
     * - detailed=false: 简化序列化，复杂对象只保留路径引用，适用于概览和导航
     *
     * 核心机制：
     * 1. 缓存检查：避免重复序列化相同路径的对象
     * 2. 循环引用检测：使用 WeakSet 防止无限递归
     * 3. 类型分发：根据对象类型选择最适合的序列化策略
     * 4. 路径管理：为简化模式的对象自动添加路径属性
     *
     * @param instance 要序列化的实例
     * @param path 对象在整个结构中的唯一路径
     * @param cache 路径到序列化结果的缓存映射
     * @param detailed 序列化模式：true=完整模式，false=简化模式
     * @returns 序列化后的对象
     */
    private serialize(instance: any, path: string, cache: Map<string, any>, detailed: boolean = true): any {
        if (instance === null || instance === undefined) {
            return null;
        }

        // 检查缓存，避免重复处理
        if (cache.has(path)) {
            return cache.get(path);
        }

        // 检查循环引用：如果当前对象正在被处理，返回引用标记
        if (this.processingObjects.has(instance)) {
            return this.createObjectReference(instance, path);
        }

        // 标记当前对象正在处理中
        this.processingObjects.add(instance);

        let result: any;

        try {
            // 根据对象类型选择不同的序列化策略
            // 注意：Scene 继承自 Node，所以要先检查 Scene
            if (instance instanceof Scene) {
                result = this.serializeScene(instance, path, cache, detailed);
            } else if (instance instanceof Node) {
                result = this.serializeNode(instance, path, cache, detailed);
            } else if (instance instanceof Component) {
                result = this.serializeComponent(instance, path, cache, detailed);
            } else if (instance instanceof Asset) {
                result = this.serializeAsset(instance, path, detailed);
            } else if (detailed && this.isValueType(instance)) {
                result = this.serializeGenericValue(instance);
            } else {
                // 处理其他类型的 CCClass 或普通对象
                const targetClass = instance.constructor;
                if (!CCClass._isCCClass(targetClass)) {
                    result = detailed
                        ? this.serializeGenericValueRecursive(instance, path, cache)
                        : this.serializeGenericValueBasic(instance, path, cache);
                } else {
                    result = this.serializeCCClass(instance, path, cache, detailed);
                }
            }

            // 为简化模式的对象添加路径属性，方便后续按路径查询
            if (!detailed && result && typeof result === 'object' && !Array.isArray(result)) {
                result.path = path;
            }

            // 存入缓存
            cache.set(path, result);

            return result;
        } finally {
            // 详细模式需要删除处理标记，简化模式使用 WeakSet 自动管理
            if (detailed) {
                this.processingObjects.delete(instance);
            }
        }
    }

    /**
     * 递归序列化对象，支持缓存和循环引用检测
     */
    private serializeWithPathCache(instance: any, path: string, cache: Map<string, any>): any {
        return this.serialize(instance, path, cache, true);
    }

    /**
     * Scene 的简化序列化
     */
    /**
     * 序列化 Cocos Creator 场景对象
     *
     * 场景是 Cocos Creator 中的顶级容器，包含所有游戏节点。
     * 序列化时需要特别处理场景的特殊属性和子节点结构。
     *
     * 处理内容：
     * - 场景基本信息（名称、类型、路径）
     * - 场景特有属性（如渲染设置等）
     * - 子节点的递归序列化
     *
     * @param scene 要序列化的场景对象
     * @param path 场景在序列化结构中的路径
     * @param cache 序列化缓存
     * @param detailed 序列化模式
     * @returns 序列化后的场景数据
     */
    private serializeScene(scene: Scene, path: string, cache: Map<string, any>, detailed: boolean): any {
        if (!scene || !scene.isValid) return null;

        let instanceData;
        if (detailed) {
            // 详细模式：使用 serializeInstanceDataDetailed 获取完整数据
            instanceData = this.serializeInstanceDataDetailed(scene, path, cache);
        } else {
            // 简化模式：使用 serializeInstanceDataBasic 获取完整的简化数据
            instanceData = this.serializeInstanceDataBasic(scene, path, cache);
        }

        // 创建特殊属性对象
        const result: any = {
            nodeId: scene.uuid,
            name: scene.name,
            type: js.getClassName(scene),
            path: path,
            parent: null,
        };

        // 将实例数据合并到结果中，特殊属性会覆盖实例数据中的同名属性
        instanceData = Object.assign(instanceData, result);
        instanceData = this.renameProperty(instanceData, 'lpos', 'position');
        instanceData = this.renameProperty(instanceData, 'lrot', 'rotation');
        instanceData = this.renameProperty(instanceData, 'lscale', 'scale');

        delete instanceData.euler;
        delete instanceData.__editorExtras__;

        return instanceData;
    }

    /**
     * 序列化 Cocos Creator 节点对象
     *
     * 节点是 Cocos Creator 场景图的基本单元，包含变换信息、组件和子节点。
     * 序列化时会处理节点的所有重要属性并进行数据清理。
     *
     * 处理流程：
     * 1. 根据 detailed 参数选择序列化策略
     * 2. 添加节点特有属性（nodeId、name、type、path）
     * 3. 重命名内部属性为用户友好的名称
     * 4. 清理不需要的编辑器属性
     *
     * 属性重命名：
     * - lpos → position（本地位置）
     * - lrot → rotation（本地旋转）
     * - lscale → scale（本地缩放）
     *
     * @param node 要序列化的节点对象
     * @param path 节点在序列化结构中的路径
     * @param cache 序列化缓存
     * @param detailed 序列化模式
     * @returns 序列化后的节点数据
     */
    private serializeNode(node: Node, path: string, cache: Map<string, any>, detailed: boolean): any {
        if (!node || !node.isValid) return null;

        let instanceData;
        if (detailed) {
            // 详细模式：使用 serializeInstanceDataDetailed 获取完整数据
            instanceData = this.serializeInstanceDataDetailed(node, path, cache);
        } else {
            // 简化模式：使用 serializeInstanceDataBasic 获取完整的简化数据
            instanceData = this.serializeInstanceDataBasic(node, path, cache);
        }

        // 创建特殊属性对象
        const result: any = {
            nodeId: node.uuid,
            name: node.name,
            type: js.getClassName(node),
            path: path,
        };

        // 将实例数据合并到结果中，特殊属性会覆盖实例数据中的同名属性
        instanceData = Object.assign(instanceData, result);
        instanceData = this.renameProperty(instanceData, 'lpos', 'position');
        instanceData = this.renameProperty(instanceData, 'lrot', 'rotation');
        instanceData = this.renameProperty(instanceData, 'lscale', 'scale');

        delete instanceData.euler;
        delete instanceData.__editorExtras__;

        return instanceData;
    }

    /**
     * 序列化 Cocos Creator 组件对象
     *
     * 组件是附加到节点上的功能模块，提供特定的游戏逻辑或渲染功能。
     * 序列化时需要处理组件的属性和其所属节点的信息。
     *
     * 处理内容：
     * - 组件的所有可序列化属性
     * - 组件类型信息和唯一标识
     * - 所属节点的基本信息（用于关联）
     * - 组件在节点中的路径位置
     *
     * @param comp 要序列化的组件对象
     * @param path 组件在序列化结构中的路径
     * @param cache 序列化缓存
     * @param detailed 序列化模式
     * @returns 序列化后的组件数据
     */
    private serializeComponent(comp: Component, path: string, cache: Map<string, any>, detailed: boolean): any {
        if (!comp || !comp.isValid) return null;

        let instanceData;
        if (detailed) {
            // 详细序列化：获取完整实例数据
            instanceData = this.serializeInstanceDataDetailed(comp, path, cache);
        } else {
            // 简化模式：使用 serializeInstanceDataBasic 获取完整的简化数据
            instanceData = this.serializeInstanceDataBasic(comp, path, cache);
        }

        const result: any = {
            cid: js.getClassId(comp),
            type: js.getClassName(comp),
            uuid: comp.uuid,
            name: comp.name,
            path: path,
            enabled: comp.enabled,
            node: this.serializeNode(comp.node, this.getNodePathFromComponentPath(path), cache, true),
        };

        // 将实例数据合并到结果中，特殊属性会覆盖实例数据中的同名属性
        return Object.assign(instanceData, result);
    }

    /**
     * 资源的统一序列化方法
     */
    private serializeAsset(asset: Asset, path: string, detailed: boolean): any {
        if (!asset || !asset.isValid) return null;

        return {
            type: js.getClassName(asset),
            uuid: asset.uuid,
            name: asset.name,
        };
    }

    /**
     * CCClass 的统一序列化方法
     */
    private serializeCCClass(instance: any, path: string, cache: Map<string, any>, detailed: boolean): any {
        const targetClass = instance.constructor;
        const result: any = {
            type: js.getClassName(targetClass)
        };

        // 只为非 cc.ValueType 对象添加 path 属性
        if (!this.isValueType(instance)) {
            result.path = path;
        }

        if (detailed) {
            // 详细序列化：使用 serializeInstanceDataDetailed
            Object.assign(result, this.serializeInstanceDataDetailed(instance, path, cache));
        } else {
            // 简化序列化：只记录基本属性，复杂对象只记录路径
            const props = targetClass.__props__;
            if (props && Array.isArray(props)) {
                const propertyMap = this.getPropertyMapping(targetClass);

                for (const [displayName, { storageName }] of propertyMap) {
                    if (Object.prototype.hasOwnProperty.call(instance, storageName)) {
                        const value = instance[storageName];
                        const propPath = `${path}/${displayName}`;

                        if (this.isComplexValue(value)) {
                            // 复杂对象使用智能引用格式
                            result[displayName] = this.createObjectReference(value, propPath);
                        } else {
                            // 简单值使用简易序列化
                            result[displayName] = this.serializeGenericValueBasic(value, propPath, cache);
                        }
                    }
                }
            }
        }

        return result;
    }



    /**
     * 从组件路径获取对应的节点路径
     *
     * 组件路径通常包含组件在节点中的索引信息，如：
     * - "root/components[0]" → "root"
     * - "root/Canvas/components[1]" → "root/Canvas"
     *
     * 此方法用于从组件路径中提取出节点路径，便于访问组件所属的节点。
     *
     * @param componentPath 组件的完整路径
     * @returns 对应的节点路径
     */
    private getNodePathFromComponentPath(componentPath: string): string {
        // 组件路径格式: root/components[0] 或 root/childNode/components[1]
        // 需要去掉最后的 /components[index] 部分
        const parts = componentPath.split('/');
        const lastPart = parts[parts.length - 1];

        if (lastPart.startsWith('components[')) {
            // 去掉最后的组件部分
            parts.pop();
            return parts.join('/');
        }

        return componentPath;
    }

    /**
     * 通用值的简化序列化方法
     *
     * 在简化序列化模式下，此方法负责处理各种类型的值：
     * - 基本类型：直接返回原值
     * - 数组：递归处理每个元素，复杂元素替换为智能引用
     * - 对象：只保留简单属性，复杂属性替换为智能引用
     * - 复杂对象：完全替换为智能引用格式：
     *   - Asset: { type: string, uuid: string }
     *   - 其他: { path: string, type: string }
     *
     * 核心策略：
     * 1. 保持数据结构的基本形状
     * 2. 将复杂对象替换为可导航的智能引用
     * 3. 使用缓存避免重复处理
     * 4. 检测并处理循环引用
     *
     * @param value 要序列化的值
     * @param path 值在整个结构中的路径
     * @param cache 序列化缓存
     * @returns 简化序列化后的结果
     */
    private serializeGenericValueBasic(value: any, path: string, cache: Map<string, any>): any {
        if (value === null || value === undefined) {
            return value;
        }

        // 检查缓存
        if (cache.has(path)) {
            return cache.get(path);
        }

        // 检查循环引用
        if (this.processingObjects.has(value)) {
            return this.createObjectReference(value, path);
        }

        // 基本类型直接返回
        if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
            return value;
        }

        // 数组处理
        if (Array.isArray(value)) {
            const result = value.map((item, index) => {
                const itemPath = `${path}[${index}]`;
                if (this.isComplexValue(item)) {
                    return this.createObjectReference(item, itemPath);
                } else {
                    return this.serializeGenericValueBasic(item, itemPath, cache);
                }
            });
            cache.set(path, result);
            return result;
        }

        // 普通对象递归序列化
        if (typeof value === 'object') {
            this.processingObjects.add(value);

            try {
                const constructor = value.constructor;
                if (constructor && CCClass._isCCClass(constructor)) {
                    const result = this.createObjectReference(value, path);
                    cache.set(path, result);
                    return result;
                }

                const result: any = {};
                for (const key in value) {
                    if (Object.prototype.hasOwnProperty.call(value, key) && !key.startsWith('_') && !key.startsWith('__')) {
                        const propPath = `${path}/${key}`;
                        const propValue = value[key];

                        if (this.isComplexValue(propValue)) {
                            result[key] = this.createObjectReference(propValue, propPath);
                        } else {
                            result[key] = this.serializeGenericValueBasic(propValue, propPath, cache);
                        }
                    }
                }

                // 只为非 cc.ValueType 对象添加路径信息
                if (Object.keys(result).length > 0 && !this.isValueType(value)) {
                    result.path = path;
                }

                cache.set(path, result);
                return result;
            } finally {
                // WeakSet 不需要手动删除
            }
        }

        const result = String(value);
        cache.set(path, result);
        return result;
    }

    /**
     * 判断值是否为复杂对象
     *
     * 复杂对象是指需要特殊处理的对象类型，在简化序列化模式下，
     * 这些对象会被替换为路径引用而不是完整序列化。
     *
     * 复杂对象包括：
     * - 对象类型（非基本类型、非数组）
     * - 具有构造函数的实例对象
     * - 非纯对象（Plain Object）
     *
     * @param value 要检查的值
     * @returns 如果是复杂对象返回 true，否则返回 false
     */
    private isComplexValue(value: any): boolean {
        if (value === null || value === undefined) {
            return false;
        }

        // 基本类型不是复杂值
        if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
            return false;
        }

        // 特殊类型是复杂值
        if (value instanceof Node || value instanceof Component || value instanceof Asset || value instanceof Scene) {
            return true;
        }

        // 数组和对象是复杂值
        if (Array.isArray(value) || typeof value === 'object') {
            const constructor = value.constructor;
            // CCClass 实例是复杂值
            if (constructor && CCClass._isCCClass(constructor)) {
                return true;
            }
            // 普通对象如果包含复杂结构也是复杂值
            return Object.keys(value).length > 0;
        }

        return false;
    }

    /**
     * 根据对象类型创建合适的引用格式
     *
     * 不同类型的对象需要不同的引用信息：
     * - Asset: 只需要 type + uuid（全局唯一资源）
     * - Node/Component/Scene: 需要 path + type（场景内对象）
     * - 其他 CCClass: 需要 path + type
     *
     * @param value 要创建引用的对象
     * @param path 对象路径
     * @returns 对象引用信息
     */
    private createObjectReference(value: any, path: string): any {
        const type = js.getClassName(value.constructor);

        // Asset 类型只需要 type 和 uuid
        if (value instanceof Asset) {
            return {
                type: type,
                uuid: value.uuid
            };
        }

        // 其他类型需要 path 和 type
        return {
            path: path,
        };
    }

    // ==================== 路径解析 ====================

    /**
     * 根据路径解析并获取目标对象
     *
     * 路径解析算法：
     * 1. 以 'root' 为起点，逐段解析路径
     * 2. 支持普通属性访问：root/name、root/position
     * 3. 支持数组索引访问：root/components[0]、root/children[1]
     * 4. 支持嵌套路径：root/Canvas/components[0]/target
     *
     * 路径格式示例：
     * - "root" → 返回根对象
     * - "root/name" → 返回根对象的 name 属性
     * - "root/components[0]" → 返回第一个组件
     * - "root/Canvas/components[1]/enabled" → 返回 Canvas 节点第二个组件的 enabled 属性
     *
     * @param instance 根实例对象
     * @param path 要解析的路径字符串
     * @returns 路径对应的对象，如果路径无效则返回 null
     */
    private resolvePath(instance: any, path: string): any {
        if (!path || path === 'root') {
            return instance;
        }

        const segments = path.split('/').slice(1); // 去掉 'root'
        let current = instance;

        for (const segment of segments) {
            if (!current) break;

            // 处理数组索引访问，如 components[0]、children[1] 等
            const arrayMatch = segment.match(/^(.+)\[(\d+)]$/);
            if (arrayMatch) {
                const propName = arrayMatch[1];
                const index = parseInt(arrayMatch[2]);
                current = current[propName];
                if (Array.isArray(current)) {
                    current = current[index];
                } else {
                    current = null;
                }
            } else {
                current = current[segment];
            }
        }

        return current;
    }

    /**
     * 序列化单个对象（不递归）
     */
    private serializeSingleObject(instance: any, path: string): any {
        return this.serialize(instance, path, new Map(), true);
    }

    /**
     * 实例数据的详细序列化（不递归）
     */
    private serializeInstanceDataDetailed(instance: any, basePath: string, cache: Map<string, any> = new Map()): any {
        const instanceData: any = {};
        const targetClass = instance.constructor;
        const props = targetClass.__props__;

        if (!props || !Array.isArray(props)) {
            return instanceData;
        }

        const propertyMap = this.getPropertyMapping(targetClass);

        for (const [displayName, { storageName }] of propertyMap) {
            try {
                // 检查实例是否真的拥有这个属性
                if (Object.prototype.hasOwnProperty.call(instance, storageName)) {
                    const value = instance[storageName];
                    const propPath = `${basePath}/${displayName}`;

                    // 循环引用检测：如果这个值正在被处理，创建引用标记
                    if (this.isComplexValue(value) && this.processingObjects.has(value)) {
                        instanceData[displayName] = this.createObjectReference(value, propPath);
                    } else {
                        // 正常序列化属性值
                        const serializedValue = this.serializePropertyRecursive(value, displayName, targetClass, propPath, cache);

                        // 数组属性的特殊处理：过滤掉 node 属性
                        // 这是因为 node 属性已经在对象的顶层提供，避免重复
                        if (Array.isArray(serializedValue)) {
                            instanceData[displayName] = serializedValue.map(item => {
                                // 检查数组项是否是包含 node 属性的对象
                                if (item && typeof item === 'object' && !Array.isArray(item) && item.node) {
                                    // 使用解构赋值移除 node 属性，保留其他属性
                                    const { node: _node, ...itemWithoutNode } = item;
                                    return itemWithoutNode;
                                }
                                return item;  // 非对象或不包含 node 的项直接返回
                            });
                        } else {
                            instanceData[displayName] = serializedValue;
                        }
                    }
                }
            } catch (error) {
                // 属性序列化失败时的错误处理
                console.warn(`Failed to serialize property ${displayName}:`, error);
                instanceData[displayName] = null;
            }
        }

        return instanceData;
    }

    /**
     * 简化模式的实例数据序列化
     *
     * 与 serializeInstanceDataDetailed 类似，但使用简化的序列化策略：
     * - 对于复杂对象，只返回路径引用 { path: string, type: string }
     * - 对于 ValueType 对象，序列化其属性值
     * - 对于基本类型，直接返回值
     *
     * @param instance 要序列化的实例
     * @param basePath 基础路径
     * @param cache 缓存映射
     * @returns 简化序列化后的实例数据
     */
    private serializeInstanceDataBasic(instance: any, basePath: string, cache: Map<string, any> = new Map()): any {
        const instanceData: any = {};
        const targetClass = instance.constructor;
        const props = targetClass.__props__;

        if (!props || !Array.isArray(props)) {
            return instanceData;
        }

        const propertyMap = this.getPropertyMapping(targetClass);

        for (const [displayName, { storageName }] of propertyMap) {
            try {
                // 检查实例是否真的拥有这个属性
                if (Object.prototype.hasOwnProperty.call(instance, storageName)) {
                    const value = instance[storageName];
                    const propPath = `${basePath}/${displayName}`;

                    // 循环引用检测：如果这个值正在被处理，创建引用标记
                    if (this.isComplexValue(value) && this.processingObjects.has(value)) {
                        instanceData[displayName] = this.createObjectReference(value, propPath);
                    } else {
                        // 使用简化序列化策略
                        const serializedValue = this.serializeGenericValueBasic(value, propPath, cache);

                        // 数组属性的特殊处理：过滤掉 node 属性
                        // 这是因为 node 属性已经在对象的顶层提供，避免重复
                        if (Array.isArray(serializedValue)) {
                            instanceData[displayName] = serializedValue.map(item => {
                                // 检查数组项是否是包含 node 属性的对象
                                if (item && typeof item === 'object' && !Array.isArray(item) && item.node) {
                                    // 使用解构赋值移除 node 属性，保留其他属性
                                    const { node: _node, ...itemWithoutNode } = item;
                                    return itemWithoutNode;
                                }
                                return item;  // 非对象或不包含 node 的项直接返回
                            });
                        } else {
                            instanceData[displayName] = serializedValue;
                        }
                    }
                }
            } catch (error) {
                // 属性序列化失败时的错误处理
                console.warn(`Failed to serialize property ${displayName}:`, error);
                instanceData[displayName] = null;
            }
        }

        return instanceData;
    }

    /**
     * 属性的递归序列化
     *
     * 这个方法负责序列化单个属性值，根据值的类型选择合适的序列化策略：
     *
     * 类型处理策略：
     * 1. 基础类型（string, number, boolean, null）：直接返回
     * 2. 数组类型：递归序列化每个元素
     * 3. 复杂对象：使用缓存机制避免重复序列化
     * 4. 其他类型：使用通用递归序列化
     *
     * 缓存机制：
     * - 对于复杂对象，首先检查缓存中是否已存在
     * - 如果存在，直接返回缓存结果
     * - 如果不存在，进行序列化并缓存结果
     *
     * 数组处理：
     * - 递归序列化数组中的每个元素
     * - 为每个元素构建独立的路径
     * - 保持数组结构的完整性
     *
     * @param value 要序列化的属性值
     * @param propName 属性名称
     * @param targetClass 目标类（用于类型检查）
     * @param propPath 属性的完整路径
     * @param cache 缓存映射
     * @returns 序列化后的属性值
     */
    private serializePropertyRecursive(value: any, propName: string, targetClass: any, propPath: string, cache: Map<string, any>): any {
        // 处理基础类型：直接返回，无需进一步处理
        if (value === null || value === undefined || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
            return value;
        }

        // 数组类型的递归处理
        if (Array.isArray(value)) {
            return value.map((item, index) => {
                const itemPath = `${propPath}[${index}]`;  // 为数组元素构建路径
                return this.serializePropertyRecursive(item, `${propName}[${index}]`, targetClass, itemPath, cache);
            });
        }

        // 复杂对象的缓存处理
        // 首先检查缓存，避免重复序列化相同路径的对象
        if (this.isComplexValue(value)) {
            return this.serializeWithPathCache(value, propPath, cache);
        }

        // 其他类型使用通用递归序列化
        return this.serializeGenericValueRecursive(value, propPath, cache);
    }

    /**
     * 通用值的递归序列化
     *
     * 这个方法处理不属于特定 Cocos Creator 类型的通用值序列化：
     *
     * 处理类型：
     * 1. 基础类型（null, undefined, number, string, boolean）：直接返回
     * 2. 数组：递归序列化每个元素
     * 3. 普通对象：递归序列化每个属性
     * 4. CCClass 实例：委托给专门的缓存序列化方法
     *
     * 缓存和循环引用处理：
     * - 首先检查对象结果缓存
     * - 检查路径缓存避免重复序列化
     * - 使用 WeakSet 检测循环引用
     *
     * 对象属性过滤：
     * - 跳过以 '_' 开头的私有属性
     * - 跳过以 '__' 开头的内部属性
     * - 只序列化对象自有的属性（非继承属性）
     *
     * 路径构建：
     * - 为每个属性和数组元素构建完整路径
     * - 路径格式：对象属性用 '/' 分隔，数组索引用 '[index]' 表示
     *
     * @param value 要序列化的值
     * @param path 当前值的完整路径
     * @param cache 缓存映射
     * @returns 序列化后的值
     */
    private serializeGenericValueRecursive(value: any, path: string, cache: Map<string, any>): any {
        // 处理 null 和 undefined
        if (value === null || value === undefined) {
            return value;
        }

        // 基础类型直接返回
        if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
            return value;
        }

        // 对于复杂对象，首先检查对象结果缓存
        if (typeof value === 'object' && this.processedResults.has(value)) {
            return this.processedResults.get(value);
        }

        // 路径缓存检查：避免重复序列化相同路径的值
        if (cache.has(path)) {
            return cache.get(path);
        }

        // 循环引用检测：如果值正在被处理，创建引用标记
        if (this.processingObjects.has(value)) {
            return this.createObjectReference(value, path);
        }

        // 数组类型的递归处理
        if (Array.isArray(value)) {
            this.processingObjects.add(value);  // 标记为正在处理
            try {
                const result = value.map((item, index) => {
                    const itemPath = `${path}[${index}]`;  // 构建数组元素路径
                    return this.serializeGenericValueRecursive(item, itemPath, cache);
                });
                cache.set(path, result);
                this.processedResults.set(value, result);  // 缓存结果
                return result;
            } finally {
                // WeakSet 会自动处理垃圾回收，不需要手动删除
            }
        }

        // 普通对象的递归序列化
        if (typeof value === 'object') {
            this.processingObjects.add(value);  // 标记为正在处理

            try {
                const constructor = value.constructor;

                // 如果是 CCClass 实例，使用专门的缓存序列化方法
                if (constructor && CCClass._isCCClass(constructor)) {
                    return this.serializeWithPathCache(value, path, cache);
                }

                // 普通对象的属性序列化
                const result: any = {};
                for (const key in value) {
                    // 只处理对象自有的属性，跳过私有和内部属性
                    if (Object.prototype.hasOwnProperty.call(value, key) && !key.startsWith('_') && !key.startsWith('__')) {
                        const propPath = `${path}/${key}`;  // 构建属性路径
                        result[key] = this.serializeGenericValueRecursive(value[key], propPath, cache);
                    }
                }

                // 只为非 cc.ValueType 对象添加路径信息
                if (Object.keys(result).length > 0 && !this.isValueType(value)) {
                    result.path = path;
                }

                cache.set(path, result);
                this.processedResults.set(value, result);  // 缓存结果
                return result;
            } finally {
                // WeakSet 会自动处理垃圾回收
            }
        }

        // 其他类型直接返回
        return value;
    }

    // ==================== 通用辅助方法 ====================

    /**
     * 通用序列化方法（用于简单值）
     *
     * 这是一个简化的序列化方法，用于处理不需要路径和缓存的简单值：
     *
     * 处理逻辑：
     * 1. 基础类型直接返回
     * 2. 数组递归处理每个元素
     * 3. 对象递归处理每个属性（跳过私有属性）
     * 4. 其他类型转换为字符串
     *
     * 适用场景：
     * - 简单数据结构的序列化
     * - 不需要循环引用检测的场景
     * - 性能要求较高的轻量级序列化
     *
     * @param value 要序列化的值
     * @returns 序列化后的值
     */
    private serializeGenericValue(value: any): any {
        if (value === null || value === undefined) {
            return value;
        }

        if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
            return value;
        }

        if (Array.isArray(value)) {
            return value.map(item => this.serializeGenericValue(item));
        }

        if (typeof value === 'object') {
            const result: any = {};
            for (const key in value) {
                if (Object.prototype.hasOwnProperty.call(value, key) && !key.startsWith('_') && !key.startsWith('__')) {
                    result[key] = this.serializeGenericValue(value[key]);
                }
            }
            return result;
        }

        return String(value);
    }

    /**
     * 获取类的属性映射
     *
     * 这个方法处理 CCClass 的属性名映射，解决内部存储名和外部显示名的差异：
     *
     * 映射类型：
     * 1. 特殊属性映射：预定义的特殊属性名转换（如 _components -> components）
     * 2. 私有属性映射：私有属性名到公共属性名的转换（如 _name -> name）
     * 3. 普通属性：直接使用属性名
     *
     * 过滤规则：
     * - 跳过 serializable 为 false 的属性
     * - 优先使用公共属性名而不是私有属性名
     * - 避免重复映射相同的属性
     *
     * 返回格式：
     * Map<displayName, { storageName, attr, mappingType }>
     * - displayName: 外部显示的属性名
     * - storageName: 内部存储的属性名
     * - attr: 属性的元数据信息
     * - mappingType: 映射类型标识
     *
     * @param targetClass 目标类
     * @returns 属性映射表
     */
    private getPropertyMapping(targetClass: any): Map<string, any> {
        const propertyDefs = this.collectPropertyDefinitions(targetClass);
        const propertyMap = new Map();

        for (const [propName, attr] of propertyDefs) {
            // 跳过不可序列化的属性
            if (attr.serializable === false) {
                continue;
            }

            // 私有属性到公共属性的映射
            if (propName.startsWith('_') && !propName.startsWith('__')) {
                const publicPropName = propName.substring(1);
                // 检查是否存在对应的公共属性
                if (propertyDefs.has(publicPropName)) {
                    const publicAttr = propertyDefs.get(publicPropName);
                    // 如果公共属性可序列化，跳过私有属性，优先使用公共属性
                    // 如果公共属性不可序列化，但私有属性可序列化，则使用私有属性
                    if (publicAttr.serializable !== false) {
                        continue;
                    }
                }
                // 如果没有对应的公共属性，或者公共属性不可序列化，使用公共名称作为显示名
                propertyMap.set(publicPropName, {
                    storageName: propName,
                    attr: attr,
                    mappingType: 'private-to-public'
                });
            } else {
                // 普通属性：直接映射
                propertyMap.set(propName, {
                    storageName: propName,
                    attr: attr,
                    mappingType: 'direct'
                });
            }
        }

        return propertyMap;
    }

    /**
     * 收集类的属性定义
     *
     * 这个方法遍历类的继承链，收集所有可序列化的属性定义：
     *
     * 收集策略：
     * 1. 从当前类开始，向上遍历继承链
     * 2. 收集每个类的 __props__ 属性定义
     * 3. 使用 CCClass.attr() 获取属性的详细元数据
     * 4. 避免重复收集相同名称的属性（子类优先）
     *
     * 属性来源：
     * - 当前类的直接属性
     * - 父类的继承属性
     * - 混入类的属性（如果有）
     *
     * 返回格式：
     * Map<propertyName, attributeInfo>
     * - propertyName: 属性名称
     * - attributeInfo: 属性的元数据信息（类型、默认值、序列化选项等）
     *
     * @param targetClass 目标类
     * @returns 属性定义映射表
     */
    private collectPropertyDefinitions(targetClass: any): Map<string, any> {
        const propertyDefs = new Map();
        let currentClass = targetClass;

        // 遍历继承链，收集所有属性定义
        while (currentClass && CCClass._isCCClass(currentClass)) {
            const props = currentClass.__props__;
            if (props && Array.isArray(props)) {
                for (const propName of props) {
                    // 避免重复收集，子类属性优先
                    if (!propertyDefs.has(propName)) {
                        const attr = CCClass.attr(currentClass, propName);
                        if (attr) {
                            propertyDefs.set(propName, attr);
                        }
                    }
                }
            }
            // 向上遍历继承链
            currentClass = js.getSuper(currentClass);
        }

        return propertyDefs;
    }

    /**
     * 重命名对象属性的工具方法
     *
     * 使用 ES6 解构赋值语法安全地重命名对象属性，避免直接修改原对象。
     * 常用于将 Cocos Creator 内部属性名转换为用户友好的名称。
     *
     * 使用场景：
     * - lpos → position（本地位置）
     * - lrot → rotation（本地旋转）
     * - lscale → scale（本地缩放）
     *
     * @param obj 要处理的对象
     * @param oldKey 原属性名
     * @param newKey 新属性名
     * @returns 重命名后的新对象
     */
    renameProperty (obj: any, oldKey: string, newKey: string) {
        const { [oldKey]: value, ...rest } = obj;
        return { ...rest, [newKey]: value };
    }
}

export const encode = new ClassSerializer();
