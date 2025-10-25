
# Scene 模块文档

Scene 模块负责处理 Cocos Creator 项目中的场景相关操作，包括场景管理、节点操作、组件管理等功能。

## 什么是 Scene 模块？

Scene 模块采用**双进程架构**：
- **主进程**: 提供 API 接口，与其他模块交互
- **场景进程**: 独立处理场景操作，避免阻塞主进程

两个进程通过 RPC 通信，确保操作的稳定性和性能。

## 主要功能

### 🎬 场景管理
- 打开/关闭场景
- 创建新场景
- 保存场景
- 场景重载

### 🎯 节点操作
- 创建各种类型的节点（精灵、按钮、3D模型等）
- 删除和更新节点
- 查询节点信息

### 🧩 组件管理
- 添加/移除组件
- 修改组件属性

### 📜 脚本管理
- 脚本加载和卸载
- 脚本变更监听


### 2. 服务扩展

如需添加新的服务模块，请按以下步骤操作：

#### 步骤 1: 定义接口

在 `common/` 目录下定义相关接口：

```typescript
// common/my-service.ts
export interface IMyService {
    doSomething(params: any): Promise<any>;
}

export interface IMyServiceEvents {
    'my-event': (data: any) => void;
}
```

#### 步骤 2: 更新模块接口

在 `scene-process/service/interfaces.ts` 中添加新服务：

```typescript
export interface ISceneModule {
    Scene: ISceneService;
    Node: INodeService;
    Component: IComponentService;
    Script: IScriptService;
    MyService: IMyService; // 新增
}
```

#### 步骤 3: 实现服务

在 `scene-process/service/` 目录下创建服务实现：

```typescript
// scene-process/service/my-service.ts
import { register, BaseService } from './core';
import { IMyService, IMyServiceEvents } from '../../common';

@register('MyService')
export class MyService extends BaseService<IMyServiceEvents> implements IMyService {
    async doSomething(params: any): Promise<any> {
        // 实现具体逻辑
        return result;
    }
}
```

#### 步骤 4: 创建代理

在 `main-process/proxy/` 目录下创建代理：

```typescript
// main-process/proxy/my-service-proxy.ts
import { Rpc } from '../rpc';

export const MyServiceProxy = {
    async doSomething(params: any) {
        return await Rpc.request('MyService', 'doSomething', params);
    }
};
```

#### 步骤 5: 更新主入口

在 `main-process/index.ts` 中导出新的代理：

```typescript
export const Scene = {
    ...SceneProxy,
    ...NodeProxy,
    ...ComponentProxy,
    ...ScriptProxy,
    ...MyServiceProxy, // 新增
    worker: sceneWorker,
};
```

### 4. 测试

为新功能添加测试用例：

```typescript
// test/my-service.test.ts
import { Scene } from '../index';

describe('MyService', () => {
    test('should do something', async () => {
        const result = await Scene.doSomething({ param: 'value' });
        expect(result).toBeDefined();
    });
});
```

运行测试：

```bash
npm run test engine
```
