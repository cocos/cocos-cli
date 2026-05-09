jest.mock('../../configuration', () => ({
    configurationRegistry: {
        register: jest.fn().mockResolvedValue({ get: jest.fn() }),
    },
    IBaseConfiguration: {},
}));
jest.mock('../../assets', () => ({
    assetManager: {
        queryAssets: jest.fn(() => []),
    },
}));
jest.mock('../../engine/dynamic-metadata', () => ({
    getEngineDynamicConfigContribution: jest.fn(() => ({
        defaults: { includeModules: [], flags: {}, macroConfig: {} },
    })),
    getEngineRenderConfig: jest.fn(() => ({})),
}));
jest.mock('../../engine/metadata', () => ({
    createEngineMetadataNodes: jest.fn(),
}));

import i18n from '../i18n';
import * as path from 'path';

const ENGINE_PATH = path.resolve(__dirname, '../../../../packages/engine');

/**
 * 将嵌套对象扁平化为 dot 分隔的 key-value 对
 * 跳过 __extends__ 等非翻译字段
 */
function flattenObject(obj: Record<string, any>, prefix = ''): Record<string, string> {
    const result: Record<string, string> = {};
    for (const key of Object.keys(obj)) {
        if (key === '__esModule' || key === '__extends__') continue;
        const fullKey = prefix ? `${prefix}.${key}` : key;
        const value = obj[key];
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            Object.assign(result, flattenObject(value, fullKey));
        } else if (typeof value === 'string') {
            result[fullKey] = value;
        }
    }
    return result;
}

describe('i18n 功能测试', () => {
    beforeEach(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
    });

    test('基本翻译功能 - 英文模式', () => {
        i18n.setLanguage('en');

        expect(i18n.t('common.loading')).toBe('Loading...');
        expect(i18n.t('common.success')).toBe('Success');
        expect(i18n.t('common.error')).toBe('Error');
        expect(i18n.t('assets.title')).toBe('Asset Database');
    });

    test('基本翻译功能 - 中文模式', () => {
        i18n.setLanguage('zh');

        expect(i18n.t('common.loading')).toBe('加载中...');
        expect(i18n.t('common.success')).toBe('成功');
        expect(i18n.t('common.error')).toBe('错误');
        expect(i18n.t('assets.title')).toBe('资源数据库');
    });

    test('带参数的翻译 - 英文模式', () => {
        i18n.setLanguage('en');

        const deprecatedTip = i18n.t('assets.deprecated_tip', {
            oldName: 'oldAPI',
            version: '3.0',
            newName: 'newAPI'
        });
        expect(deprecatedTip).toBe('oldAPI has been deprecated in version 3.0, please replace with newAPI');

        const globalReadonlyTip = i18n.t('assets.global_readonly_tip', { name: 'globalVar' });
        expect(globalReadonlyTip).toBe('Global variable globalVar field is already used by asset process and cannot be overwritten, please use other field');
    });

    test('带参数的翻译 - 中文模式', () => {
        i18n.setLanguage('zh');

        const deprecatedTip = i18n.t('assets.deprecated_tip', {
            oldName: 'oldAPI',
            version: '3.0',
            newName: 'newAPI'
        });
        expect(deprecatedTip).toBe('oldAPI 已在 3.0 版本废弃，请更换为 newAPI');

        const globalReadonlyTip = i18n.t('assets.global_readonly_tip', { name: 'globalVar' });
        expect(globalReadonlyTip).toBe('全局变量 globalVar 字段已被资源进程使用，不可重写，请更换其他字段');
    });

    test('不同命名空间的翻译', () => {
        i18n.setLanguage('zh');

        expect(i18n.t('common.loading')).toBe('加载中...');
        expect(i18n.t('assets.title')).toBe('资源数据库');
        expect(i18n.t('assets.description')).toBe('Cocos Creator 资源管理器');
        expect(i18n.t('builder.tasks.sort_asset_bundle')).toBe('查询 Asset Bundle');
    });

    test('不存在的 key 处理', () => {
        expect(i18n.t('nonexistent.key' as any)).toBe('nonexistent.key');
        expect(i18n.t('nonexistent.loading' as any)).toBe('nonexistent.loading');
    });

    test('语言切换功能', () => {
        const testKey = 'common.success';

        i18n.setLanguage('zh');
        expect(i18n._lang).toBe('zh');
        expect(i18n.t(testKey)).toBe('成功');

        i18n.setLanguage('en');
        expect(i18n._lang).toBe('en');
        expect(i18n.t(testKey)).toBe('Success');
    });
});

/**
 * 以下测试通过调用 EngineManager._loadEngineI18n 加载
 * packages/engine/editor/i18n 路径下的实际 .js 文件，
 * 验证所有引擎编辑器多语言 key 均已正确注册
 */
describe('engine editor i18n - _loadEngineI18n 加载测试', () => {
    beforeAll(() => {
        const { Engine } = require('../../engine');
        (Engine as any)._loadEngineI18n(ENGINE_PATH);
    });

    afterAll(() => {
        i18n.setLanguage('en');
    });

    // ========== components 模块 ==========
    describe('components 模块 - 精确值测试', () => {
        test('英文翻译', () => {
            i18n.setLanguage('en');
            expect(i18n.t('ENGINE.components.add_component' as any)).toBe('Add Component');
            expect(i18n.t('ENGINE.components.missScriptTip' as any)).toContain('Script compilation fails');
            expect(i18n.t('ENGINE.components.label.font_style' as any)).toBe('Font Style');
            expect(i18n.t('ENGINE.components.label.font_style_tooltip' as any)).toContain('Bold, Italic, Underline');
            expect(i18n.t('ENGINE.components.layer.confirm_message' as any)).toContain('Do you want to set layer');
            expect(i18n.t('ENGINE.components.layer.change_children' as any)).toBe('Yes, change children');
            expect(i18n.t('ENGINE.components.layer.change_self' as any)).toBe('No, this object only');
            expect(i18n.t('ENGINE.components.lightProbeGroup.generateTip' as any)).toBe('Regenerate probes in the scene');
            expect(i18n.t('ENGINE.components.lightProbeGroup.editTip' as any)).toContain('Toggle the probe editing mode');
            expect(i18n.t('ENGINE.components.blockInputEventsTip' as any)).toContain('block all input events');
            expect(i18n.t('ENGINE.components.lod.applyCameraSizeLessThanMinimum' as any)).toContain('less than its limit');
            expect(i18n.t('ENGINE.components.lod.applyCameraSizeGreaterThanMaximum' as any)).toContain('greater than its limit');
            expect(i18n.t('ENGINE.components.particle_system_2d.sync' as any)).toBe('Sync');
            expect(i18n.t('ENGINE.components.particle_system_2d.sync_tips' as any)).toContain('Synchronize');
            expect(i18n.t('ENGINE.components.particle_system_2d.export' as any)).toBe('Export');
            expect(i18n.t('ENGINE.components.particle_system_2d.export_error' as any)).toContain('does not support exports');
            expect(i18n.t('ENGINE.components.particle_system_2d.export_tips' as any)).toContain('Export custom particle');
            expect(i18n.t('ENGINE.components.safe_area.brief_help' as any)).toContain('safe area');
        });

        test('中文翻译', () => {
            i18n.setLanguage('zh');
            expect(i18n.t('ENGINE.components.add_component' as any)).toBe('添加组件');
            expect(i18n.t('ENGINE.components.label.font_style' as any)).toBe('文本样式');
            expect(i18n.t('ENGINE.components.layer.confirm_message' as any)).toContain('是否连同修改子节点');
            expect(i18n.t('ENGINE.components.layer.change_children' as any)).toBe('连同修改子节点');
            expect(i18n.t('ENGINE.components.layer.change_self' as any)).toBe('只修改节点自身');
            expect(i18n.t('ENGINE.components.lightProbeGroup.generateTip' as any)).toBe('重新生成场景里的探针数据');
            expect(i18n.t('ENGINE.components.lightProbeGroup.editTip' as any)).toContain('探针编辑模式');
            expect(i18n.t('ENGINE.components.blockInputEventsTip' as any)).toContain('拦截所有输入事件');
            expect(i18n.t('ENGINE.components.particle_system_2d.sync' as any)).toBe('同步');
            expect(i18n.t('ENGINE.components.particle_system_2d.export' as any)).toBe('导出');
        });

        test('语言切换', () => {
            i18n.setLanguage('en');
            expect(i18n.t('ENGINE.components.add_component' as any)).toBe('Add Component');
            i18n.setLanguage('zh');
            expect(i18n.t('ENGINE.components.add_component' as any)).toBe('添加组件');
        });
    });

    // ========== animation 模块 ==========
    describe('animation 模块 - 精确值测试', () => {
        test('animation_graph 子类别 - 英文', () => {
            i18n.setLanguage('en');
            expect(i18n.t('ENGINE.animation_graph.pose_graph_node_sub_categories.pose_nodes' as any)).toBe('Pose Nodes');
            expect(i18n.t('ENGINE.animation_graph.pose_graph_node_sub_categories.pose_nodes_blend' as any)).toBe('Blend');
            expect(i18n.t('ENGINE.animation_graph.pose_graph_node_sub_categories.pose_nodes_ik' as any)).toBe('Inverse Kinematic');
            expect(i18n.t('ENGINE.animation_graph.pose_graph_node_sub_categories.pose_nodes_choose' as any)).toBe('Choose');
        });

        test('animation_graph 子类别 - 中文', () => {
            i18n.setLanguage('zh');
            expect(i18n.t('ENGINE.animation_graph.pose_graph_node_sub_categories.pose_nodes' as any)).toBe('姿态结点');
            expect(i18n.t('ENGINE.animation_graph.pose_graph_node_sub_categories.pose_nodes_blend' as any)).toBe('混合');
            expect(i18n.t('ENGINE.animation_graph.pose_graph_node_sub_categories.pose_nodes_ik' as any)).toBe('反向动力学');
            expect(i18n.t('ENGINE.animation_graph.pose_graph_node_sub_categories.pose_nodes_choose' as any)).toBe('选择');
        });

        test('animation_graph 子菜单翻译', () => {
            i18n.setLanguage('en');
            expect(i18n.t('ENGINE.animation_graph.pose_graph_node_sub_menus.play_or_sample_clip_motion' as any)).toBe('Animation Clip');
            expect(i18n.t('ENGINE.animation_graph.pose_graph_node_sub_menus.play_or_sample_animation_blend_1d' as any)).toBe('Animation Blend 1D');
            expect(i18n.t('ENGINE.animation_graph.pose_graph_node_sub_menus.play_or_sample_animation_blend_2d' as any)).toBe('Animation Blend 2D');

            i18n.setLanguage('zh');
            expect(i18n.t('ENGINE.animation_graph.pose_graph_node_sub_menus.play_or_sample_clip_motion' as any)).toBe('动画剪辑');
            expect(i18n.t('ENGINE.animation_graph.pose_graph_node_sub_menus.play_or_sample_animation_blend_1d' as any)).toBe('一维动画混合');
            expect(i18n.t('ENGINE.animation_graph.pose_graph_node_sub_menus.play_or_sample_animation_blend_2d' as any)).toBe('二维动画混合');
        });

        test('Animation 组件属性 - 英文', () => {
            i18n.setLanguage('en');
            expect(i18n.t('ENGINE.classes.cc.Animation.properties.clips.displayName' as any)).toBe('Clips');
            expect(i18n.t('ENGINE.classes.cc.Animation.properties.clips.tooltip' as any)).toBe('All clips this component governs.');
            expect(i18n.t('ENGINE.classes.cc.Animation.properties.defaultClip.displayName' as any)).toBe('Default Clip');
            expect(i18n.t('ENGINE.classes.cc.Animation.properties.defaultClip.tooltip' as any)).toBe('The default clip to play.');
            expect(i18n.t('ENGINE.classes.cc.Animation.properties.playOnLoad.displayName' as any)).toBe('Play On Load');
        });

        test('Animation 组件属性 - 中文', () => {
            i18n.setLanguage('zh');
            expect(i18n.t('ENGINE.classes.cc.Animation.properties.clips.displayName' as any)).toBe('剪辑列表');
            expect(i18n.t('ENGINE.classes.cc.Animation.properties.clips.tooltip' as any)).toBe('此组件管理的所有剪辑。');
            expect(i18n.t('ENGINE.classes.cc.Animation.properties.defaultClip.displayName' as any)).toBe('默认剪辑');
            expect(i18n.t('ENGINE.classes.cc.Animation.properties.playOnLoad.displayName' as any)).toBe('加载后播放');
        });

        test('SkeletalAnimation 属性', () => {
            i18n.setLanguage('en');
            expect(i18n.t('ENGINE.classes.cc.SkeletalAnimation.properties.sockets.displayName' as any)).toBe('Sockets');
            expect(i18n.t('ENGINE.classes.cc.SkeletalAnimation.properties.useBakedAnimation.displayName' as any)).toBe('Use Baked Animation');

            i18n.setLanguage('zh');
            expect(i18n.t('ENGINE.classes.cc.SkeletalAnimation.properties.sockets.displayName' as any)).toBe('挂点列表');
            expect(i18n.t('ENGINE.classes.cc.SkeletalAnimation.properties.useBakedAnimation.displayName' as any)).toBe('预烘培动画');
        });

        test('AnimationController 属性', () => {
            i18n.setLanguage('en');
            expect(i18n.t('ENGINE.classes.cc.animation.AnimationController.properties.graph.displayName' as any)).toBe('Graph');

            i18n.setLanguage('zh');
            expect(i18n.t('ENGINE.classes.cc.animation.AnimationController.properties.graph.displayName' as any)).toBe('图');
        });

        test('PoseGraph 节点 displayName', () => {
            i18n.setLanguage('en');
            expect(i18n.t('ENGINE.classes.cc.animation.PoseGraphOutputNode.displayName' as any)).toBe('Output Pose');
            expect(i18n.t('ENGINE.classes.cc.animation.PoseNodePlayMotion.displayName' as any)).toBe('Play Animation');
            expect(i18n.t('ENGINE.classes.cc.animation.PoseNodeSampleMotion.displayName' as any)).toBe('Sample Animation');
            expect(i18n.t('ENGINE.classes.cc.animation.PoseNodeBlendTwoPose.displayName' as any)).toBe('Blend Two Pose');
            expect(i18n.t('ENGINE.classes.cc.animation.PoseNodeFilteringBlend.displayName' as any)).toBe('Filtering Blend');
            expect(i18n.t('ENGINE.classes.cc.animation.PoseNodeAdditivelyBlend.displayName' as any)).toBe('Additively Blend');
            expect(i18n.t('ENGINE.classes.cc.animation.PoseNodeChoosePoseByBoolean.displayName' as any)).toBe('Choose Pose By Boolean');
            expect(i18n.t('ENGINE.classes.cc.animation.PoseNodeChoosePoseByIndex.displayName' as any)).toBe('Choose Pose By Index');
            expect(i18n.t('ENGINE.classes.cc.animation.PoseNodeApplyTransform.displayName' as any)).toBe('Apply Transform');
            expect(i18n.t('ENGINE.classes.cc.animation.PoseNodeCopyTransform.displayName' as any)).toBe('Copy Transform');
            expect(i18n.t('ENGINE.classes.cc.animation.PoseNodeTwoBoneIKSolver.displayName' as any)).toBe('Two Bone IK Solver');
            expect(i18n.t('ENGINE.classes.cc.animation.PVNodeGetVariableBase.displayName' as any)).toBe('Get Variable');
            expect(i18n.t('ENGINE.classes.cc.animation.PoseNodeUseStashedPose.displayName' as any)).toBe('Use Stashed Pose');
            expect(i18n.t('ENGINE.classes.cc.animation.PoseNodeStateMachine.displayName' as any)).toBe('State Machine');
            expect(i18n.t('ENGINE.classes.cc.animation.PoseNodeBlendInProportion.displayName' as any)).toBe('Blend In Proportion');
            expect(i18n.t('ENGINE.classes.cc.animation.PoseNodeSetAuxiliaryCurve.displayName' as any)).toBe('Set Auxiliary Curve');

            i18n.setLanguage('zh');
            expect(i18n.t('ENGINE.classes.cc.animation.PoseGraphOutputNode.displayName' as any)).toBe('输出姿态');
            expect(i18n.t('ENGINE.classes.cc.animation.PoseNodePlayMotion.displayName' as any)).toBe('播放动画');
            expect(i18n.t('ENGINE.classes.cc.animation.PoseNodeSampleMotion.displayName' as any)).toBe('采样动画');
            expect(i18n.t('ENGINE.classes.cc.animation.PoseNodeBlendTwoPose.displayName' as any)).toBe('混合双姿态');
            expect(i18n.t('ENGINE.classes.cc.animation.PoseNodeAdditivelyBlend.displayName' as any)).toBe('叠加混合');
            expect(i18n.t('ENGINE.classes.cc.animation.PoseNodeChoosePoseByBoolean.displayName' as any)).toBe('按布尔选择');
            expect(i18n.t('ENGINE.classes.cc.animation.PoseNodeApplyTransform.displayName' as any)).toBe('应用变换');
            expect(i18n.t('ENGINE.classes.cc.animation.PoseNodeTwoBoneIKSolver.displayName' as any)).toBe('双骨骼 IK 结算器');
        });

        test('PoseGraph 带参数 title 翻译', () => {
            i18n.setLanguage('en');
            expect(i18n.t('ENGINE.classes.cc.animation.PoseNodePlayMotion.title' as any, { motionName: 'Walk' })).toBe('Play Walk');
            expect(i18n.t('ENGINE.classes.cc.animation.PoseNodeSampleMotion.title' as any, { motionName: 'Idle' })).toBe('Sample Idle');
            expect(i18n.t('ENGINE.classes.cc.animation.PoseNodeApplyTransform.title' as any, { nodeName: 'Root' })).toBe('Transform Root');
            expect(i18n.t('ENGINE.classes.cc.animation.PoseNodeTwoBoneIKSolver.title' as any, { endEffectorBoneName: 'Hand_R' })).toBe('Solve Two Bone IK: Hand_R');
            expect(i18n.t('ENGINE.classes.cc.animation.PVNodeGetVariableBase.title' as any, { variableName: 'speed' })).toBe('Variable speed');
            expect(i18n.t('ENGINE.classes.cc.animation.PoseNodeUseStashedPose.title' as any, { stashName: 'base' })).toBe('Use Stash base');

            i18n.setLanguage('zh');
            expect(i18n.t('ENGINE.classes.cc.animation.PoseNodePlayMotion.title' as any, { motionName: '行走' })).toBe('播放 行走');
            expect(i18n.t('ENGINE.classes.cc.animation.PoseNodeSampleMotion.title' as any, { motionName: '待机' })).toBe('采样 待机');
            expect(i18n.t('ENGINE.classes.cc.animation.PoseNodeApplyTransform.title' as any, { nodeName: '根节点' })).toBe('变换 根节点');
            expect(i18n.t('ENGINE.classes.cc.animation.PVNodeGetVariableBase.title' as any, { variableName: '速度' })).toBe('变量 速度');
        });

        test('ClipMotion / MotionSyncInfo 属性', () => {
            i18n.setLanguage('en');
            expect(i18n.t('ENGINE.classes.cc.animation.ClipMotion.properties.clip.displayName' as any)).toBe('Clip');
            expect(i18n.t('ENGINE.classes.cc.animation.MotionSyncInfo.properties.group.displayName' as any)).toBe('Group');
        });
    });

    // ========== assets 模块 ==========
    describe('assets 模块 - 精确值测试', () => {
        test('dialog 翻译', () => {
            i18n.setLanguage('en');
            expect(i18n.t('ENGINE.dialog.confirm' as any)).toBe('Confirm');
            expect(i18n.t('ENGINE.dialog.cancel' as any)).toBe('Cancel');
            expect(i18n.t('ENGINE.dialog.warn' as any)).toBe('Warn');

            i18n.setLanguage('zh');
            expect(i18n.t('ENGINE.dialog.confirm' as any)).toBe('确认');
            expect(i18n.t('ENGINE.dialog.cancel' as any)).toBe('取消');
            expect(i18n.t('ENGINE.dialog.warn' as any)).toBe('警告');
        });

        test('inspector 翻译', () => {
            i18n.setLanguage('en');
            expect(i18n.t('ENGINE.inspector.cloneToEdit' as any)).toBe('Clone it. Use and go into edit.');
            expect(i18n.t('ENGINE.inspector.cloneToDirectoryIllegal' as any)).toContain('current project assets path');
            expect(i18n.t('ENGINE.inspector.preview.header' as any)).toBe('Preview');
            expect(i18n.t('ENGINE.inspector.preview.resetCameraView' as any)).toBe('Reset camera view');
            expect(i18n.t('ENGINE.inspector.preview.viewToggle' as any)).toContain('Toggle');
            expect(i18n.t('ENGINE.inspector.spine.skin' as any)).toBe('Skin');
            expect(i18n.t('ENGINE.inspector.spine.animation' as any)).toBe('Animation');

            i18n.setLanguage('zh');
            expect(i18n.t('ENGINE.inspector.cloneToEdit' as any)).toBe('克隆出新资源，使用并编辑');
            expect(i18n.t('ENGINE.inspector.preview.header' as any)).toBe('预览');
        });

        test('assets 资源操作翻译', () => {
            i18n.setLanguage('en');
            expect(i18n.t('ENGINE.assets.reset' as any)).toBe('Reset');
            expect(i18n.t('ENGINE.assets.save' as any)).toBe('Save');
            expect(i18n.t('ENGINE.assets.newFolder' as any)).toBe('Folder');
            expect(i18n.t('ENGINE.assets.newTypeScript' as any)).toBe('TypeScript');
            expect(i18n.t('ENGINE.assets.newMaterial' as any)).toBe('Material');
            expect(i18n.t('ENGINE.assets.newAnimation' as any)).toBe('Animation Clip');
            expect(i18n.t('ENGINE.assets.newAnimationGraph' as any)).toBe('Animation Graph');
            expect(i18n.t('ENGINE.assets.newAnimationGraphVariant' as any)).toBe('Animation Graph Variant');
            expect(i18n.t('ENGINE.assets.newAnimationMask' as any)).toBe('Animation Mask');
            expect(i18n.t('ENGINE.assets.newPac' as any)).toBe('Auto Atlas');
            expect(i18n.t('ENGINE.assets.newTerrain' as any)).toBe('Terrain');
            expect(i18n.t('ENGINE.assets.multipleWarning' as any)).toContain('Multi-select editing');
            expect(i18n.t('ENGINE.assets.locate_asset' as any)).toContain('Locate');

            i18n.setLanguage('zh');
            expect(i18n.t('ENGINE.assets.reset' as any)).toBe('重置');
            expect(i18n.t('ENGINE.assets.save' as any)).toBe('保存');
            expect(i18n.t('ENGINE.assets.newFolder' as any)).toBe('文件夹');
            expect(i18n.t('ENGINE.assets.newTypeScript' as any)).toBe('脚本 (TypeScript)');
            expect(i18n.t('ENGINE.assets.newMaterial' as any)).toBe('材质');
        });

        test('assets texture 属性翻译', () => {
            i18n.setLanguage('en');
            expect(i18n.t('ENGINE.assets.texture.anisotropy' as any)).toBe('Anisotropy');
            expect(i18n.t('ENGINE.assets.texture.filterMode' as any)).toBe('Filter Mode');
            expect(i18n.t('ENGINE.assets.texture.generateMipmaps' as any)).toBe('Generate Mipmaps');
            expect(i18n.t('ENGINE.assets.texture.wrapMode' as any)).toBe('Wrap Mode');
        });

        test('assets fbx 属性翻译', () => {
            i18n.setLanguage('en');
            expect(i18n.t('ENGINE.assets.fbx.model' as any)).toBe('Model');
            expect(i18n.t('ENGINE.assets.fbx.animation' as any)).toBe('Animation');
            expect(i18n.t('ENGINE.assets.fbx.material' as any)).toBe('Material');
            expect(i18n.t('ENGINE.assets.fbx.GlTFUserData.normals.name' as any)).toBe('Normals');
            expect(i18n.t('ENGINE.assets.fbx.GlTFUserData.tangents.name' as any)).toBe('Tangents');
        });

        test('assets spriteFrame 属性翻译', () => {
            i18n.setLanguage('en');
            expect(i18n.t('ENGINE.assets.spriteFrame.packable' as any)).toBe('Packable');
            expect(i18n.t('ENGINE.assets.spriteFrame.rotated' as any)).toBe('Rotated');
            expect(i18n.t('ENGINE.assets.spriteFrame.borderTop' as any)).toBe('Border Top');
            expect(i18n.t('ENGINE.assets.spriteFrame.meshType' as any)).toBe('Mesh Type');
            expect(i18n.t('ENGINE.assets.spriteFrame.pixelsToUnit' as any)).toBe('Pixels To Unit');
        });

        test('assets image 属性翻译', () => {
            i18n.setLanguage('en');
            expect(i18n.t('ENGINE.assets.image.label' as any)).toBe('Image');
            expect(i18n.t('ENGINE.assets.image.type' as any)).toBe('Type');
            expect(i18n.t('ENGINE.assets.image.flipVertical' as any)).toBe('Flip Vertical');
        });

        test('menu 翻译', () => {
            i18n.setLanguage('en');
            expect(i18n.t('ENGINE.menu.remove_component' as any)).toBe('Remove');
            expect(i18n.t('ENGINE.menu.reset_component' as any)).toBe('Reset');
            expect(i18n.t('ENGINE.menu.move_up_component' as any)).toBe('Move Up');
            expect(i18n.t('ENGINE.menu.move_down_component' as any)).toBe('Move Down');
            expect(i18n.t('ENGINE.menu.copy_component' as any)).toBe('Copy Component');
            expect(i18n.t('ENGINE.menu.paste_component' as any)).toBe('Paste Component As New');
            expect(i18n.t('ENGINE.menu.help_url' as any)).toBe('Help Document');
            expect(i18n.t('ENGINE.menu.copy_property_path' as any)).toBe('Copy Property Path');
            expect(i18n.t('ENGINE.menu.reset_node' as any)).toBe('Reset');

            i18n.setLanguage('zh');
            expect(i18n.t('ENGINE.menu.remove_component' as any)).toBe('删除组件');
            expect(i18n.t('ENGINE.menu.copy_component' as any)).toBe('复制组件');
            expect(i18n.t('ENGINE.menu.paste_component' as any)).toBe('粘贴成为新组件');
            expect(i18n.t('ENGINE.menu.help_url' as any)).toBe('帮助文档');
        });

        test('prefab 翻译', () => {
            i18n.setLanguage('en');
            expect(i18n.t('ENGINE.prefab.edit' as any)).toBe('Edit prefab asset');
            expect(i18n.t('ENGINE.prefab.local' as any)).toBe('Location');
            expect(i18n.t('ENGINE.prefab.reset' as any)).toBe('Reset from prefab');
            expect(i18n.t('ENGINE.prefab.save' as any)).toBe('Update prefab asset');
            expect(i18n.t('ENGINE.prefab.link' as any)).toContain('Connect');
            expect(i18n.t('ENGINE.prefab.unlink' as any)).toBe('Remove Selected');

            i18n.setLanguage('zh');
            expect(i18n.t('ENGINE.prefab.edit' as any)).toBe('编辑资源');
            expect(i18n.t('ENGINE.prefab.local' as any)).toBe('定位资源');
            expect(i18n.t('ENGINE.prefab.reset' as any)).toBe('从资源还原');
            expect(i18n.t('ENGINE.prefab.save' as any)).toBe('更新到资源');
        });
    });

    // ========== localization 模块 ==========
    describe('localization 模块 - 精确值测试', () => {
        test('common 属性翻译', () => {
            i18n.setLanguage('en');
            expect(i18n.t('ENGINE.common.attribute.title' as any)).toContain('Attribute');
            expect(i18n.t('ENGINE.common.attribute.description' as any)).toContain('Description');
        });

        test('TCVariableBinding / TCAuxiliaryCurveBinding 翻译', () => {
            i18n.setLanguage('en');
            expect(i18n.t('ENGINE.classes.cc.animation.TCVariableBinding.menu' as any)).toBe('Variable Binding');
            expect(i18n.t('ENGINE.classes.cc.animation.TCAuxiliaryCurveBinding.menu' as any)).toBe('Auxiliary Curve Binding');
            expect(i18n.t('ENGINE.classes.cc.animation.TCStateWeightBinding.menu' as any)).toBe('State Weight Binding');
            expect(i18n.t('ENGINE.classes.cc.animation.TCStateMotionTimeBinding.menu' as any)).toBe('Motion Time Binding');
        });

        test('CurveRange 翻译', () => {
            i18n.setLanguage('en');
            expect(i18n.t('ENGINE.classes.cc.CurveRange.properties.spline.displayName' as any)).toBe('Spline');
            expect(i18n.t('ENGINE.classes.cc.CurveRange.properties.splineMin.displayName' as any)).toBe('Spline Min');
            expect(i18n.t('ENGINE.classes.cc.CurveRange.properties.splineMax.displayName' as any)).toBe('Spline Max');
        });

        test('ambient / skybox / fog / shadow 翻译', () => {
            i18n.setLanguage('en');
            expect(i18n.t('ENGINE.ambient.skyLightingColor' as any)).toContain('Sky Color');
            expect(i18n.t('ENGINE.ambient.groundLightingColor' as any)).toContain('Ground Color');
            expect(i18n.t('ENGINE.ambient.skyIllum' as any)).toContain('Ambient lighting');
            expect(i18n.t('ENGINE.skybox.enabled' as any)).toContain('skybox rendering');
            expect(i18n.t('ENGINE.skybox.useHDR' as any)).toContain('HDR');
            expect(i18n.t('ENGINE.skybox.envmap' as any)).toContain('skybox texture');
            expect(i18n.t('ENGINE.fog.enabled' as any)).toContain('global fog');
            expect(i18n.t('ENGINE.fog.fogColor' as any)).toContain('In-Scattering');
            expect(i18n.t('ENGINE.fog.fogDensity' as any)).toContain('foggy');
            expect(i18n.t('ENGINE.shadow.enabled' as any)).toContain('real time shadows');
            expect(i18n.t('ENGINE.shadow.shadowMapSize' as any)).toContain('resolutions');
        });

        test('camera 属性翻译', () => {
            i18n.setLanguage('en');
            expect(i18n.t('ENGINE.camera.priority' as any)).toContain('Render priority');
            expect(i18n.t('ENGINE.camera.visibility' as any)).toContain('Visibility mask');
            expect(i18n.t('ENGINE.camera.fov' as any)).toContain('Field of view');
            expect(i18n.t('ENGINE.camera.near' as any)).toContain('Near clipping');
            expect(i18n.t('ENGINE.camera.far' as any)).toContain('Far clipping');
            expect(i18n.t('ENGINE.camera.aperture' as any)).toContain('aperture');
            expect(i18n.t('ENGINE.camera.rect' as any)).toContain('viewport');
        });

        test('lights 属性翻译', () => {
            i18n.setLanguage('en');
            expect(i18n.t('ENGINE.lights.color' as any)).toBe('Color of the light');
            expect(i18n.t('ENGINE.lights.range' as any)).toBe('Range of the light');
            expect(i18n.t('ENGINE.lights.spotAngle' as any)).toContain('Cone angle');
            expect(i18n.t('ENGINE.lights.shadowEnabled' as any)).toContain('real time shadows');
            expect(i18n.t('ENGINE.lights.enableCSM' as any)).toBe('Enable CSM');
        });

        test('animation 相关属性翻译', () => {
            i18n.setLanguage('en');
            expect(i18n.t('ENGINE.animation.default_clip' as any)).toContain('default animation clip');
            expect(i18n.t('ENGINE.animation.clips' as any)).toContain('animation clips');
            expect(i18n.t('ENGINE.animation.play_on_load' as any)).toContain('Automatically play');
        });

        test('audio 属性翻译', () => {
            i18n.setLanguage('en');
            expect(i18n.t('ENGINE.audio.clip' as any)).toContain('AudioClip');
            expect(i18n.t('ENGINE.audio.volume' as any)).toContain('volume');
            expect(i18n.t('ENGINE.audio.loop' as any)).toContain('looping');
            expect(i18n.t('ENGINE.audio.playOnAwake' as any)).toContain('auto-play');
        });

        test('sprite 属性翻译', () => {
            i18n.setLanguage('en');
            expect(i18n.t('ENGINE.sprite.edit_button' as any)).toBe('Edit');
            expect(i18n.t('ENGINE.sprite.fill_type' as any)).toContain('direction of filling');
            expect(i18n.t('ENGINE.sprite.fill_center' as any)).toContain('radial filling');
        });

        test('button 属性翻译', () => {
            i18n.setLanguage('en');
            expect(i18n.t('ENGINE.button.interactable' as any)).toContain('Interactable');
            expect(i18n.t('ENGINE.button.transition' as any)).toContain('Transition');
            expect(i18n.t('ENGINE.button.normal_color' as any)).toBe('Button color');
            expect(i18n.t('ENGINE.button.pressed_color' as any)).toContain('pressed');
        });

        test('canvas 属性翻译', () => {
            i18n.setLanguage('en');
            expect(i18n.t('ENGINE.canvas.camera' as any)).toBe('2D rendering camera');
            expect(i18n.t('ENGINE.canvas.design_resolution' as any)).toContain('resolution');
        });

        test('widget 属性翻译', () => {
            i18n.setLanguage('en');
            expect(i18n.t('ENGINE.widget.align_top' as any)).toContain('Top edge');
            expect(i18n.t('ENGINE.widget.align_bottom' as any)).toContain('Bottom edge');
            expect(i18n.t('ENGINE.widget.align_left' as any)).toContain('Left edge');
            expect(i18n.t('ENGINE.widget.align_right' as any)).toContain('Right edge');
            expect(i18n.t('ENGINE.widget.align_h_center' as any)).toContain('horizontal midpoint');
            expect(i18n.t('ENGINE.widget.align_v_center' as any)).toContain('vertical midpoint');
        });

        test('layout 属性翻译', () => {
            i18n.setLanguage('en');
            expect(i18n.t('ENGINE.layout.layout_type' as any)).toContain('Automatic layout');
            expect(i18n.t('ENGINE.layout.resize_mode' as any)).toContain('Automatic resize');
            expect(i18n.t('ENGINE.layout.padding_left' as any)).toContain('padding');
            expect(i18n.t('ENGINE.layout.space_x' as any)).toContain('horizontal distance');
        });

        test('scrollview 属性翻译', () => {
            i18n.setLanguage('en');
            expect(i18n.t('ENGINE.scrollview.content' as any)).toContain('scrollable');
            expect(i18n.t('ENGINE.scrollview.horizontal' as any)).toBe('Horizontal scroll');
            expect(i18n.t('ENGINE.scrollview.vertical' as any)).toBe('Vertical scroll');
            expect(i18n.t('ENGINE.scrollview.inertia' as any)).toContain('inertia');
        });

        test('pageview 属性翻译', () => {
            i18n.setLanguage('en');
            expect(i18n.t('ENGINE.pageview.direction' as any)).toContain('page view direction');
            expect(i18n.t('ENGINE.pageview.indicator' as any)).toContain('Indicator');
        });

        test('label 相关翻译', () => {
            i18n.setLanguage('en');
            expect(i18n.t('ENGINE.label.horizontal_align_left' as any)).toBe('Align Left');
            expect(i18n.t('ENGINE.label.horizontal_align_center' as any)).toBe('Align Horizontal Center');
            expect(i18n.t('ENGINE.label.vertical_align_top' as any)).toBe('Align Top');
        });

        test('particle_system 属性翻译', () => {
            i18n.setLanguage('en');
            expect(i18n.t('ENGINE.particle_system.preview' as any)).toContain('Play particle');
            expect(i18n.t('ENGINE.particle_system.capacity' as any)).toContain('Maximum particle');
            expect(i18n.t('ENGINE.particle_system.duration' as any)).toBe('Particle duration');
            expect(i18n.t('ENGINE.particle_system.loop' as any)).toBe('Loop animation');
        });

        test('physics2d 属性翻译', () => {
            i18n.setLanguage('en');
            expect(i18n.t('ENGINE.physics2d.rigidbody.type' as any)).toContain('Rigid body type');
            expect(i18n.t('ENGINE.physics2d.rigidbody.bullet' as any)).toContain('fast moving body');
            expect(i18n.t('ENGINE.physics2d.collider.density' as any)).toBe('The density');
            expect(i18n.t('ENGINE.physics2d.collider.friction' as any)).toContain('friction coefficient');
        });

        test('physics3d 属性翻译', () => {
            i18n.setLanguage('en');
            expect(i18n.t('ENGINE.physics3d.rigidbody.type' as any)).toContain('Type of this rigid body');
            expect(i18n.t('ENGINE.physics3d.rigidbody.mass' as any)).toContain('mass');
            expect(i18n.t('ENGINE.physics3d.collider.isTrigger' as any)).toContain('trigger');
            expect(i18n.t('ENGINE.physics3d.collider.center' as any)).toContain('center of the shape');
        });

        test('features 模块标签翻译', () => {
            i18n.setLanguage('en');
            expect(i18n.t('ENGINE.features.core.label' as any)).toBe('Core');
            expect(i18n.t('ENGINE.features.core.description' as any)).toContain('Cocos Creator');
            expect(i18n.t('ENGINE.features.ui.label' as any)).toBe('User Interface');
            expect(i18n.t('ENGINE.features.audio.label' as any)).toBe('Audio');
            expect(i18n.t('ENGINE.features.video.label' as any)).toBe('Video');
            expect(i18n.t('ENGINE.features.animation.label' as any)).toBe('Basic Animation');
            expect(i18n.t('ENGINE.features.skeletal_animation.label' as any)).toBe('Skeletal Animation');
            expect(i18n.t('ENGINE.features.marionette.label' as any)).toBe('Marionette Animation System');
            expect(i18n.t('ENGINE.features.particle.label' as any)).toBe('Particle System');
            expect(i18n.t('ENGINE.features.terrain.label' as any)).toBe('Terrain');
            expect(i18n.t('ENGINE.features.light_probe.label' as any)).toBe('Light Probe');
            expect(i18n.t('ENGINE.features.tween.label' as any)).toBe('Tween');
            expect(i18n.t('ENGINE.features.profiler.label' as any)).toBe('Running Stats');
            expect(i18n.t('ENGINE.features.physics.label' as any)).toBe('Physics System');
            expect(i18n.t('ENGINE.features.physics_builtin.label' as any)).toBe('Builtin Physics System');
            expect(i18n.t('ENGINE.features.physics_cannon.label' as any)).toContain('cannon.js');
            expect(i18n.t('ENGINE.features.physics_ammo.label' as any)).toContain('Bullet');
            expect(i18n.t('ENGINE.features.physics_physx.label' as any)).toContain('PhysX');
            expect(i18n.t('ENGINE.features.base_2d.label' as any)).toBe('Basic 2D Features');
            expect(i18n.t('ENGINE.features.base_3d.label' as any)).toBe('Basic 3D Features');
            expect(i18n.t('ENGINE.features.rich_text.label' as any)).toBe('Rich Text');
            expect(i18n.t('ENGINE.features.mask.label' as any)).toBe('Mask');
            expect(i18n.t('ENGINE.features.spine.label' as any)).toBe('Spine Animation');
            expect(i18n.t('ENGINE.features.dragon_bones.label' as any)).toBe('Dragon Bones');
            expect(i18n.t('ENGINE.features.tiled_map.label' as any)).toBe('Tiled Map');
            expect(i18n.t('ENGINE.features.websocket.label' as any)).toBe('WebSocket');
            expect(i18n.t('ENGINE.features.custom_pipeline.label' as any)).toContain('Render Pipeline');
            expect(i18n.t('ENGINE.features.gfx_webgl.label' as any)).toBe('WebGL');
            expect(i18n.t('ENGINE.features.gfx_webgl2.label' as any)).toBe('WebGL 2.0');
            expect(i18n.t('ENGINE.features.gfx_webgpu.label' as any)).toBe('WebGPU');

            expect(i18n.t('ENGINE.features.categories.2d.label' as any)).toBe('2D');
            expect(i18n.t('ENGINE.features.categories.3d.label' as any)).toBe('3D');
            expect(i18n.t('ENGINE.features.categories.animation.label' as any)).toBe('Animation');
            expect(i18n.t('ENGINE.features.categories.network.label' as any)).toBe('Network');
        });

        test('features flags 翻译', () => {
            i18n.setLanguage('en');
            expect(i18n.t('ENGINE.features.flags.spine.loadManual.label' as any)).toBe('Load Manually');
            expect(i18n.t('ENGINE.features.flags.bullet.loadManual.label' as any)).toBe('Load Manually');
            expect(i18n.t('ENGINE.features.flags.box2d.loadManual.label' as any)).toBe('Load Manually');
            expect(i18n.t('ENGINE.features.flags.physx.loadManual.label' as any)).toBe('Load Manually');
        });

        test('videoplayer / webview 翻译', () => {
            i18n.setLanguage('en');
            expect(i18n.t('ENGINE.videoplayer.clip' as any)).toContain('local video clip');
            expect(i18n.t('ENGINE.videoplayer.volume' as any)).toContain('volume');
            expect(i18n.t('ENGINE.videoplayer.loop' as any)).toContain('played again');
            expect(i18n.t('ENGINE.webview.url' as any)).toContain('URL');
        });

        test('editbox 翻译', () => {
            i18n.setLanguage('en');
            expect(i18n.t('ENGINE.editbox.string' as any)).toContain('initial input text');
            expect(i18n.t('ENGINE.editbox.font_size' as any)).toContain('font size');
            expect(i18n.t('ENGINE.editbox.max_length' as any)).toContain('maximize input');
        });

        test('mask 翻译', () => {
            i18n.setLanguage('en');
            expect(i18n.t('ENGINE.mask.type' as any)).toBe('The mask type');
            expect(i18n.t('ENGINE.mask.inverted' as any)).toContain('Reverse mask');
        });

        test('ui_transform / graphics 翻译', () => {
            i18n.setLanguage('en');
            expect(i18n.t('ENGINE.ui_transform.content_size' as any)).toContain('Size');
            expect(i18n.t('ENGINE.ui_transform.anchor_point' as any)).toContain('Anchor');
            expect(i18n.t('ENGINE.graphics.lineWidth' as any)).toContain('width');
            expect(i18n.t('ENGINE.graphics.strokeColor' as any)).toContain('stroke color');
        });

        test('postprocess / bloom / taa / fsr 翻译', () => {
            i18n.setLanguage('en');
            expect(i18n.t('ENGINE.postprocess.global' as any)).toContain('post process');
            expect(i18n.t('ENGINE.bloom.threshold' as any)).toContain('brightness threshold');
            expect(i18n.t('ENGINE.taa.feedback' as any)).toContain('History frame');
            expect(i18n.t('ENGINE.fsr.sharpness' as any)).toBe('Sharpness');
        });

        test('octree_culling / skin / light_probe 翻译', () => {
            i18n.setLanguage('en');
            expect(i18n.t('ENGINE.octree_culling.enabled' as any)).toContain('octree culling');
            expect(i18n.t('ENGINE.skin.enabled' as any)).toContain('skin scattering');
            expect(i18n.t('ENGINE.light_probe.giScale' as any)).toContain('GI multiplier');
            expect(i18n.t('ENGINE.light_probe.showProbe' as any)).toContain('showing light probe');
        });

        test('localization 中文翻译', () => {
            i18n.setLanguage('zh');
            expect(i18n.t('ENGINE.ambient.skyLightingColor' as any)).toContain('天空颜色');
            expect(i18n.t('ENGINE.camera.priority' as any)).toContain('渲染优先级');
            expect(i18n.t('ENGINE.features.core.label' as any)).toBe('核心功能');
            expect(i18n.t('ENGINE.features.ui.label' as any)).toBe('用户界面');
            expect(i18n.t('ENGINE.features.audio.label' as any)).toBe('音频');
            expect(i18n.t('ENGINE.features.terrain.label' as any)).toBe('地形');
        });
    });

    // ========== modules/physics ==========
    describe('modules/physics - 精确值测试', () => {
        test('PhysicsMaterial 英文', () => {
            i18n.setLanguage('en');
            expect(i18n.t('ENGINE.classes.cc.PhysicsMaterial.properties.friction.displayName' as any)).toBe('Friction');
            expect(i18n.t('ENGINE.classes.cc.PhysicsMaterial.properties.friction.tooltip' as any)).toContain('Friction coefficient');
            expect(i18n.t('ENGINE.classes.cc.PhysicsMaterial.properties.rollingFriction.displayName' as any)).toBe('Rolling Friction');
            expect(i18n.t('ENGINE.classes.cc.PhysicsMaterial.properties.rollingFriction.tooltip' as any)).toContain('Rolling friction coefficient');
            expect(i18n.t('ENGINE.classes.cc.PhysicsMaterial.properties.spinningFriction.displayName' as any)).toBe('Spinning Friction');
            expect(i18n.t('ENGINE.classes.cc.PhysicsMaterial.properties.spinningFriction.tooltip' as any)).toContain('Spinning Friction coefficient');
            expect(i18n.t('ENGINE.classes.cc.PhysicsMaterial.properties.restitution.displayName' as any)).toBe('Restitution');
            expect(i18n.t('ENGINE.classes.cc.PhysicsMaterial.properties.restitution.tooltip' as any)).toContain('Restitution coefficient');
        });

        test('PhysicsMaterial 中文', () => {
            i18n.setLanguage('zh');
            expect(i18n.t('ENGINE.classes.cc.PhysicsMaterial.properties.friction.displayName' as any)).toBe('摩擦系数');
            expect(i18n.t('ENGINE.classes.cc.PhysicsMaterial.properties.rollingFriction.displayName' as any)).toBe('滚动摩擦系数');
            expect(i18n.t('ENGINE.classes.cc.PhysicsMaterial.properties.spinningFriction.displayName' as any)).toBe('自旋摩擦系数');
            expect(i18n.t('ENGINE.classes.cc.PhysicsMaterial.properties.restitution.displayName' as any)).toBe('弹性系数');
        });
    });

    // ========== modules/rendering ==========
    describe('modules/rendering - 精确值测试', () => {
        test('ModelBakeSettings 英文', () => {
            i18n.setLanguage('en');
            expect(i18n.t('ENGINE.classes.cc.ModelBakeSettings.groups.LightMap.displayName' as any)).toBe('Light Map Settings');
            expect(i18n.t('ENGINE.classes.cc.ModelBakeSettings.groups.LightProbe.displayName' as any)).toBe('Light Probe Settings');
            expect(i18n.t('ENGINE.classes.cc.ModelBakeSettings.groups.ReflectionProbe.displayName' as any)).toBe('Reflection Probe Settings');
            expect(i18n.t('ENGINE.classes.cc.ModelBakeSettings.properties.bakeable.displayName' as any)).toBe('Bakeable');
            expect(i18n.t('ENGINE.classes.cc.ModelBakeSettings.properties.castShadow.displayName' as any)).toBe('Cast Shadows');
            expect(i18n.t('ENGINE.classes.cc.ModelBakeSettings.properties.receiveShadow.displayName' as any)).toBe('Receive Shadows');
            expect(i18n.t('ENGINE.classes.cc.ModelBakeSettings.properties.useLightProbe.displayName' as any)).toBe('Use Light Probe');
        });

        test('MeshRenderer 英文', () => {
            i18n.setLanguage('en');
            expect(i18n.t('ENGINE.classes.cc.MeshRenderer.properties.mesh.displayName' as any)).toBe('Mesh');
            expect(i18n.t('ENGINE.classes.cc.MeshRenderer.properties.mesh.tooltip' as any)).toContain('mesh asset');
            expect(i18n.t('ENGINE.classes.cc.MeshRenderer.properties.sharedMaterials.displayName' as any)).toBe('Materials');
        });

        test('SkinnedMeshRenderer 英文', () => {
            i18n.setLanguage('en');
            expect(i18n.t('ENGINE.classes.cc.SkinnedMeshRenderer.properties.skeleton.displayName' as any)).toBe('Skeleton');
            expect(i18n.t('ENGINE.classes.cc.SkinnedMeshRenderer.properties.skeleton.tooltip' as any)).toContain('Skeleton asset');
            expect(i18n.t('ENGINE.classes.cc.SkinnedMeshRenderer.properties.skinningRoot.displayName' as any)).toBe('Skinning Root');
        });

        test('rendering 中文', () => {
            i18n.setLanguage('zh');
            expect(i18n.t('ENGINE.classes.cc.ModelBakeSettings.groups.LightMap.displayName' as any)).toBe('光照贴图设置');
            expect(i18n.t('ENGINE.classes.cc.ModelBakeSettings.groups.LightProbe.displayName' as any)).toBe('光照探针设置');
            expect(i18n.t('ENGINE.classes.cc.ModelBakeSettings.groups.ReflectionProbe.displayName' as any)).toBe('反射探针设置');
            expect(i18n.t('ENGINE.classes.cc.ModelBakeSettings.properties.bakeable.displayName' as any)).toBe('可烘焙');
            expect(i18n.t('ENGINE.classes.cc.ModelBakeSettings.properties.castShadow.displayName' as any)).toBe('投射阴影');
            expect(i18n.t('ENGINE.classes.cc.ModelBakeSettings.properties.receiveShadow.displayName' as any)).toBe('接收阴影');
            expect(i18n.t('ENGINE.classes.cc.ModelBakeSettings.properties.useLightProbe.displayName' as any)).toBe('使用光照探针');
            expect(i18n.t('ENGINE.classes.cc.MeshRenderer.properties.mesh.displayName' as any)).toBe('网格');
            expect(i18n.t('ENGINE.classes.cc.SkinnedMeshRenderer.properties.skeleton.displayName' as any)).toBe('骨骼');
            expect(i18n.t('ENGINE.classes.cc.SkinnedMeshRenderer.properties.skinningRoot.displayName' as any)).toBe('蒙皮根');
        });
    });

    // ========== modules/terrain ==========
    describe('modules/terrain - 精确值测试', () => {
        test('Terrain 英文', () => {
            i18n.setLanguage('en');
            expect(i18n.t('ENGINE.classes.cc.Terrain.properties._asset.tooltip' as any)).toBe('The terrain asset.');
            expect(i18n.t('ENGINE.classes.cc.Terrain.properties.effectAsset.tooltip' as any)).toBe('The terrain effect asset.');
            expect(i18n.t('ENGINE.classes.cc.Terrain.properties.receiveShadow.tooltip' as any)).toBe('Receive shadow.');
            expect(i18n.t('ENGINE.classes.cc.Terrain.properties.useNormalMap.tooltip' as any)).toBe('Use normal map.');
            expect(i18n.t('ENGINE.classes.cc.Terrain.properties.usePBR.tooltip' as any)).toBe('Use pbr material.');
            expect(i18n.t('ENGINE.classes.cc.Terrain.properties.lodEnable.tooltip' as any)).toBe('Enable lod.');
            expect(i18n.t('ENGINE.classes.cc.Terrain.properties.LodBias.tooltip' as any)).toBe('Lod bias.');
        });

        test('Terrain 中文', () => {
            i18n.setLanguage('zh');
            expect(i18n.t('ENGINE.classes.cc.Terrain.properties._asset.tooltip' as any)).toBe('地形所使用的资源。');
            expect(i18n.t('ENGINE.classes.cc.Terrain.properties.effectAsset.tooltip' as any)).toBe('地形特效资源。');
            expect(i18n.t('ENGINE.classes.cc.Terrain.properties.receiveShadow.tooltip' as any)).toBe('是否接受阴影。');
            expect(i18n.t('ENGINE.classes.cc.Terrain.properties.useNormalMap.tooltip' as any)).toBe('是否使用法线贴图。');
            expect(i18n.t('ENGINE.classes.cc.Terrain.properties.usePBR.tooltip' as any)).toBe('是否使用物理材质。');
            expect(i18n.t('ENGINE.classes.cc.Terrain.properties.lodEnable.tooltip' as any)).toBe('是否允许 lod。');
            expect(i18n.t('ENGINE.classes.cc.Terrain.properties.LodBias.tooltip' as any)).toBe('Lod 偏移距离。');
        });
    });

    // ========== modules/ui ==========
    describe('modules/ui - 精确值测试', () => {
        test('UIRenderer 英文', () => {
            i18n.setLanguage('en');
            expect(i18n.t('ENGINE.classes.cc.UIRenderer.properties.customMaterial.displayName' as any)).toBe('Custom Material');
            expect(i18n.t('ENGINE.classes.cc.UIRenderer.properties.customMaterial.tooltip' as any)).toContain('custom material');
            expect(i18n.t('ENGINE.classes.cc.UIRenderer.properties.color.displayName' as any)).toBe('Color');
            expect(i18n.t('ENGINE.classes.cc.UIRenderer.properties.color.tooltip' as any)).toContain('Rendering color');
        });

        test('Label 英文', () => {
            i18n.setLanguage('en');
            expect(i18n.t('ENGINE.classes.cc.Label.properties.string.displayName' as any)).toBe('string');
            expect(i18n.t('ENGINE.classes.cc.Label.properties.string.tooltip' as any)).toContain('label text');
            expect(i18n.t('ENGINE.classes.cc.Label.properties.horizontalAlign.displayName' as any)).toBe('Horizontal Alignment');
            expect(i18n.t('ENGINE.classes.cc.Label.properties.verticalAlign.displayName' as any)).toBe('Vertical Alignment');
            expect(i18n.t('ENGINE.classes.cc.Label.properties.fontSize.displayName' as any)).toBe('Font Size');
            expect(i18n.t('ENGINE.classes.cc.Label.properties.fontSize.tooltip' as any)).toContain('points');
            expect(i18n.t('ENGINE.classes.cc.Label.properties.lineHeight.displayName' as any)).toBe('Line Height');
            expect(i18n.t('ENGINE.classes.cc.Label.properties.overflow.displayName' as any)).toBe('Overflow Processing');
            expect(i18n.t('ENGINE.classes.cc.Label.properties.enableWrapText.displayName' as any)).toBe('Auto Newline');
            expect(i18n.t('ENGINE.classes.cc.Label.properties.useSystemFont.displayName' as any)).toBe('System Fonts');
            expect(i18n.t('ENGINE.classes.cc.Label.properties.font.displayName' as any)).toBe('Font');
            expect(i18n.t('ENGINE.classes.cc.Label.properties.isBold.displayName' as any)).toBe('Bold');
            expect(i18n.t('ENGINE.classes.cc.Label.properties.isItalic.displayName' as any)).toBe('Italic');
            expect(i18n.t('ENGINE.classes.cc.Label.properties.isUnderline.displayName' as any)).toBe('Underline');
            expect(i18n.t('ENGINE.classes.cc.Label.properties.enableOutline.displayName' as any)).toBe('Enable Outline');
            expect(i18n.t('ENGINE.classes.cc.Label.properties.enableShadow.displayName' as any)).toBe('Enable Shadow');
        });

        test('RichText 英文', () => {
            i18n.setLanguage('en');
            expect(i18n.t('ENGINE.classes.cc.RichText.properties.string.displayName' as any)).toBe('string');
            expect(i18n.t('ENGINE.classes.cc.RichText.properties.string.tooltip' as any)).toContain('BBcode');
            expect(i18n.t('ENGINE.classes.cc.RichText.properties.fontSize.displayName' as any)).toBe('Font Size');
            expect(i18n.t('ENGINE.classes.cc.RichText.properties.maxWidth.displayName' as any)).toBe('Max Width');
            expect(i18n.t('ENGINE.classes.cc.RichText.properties.lineHeight.displayName' as any)).toBe('Line Height');
            expect(i18n.t('ENGINE.classes.cc.RichText.properties.handleTouchEvent.displayName' as any)).toBe('Block input events');
        });

        test('Sprite 英文', () => {
            i18n.setLanguage('en');
            expect(i18n.t('ENGINE.classes.cc.Sprite.properties.grayscale.displayName' as any)).toBe('Grayscale');
            expect(i18n.t('ENGINE.classes.cc.Sprite.properties.spriteAtlas.displayName' as any)).toBe('Sprite Atlas');
            expect(i18n.t('ENGINE.classes.cc.Sprite.properties.spriteFrame.displayName' as any)).toBe('Sprite Frame');
            expect(i18n.t('ENGINE.classes.cc.Sprite.properties.type.displayName' as any)).toBe('Type');
            expect(i18n.t('ENGINE.classes.cc.Sprite.properties.sizeMode.displayName' as any)).toBe('Size Mode');
            expect(i18n.t('ENGINE.classes.cc.Sprite.properties.trim.displayName' as any)).toBe('Trim');
        });

        test('UISkew 英文', () => {
            i18n.setLanguage('en');
            expect(i18n.t('ENGINE.classes.cc.UISkew.properties.rotational.displayName' as any)).toContain('Rotational');
            expect(i18n.t('ENGINE.classes.cc.UISkew.properties.skew.displayName' as any)).toContain('Skew');
        });

        test('Spine Skeleton 英文', () => {
            i18n.setLanguage('en');
            expect(i18n.t('ENGINE.classes.sp.Skeleton.properties.skeletonData.displayName' as any)).toBe('SkeletonData');
            expect(i18n.t('ENGINE.classes.sp.Skeleton.properties.loop.displayName' as any)).toBe('Loop');
            expect(i18n.t('ENGINE.classes.sp.Skeleton.properties.timeScale.displayName' as any)).toBe('Time Scale');
            expect(i18n.t('ENGINE.classes.sp.Skeleton.properties.debugSlots.displayName' as any)).toBe('Debug Slots');
            expect(i18n.t('ENGINE.classes.sp.Skeleton.properties.debugBones.displayName' as any)).toBe('Debug Bones');
            expect(i18n.t('ENGINE.classes.sp.Skeleton.properties.debugMesh.displayName' as any)).toBe('Debug Mesh');
        });

        test('UI 中文翻译', () => {
            i18n.setLanguage('zh');
            expect(i18n.t('ENGINE.classes.cc.UIRenderer.properties.customMaterial.displayName' as any)).toBe('自定义材质');
            expect(i18n.t('ENGINE.classes.cc.UIRenderer.properties.color.displayName' as any)).toBe('颜色');
            expect(i18n.t('ENGINE.classes.cc.Label.properties.string.displayName' as any)).toBe('字符串');
            expect(i18n.t('ENGINE.classes.cc.Label.properties.fontSize.displayName' as any)).toBe('字体大小');
            expect(i18n.t('ENGINE.classes.cc.Label.properties.lineHeight.displayName' as any)).toBe('行高');
            expect(i18n.t('ENGINE.classes.cc.Label.properties.isBold.displayName' as any)).toBe('粗体');
            expect(i18n.t('ENGINE.classes.cc.Label.properties.isItalic.displayName' as any)).toBe('斜体');
            expect(i18n.t('ENGINE.classes.cc.Label.properties.isUnderline.displayName' as any)).toBe('下划线');
            expect(i18n.t('ENGINE.classes.cc.Label.properties.enableOutline.displayName' as any)).toBe('启用描边');
            expect(i18n.t('ENGINE.classes.cc.Label.properties.enableShadow.displayName' as any)).toBe('启用阴影');
            expect(i18n.t('ENGINE.classes.cc.RichText.properties.fontSize.displayName' as any)).toBe('字体大小');
            expect(i18n.t('ENGINE.classes.cc.RichText.properties.handleTouchEvent.displayName' as any)).toBe('阻止输入事件');
        });
    });

    // ========== 全量 key 动态覆盖测试 ==========
    describe('全量 key 动态覆盖测试', () => {
        const enSourceFiles = [
            { name: 'en/components.js', file: path.resolve(ENGINE_PATH, 'editor/i18n/en/components.js') },
            { name: 'en/animation.js', file: path.resolve(ENGINE_PATH, 'editor/i18n/en/animation.js') },
            { name: 'en/assets.js', file: path.resolve(ENGINE_PATH, 'editor/i18n/en/assets.js') },
            { name: 'en/localization.js', file: path.resolve(ENGINE_PATH, 'editor/i18n/en/localization.js') },
            { name: 'en/modules/physics.js', file: path.resolve(ENGINE_PATH, 'editor/i18n/en/modules/physics.js') },
            { name: 'en/modules/rendering.js', file: path.resolve(ENGINE_PATH, 'editor/i18n/en/modules/rendering.js') },
            { name: 'en/modules/terrain.js', file: path.resolve(ENGINE_PATH, 'editor/i18n/en/modules/terrain.js') },
            { name: 'en/modules/ui.js', file: path.resolve(ENGINE_PATH, 'editor/i18n/en/modules/ui.js') },
        ];

        const zhSourceFiles = [
            { name: 'zh/components.js', file: path.resolve(ENGINE_PATH, 'editor/i18n/zh/components.js') },
            { name: 'zh/animation.js', file: path.resolve(ENGINE_PATH, 'editor/i18n/zh/animation.js') },
            { name: 'zh/assets.js', file: path.resolve(ENGINE_PATH, 'editor/i18n/zh/assets.js') },
            { name: 'zh/localization.js', file: path.resolve(ENGINE_PATH, 'editor/i18n/zh/localization.js') },
            { name: 'zh/modules/physics.js', file: path.resolve(ENGINE_PATH, 'editor/i18n/zh/modules/physics.js') },
            { name: 'zh/modules/rendering.js', file: path.resolve(ENGINE_PATH, 'editor/i18n/zh/modules/rendering.js') },
            { name: 'zh/modules/terrain.js', file: path.resolve(ENGINE_PATH, 'editor/i18n/zh/modules/terrain.js') },
            { name: 'zh/modules/ui.js', file: path.resolve(ENGINE_PATH, 'editor/i18n/zh/modules/ui.js') },
        ];

        test.each(enSourceFiles)('英文 $name - 所有 key 均已注册', ({ file }) => {
            i18n.setLanguage('en');
            const data = require(file);
            const flat = flattenObject(data, 'ENGINE');
            const failedKeys: string[] = [];
            for (const key of Object.keys(flat)) {
                const result = i18n.t(key as any);
                if (result === key) {
                    failedKeys.push(key);
                }
            }
            expect(failedKeys).toEqual([]);
        });

        test.each(zhSourceFiles)('中文 $name - 所有 key 均已注册', ({ file }) => {
            i18n.setLanguage('zh');
            const data = require(file);
            const flat = flattenObject(data, 'ENGINE');
            const failedKeys: string[] = [];
            for (const key of Object.keys(flat)) {
                const result = i18n.t(key as any);
                if (result === key) {
                    failedKeys.push(key);
                }
            }
            expect(failedKeys).toEqual([]);
        });

        test.each(enSourceFiles)('英文值匹配 $name - 所有翻译值与源文件一致', ({ file }) => {
            i18n.setLanguage('en');
            const data = require(file);
            const flat = flattenObject(data, 'ENGINE');
            const mismatches: { key: string; expected: string; actual: string }[] = [];
            for (const [key, expected] of Object.entries(flat)) {
                const result = i18n.t(key as any);
                if (result !== expected) {
                    mismatches.push({ key, expected, actual: result });
                }
            }
            expect(mismatches).toEqual([]);
        });

        test.each(zhSourceFiles)('中文值匹配 $name - 所有翻译值与源文件一致', ({ file }) => {
            i18n.setLanguage('zh');
            const data = require(file);
            const flat = flattenObject(data, 'ENGINE');
            const mismatches: { key: string; expected: string; actual: string }[] = [];
            for (const [key, expected] of Object.entries(flat)) {
                const result = i18n.t(key as any);
                if (result !== expected) {
                    mismatches.push({ key, expected, actual: result });
                }
            }
            expect(mismatches).toEqual([]);
        });
    });
});

describe('registerLanguagePatch 边界场景测试', () => {
    beforeEach(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
    });

    test('无效参数不应抛出异常', () => {
        expect(() => i18n.registerLanguagePatch('', 'test', { key: 'value' })).not.toThrow();
        expect(() => i18n.registerLanguagePatch('en', 123 as any, { key: 'value' })).not.toThrow();
        expect(() => i18n.registerLanguagePatch('en', 'test', null as any)).not.toThrow();
        expect(() => i18n.registerLanguagePatch('en', 'test', undefined as any)).not.toThrow();
    });

    test('空数据对象不应影响已有翻译', () => {
        i18n.setLanguage('en');
        const beforeValue = i18n.t('common.loading');
        i18n.registerLanguagePatch('en', 'common', {});
        expect(i18n.t('common.loading')).toBe(beforeValue);
    });

    test('重复注册相同 patchPath 应覆盖旧值', () => {
        i18n.setLanguage('en');

        i18n.registerLanguagePatch('en', 'engine.override_test', { greeting: 'Hello' });
        expect(i18n.t('engine.override_test.greeting' as any)).toBe('Hello');

        i18n.registerLanguagePatch('en', 'engine.override_test', { greeting: 'Hi' });
        expect(i18n.t('engine.override_test.greeting' as any)).toBe('Hi');
    });

    test('深层嵌套结构应正确扁平化', () => {
        i18n.setLanguage('en');

        i18n.registerLanguagePatch('en', 'engine.deep', {
            level1: {
                level2: {
                    level3: {
                        level4: {
                            value: 'deep value',
                        },
                    },
                },
            },
        });

        expect(i18n.t('engine.deep.level1.level2.level3.level4.value' as any)).toBe('deep value');
    });

    test('transI18nName 方法测试', () => {
        i18n.setLanguage('en');

        i18n.registerLanguagePatch('en', 'engine.trans_test', { myKey: 'My Translation' });

        expect(i18n.transI18nName('i18n:engine.trans_test.myKey')).toBe('My Translation');
        expect(i18n.transI18nName('plainText')).toBe('plainText');
        expect(i18n.transI18nName('')).toBe('');
    });
});
