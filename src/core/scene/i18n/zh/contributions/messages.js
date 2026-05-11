module.exports = {
    messages: {
        description: {
            gameview_stop: '退出播放',
            gameview_play_of_switch_scene: '当前 Game View 处于播放状态,要切换场景请退出播放。',
            open_scene: '打开场景',
            close_scene: '关闭场景',
            save_scene: '保存场景',
            save_as_scene: '场景另存为',
            query_is_ready: '查询当前场景是否准备就绪',
            query_dirty: '查询当前场景是否有修改',
            query_classes: '查询所有在引擎中注册的类',
            query_components: '查询当前场景的所有组件',
            query_component_has_script: '查询引擎组件列表是否含有指定类名的脚本',
            query_node_tree: '查询节点树的信息',
            query_node_by_asset_uuid: '查询使用了资源 UUID 的节点',
            set_property: '设置某个元素内的属性',
            reset_property: '重置元素属性到默认值',
            // update_property_from_null: '属性值从 null 变为一个可编辑的值',
            // set_node_and_children_layer: '置某个节点连同它的子集的 Layer 属性值',
            move_array_element: '移动数组内某个元素的位置',
            remove_array_element: '删除数组内某个元素的位置',
            cut_node: '剪切节点',
            // select_all_nodes: '选择所有节点',
            copy_node: '拷贝节点，给下一步粘贴（创建）节点准备数据',
            duplicate_node: '复制节点',
            paste_node: '粘贴节点',
            set_parent: '设置节点父级',
            create_node: '创建节点',
            query_node: '查询一个节点的数据',
            reset_node: '重置节点的位置, 角度和缩放',
            remove_node: '删除节点',
            create_component: '创建组件',
            reset_component: '重置组件',
            execute_component_method: '执行组件上的方法',
            execute_scene_script: '执行某个插件注册的方法',
            remove_component: '删除组件',
            query_component: '查询一个组件的数据',
            snapshot: '快照当前场景状态',
            snapshot_abort: '中止快照',
            // undo: '撤销一次操作记录',
            // redo: '重做一次操作记录',
            soft_reload: '软刷新场景',
            change_gizmo_tool: '更改 Gizmo 工具',
            change_gizmo_pivot: '更改变换基准点',
            change_gizmo_coordinate: '更改坐标系',
            change_is2D: '更改2D/3D视图模式',
            set_grid_visible: '显示/隐藏网格',
            query_is_grid_visible: '查询网格显示状态',
            set_icon_gizmo_3d: '设置 IconGizmo 为 3D 或 2D 模式',
            query_is_icon_gizmo_3d: '查询 IconGizmo 模式',
            set_icon_gizmo_size: '设置 IconGizmo 的大小',
            query_icon_gizmo_size: '查询 IconGizmo 的大小',
            query_gizmo_tool_name: '获取当前 Gizmo 工具的名字',
            query_gizmo_view_mode: '查询视图模式（查看/选择）',
            query_gizmo_pivot: '获取当前 Gizmo 基准点名字',
            query_gizmo_coordinate: '获取当前坐标系名字',
            query_is2D: '获取当前视图模式',
            focus_camera: '聚焦场景相机到节点上',
            align_with_view: '将场景相机位置与角度应用到选中节点上',
            align_view_with_node: '将选中节点位置与角度应用到当前视角',
            // broadcast
            scene_ready: '场景打开通知',
            scene_close: '场景关闭通知',

            UITransform_lack: '正在添加 UI 节点，但所有上层节点都没有 cc.UITransform 组件',
            UITransform_add_to_root: '给根节点添加 cc.UITransform 组件',
            UITransform_within_canvas: '创建 Canvas 节点作为父节点',
            UITransform_cancel: '取消',

            animationComponentCollision: '动画控制器组件和动画组件、骨骼动画组件不能共存。',

            physicsDynamicBodyShape: '动力学刚体不能设置为以下碰撞体：Terrain, Plane, Non-Convex Mesh。',

            light_probe_edit_mode_changed: '光照探针编辑模式切换通知',
            light_probe_bounding_box_edit_mode_changed: '光照探针组件包围盒编辑模式切换通知',
            light_probe_delete_when_editing_probe: '当前正在探针编辑模式 无法修改正在编辑的探针节点。请先退出探针编辑模式并再次尝试。',

            begin_recording: '开始记录节点 Undo 数据',
            end_recording: '结束记录节点 Undo 数据',
            cancel_recording: '取消记录节点 Undo 数据',

            // prefab
            create_prefab: '创建预制体资源(内置撤销记录)',
            apply_prefab: '应用预制体节点修改到对应资源(内置撤销记录)',
            restore_prefab: '使用预制体资源还原对应预制件节点(内置撤销记录)',
            revert_removed_component: '还原预制体节点被移除的组件(内置撤销记录)',
            apply_removed_component: '应用预制体删除组件的修改到对应资源(内置撤销记录)',
        },
        doc: {
            // message
            open_scene: `
                - uuid {string} 场景资源的 UUID`,
            query_classes: `
                @returns {[Object]}
                - extends? {string} 过滤出基于此类名扩展而来的类
                `,
            query_components: `
                @returns {[Object]}
                - name {string} 组件名字
                - path {string} 菜单路径
                `,
            query_component_has_script: `
                - name 脚本的类名 Class
                
                @returns {boolean} 存在 true, 不存在 false
                `,
            query_node_tree: `
                - uuid? {string} 根节点 uuid，不传入则以场景节点为根节点
                
                @returns {Object}
                - name {string} 节点名字或者 'scene'
                - active {boolean} 节点激活状态 
                - type {string} cc.Scene or cc.Node
                - uuid {string} 节点的 uuid
                - children {[]} 子节点数组
                - prefab {number} prefab状态, 1 表示是 prefab, 2 表示是 prefab 但丢失资源
                - isScene {boolean} 是否是场景节点
                - components {[Object]} 组件数组
                    - type {string} 组件类型
                    - value {string} 组件的 uuid 
                    - extends {[string]} 组件的继承链数组
                `,
            query_node_by_asset_uuid: `
                - 查询使用了资源 UUID 的节点
                
                @returns {string[]}  节点的 uuid
                `,
            set_property: `
                - options {SetPropertyOptions}
                    - uuid {string} 修改属性的对象的 uuid
                    - path {string} 属性挂载对象的搜索路径
                    - dump {IProperty} 属性 dump 出来的数据
                `,
            reset_property: `
                - options {SetPropertyOptions}
                    - uuid {string} 修改属性的对象的 uuid
                    - path {string} 属性挂载对象的搜索路径
                `,
            // update_property_from_null: `
            // - options {SetPropertyOptions}
            //     - uuid {string} 修改属性的对象的 uuid
            //     - path {string} 属性挂载对象的搜索路径
            // `,
            // set_node_and_children_layer: `
            // - options {SetPropertyOptions}
            //     - uuid {string} 修改属性的对象的 uuid
            //     - path {string} 属性挂载对象的搜索路径
            //     - dump {IProperty} 属性 dump 出来的数据
            // `,
            move_array_element: `
                - options {MoveArrayOptions}
                    - uuid {string} 节点的 uuid
                    - path {string} 数组的搜索路径
                    - target {number} 目标 item 原来的索引
                    - offset {number} 偏移量
                
                @returns {boolean} 操作是否成功
                `,
            remove_array_element: `
                - options {MoveArrayOptions}
                    - uuid {string} 节点的 uuid
                    - path {string} 数组的搜索路径
                    - index {number} 目标 item 的索引
                
                @returns {boolean} 操作是否成功
                `,
            // select_all_nodes: `
            // - 选择所有节点，在不同的场景模式下，选到的节点类型有所区别，比如Light Probe Editor模式下，只会选到Light Probe节点

            // @returns {string[]}  节点的 uuid
            // `,
            copy_node: `
                - uuids {string | string[]} 节点的 uuid
    
                @returns {string | string[]} 返回节点的 uuid
                `,
            cut_node: `
                - uuids {string | string[]} 节点的 uuid
    
                @returns {string | string[]} 返回节点的 uuid
                `,
            duplicate_node: `
                - uuids {string | string[]} 节点的 uuid
    
                @returns {string | string[]} 返回新节点的 uuid
                `,
            paste_node: `
                - options {PasteNodeOptions}
                    - target {string} 目标节点 uuid
                    - uuids {string | string[]} 被复制的节点 uuid
                    - keepWorldTransform {boolean} 是否保持新节点的世界坐标不变
                
                @returns {string | string[]} 返回新节点的 uuid
                `,
            set_parent: `
                - options {CutNodeOptions}
                    - parent {string} 父节点 uuid
                    - uuids {string|string[]} 需要设置的子节点 uuid
                    - keepWorldTransform {boolean} 是否保持新节点的世界坐标不变
                
                @returns {string | string[]} 返回节点的 uuid
                `,
            create_node: `
                - options {CreateNodeOptions}
                    - parent {string} 父节点 uuid
                    - components? {string[]} 组件名字
                
                    - name? {string} 节点名字
                    - dump? {INode | IScene} node 初始化应用的 dump 数据
                    - keepWorldTransform? {boolean} 是否保持新节点的世界坐标不变
                    - type? {string} 资源类型
                    - canvasRequired? {boolean} 是否需要有 cc.Canvas
                    - unlinkPrefab? {boolean} 是否要解绑为普通节点
                    - assetUuid? {string} asset uuid，从资源实例化节点
                
                @returns {string | string[]} 返回新节点的 uuid
                `,
            query_node: `
                - uuid {string} 节点的 uuid
    
                @returns {Object} 节点的 dump 数据
                `,
            reset_node: `
                - uuid {string} 节点的 uuid
    
                @returns {boolean} 操作是否成功
                `,
            restore_prefab: `
                - uuid {string} 节点的 uuid
                - assetUuid {string} 资源的 uuid
    
                @returns {boolean} 操作是否成功
                `,
            remove_node: `
                - options {RemoveNodeOptions}
                    - uuid: {string | string[]} 节点的 uuid
                `,
            create_component: `
                - options {CreateComponentOptions}
                    - uuid {string} 节点的 uuid
                    - component {string} 组件 classId （cid）（推荐方式） 或者 className 类名
                `,
            remove_component: `
                - options {CreateComponentOptions}
                    - uuid {string} 节点的 uuid
                    - component {string} 组件 classId （cid）（推荐方式） 或者 className 类名
                `,
            reset_component: `
                - options {ResetComponentOptions}
                    - uuid {string} 组件的 uuid
                
                @returns {boolean} 操作是否成功
                `,
            execute_component_method: `
                - options {ExecuteComponentMethodOptions}
                    - uuid {string} 组件的 uuid
                    - name {string} 方法名
                    - args {any[]} 参数
                `,
            execute_scene_script: `
                - options {ExecuteSceneScriptMethodsOptions}
                    - name {string} 注册进来的插件名字
                    - method {string} 执行的方法名字
                    - args {any[]} 参数数组
                `,
            query_component: `
                - uuid {string} 组件的 uuid
    
                @returns {Object} 组件的 dump 数据
                `,
            change_gizmo_tool: `
                - name {string} 工具名字 'position' | 'rotation' | 'scale'| 'rect'
                `,
            change_gizmo_pivot: `
                - name {string} 变换基准点 'pivot' | 'center'
                `,
            change_gizmo_coordinate: `
                - type {string} 坐标系 'local' | 'global'
                `,
            change_is2D: `
                - is2D {boolean} 2D/3D视图
                `,
            set_grid_visible: `
                - visible {boolean} 显示/隐藏网格
                `,
            query_is_grid_visible: `
                @returns {boolean} true: visible, false: invisible
                `,
            set_icon_gizmo_3d: `
                - is3D {boolean} 3D/2D IconGizmo
                `,
            query_is_icon_gizmo_3d: `
                @returns {boolean} true: 3D, false: 2D
                `,
            set_icon_gizmo_size: `
                - size {number} IconGizmo 的大小
                `,
            query_icon_gizmo_size: `
                @returns {number} IconGizmo 的大小
                `,
            query_gizmo_tool_name: `
                @returns {string} 'position' | 'rotation' | 'scale' | 'rect'
                `,
            query_gizmo_view_mode: `
                @return {string} 'view' | 'select'
                `,
            query_gizmo_pivot: `
                @returns {string} 'pivot' | 'center'
                `,
            query_gizmo_coordinate: `
                @returns {string} 'local' | 'global'
                `,
            query_is2D: `
                @returns {boolean} true:2D, false:3D
                `,
            focus_camera: `
                - uuids {string[] | null} 节点 uuid
                `,
            align_with_view: `
                @returns {null}
                `,
            align_view_with_node: `
                @returns {null}
                `,
            // broadcast
            scene_ready: `
                - uuid {string} uuid of scene
                `,

            light_probe_edit_mode_changed: `
                - mode {boolean} 切换后的探针编辑模式
                `,

            light_probe_bounding_box_edit_mode_changed: `
                - mode {boolean} 切换后的探针组件包围盒编辑模式
                `,
        },
        example: {
            // message
            open_scene: `
await Editor.Message.request('scene', 'open-scene', sceneUuid);
                `,
            save_scene: `
await Editor.Message.request('scene', 'save-scene');
                `,
            save_as_scene: `
await Editor.Message.request('scene', 'save-as-scene');
                `,
            close_scene: `
await Editor.Message.request('scene', 'close-scene');
                `,
            query_is_ready: `
await Editor.Message.request('scene', 'query-is-ready');
                `,
            query_dirty: `
await Editor.Message.request('scene', 'query-dirty');
                `,
            query_classes: `
await Editor.Message.request('scene', 'query-classes');
                `,
            query_components: `
await Editor.Message.request('scene', 'query-components');
                `,
            query_component_has_script: `
await Editor.Message.request('scene', 'query-component-has-script', 'cc.Sprite');
                `,
            query_node_tree: `
await Editor.Message.request('scene', 'query-node-tree', nodeUuid);
                `,
            query_node_by_asset_uuid: `
await Editor.Message.request('scene', 'query-nodes-by-asset-uuid', assetUuid);
                `,
            set_property: `
await Editor.Message.request('scene', 'set-property', {
    uuid: nodeUuid,
    path: '__comps__.1.defaultClip',
    dump: {
        type: 'cc.AnimationClip',
        value: {
            uuid: animClipUuid,
        },
    },
});
                `,
            reset_property: `
await Editor.Message.request('scene', 'reset-property', {
    uuid: nodeUuid,
    path: 'position',
});
                `,
            move_array_element: `
await Editor.Message.request('scene', 'move-array-element', {
    uuid: nodeUuid,
    path: '__comps__',
    target: 1,
    offset: -1,
});
                `,
            remove_array_element: `
await Editor.Message.request('scene', 'remove-array-element', {
    uuid: nodeUuid,
    path: '__comps__',
    index: 0,
});
                `,
            copy_node: `
await Editor.Message.request('scene', 'copy-node', uuids);
                `,
            cut_node: `
await Editor.Message.request('scene', 'cut-node', uuids);
                `,
            duplicate_node: `
await Editor.Message.request('scene', 'duplicate-node', uuids);
                `,
            paste_node: `
await Editor.Message.request('scene', 'paste-node', {
    target: nodeUuid,
    uuids: nodeUuids,
});
                `,
            set_parent: `
await Editor.Message.request('scene','set-parent', {
    parent: nodeUuid,
    uuids: nodeUuids,
});
                `,
            create_node: `
await Editor.Message.request('scene', 'create-node', {
    name: 'New Node'
    parent: nodeUuid,
});
                `,
            query_node: `
await Editor.Message.request('scene', 'query-node', nodeUuid);
                `,
            reset_node: `
await Editor.Message.request('scene', 'reset-node', {
    uuid: nodeUuid,
});
                `,
            restore_prefab: `
await Editor.Message.request('scene', 'restore-prefab', nodeUuid, assetUuid);
                `,
            remove_node: `
await Editor.Message.request('scene', 'remove-node', { 
    uuid: nodeUuid
});
                `,
            create_component: `
Editor.Message.request('scene', 'create-component', { 
    uuid: nodeUuid,
    component: 'cc.Sprite'
});
                `,
            remove_component: `
await Editor.Message.request('scene', 'remove-component', { 
    uuid: componentUuid,
});
                `,
            reset_component: `
await Editor.Message.request('scene', 'reset-component', {
    uuid: componentUuid,
});
                `,
            execute_component_method: `
await Editor.Message.request('scene', 'execute-component-method', {
    uuid: componentUuid,
    name: 'getNoisePreview',
    args: [100, 100],
});
                `,
            execute_scene_script: `
await Editor.Message.request('scene', 'execute-scene-script', {
    name: 'animation-graph',
    method: 'query',
    args: [],
});
                `,
            snapshot: `
await Editor.Message.request('scene', 'snapshot');
                `,
            snapshot_abort: `
await Editor.Message.request('scene', 'snapshot-abort');
                `,
            begin_recording: `
const undoID = await Editor.Message.request('scene', 'begin-recording', nodeUuid);
                `,
            end_recording: `
await Editor.Message.request('scene', 'end-recording', undoID);
                `,
            cancel_recording: `
await Editor.Message.request('scene', 'cancel-recording', undoID);
                `,
            soft_reload: `
await Editor.Message.request('scene', 'soft-reload');
                `,
            query_component: `
await Editor.Message.request('scene', 'query-component', nodeUuid);
                `,
            change_gizmo_tool: `
await Editor.Message.request('scene', 'change-gizmo-tool', 'position');
                `,
            change_gizmo_pivot: `
await Editor.Message.request('scene', 'query-gizmo-pivot');
                `,
            change_gizmo_coordinate: `
await Editor.Message.request('scene', 'change-gizmo-coordinate', 'global');
                `,
            change_is2D: `
await Editor.Message.request('scene', 'change-is2D', true);
                `,
            set_grid_visible: `
await Editor.Message.request('scene', 'set-grid-visible', false);
                `,
            query_is_grid_visible: `
await Editor.Message.request('scene', 'query-is-grid-visible');
                `,
            set_icon_gizmo_3d: `
await Editor.Message.request('scene', 'set-icon-gizmo-3d', false);
                `,
            query_is_icon_gizmo_3d: `
await Editor.Message.request('scene', 'query-is-icon-gizmo-3d');
                `,
            set_icon_gizmo_size: `
await Editor.Message.request('scene', 'set-icon-gizmo-size', 60);
                `,
            query_icon_gizmo_size: `
await Editor.Message.request('scene', 'query-icon-gizmo-size');
                `,
            query_gizmo_tool_name: `
await Editor.Message.request('scene', 'query-gizmo-tool-name');
                `,
            query_gizmo_view_mode: `
await Editor.Message.request('scene', 'query-gizmo-view-mode');
                `,
            query_gizmo_pivot: `
await Editor.Message.request('scene', 'query-gizmo-pivot');
                `,
            query_gizmo_coordinate: `
await Editor.Message.request('scene', 'query-gizmo-coordinate');
                `,
            query_is2D: `
await Editor.Message.request('scene', 'query-is2D');
                `,
            focus_camera: `
await Editor.Message.request('scene', 'focus-camera', nodeUuids);
                `,
            align_with_view: `
await Editor.Message.request('scene', 'align-with-view');
                `,
            align_view_with_node: `
await Editor.Message.request('scene', 'align-with-view-node');
                `,
            // broadcast
            scene_ready: `
Editor.Message.broadcast('scene:ready', assetUuid);
                `,
            scene_close: `
Editor.Message.broadcast('scene:close');
                `,
            light_probe_edit_mode_changed: `
Editor.Message.broadcast('scene:light-probe-edit-mode-changed', true);
                `,
            light_probe_bounding_box_edit_mode_changed: `
Editor.Message.broadcast('scene:light-probe-bounding-box-edit-mode-changed', true);
                `,
        },
    },
}