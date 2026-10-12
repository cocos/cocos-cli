# 完整宿主模块入口（Draft）

cocos-cli 通过 `src/core/base/native-modules.ts` 获取 gl/sharp。宿主配置 `COCOS_CLI_RUNTIME_PROVIDER` 时，该变量必须是 CommonJS 入口的绝对路径，入口导出：

```javascript
module.exports = {
    version: 1,
    getGl() { return require('gl'); },
    getSharp() { return require('sharp'); },
};
```

入口及其依赖由宿主打包，返回包含 JS 和配套原生绑定的完整 npm 模块。函数按需加载；CLI 不依赖宿主的 node_modules 布局。两边仍需验证 CLI 使用的公共 API 是否兼容。

未配置入口时，CLI 使用自身 gl/sharp，因此独立 Node 和旧宿主路径保留。已配置但路径无效、协议不支持或模块加载失败时，错误直接传播，不回退到自身的原生库。fork 子进程继承环境后各自选择入口，无需 preload；若显式替换 env，须保留该配置。

业务代码统一使用 `getGl()` / `getSharp()`；类型仍可通过 `import type` 引用 npm 包。引擎预加载的 `nodeEnv.sharp` 由调用方注入，避免 cc-module 直接加载另一套依赖。测试会扫描业务源码和 cc-module，阻止直接运行时引用重新出现。

本 Draft 配合 PinK 的完整模块入口评审，不回退 #877，也不修改 rebuild、发布分支、依赖版本或 SDK 下载配置。旧 loader patch 暂时保留。方案接受后再切换统一包流水线并清理旧适配。

验证入口：

```sh
npx tsc --project packages/cc-module/tsconfig.json
npx tsc --project tsconfig.json --noEmit
npx jest --runInBand --runTestsByPath src/core/base/test/native-modules.test.ts src/core/assets/test/image-processing.test.ts src/core/scene/test/reflection-probe-bake-transaction.test.ts
```

正式切换前，还需对完整工程、签名包、实际 utility process、Windows 以及所有交付架构验证；本机加载测试不能替代这些验收。
