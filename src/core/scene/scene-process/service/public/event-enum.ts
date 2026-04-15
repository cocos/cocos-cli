enum NodeEventType {
    TRANSFORM_CHANGED = 'transform-changed', // 节点改变位置、旋转或缩放事件
    SIZE_CHANGED = 'size-changed', // 当节点尺寸改变时触发的事件
    ANCHOR_CHANGED = 'anchor-changed', // 当节点锚点改变时触发的事件
    CHILD_ADDED = 'child-added', // 节点子类添加
    CHILD_REMOVED = 'child-removed', // 节点子类移除
    PARENT_CHANGED = 'parent-changed', // 父节点改变时触发的事件
    CHILD_CHANGED = 'child-changed', // 子节点改变时触发的事件
    COMPONENT_CHANGED = 'component-changed', // 组件数据发生改变时
    ACTIVE_IN_HIERARCHY_CHANGE = 'active-in-hierarchy-changed', // 节点在hierarchy是否激活
    NOTIFY_NODE_CHANGED = 'notify-node-changed',
    PREFAB_INFO_CHANGED = 'prefab-info-changed', // prefab数据改变
    LIGHT_PROBE_CHANGED = 'light-probe-changed', // 光照探针数据改变
}

enum NodeOperationType {
    SET_PROPERTY = 'set-property', // 设置节点上的属性
    MOVE_ARRAY_ELEMENT = 'move-array-element', // 调整一个数组类型的数据内某个 item 的位置
    REMOVE_ARRAY_ELEMENT = 'remove-array-element', // 删除一个数组元素
    CREATE_COMPONENT = 'create-component', // 创建一个组件
    RESET_COMPONENT = 'reset-component', // 重置一个组件
}

enum EventSourceType {
    EDITOR = 'editor', // 由编辑器主动发出
    UNDO = 'undo', // undo产生的事件
    ENGINE = 'engine', // 由引擎发出
}

export { NodeEventType, NodeOperationType, EventSourceType };
