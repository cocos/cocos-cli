module.exports = {
    messages: {
        description: {
            gameview_stop: 'Stop GameView',
            gameview_play_of_switch_scene: 'The GameView is currently in the playing state. To switch scenes, please stop GameView.',
            open_scene: 'Open scene',
            close_scene: 'Close scene',
            save_scene: 'Save scene',
            save_as_scene: 'Save scene to other place',
            query_is_ready: 'Query the ready state of current scene',
            query_dirty: 'Query dirty state of current scene',
            query_classes: 'Query all classes',
            query_components: 'Query all components',
            query_component_has_script: 'Whether a script is in the components list',
            query_node_tree: 'Query node tree information',
            query_node_by_asset_uuid: 'Query node by asset uuid',
            set_property: 'Set property of object',
            reset_property: 'reset a property of object with default value',
            // update_property_from_null: 'update a property value of object from null',
            // set_node_and_children_layer: 'Set the layer of node and it\'s children',
            move_array_element: 'Move the position of item in the property with Array type',
            remove_array_element: 'Remove the item of property with Array type',
            cut_node: 'Cut node',
            // select_all_nodes: 'Select all nodes',
            copy_node: 'Copy node, prepare data for paste or create node',
            duplicate_node: 'Duplicate node',
            paste_node: 'Paste node',
            set_parent: 'Set parent of node',
            create_node: 'Create node',
            query_node: 'Query dump data of node',
            reset_node: 'Reset node properties: position, rotation, scale.',
            remove_node: 'Remove node',
            create_component: 'Create component',
            reset_component: 'Reset component',
            execute_component_method: 'Execute method of component',
            execute_scene_script: 'Execute method of extension script',
            query_component: 'Query dump data of component',
            snapshot: 'Snapshot current scene state',
            snapshot_abort: 'Abort snapshot',
            // undo: 'Undo operation',
            // redo: 'Redo operation',
            soft_reload: 'Soft reload scene',
            change_gizmo_tool: 'Change gizmo tool',
            change_gizmo_pivot: 'Change gizmo pivot',
            change_gizmo_coordinate: 'Change gizmo coordinate',
            change_is2D: 'Change between 2D/3D view',
            set_grid_visible: 'Show or hide grid',
            query_is_grid_visible: 'Query visible state of grid',
            set_icon_gizmo_3d: 'Set the IconGizmo to 3D or 2D',
            query_is_icon_gizmo_3d: 'Query IconGizmo mode',
            set_icon_gizmo_size: 'Set the size of IconGizmo',
            query_icon_gizmo_size: 'Query size of IconGizmo',
            query_gizmo_tool_name: 'Query current gizmo tool name',
            query_gizmo_view_mode: 'Query view mode (view/select)',
            query_gizmo_pivot: 'Query current gizmo pivot name',
            query_gizmo_coordinate: 'Query current gizmo coordinate name',
            query_is2D: 'Query current view mode(2D/3D)',
            focus_camera: 'Focus editor camera to nodes',
            align_with_view: 'Apply the scene camera position and Angle to the selected node',
            align_view_with_node: 'Applies the selected node position and Angle to the current view',
            // broadcast
            scene_ready: 'Message when scene is opened',
            scene_close: 'Message when scene is closed',

            UITransform_lack: 'UI node is being added, but the cc.UITransform component is not found in any upper node',
            UITransform_add_to_root: 'Add cc.UITransform component to the root node',
            UITransform_within_canvas: 'Create the Canvas node as the parent node',
            UITransform_cancel: 'Cancel',

            animationComponentCollision:
                'Animation controller component, animation component and skeleton animation component cannot coexist.',

            physicsDynamicBodyShape: 'A dynamic rigid body can not have the following collider shapes: Terrain, Plane and Non-Convex Mesh.',

            light_probe_edit_mode_changed: 'LightProbe edit mode changed notification',
            light_probe_bounding_box_edit_mode_changed: 'LightProbe component bounding box edit mode changed notification',
            light_probe_delete_when_editing_probe: 'Currently in probe editing mode The probe node being edited cannot be modified. Please exit probe editing mode and try again.',

            begin_recording: 'Begin node recording for undo',
            end_recording: 'End node recording for undo',
            cancel_recording: 'Cancel node recording for undo',

            // prefab
            create_prefab: 'Create prefab asset(record undo automatically)',
            apply_prefab: 'Apply modification to prefab asset(record undo automatically)',
            restore_prefab: 'Restore prefab node form asset(record undo automatically)',
            revert_removed_component: 'Revert removed component(record undo automatically)',
            apply_removed_component: 'Apply removed component to prefab asset(record undo automatically)',
        },
        doc: {
            open_scene: `
                - uuid {string} uuid of scene asset`,
            query_classes: `
                @returns {[Object]}
                - extends? {string} filter classes which extend from this class
                `,
            query_components: `
                @returns {[Object]}
                - name {string} name of component
                - path {string} path in menu
                `,
            query_component_has_script: `
                - name class name of script
                
                @returns {boolean} exist or not
                `,
            query_node_tree: `
                - uuid? {string} the uuid of root node, default is scene node
                
                @returns {Object}
                - name {string} name of node or 'scene'
                - active {boolean} active state of node
                - type {string} cc.Scene or cc.Node
                - uuid {string} uuid of node
                - children {[]} children of current node
                - prefab {number} state of prefab, 1: normal, 2: lost resource
                - isScene {boolean} whether it is a scene node
                - components {[Object]} array of component
                    - type {string} type of component
                    - value {string} uuid of component
                    - extends {[string]} array of component inheritance chain
                `,
            query_node_by_asset_uuid: `
                - Query node by asset uuid
                
                @returns {string[]}  uuid of node
                `,
            set_property: `
                - options {SetPropertyOptions}
                    - uuid {string} uuid of the object
                    - path {string} search path of the property
                    - dump {IProperty} the dump data of the property
                `,
            reset_property: `
                - options {SetPropertyOptions}
                    - uuid {string} uuid of the object
                    - path {string} search path of the property
                `,
            // update_property_from_null: `
            // - options {SetPropertyOptions}
            //     - uuid {string} uuid of the object
            //     - path {string} search path of the property
            // `,
            // set_node_and_children_layer: `
            // - options {SetPropertyOptions}
            //     - uuid {string} uuid of the object
            //     - path {string} search path of the property
            //     - dump {IProperty} the dump data of the property
            // `,
            move_array_element: `
                - options {MoveArrayOptions}
                    - uuid {string} uuid of node
                    - path {string} search path of array
                    - target {number} original index of the target item
                    - offset {number} move offset
                
                @returns {boolean} whether it is successful
                `,
            remove_array_element: `
                - options {MoveArrayOptions}
                    - uuid {string} uuid of node
                    - path {string} search path of array
                    - index {number} index of item
                
                @returns {boolean} whether it is successful
                `,
            // select_all_nodes: `
            // - Select all nodes. In different scene modes, the selected node types are different. For example, in Light Probe Editor mode, only Light Probe nodes are selected.

            // @returns {string[]} uuid of nodes
            // `,
            copy_node: `
                - uuids {string | string[]} uuid of node
                
                @returns {string | string[]} uuid of node
                `,
            cut_node: `
                - uuids {string | string[]} uuid of node
                
                @returns {string | string[]} uuid of node
                `,
            duplicate_node: `
                - uuids {string | string[]} uuid of node
                
                @returns {string | string[]} uuid of new node
                `,
            paste_node: `
                - options {PasteNodeOptions}
                    - target {string} uuid of target node
                    - uuids {string | string[]} uuid of node that is copied
                    - keepWorldTransform {boolean} whether to keep the world transform
                
                @returns {string | string[]} uuid of new node
                `,
            set_parent: `
                - options {CutNodeOptions}
                    - parent {string} uuid of parent
                    - uuids {string|string[]} uuid of the node that need to set
                    - keepWorldTransform {boolean} whether to keep the world transform
                
                @returns {string | string[]} uuid of node
                `,
            create_node: `
                - options {CreateNodeOptions}
                    - parent {string} uuid of parent
                    - components? {string[]} component names
                
                    - name? {string} name of node
                    - dump? {INode | IScene} dump data of node
                    - keepWorldTransform? {boolean} whether to keep the world transform
                    - type? {string} asset type
                    - canvasRequired? {boolean} need cc.Canvas or not
                    - unlinkPrefab? {boolean} to be a normal node
                    - assetUuid? {string} uuid of asset, if this value is set, create node from this asset
                
                @returns {string | string[]} uuid of node
                `,
            query_node: `
                - uuid {string} uuid of node

                @returns {Object} dump of node
                `,
            reset_node: `
                - uuid {string} uuid of node

                @returns {boolean} whether it is successful
                `,
            restore_prefab: `
                - uuid {string} uuid of node
                - assetUuid {string} uuid of asset

                @returns {boolean} whether it is successful
                `,
            remove_node: `
                - options {RemoveNodeOptions}
                    - uuid: {string | string[]} uuid of node
                `,
            create_component: `
                - options {CreateComponentOptions}
                    - uuid {string} uuid of node
                    - component {string} classId (cid) (is recommended) or className
                `,
            remove_component: `
                - options {CreateComponentOptions}
                    - uuid {string} uuid of node
                    - component {string} classId (cid) (is recommended) or className
                `,
            reset_component: `
                - options {ResetComponentOptions}
                    - uuid {string} uuid of component
                
                @returns {boolean} whether it is successful
                `,
            execute_component_method: `
                - options {ExecuteComponentMethodOptions}
                    - uuid {string} uuid of component
                    - name {string} name of method
                    - args {any[]} arguments
                `,
            execute_scene_script: `
                - options {ExecuteSceneScriptMethodsOptions}
                    - name {string} name of extension
                    - method {string} name of method
                    - args {any[]} arguments
                `,
            query_component: `
                - uuid {string} uuid of component

                @returns {Object} dump of component
                `,
            change_gizmo_tool: `
                - name {string} tool name 'position' | 'rotation' | 'scale' | 'rect'
                `,
            change_gizmo_pivot: `
                - name {string} pivot name 'pivot' | 'center'
                `,
            change_gizmo_coordinate: `
                - type {string} coordinate name 'local' | 'global'
                `,
            change_is2D: `
                - is2D {boolean} 2D/3D view
                `,
            set_grid_visible: `
                - visible {boolean} show/hide grid
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
                - size {number} size of IconGizmo
                `,
            query_icon_gizmo_size: `
                @returns {number} size of IconGizmo
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
                - uuids {string[] | null} uuid of node
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
                - mode {boolean} light probe edit mode after changed
                `,

            light_probe_bounding_box_edit_mode_changed: `
                - mode {boolean} light probe component bounding box edit mode after changed
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
await Editor.Message.request('scene', 'change-gizmo-pivot');
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