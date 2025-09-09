
## 文件夹结构说明

@types - 类型定义
[compiler](compiler) 调用 **@editor/quick-compiler** 与 **@cocos/ccbuild** 去编译引擎 
[modules](modules) 之前适配编辑器的模块，关键是 preload，preload 去加载引擎

## 目前需求：

**quick-compiler** + **ccbuild** 编译 **engine** 后的代码能跑在 node 环境下

## 验证方式

1. cd 到 cocos-cli 目录 npm i 安装
2. tsc 或者 npm run build
3. 修改 engine.test 中的 MOCK_ENGINE_PATH 与 MOCK_PROJECT_PATH 路径
4. npm run test 跑单元测试
5. 查看结果
