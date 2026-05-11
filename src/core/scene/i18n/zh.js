'use strict';

module.exports = {

    ...require('./zh/node'),

    title: '场景编辑器',
    description: 'Cocos Creator 场景编辑器',
    preview_title: '预览',
    dock: '停靠',

    project_2d_name: '2D 项目',
    project_2d_tooltip:
        '当前项目为 2D 项目<br>引擎的 3D 模块将会在构建时剔除，编辑器已屏蔽部分 3D 相关功能。<br>如需切换为 3D 项目，可在菜单：<br>项目 / 项目设置 / 功能裁剪 中勾选 “基础 3D 功能” 模块。',

    new: '新建场景',
    save: '保存场景',
    save_as: '另存为..',
    align_with_view: '将节点对齐到场景视角',
    align_view_with_node: '将场景视角对齐到与节点',

    is3DValueWarn: '正在使用 2D 模式，该 3D 参数正被使用，请检查是否符合你的预期',

    distribution: '分布:',
    alignment: '对齐:',

    dragDrop: {
        typeMismatch: '类型不同，请确保资源类型相同才能执行此操作。'
    },

    menu: {
        undo: '撤销',
        redo: '重做',

        // 新建菜单
        newNodeEmpty: '空节点',

        new3dObject: '3D 对象',
        new3dCube: 'Cube 立方体',
        new3dCylinder: 'Cylinder 圆柱体',
        new3dSphere: 'Sphere 球体',
        new3dCapsule: 'Capsule 胶囊',
        new3dCone: 'Cone 圆锥体',
        new3dTorus: 'Torus 圆环体',
        new3dPlane: 'Plane 平面',
        new3dQuad: 'Quad 四方形',

        newLightObject: '光源',
        newLightDirectional: '平行光',
        newLightSphere: '球面光',
        newLightSpot: '聚光',

        newLightProbe: '光照探针',
        newReflectionProbe: '反射探针',

        newCameraObject: '摄像机',
        newTerrain: '地形',

        newEffects: '特效',
        newEffectsParticle: '粒子系统',

        newUI: 'UI 组件',
        newRenderUI: '2D 对象',
        newUICanvas: 'Canvas（画布）',
        newUISprite: 'Sprite（精灵）',
        newUILabel: 'Label（文本）',
        newUIButton: 'Button（按钮）',
        newUIToggle: 'Toggle（复选按钮）',
        newUIToggleGroup: 'ToggleGroup（单选按钮）',
        newUISlider: 'Slider（滑动器）',
        newUIProgressBar: 'ProgressBar（进度条）',
        newUIWidget: 'Widget（对齐）',
        newUIEditBox: 'EditBox（输入框）',
        newUILayout: 'Layout（布局）',
        newUIScrollView: 'ScrollView（滚动视图）',
        newUIMask: 'Mask（遮罩）',
        newUIParticle2D: 'ParticleSystem2D（粒子）',
        newUISpriteSplash: 'SpriteSplash（单色）',
        newUIRichText: 'RichText（富文本）',
        newUITiledMap: 'TiledMap（地图）',
        newUIVideoPlayer: 'VideoPlayer（播放器）',
        newUIWebView: 'WebView（网页视图）',
        newUIPageView: 'PageView（页面视图）',
        newUIGraphics: 'Graphics（绘图）',

        newSpriteRenderer: 'SpriteRenderer（2D精灵）',

        experimental: '实验性功能',

        help_url: '帮助文档',
    },

    develop: '打开场景调试工具',
    preview_develop: '打开预览调试工具',
    graphical_tools: '开关图形工具',

    terrain: {
        is_create_message: '编辑地形需要有地形资源，是否创建地形资源?',
        is_create: '是否创建地形资源?',
        path_unlegal: '保存路径请限制在当前项目 /assets 路径内',
        cancel: '取消',
        edit: '编辑',
        save: '保存',
        delete: '删除',
        abort: '中止',
        manage: '管理',
        bulge: '雕塑 隆起',
        sunken: '雕塑 凹下',
        smooth: '雕塑 平滑',
        paint: '涂料',
        sculpt: '雕塑',
        select: '选择',
        noImageData: '暂无数据',

        tileSize: '栅格大小',
        weightMapSize: '权重图大小',
        lightMapSize: '光照图大小',
        blockCount: '地形块数量',
        brushSize: '画刷大小',
        brushStrength: '画刷强度',
        brushHeight: '画刷高度',
        brushMode: '画刷模式',
        brushRotation: '画刷旋转',
        brushFalloff: '画刷衰减',
        brush: '画刷',
        layer: '纹理层',
        normalMap: '法线贴图',
        metallic: '金属性',
        roughness: '粗糙度',
        paintTileSize: '平铺大小',
        index: '索引',
        layers: '纹理层',
        weight: '权重图',
    },
    messages: {
        cannot_cut_to_self: '不能将剪切的节点粘贴到自己身上',
        warning: '警告',
        scenario_modified: ' 数据已经修改。',
        want_to_save: '是否要把数据保存到文件？',
        save: '保存',
        dont_save: '不保存',
        cancel: '取消',
        save_fail: '保存场景失败：保存路径请限制在当前项目 /assets 路径内，并以 .scene 作为文件后缀',
        save_fail_prefab: '保存预制件失败：保存路径请限制在当前项目 /assets 路径内，并以 .prefab 作为文件后缀',
        save_type_fail: '新场景保存类型不匹配',

        confirm: '确定',
        particle_system_2d: {
            export_error: '该资源不支持导出到项目外，保存路径请限制在当前项目 /assets 路径内，并以 .plist 作为文件后缀',
        },
        scene_cache: {
            use_latest_scene: '查询到即将打开的场景 {url} 存在 {time} 生成的未被保存的场景数据，是否应用该数据？',
            use_last_scene: '打开 {url} 场景失败，该场景数据可能已经损坏，查询到有历史缓存版本 ({time})的场景数据，是否应用？',
            apply: '应用',
            no: '否',
        },
        not_response: '场景无响应',
        debug_native: '调试原生场景方法:请打开C++调试工具,附加到场景进程后，点击确定',
        graphical_tools_not_support: '编辑器预览和原生场景暂不支持抓帧',

        webGLContextLost: {
            message: '场景视图的 WebGL 上下文已丢失，是否重载场景视图进行恢复？',
            title: 'WebGL 上下文丢失',
            buttons: {
                reload: '重新加载',
                cancel: '取消'
            }
        },

        setInternalCameraParent: '禁止修改内置摄像机节点的父节点',

        loadSceneTimeoutTips: {
            message: '打开场景超时。是否继续等待？',
            waiting: '等待',
            interrupt: '中断'
        }
    },

    save_prefab: '保存',
    close_prefab: '关闭',
    save_clip: '保存',
    close_clip: '关闭',

    gizmos: {
        tools_visibility_3d: '3D工具可见性',
        icon3d: '3D 图标',
        showGrid: '显示网格',
        showOriginAxis: '显示原点',
    },

    ui_tools: {
        zoom_up: '放大',
        zoom_down: '缩小',
        zoom_reset: '按1:1显示',
        align_top: '顶对齐',
        align_v_center: '垂直居中对齐',
        align_bottom: '底对齐',
        align_left: '左对齐',
        align_h_center: '水平居中对齐',
        align_right: '右对齐',
        distribute_top: '按顶分布',
        distribute_v_center: '按垂直居中分布',
        distribute_bottom: '按底分布',
        distribute_left: '按左分布',
        distribute_h_center: '按水平居中分布',
        distribute_right: '按右分布',
    },

    tooltips: {
        view_gizmo: '查看/选择对象工具，使用快捷键 Q 切换模式',
        translate_gizmo: '移动工具，拖拽工具手柄来修改节点的位置 (W)',
        rotate_gizmo: '旋转工具，拖拽工具手柄来修改节点的角度 (E)',
        scale_gizmo: '缩放工具，拖拽工具手柄来修改节点的缩放 (R)',
        rect_gizmo: '矩形变换工具，拖拽四条边或四个顶点，可以同时修改节点的大小和位置 (T)',
        local: '局部坐标',
        local_gizmo: '变换工具中手柄箭头的朝向表示相对于节点的方向',
        global: '世界坐标',
        global_gizmo: '变换工具中手柄箭头的朝向以世界坐标系为准，不会考虑节点的旋转',
        pivot: '锚点',
        pivotTip: '变换工具出现在节点的锚点位置',
        center: '中心点',
        centerTip: '变换工具出现在节点的中心点位置',
        edit_mode: '切换 2D/3D 编辑模式. (2)',
    },

    increment_snap: {
        title: '增量吸附配置',
        enable_translate: '是否启用移动吸附',
        enable_rotate: '是否启用旋转吸附',
        enable_scale: '是否启用缩放吸附',
        xyz_together: 'X Y Z 统一使用 X 值',
    },

    rect_tool_snap: {
        title: '矩形工具吸附配置',
        enable_snap: '启用智能对齐',
        threshold: '吸附检测阈值',
    },

    scripting: {
        crReport: '在 {importer} 中检测到可能的循环引用：从 {source} 导入 {imported} 时。',
    },

    camera_size: {
        render_target_resolution: '渲染输出目标分辨率',
    },

    scene_view: {
        is_scene_light_on: '如果开启，将开启场景中的灯，如果关闭则使用一个和场景相机对齐的平行光',
    },

    editor_camera: {
        title: '场景摄像机',
        fov: '视角大小',
        fovTip: '<div style="font-weight:bold;">fov</div>相机的视角大小。',
        far: '远焦距',
        farTip: '<div style="font-weight:bold;">far</div>相机的远裁剪距离，应在可接受范围内尽量取最小。',
        near: '近焦距',
        nearTip: '<div style="font-weight:bold;">near</div>相机的近裁剪距离，应在可接受范围内尽量取最大。',
        color: '颜色',
        colorTip: '<div style="font-weight:bold;">color</div>相机的颜色缓冲默认值。',
        wheel: '滚轮',
        wheelTip: '<div style="font-weight:bold;">wheelSpeed</div>相机在场景视图移动的速度',
        wander: '漫游',
        wanderTip: '<div style="font-weight:bold;">wanderSpeed</div>相机漫游场景视图的速度。',
        enableAcceleration: '漫游加速',
        enableAccelerationTip: '<div style="font-weight:bold;">enableAcceleration</div>开启后，漫游相机移动速度会随着时间增长, 否则相机会以一个恒定速度移动。',
        aperture: '光圈',
        apertureTip: '<div style="font-weight:bold;">aperture</div>相机光圈，影响相机的曝光参数。',
        shutter: '快门',
        shutterTip: '<div style="font-weight:bold;">shutter</div>相机快门，影响相机的曝光参数。',
        iso: '感光度',
        isoTip: '<div style="font-weight:bold;">iso</div>相机感光度，影响相机的曝光参数。',

        settings: {
            reset: '重置'
        }
    },

    animation: {
        delete_edit_clip_limit: '动画编辑模式下不允许移除或替换正在编辑的动画剪辑',
    },

    debug_view: {
        base_shading: '基础绘制模式',
        shaded: '正常渲染',
        wireframe: '线框',
        wireframe_on_shaded: '正常渲染加线框',
        performance_info: '性能信息',
        overdraw: '几何密度',
        mipMap_density: '贴图密度',
        UV_density: 'UV密度',
        lightMap_density: 'UV密度',
        normalMap: '法线贴图',
        light_map_uv: '光照贴图UV',

        physics_info: '物理信息',
        collision: '碰撞显示',
        rendering_debug_options: '渲染调试 (只支持 surface shader)',
        rendering_single_option: '渲染单项调试',
        CSM_layer_coloration: '级联阴影染色',
        lighting_with_base_color: '光照信息带固有色（纯光照切换）',
        disable_all_single_options: '无单项调试',
        model_info: '模型信息',
        vertex_colors: '顶点色',
        world_normal: '世界空间顶点法线',
        world_tangent: '世界空间顶点切线',
        world_position: '世界空间顶点坐标 ',
        mirrored_normal: '法线镜像',
        UV0: 'UV0',
        UV1: ' UV1',
        projection_depth_z: '投影深度Z',
        liner_depth_w: '线性深度W',
        front_face_coloration: '正反面标记',

        material_info: '材质信息',
        world_space_pixel_normals: '世界空间像素法线',
        world_space_pixel_tangents: '世界空间像素切线',
        world_space_pixel_binormals: '世界空间像素副法线',
        base_color: '固有色',
        diffuse_color: '漫反射颜色',
        specular_color: '镜面反射颜色',
        opacity: '透明度',
        metallic: '金属度',
        roughness: '粗糙度',
        specular_intensity: '镜面反射强度',
        ior: '折射率',

        lighting_info: '光照信息',
        direct_diffuse: '直接光漫反射',
        direct_specular: '直接光镜面反射',
        direct_lighting: '直接光照',
        ambient_diffuse: '环境光漫反射',
        ambient_specular: '环境光镜面反射',
        ambient_lighting: '环境光照',
        emissive: '自发光',
        light_map: '光照贴图',
        shadows: '阴影',
        ambient_occlusion: '环境光遮蔽',

        adv_lighting_info: '高级光照信息',
        fresnel: '菲涅耳',
        direct_transmit_diffuse: '直接透射光',
        direct_transmit_specular: '直接折射光',
        ambient_transmit_diffuse: '环境透射光',
        ambient_transmit_specular: '环境折射光',
        transmit_lighting: '透射光照',
        direct_trt: '直接光内反射',
        ambient_trt: '环境光内反射',
        trt_lighting: '内反射光照',
        tt_lighting: '内透射光照',

        misc_info: '其他信息',
        fog_factor: '雾',

        rendering_composite_options: '渲染组合调试',
        enable_all_composite_options: '全选渲染组合调试组',
        lighting: '光照功能',
        tone_mapping: '色调映射',
        cammacorrection: '伽玛校正',
        transmit_diffuse: '透射光',
        transmit_specular: '折射光',
    },

    game_view: {
        edit: '管理...',
        design_resolution: '设计分辨率',
        free_aspect: '不限比例',
        full_screen_tips: '最佳显示比例',
        devtool_invalid: '预览调试工具仅在编辑器预览下可用',
        ready: '预览环境初始化完毕',
        failed: '预览环境初始化失败，无法预览',
    },

    contributions: {
        ...require('./zh/contributions/messages'),
        ...require('./zh/contributions/preferences'),
        ...require('./zh/contributions/console'),
    },

    lod: {
        culled: '剔除',
    },
    crash: {
        dialog: {
            native_crash: {
                message: '原生场景被用来提高场景的效果和表现，但是检测到多次场景崩溃， 是否尝试切换到typescript引擎？',
                switch_to_ts: '切换并重启',
                continue: '继续使用原生引擎',
            },
        },
    },
    disable_in_native_tooltip: '启用原生引擎模式下该功能暂不可用',

    ui_prop: {
        array_not_support_multiple: '数组暂不支持多选编辑',
    },

    shortcut: {
        camera_wander: '相机漫游：',
        wander_speed: '加速：',
        wander_wheelUp: '提高速度：',
        wander_wheelDown: '减低速度：',
        vertexSnap: '顶点吸附：',
        surfaceSnap: '表面吸附：',
    },
    // 属性右键菜单
    property_contextmenu: {
        copy_property_path: '复制属性路径',
        copy_property_value: '复制值',
        paste_property_value: '粘贴值',
    },
    multi_scene: {
        title: '编辑器重启',
        tips: '修改多场景编辑模式需要重启编辑器，请自行重启',
        confirm: '确认',
    },
    multi_tab_contextmenu: {
        locate_resource: '定位到资源',
        close: '关闭',
        close_to_right: '关闭右侧场景',
        close_others: '关闭其他场景',
    }
};
