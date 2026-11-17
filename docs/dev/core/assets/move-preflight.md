# 资源移动预检

`preflightMoveAsset(source, target)` 检查一次资源移动，返回冲突信息和单次使用的 token，不修改文件或预留目标。CLI 负责路径、命名、状态校验和移动；调用方负责提示用户及批量处理策略。

## 调用流程

`source` 接受主资源的 UUID、Asset DB URL 或绝对路径；`target` 接受 Asset DB URL 或绝对路径，其父目录必须存在于可写、已启用的 Asset DB 内。不能移动或覆盖挂载根，也不能把资源移入或覆盖自身。

预检返回两种结果：

- `action: 'move'`：目标名称未被占用，可携带 token 提交。
- `action: 'choose-conflict-handling'`：调用方让用户选择覆盖、自动重命名或取消。取消时不调用 `moveAsset()`。

```ts
const preflight = await assets.preflightMoveAsset(source, target);
const choice = preflight.action === 'choose-conflict-handling'
    ? await chooseConflictHandling(preflight.conflict)
    : undefined;

if (choice !== 'cancel') {
    const moved = await assets.moveAsset(source, target, {
        preflightToken: preflight.preflightToken,
        overwrite: choice === 'overwrite',
        rename: choice === 'rename',
    });
    // Use moved.uuid and moved.url for the actual resource and final name.
}
```

批量移动应逐项完成“预检 → 用户选择 → 提交”，再处理下一项，避免后续预检依据已经过期。

## Token 与重试

- token 绑定本次请求、资源身份、挂载和文件系统状态，只能使用一次，提交失败后也不能复用。
- 预检提供乐观校验，不是文件系统锁。提交时及等待 Animation Graph 写入后会重新检查；目录内变化、挂载替换或项目关闭等情况可能使提交失效。
- 状态失效后必须重新预检，并重新进行所需的用户确认，不能自动重放上一次覆盖决定。
- 目标被导入任务预留，或路径不受支持时，返回错误；这些情况不能通过选择覆盖或重命名解决。

## 路径支持范围

| 场景 | 行为 |
| --- | --- |
| 普通索引路径；已注册挂载根或其上级经过 symlink | 支持，以挂载根解析后的路径作为判断基准 |
| 源资源是有效的文件 symlink | 支持，移动链接条目 |
| 目标是 symlink，包括悬空链接 | 可覆盖链接条目，但不能存在需要协调的 alias 子项索引 |
| 挂载根内额外的父目录 alias；受影响资源存在混合 alias 索引 | 预检拒绝，不修改文件、metadata 或索引 |
| 源资源是目录 symlink；源或目标目录子树内包含目录链接 | 预检拒绝，避免移动后的刷新跟随链接并改写其指向资源的 metadata |

本功能不提供跨 alias 的资源身份协调。支持范围会在提交、等待写入后及自动命名的实际目标上再次检查。

## 覆盖、返回值与失败

- 名称占用包含资源本体、`.meta` 和悬空 symlink。只有 metadata 占用目标时，冲突信息中的 `targetIsDirectory` 为 `null`。自动命名会避开这些条目。
- 覆盖会整体替换目标目录，不合并内容；移动保留源 UUID 和子资源 metadata。
- 成功返回最终 `IAssetInfo`。调用方应使用返回的 UUID 和 URL，不自行推导自动命名后的路径。
- 不支持的路径和失效 token 会在写入前被拒绝。其他失败可能发生在文件移动或数据库刷新阶段，不能将所有异常都理解为磁盘未变化。
- 写入失败时会尝试恢复；无法安全恢复时保留恢复数据，并在错误中报告相关位置。调用方应展示错误，避免自动重试覆盖。

上述预检限制适用于 preflight/token 调用流程。既有不传 token 的 `moveAsset()` 调用仍可用；`preflightToken` 仅属于移动选项 `AssetMoveOptions`。lib 接口与 `assets-preflight-move-asset` 工具提供相同的预检信息。
