import { z } from 'zod';

// 场景名称相关的 scheme
export const SchemeSceneUuid = z.string().describe('场景资源的唯一标识符 UUID');

// 创建组件信息
export const SchemeCreateComponentInfo = z.object({
    uuid: z.string().describe('节点UUID'),
    component: z.string().describe('组件名称'),
}).describe('当前组件的信息');

// 当前组件信息
export const SchemeComponentInfo = z.object({
    uuid: z.string().describe('返回组件的 UUID'),
}).describe('当前组件的信息');


// 移除组件
export const SchemeRemoveComponent = z.object({
    path: z.string().optional().describe('关闭的场景文件路径'),
}).describe('关闭场景操作的结果信息');

// 查询组件
export const SchemeQueryComponent = z.object({
    path: z.string().optional().describe('关闭的场景文件路径'),
}).describe('关闭场景操作的结果信息');




/**
 * 属性数据结构和配置选项
 * 用于描述编辑器中的属性字段，支持多种数据类型和UI控件
 */
export const SchemeProperty: z.ZodTypeAny = z.lazy((): z.ZodTypeAny =>
    z.object({
        value: z.union([
            z.record(z.string(), z.any()),
            z.any()
        ]).describe('属性的当前值，可以是键值对对象或基础类型值'),
        
        default: z.any().optional().describe('属性的默认值'),
        
        values: z.array(z.union([
            z.record(z.string(), z.any()),
            z.any()
        ])).optional().describe('多选节点时的多个属性值数组，用于多选状态显示'),
        
        lock: z.record(z.string(), z.any()).optional().describe('向量属性的锁定状态，如 Vec4 的 x,y,z,w 分量锁定'),
        
        cid: z.string().optional().describe('组件标识符'),
        type: z.string().optional().describe('属性数据类型'),
        
        ui: z.object({
            name: z.string().describe('指定使用的UI组件名称'),
            data: z.any().optional().describe('UI组件的额外配置数据')
        }).optional().describe('自定义UI组件配置'),
        
        readonly: z.boolean().optional().describe('是否只读'),
        visible: z.boolean().optional().describe('是否可见'),
        name: z.string().optional().describe('属性名称'),
        
        elementTypeData: z.lazy(() => SchemeProperty).optional().describe('数组元素类型的数据定义'),
        
        path: z.string().optional().describe('数据的搜索路径，由使用方填充'),
        
        isArray: z.boolean().optional().describe('是否为数组类型'),
        invalid: z.boolean().optional().describe('是否无效属性'),
        extends: z.array(z.string()).optional().describe('继承链'),
        displayName: z.string().optional().describe('界面显示名称'),
        displayOrder: z.number().optional().describe('显示排序'),
        help: z.string().optional().describe('帮助文档URL'),
        
        group: z.object({
            // 根据实际的 IPropertyGroupOptions 结构补充
            name: z.string().optional(),
            style: z.string().optional()
        }).optional().describe('属性分组/Tab配置'),
        
        tooltip: z.string().optional().describe('提示文本'),
        editor: z.any().optional().describe('编辑器相关数据'),
        animatable: z.boolean().optional().describe('是否可在动画中编辑'),
        radioGroup: z.boolean().optional().describe('是否渲染为单选组'),
        
        // Enum 相关
        enumList: z.array(z.any()).optional().describe('枚举类型选项列表'),
        bitmaskList: z.array(z.any()).optional().describe('位掩码选项列表'),
        
        // Number 相关
        min: z.number().optional().describe('数值最小值'),
        max: z.number().optional().describe('数值最大值'),
        step: z.number().optional().describe('数值步进值'),
        slide: z.boolean().optional().describe('是否显示为滑块'),
        unit: z.string().optional().describe('显示单位'),
        radian: z.boolean().optional().describe('是否为角度值'),
        
        // Label 相关
        multiline: z.boolean().optional().describe('字符串是否允许多行'),
        
        optionalTypes: z.array(z.string()).optional().describe('可变类型对象的支持类型列表'),
        
        userData: z.record(z.string(), z.any()).optional().describe('用户透传数据')
        
    }).describe('属性数据结构和编辑器配置选项，用于定义属性的值、UI显示、验证规则等')
);

// 移除组件
export const SchemeSetPropertyOptions = z.object({
    uuid: z.string().describe('组件的 UUID'),
    path: z.string().describe('属性挂载对象的搜索路径'),
    dump: SchemeProperty.describe('关闭的场景文件路径'),
    record: z.boolean().optional().describe('是否记录undo'),
}).describe('关闭场景操作的结果信息');

// 组件值类型定义
export const SchemaComponentValue = z.object({
    enabled: z.any().describe('组件是否启用'),
    uuid: z.string().describe('组件的唯一标识符'),
    name: z.string().describe('组件名称')
}).catchall(z.any()).describe('组件值的完整结构');

export const SchemaComponentDumpInfoResult = z.object({
    value: SchemaComponentValue.describe('组件的值对象'),
    mountedRoot: z.string().optional().describe('组件挂载的根节点路径')
}).describe('组件dump信息');

// 类型导出


export type TSchemeCreateComponentInfo = z.infer<typeof SchemeCreateComponentInfo>;

export type TSchemeSceneUuid = z.infer<typeof SchemeSceneUuid>;
export type TComponentInfo = z.infer<typeof SchemeComponentInfo>;
export type TSetPropertyOptions = z.infer<typeof SchemeSetPropertyOptions>;
export type TComponentDumpInfoResult = z.infer<typeof SchemaComponentDumpInfoResult>;
