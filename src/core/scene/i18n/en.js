'use strict';

module.exports = {

    ...require('./en/node'),

    title: 'Scene',
    description: 'Cocos Creator Scene Editor',
    preview_title: 'Preview',
    dock: 'DOCK',

    project_2d_name: '2D Project',
    project_2d_tooltip:
        'Current Project is type of 2D Project.<br>If you want to switch the current project to a 3D project, <br>check "Basic 3D Features" module checkbox from the menu: <br>Project / Project Settings / Feature Cropping',

    new: 'New Scene',
    save: 'Save Scene',
    save_as: 'Save As',
    align_with_view: 'Align Node with Scene View',
    align_view_with_node: 'Align Scene View with Node',

    is3DValueWarn: '2D mode is active. This 3D parameter is currently in use. Please check if this aligns with your expectations.',
    distribution: 'Distribute:',
    alignment: 'Align:',

    dragDrop: {
        typeMismatch: 'The types do not match. Please ensure the asset type is the same to perform this action.'
    },

    menu: {
        undo: 'Undo',
        redo: 'Redo',

        // 新建菜单
        newNodeEmpty: 'Empty Node',

        new3dObject: '3D Object',
        new3dCube: 'Cube',
        new3dCylinder: 'Cylinder',
        new3dSphere: 'Sphere',
        new3dCapsule: 'Capsule',
        new3dCone: 'Cone',
        new3dTorus: 'Torus',
        new3dPlane: 'Plane',
        new3dQuad: 'Quad',

        newLightObject: 'Light',
        newLightDirectional: 'Directional Light',
        newLightSphere: 'Sphere Light',
        newLightSpot: 'Spot Light',

        newLightProbe: 'Light Probe Group',
        newReflectionProbe: 'Reflection Probe',

        newCameraObject: 'Camera',
        newTerrain: 'Terrain',

        newEffects: 'Effects',
        newEffectsParticle: 'Particle System',

        newUI: 'UI Component',
        newRenderUI: '2D Object',
        newUICanvas: 'Canvas',
        newUISprite: 'Sprite',
        newUILabel: 'Label',
        newUIButton: 'Button',
        newUIToggle: 'Toggle',
        newUIToggleGroup: 'ToggleGroup',
        newUISlider: 'Slider',
        newUIProgressBar: 'ProgressBar',
        newUIWidget: 'Widget',
        newUIEditBox: 'EditBox',
        newUILayout: 'Layout',
        newUIScrollView: 'ScrollView',
        newUIMask: 'Mask',
        newUIParticle2D: 'ParticleSystem2D',
        newUISpriteSplash: 'SpriteSplash',
        newUIRichText: 'RichText',
        newUITiledMap: 'TiledMap',
        newUIVideoPlayer: 'VideoPlayer',
        newUIWebView: 'WebView',
        newUIPageView: 'PageView',
        newUIGraphics: 'Graphics',

        newSpriteRenderer: 'SpriteRenderer',

        experimental: 'Experimental',

        help_url: 'Help Document',
    },

    develop: 'Open Scene DevTools',
    preview_develop: 'Open Preview DevTools',
    graphical_tools: 'Toggle Graphics Tool',

    terrain: {
        is_create_message: 'You need terrain assets, when you visit terrain editor, do you want to create it?',
        is_create: 'Do you need to create terrain asset?',
        path_unlegal: 'Please limit the saved path to the current project assets path',
        cancel: 'Cancel',
        edit: 'Edit',
        save: 'Save',
        delete: 'Delete',
        abort: 'Abort',
        manage: 'Manage',
        bulge: 'Paint Bulge',
        sunken: 'Paint Sunken',
        smooth: 'Paint Smooth',
        paint: 'Paint',
        sculpt: 'Sculpt',
        select: 'Select',
        noImageData: 'No Data',

        tileSize: 'Tile Size',
        weightMapSize: 'Weight Map Size',
        lightMapSize: 'Light Map Size',
        blockCount: 'Block Count',
        brushSize: 'Brush Size',
        brushStrength: 'Brush Strength',
        brushHeight: 'Brush Height',
        brushMode: 'Brush Mode',
        brushRotation: 'Brush Rotation',
        brushFalloff: 'Brush Falloff',
        brush: 'Brush',
        layer: 'Terrain Layer',
        normalMap: 'Normal Map',
        metallic: 'Metallic',
        roughness: 'Roughness',
        paintTileSize: 'Tile Size',
        index: 'Index',
        layers: 'Layers',
        weight: 'Weight',
    },
    messages: {
        cannot_cut_to_self: 'Can not cut node and paste to isself',
        warning: 'Warning',
        scenario_modified: ' data has been modified.',
        want_to_save: 'Do you want to save data to the file.?',
        save: 'Save',
        dont_save: 'Don\'t save',
        cancel: 'Cancel',
        save_fail: 'Failed to save scene: please limit the saved path to the current project assets path and suffix it with \'.scene\'',
        save_fail_prefab:
            'Failed to save prefab: please limit the saved path to the current project assets path and suffix it with \'.prefab\'',
        save_type_fail: 'New scene save type mismatch',

        confirm: 'Confirm',
        particle_system_2d: {
            export_error:
                'This resource does not support exports outside of the project，please limit the saved path to the current project assets path and suffix it with.plist',
        },
        scene_cache: {
            use_latest_scene:
                'It is found that the scene {url} to be opened has unsaved scene data generated by {time}. Do you want to apply this data?',
            use_last_scene:
                'Failed to open the scene ({url}). The scene data may be damaged. We found the scene has data of the historical cached version ({time}), do you apply it?',
            apply: 'Apply',
            no: 'No',
        },
        not_response: 'Scene Not Response',
        debug_native: 'Open C++ debug tool,debug with attaching process id',
        graphical_tools_not_support: 'Editor preview and native scene does not support graphical tools yet',

        webGLContextLost: {
            message: 'WebGL context of the scene view has been lost. Do you want to reload it to restore the context?',
            title: 'WebGL Context Lost',
            buttons: {
                reload: 'Reload',
                cancel: 'Cancel'
            }
        },

        setInternalCameraParent: 'It is forbidden to modify the parent node of the internal camera node',

        loadSceneTimeoutTips: {
            message: 'Open scene timeout. Do you want to wait?',
            waiting: 'waiting',
            interrupt: 'interrupt'
        }
    },

    save_prefab: 'Save',
    close_prefab: 'Close',
    save_clip: 'Save',
    close_clip: 'Close',

    gizmos: {
        tools_visibility_3d: '3D Tools Visibility',
        icon3d: '3D Icons',
        showGrid: 'Show Grid',
        showOriginAxis: 'Show Origin',
    },
    ui_tools: {
        zoom_up: 'Zoom up',
        zoom_down: 'Zoom down',
        zoom_reset: 'Actual Size',
        align_top: 'Align Top',
        align_v_center: 'Align Vertical Center',
        align_bottom: 'Align Bottom',
        align_left: 'Align Left',
        align_h_center: 'Align Horizontal Center',
        align_right: 'Align Right',
        distribute_top: 'Distribute Top',
        distribute_v_center: 'Distribute Vertical Center',
        distribute_bottom: 'Distribute Bottom',
        distribute_left: 'Distribute Left',
        distribute_h_center: 'Distribute Horizontal Center',
        distribute_right: 'Distribute Right',
    },
    tooltips: {
        view_gizmo: 'Switch between View Mode and Select Objects Mode with shortcut key Q',
        translate_gizmo: 'Move Gizmo, drag gizmo handle to change Node\'s position. (W)',
        rotate_gizmo: 'Rotate Gizmo, drag gizmo handle to change Node\'s rotation. (E)',
        scale_gizmo: 'Scale Gizmo, drag gizmo handle to change Node\'s scale. (R)',
        rect_gizmo: 'Rect Gizmo, drag edges or corner points to change Node\'s size and position. (T)',
        local: 'Local',
        local_gizmo: 'Gizmo\'s rotation is relative to the Node\'s.',
        global: 'Global',
        global_gizmo: 'Gizmo\'s rotation stay the same as world space orientation.',
        pivot: 'Pivot',
        pivotTip: 'Position the Gizmo at the actual anchor point of a Node',
        center: 'Center',
        centerTip: 'Position the Gizmo at the center of the object’s rendered bounds.',
        edit_mode: 'Switch 2D/3D Edit Mode. (2)',
        rotationTip3D: 'The degree of rotation in local space.<br>The corresponding scripting API is Node.eulerAngles.',
        rotationTip2D: 'The degree of rotation in counter clockwise.<br>The corresponding scripting API is Node.angle.',
        scaleTip: 'The scaling of this node in local space',
        positionTip: 'Position coordinates in local space',
    },

    increment_snap: {
        title: 'Increment Snap Configuration',
        enable_translate: 'Enable snap when moving',
        enable_rotate: 'Enable snap when rotating',
        enable_scale: 'Enable snap when scaling',
        xyz_together: 'X, Y, and Z all use X value',
    },

    rect_tool_snap: {
        title: 'Rect Tool Snap Configuration',
        enable_snap: 'Enable auto snap',
        threshold: 'Snap threshold',
    },

    scripting: {
        crReport: 'Possible circular-reference in {importer}: when import {imported} from {source}.',
    },

    camera_size: {
        render_target_resolution: 'Render target resolution',
    },

    scene_view: {
        is_scene_light_on: 'If toggle on, all the light in the scene is used, otherwise use a directional light align with editor camera',
    },

    animation: {
        delete_edit_clip_limit: 'Can not remove the animation clip being edited in the animation editing mode',
    },

    debug_view: {
        base_shading: 'Basic Shading',
        shaded: 'Shaded',
        wireframe: 'Wireframe',
        wireframe_on_shaded: 'Wireframe on Shaded',
        performance_info: 'Performance Info',
        overdraw: 'Overdraw',
        mipMap_density: 'MipMap Density',
        UV_density: 'UV Density',
        lightMap_density: 'LightMap Density',
        light_map_uv: 'Light Map UV',
        normalMap: 'Normal Map',

        physics_info: 'Physics Info',
        collision: 'Collision',
        rendering_debug_options: 'Rendering Debug (surface shader only)',
        rendering_single_option: 'Rendering Single Option',
        CSM_layer_coloration: 'CSM Layer Coloration',
        lighting_with_base_color: 'Lighting with Base Color',
        disable_all_single_options: 'Disable All Single Options',
        model_info: 'Model Info',
        vertex_colors: 'Vertex Colors',
        world_normal: 'World Normal',
        world_tangent: 'World Tangent',
        world_position: 'World Position',
        mirrored_normal: 'Mirrored Normal',
        UV0: 'UV0',
        UV1: 'UV1',
        projection_depth_z: 'Projection Depth Z',
        liner_depth_w: 'Liner Depth W',
        front_face_coloration: 'Front Face Coloration',

        material_info: 'Material Info',
        world_space_pixel_normals: 'World Space Pixel Normals',
        world_space_pixel_tangents: 'World Space Pixel Tangents',
        world_space_pixel_binormals: 'World Space Pixel Binormals',
        base_color: 'Base Color',
        diffuse_color: 'Diffuse Color',
        specular_color: 'Specular Color',
        opacity: 'Opacity',
        metallic: 'Metallic',
        roughness: 'Roughness',
        specular_intensity: 'Specular Intensity',
        ior: 'Index of Refractivity',

        lighting_info: 'Lighting Info',
        direct_diffuse: 'Direct Diffuse',
        direct_specular: 'Direct Specular',
        direct_lighting: 'Direct Lighting',
        ambient_diffuse: 'Ambient Diffuse',
        ambient_specular: 'Ambient Specular',
        ambient_lighting: 'Ambient Lighting',
        emissive: 'Emissive',
        light_map: 'Light Map',
        shadows: 'Shadows',
        ambient_occlusion: 'Ambient Occlusion',

        adv_lighting_info: 'Advanced Lighting Info',
        fresnel: 'Fresnel',
        direct_transmit_diffuse: 'Direct Transmittance',
        direct_transmit_specular: 'Direct Refract',
        ambient_transmit_diffuse: 'Ambient Transmittance',
        ambient_transmit_specular: 'Ambient Refract',
        transmit_lighting: 'Transmittance Lighting',
        direct_trt: 'Direct Internal Reflection',
        ambient_trt: 'Ambient Internal Reflection',
        trt_lighting: 'Internal Reflection Lighting',
        tt_lighting: 'Internal Transmit Lighting',

        misc_info: 'Misc Info',
        fog_factor: 'Fog',

        rendering_composite_options: 'Rendering Composite Options',
        enable_all_composite_options: 'Enable All Composite Options',
        lighting: 'Lighting',
        tone_mapping: 'Tone Mapping',
        cammacorrection: 'GammaCorrection',
        transmit_diffuse: 'Transmittance Lighting',
        transmit_specular: 'Refract',
    },

    game_view: {
        edit: 'Edit...',
        design_resolution: 'Design Resolution',
        free_aspect: 'Free Aspect',
        full_screen_tips: 'Fit to current view',
        devtool_invalid: 'preview devtool is available only in editor preview mode',
        ready: 'preview process is ready',
        failed: 'preview process inited failed',
    },

    editor_camera: {
        title: 'Scene Camera',
        fov: 'Fov',
        fovTip: '<div style="font-weight:bold;">fov</div>Field of view of the camera.',
        far: 'Far',
        farTip: '<div style="font-weight:bold;">far</div>Far clipping distance of the camera,<br> should be as small as possible within acceptable range.',
        near: 'Near',
        nearTip: '<div style="font-weight:bold;">near</div>Near clipping distance of the camera,<br> should be as large as possible within acceptable range.',
        color: 'Color',
        colorTip: '<div style="font-weight:bold;">color</div>Clearing color of the camera.',
        wheel: 'Wheel',
        wheelTip: '<div style="font-weight:bold;">wheelSpeed</div>The speed of the camera moving in the scene view.',
        wander: 'Wander',
        wanderTip: '<div style="font-weight:bold;">wanderSpeed</div>The speed at which the camera roams the scene view.',
        enableAcceleration: 'Acceleration',
        enableAccelerationTip: '<div style="font-weight:bold;">enableAcceleration</div>Wander Acceleration. ' +
            'If enabled, editor camera will accelerate over time when moving, <br> otherwise camera will move in a constant speed.',
        aperture: 'Aperture',
        apertureTip: '<div style="font-weight:bold;">aperture</div>Camera aperture, controls the exposure parameter.',
        shutter: 'Shutter',
        shutterTip: '<div style="font-weight:bold;">shutter</div>Camera shutter, controls the exposure parameter.',
        iso: 'Iso',
        isoTip: '<div style="font-weight:bold;">iso</div>Camera ISO, controls the exposure parameter.',

        settings: {
            reset: 'Reset Settings'
        }
    },

    contributions: {
        ...require('./en/contributions/messages'),
        ...require('./en/contributions/preferences'),
        ...require('./en/contributions/console'),
    },

    lod: {
        culled: 'Culled',
    },
    crash: {
        dialog: {
            native_crash: {
                message: 'Native engine is used to improve editor\'s performance. However, we detect multiple scene crashes. Do you want to use Typescript engine for editor instead?',
                switch_to_ts: 'Switch to Typescript engine and restart',
                continue: 'Continue to use native engine',
            },
        },
    },
    disable_in_native_tooltip: 'This function is temporarily unavailable when native engine mode is enabled for the editor',
    ui_prop: {
        array_not_support_multiple: 'Arrays do not support multiple selections',
    },

    shortcut: {
        camera_wander: 'Wandering:',
        wander_speed: 'Speed Up:',
        wander_wheelUp: 'Increase Speed:',
        wander_wheelDown: 'Decrease Speed:',
        vertexSnap: 'Vertex Snap:',
        surfaceSnap: 'Surface Snap:',
    },

    // 属性的右键菜单
    property_contextmenu: {
        copy_property_path: 'Copy Property Path',
        copy_property_value: 'Copy Property Value',
        paste_property_value: 'Paste Property Value',
    },
    multi_scene: {
        title: 'CocosCreator reload',
        tips: 'Changing the multi-scene editing mode requires editor restart. please restart yourself.',
        confirm: 'Confirm',
    },
    multi_tab_contextmenu: {
        locate_resource: 'Locate to the Resource',
        close: 'Close',
        close_to_right: 'Close Scenes to the Right',
        close_others: 'Close Other Scenes',
    },
};
