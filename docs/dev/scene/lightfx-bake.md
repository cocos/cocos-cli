# Light Probe 与 Lightmap 烘焙

## 功能概览

Cocos CLI 通过 Creator 随附的 LightFX 工具提供离线光照烘焙能力：

- Light Probe：计算场景内所有有效光照探针的球谐光照系数，并写回场景。
- Lightmap：为静态 Mesh 和 Terrain 生成 Lightmap，导入 Asset DB 并绑定到组件。
- 清理：解除 Light Probe 或 Lightmap 的烘焙结果，可选择保存场景及删除 Lightmap 资产。
- 取消：终止当前正在运行的 LightFX 任务。

MCP API 只负责参数校验和结果封装。场景数据读取、LightFX 调用、结果绑定、Undo、保存和回滚均在 scene-process 服务中完成。Light Probe 与 Lightmap 共享场景导出、二进制协议、进程管理和临时目录管理。

## 使用前提

1. 使用 CLI 打开一个已保存的 `.scene` 资产；不支持未保存场景和 prefab。
2. Light Probe 烘焙前，场景中需要至少 4 个已生成的有效探针。
3. Lightmap 烘焙前，需要在 MeshRenderer、SkinnedMeshRenderer 或 Terrain 上配置有效的烘焙设置。
4. 同一时间只允许运行一个 LightFX 烘焙任务。
5. LightFX 在 Node scene-process 中执行，不要求打开浏览器 `/scene-editor/`，也不依赖 WebGL 场景渲染器。

## MCP 工具

### 烘焙 Light Probe

工具名：`scene-bake-light-probes`

```json
{
  "options": {
    "giScale": 8,
    "giSamples": 4096,
    "bounces": 1,
    "saveScene": true,
    "timeoutMs": 600000
  }
}
```

参数：

| 参数 | 范围 | 默认行为 |
| --- | --- | --- |
| `giScale` | 0–100 | 使用场景 `lightProbeInfo.giScale` |
| `giSamples` | 64–65535，整数 | 使用场景 `lightProbeInfo.giSamples` |
| `bounces` | 1–4，整数 | 使用场景 `lightProbeInfo.bounces` |
| `saveScene` | boolean | `true` |
| `timeoutMs` | 1000–3600000 ms | 600000 ms |

这些覆盖参数只影响本次烘焙，不会修改 LightProbeInfo 的持久化配置。`reduceRinging`、`showWireframe`、`showConvex` 和探针显示尺寸不参与 LightFX 计算，因此不属于该接口参数。

成功返回示例：

```json
{
  "result": {
    "code": 200,
    "data": {
      "sceneUrl": "db://assets/LightProbe.scene",
      "probeCount": 125,
      "giScale": 8,
      "giSamples": 4096,
      "bounces": 1,
      "durationMs": 1630
    }
  }
}
```

### 清理 Light Probe

工具名：`scene-clear-light-probes`

```json
{
  "options": {
    "saveScene": true
  }
}
```

该操作清除当前场景全部探针的烘焙结果，通知引擎刷新，并作为一次 Undo 操作记录。成功结果中的 `probeCount` 表示处理的探针数量。

### 烘焙 Lightmap

工具名：`scene-bake-lightmap`

```json
{
  "options": {
    "msaa": 4,
    "resolution": 1024,
    "filter": true,
    "highp": false,
    "giScale": 1,
    "giSamples": 25,
    "giPathLength": 4,
    "aoLevel": 0,
    "aoStrength": 0.5,
    "aoRadius": 1,
    "aoColor": [136, 136, 136, 255],
    "threads": 1,
    "saveScene": true,
    "timeoutMs": 600000
  }
}
```

参数：

| 参数 | 范围 | CLI 默认值 |
| --- | --- | --- |
| `msaa` | 1、2、4、8 | 4 |
| `resolution` | 128–8192，整数 | 1024 |
| `filter` | boolean | `true` |
| `highp` | boolean | `false` |
| `giScale` | 0–100 | 1 |
| `giSamples` | 1–65535，整数 | 25 |
| `giPathLength` | 1–64，整数 | 4 |
| `aoLevel` | 0–2，整数 | 0 |
| `aoStrength` | ≥ 0 | 0.5 |
| `aoRadius` | ≥ 0 | 1 |
| `aoColor` | 3 个 RGB 值及可选 Alpha，单项 0–255 | `[136, 136, 136]` |
| `threads` | 1–256，整数 | 1 |
| `saveScene` | boolean | `true` |
| `timeoutMs` | 1000–3600000 ms | 600000 ms |

未传入的参数使用 CLI 默认值。参数只影响本次烘焙，不写回 Creator 的 Lightmap 面板配置。

成功返回示例：

```json
{
  "result": {
    "code": 200,
    "data": {
      "sceneUrl": "db://assets/LightProbe.scene",
      "textureUrls": [
        "db://assets/LightProbe/lightmap/LFX_Mesh_0000.png",
        "db://assets/LightProbe/lightmap/LFX_Terrain_0000.png"
      ],
      "meshCount": 7,
      "terrainCount": 1,
      "durationMs": 4668
    }
  }
}
```

### 清理 Lightmap

工具名：`scene-clear-lightmap`

只解除场景绑定并保留贴图：

```json
{
  "options": {
    "saveScene": true,
    "deleteAssets": false
  }
}
```

解除绑定并删除当前场景生成的 Lightmap 目录：

```json
{
  "options": {
    "saveScene": true,
    "deleteAssets": true
  }
}
```

`saveScene` 默认为 `true`，`deleteAssets` 默认为 `false`。成功结果中的 `clearedCount` 是解除绑定的 Mesh 和 Terrain block 总数。

### 取消烘焙

工具名：`scene-cancel-lightfx-bake`

该工具没有输入参数：

```json
{}
```

成功返回示例：

```json
{
  "result": {
    "code": 200,
    "data": {
      "cancelled": true,
      "target": "lightmap"
    }
  }
}
```

没有任务运行时，返回 `cancelled: false` 和 `target: null`。

## Lightmap 资产规则

Lightmap 统一输出到：

```text
db://assets/<scene-name>/lightmap/
```

典型文件包括：

```text
LFX_Mesh_0000.png
LFX_Terrain_0000.png
```

- Mesh 与 Terrain 使用独立的类型和索引映射，避免两者均从索引 0 开始时串绑贴图。
- 重复烘焙会保留同名贴图的 `.meta`，从而复用 Asset UUID。
- 导入后将 `fixAlphaTransparencyArtifacts` 设置为 `false`，再加载 Texture2D 子资源并绑定。
- 资产导入、组件绑定或场景保存失败时，恢复原贴图目录、组件绑定和场景全局标记。
- 成功、失败、取消和超时都会清理本次 LightFX workspace。

## Creator 互操作说明

CLI 烘焙并保存后，Creator 重新打开场景可以正常加载和显示 Light Probe 与 Lightmap 结果。

Creator Lightmap 面板的“清除”操作依赖该面板自己保存的 `latestLightmapResultDir`。CLI 不写入 Creator 的私有面板状态，因此 Creator 面板可能无法清除 CLI 生成的 Lightmap。请使用 `scene-clear-lightmap` 清理 CLI 烘焙结果。CLI 不伪造 Creator Profile 状态，以避免耦合面板内部实现或误删资源。

## 运行时兼容性

随 Creator 提供的 LightFX 可执行程序使用 Socket.IO 2.x 协议，而 CLI 现有服务使用 Socket.IO 4.x。项目通过 npm alias `socket.io-v2` 提供仅供 LightFX 本地进程桥接使用的 2.3.0 服务：

- 只监听本机随机端口。
- 不替换 MCP 或其他现有 Socket.IO 4.x 服务。
- LightFX 升级并支持 Socket.IO 4.x 后可以移除该兼容依赖。

LightFX 当前可能输出 Creator 历史协议版本。解析器只接受已知兼容版本，并拒绝未知版本、截断数据、非法长度及非有限浮点数。

## 错误与事务

常见错误包括：

- 当前没有打开已保存场景。
- 探针不足、未生成或没有可烘焙 Mesh/Terrain。
- 场景依赖资产缺失。
- LightFX 缺失、启动失败、连接失败、超时或异常退出。
- 输出协议不兼容或结果损坏。
- Asset DB 导入、Texture2D 加载或场景保存失败。
- 已有另一个 LightFX 任务运行。

Bake 和 Clear 都记录为单次 Undo 操作。场景结果提交失败时恢复原组件数据和全局标记；Lightmap 资产提交失败时还会恢复原 PNG 与 `.meta`。

## 验证范围

当前实现已经验证：

- Light Probe Bake/Clear，包含 SH 数据保存和重新加载。
- Mesh Lightmap Bake/Clear。
- Terrain Lightmap Bake/Clear。
- Mesh 与 Terrain 混合场景的独立贴图绑定。
- 重复烘焙的 `.meta` 与 UUID 复用。
- TypeScript 编译、ESLint、API、协议和资产事务测试。

新增材质类型、灯光类型、LightFX 版本或目标平台时，应补充对应真实场景回归。
