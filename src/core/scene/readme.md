
# 场景介绍

- [common](common) 通用常量以及接口定义
- [main-process](main-process) 主进程
  - [proxy](main-process/proxy) 代理
    - [node-proxy.ts](main-process/proxy/node-proxy.ts) 发消息请求场景进程对进行节点操作
    - [scene-proxy.ts](main-process/proxy/scene-proxy.ts) 发消息请求场景进程对进行场景操作
    - ....
  - [rpc.ts](main-process/rpc.ts) - 用于与场景进程交互
  - [scene-worker.ts](main-process/scene-worker.ts) 启动场景进程
- [scene-process](scene-process) 场景进程
  - [service](scene-process/service) 具体的操作
    - [decorator.ts](scene-process/service/decorator.ts) 装饰器用于注册服务以及注册需要开发的接口给主进程调用
    - [interfaces.ts](scene-process/service/interfaces.ts) 接口定义，如果新增需要在这里加
    - [node.ts](scene-process/service/node.ts) 节点的操作
    - [scene.ts](scene-process/service/scene.ts) 场景的操作
    - ...
  - [rpc.ts](scene-process/rpc.ts)- 用于与主进程模块交互


# 新增模块

- 在 [common](common) 里面定义接口，可参考 node.ts[node.ts](common/node.ts) 与 scene.ts[scene.ts](common/scene.ts) 定义
- [proxy](main-process/proxy) 新增 proxy 可参考 [node-proxy.ts](main-process/proxy/node-proxy.ts) 与 [scene.ts](common/scene.ts) 定义
- [service](scene-process/service) 新增 service 可参考 [node.ts](scene-process/service/node.ts) 与 [scene.ts](scene-process/service/scene.ts)
    - 需要让 Rpc 识别需要，通过 @register('Scene') + @expose() 去注册，否则 Rpc 是无法识别
    - 需要调用主进程模块
      - 需要在主进程的 [rpc.ts](main-process/rpc.ts) 里面进行添加模块注册，例如 **assetManager** 的注册。
      - 在主进程的 [index.ts](main-process/index.ts)，**IMainModule** 加入注册模块定义。
      - 然后在通过 import { Rpc } from '../rpc'; Rpc.request 与 Rpc.send 去使用。
- [interfaces.ts](scene-process/service/interfaces.ts) 添加新增的模块名与接口
- [test](test)加入单元测试
- 可以通过 npm run test engine 进行单元测试
