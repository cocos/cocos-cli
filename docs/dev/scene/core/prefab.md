# Scene Prefab

Last updated: 2026-06-10

## 背景

Prefab 是 scene 模块里最容易出现时序问题的区域。原因是一个 prefab 操作经常会同时修改两类会被保存下来的数据：

- 场景里的 prefab instance 结构和 `_prefab` metadata。
- prefab asset 文件内容。

这两类数据之间还有异步刷新链路：prefab asset 保存后，asset system 会发送 `asset-change`，`PrefabService.onAssetChanged()` 再触发当前 editor 的 soft reload。soft reload 只是刷新编辑器状态，不是 dirty 判定来源。

dirty 的权威来源仍然是 `Undo.isDirty()`：当前内容和最近一次保存或标记为已保存时相比，是否还有未保存的变更。`node:change` / `component:*` 只用于 hierarchy、inspector、扩展事件刷新，不能作为 dirty 判定依据。

## 这次问题的根因

失败现象是 prefab dirty/undo 集成测试里偶发：

```text
创建预制体资源失败，返回结果为 null
```

直接失败点在 `createPrefabFromNode()`：底层 `createPrefabAssetFromNode()` 返回了 `null`。

从数据流看，真正的问题不是 `revertToPrefab` 自己逻辑错误，而是前一次 `applyPrefabChanges` 保存 prefab asset 后排队的 soft reload 可能晚到，并打断下一次 prefab 操作：

1. `applyPrefabChanges` 保存 prefab asset。
2. asset system 发送 `asset-change`。
3. `PrefabService.onAssetChanged()` 把当前 editor reload 放进 500ms debounce，用来合并短时间内连续到来的 asset change。
4. 下一条 prefab API 已经开始执行，例如 `createPrefabFromNode` / `revertToPrefab`。
5. 上一轮 soft reload 在这条 API 中途执行，重载当前 scene。
6. 正在操作的 node 变成旧对象，原 node 的 parent 可能已经不存在。
7. `replaceNewPrefabAssetWithClearedReference()` 无法把新 prefab root 插回父节点，最终返回 `null`。

所以问题本质是 prefab 修改和 prefab soft reload 没有排好顺序，导致上一轮 reload 能插进下一轮修改中间。

## 当前方案

当前修复不是新增固定 sleep，也不是扩大 `Editor.lock()`。

做法是让 `PrefabSoftReloadScheduler` 明确记录 reload 现在处于什么状态：

- 还没触发的 reload timer。
- 正在执行的 reload promise。
- 等待指定 asset reload 完成的队列。
- 等待 scheduler 空闲的队列。

会修改数据的 Prefab API 执行前，先等待本服务已经排队的 soft reload 完成：

- `createPrefabFromNode`
- `applyPrefabChanges`
- `revertToPrefab`
- `unpackPrefabInstance`
- `unlinkPrefab`

`applyPrefabChanges` 还会判断当前 prefab asset 是否真的影响当前打开的 editor。如果会影响，就先等对应 asset reload 完成，再 capture after snapshot 并 push `PrefabApplyCommand`。

这样可以保证 API 返回时，调用方不会马上读到“刷新到一半”的状态，也能避免上一轮 reload 晚到后打断下一轮修改。

## 为什么不用 `Editor.lock()`

曾经验证过把会修改数据的 prefab API 包在 `Editor.lock()` 里，但这会引入新的互等风险：

- prefab 修改内部会触发 asset save / load。
- asset change 会触发 editor reload。
- editor reload 会等待 editor lock。
- prefab 修改又可能等待 reload 或 asset ready。

结果是 prefab dirty/undo contract 测试从正常十几秒变成 100 秒超时。

因此当前方案只等待 `PrefabSoftReloadScheduler` 自己排队的 reload 完成，不持有全局 editor lock。

## 行为变化

当前改动会让 prefab API 的返回时机更明确：

- 连续 prefab 修改会更串行。
- 如果前一轮 prefab asset change 已经排了 soft reload，后一轮 prefab API 会先等它完成。
- `applyPrefabChanges` 成功返回时，对应 prefab reload 已完成。
- prefab reload 事件仍会发送。
- dirty/undo 语义不变，仍由 undo command 和 `Undo.isDirty()` 决定。

这可能让连续 prefab 操作比旧行为多等一次 debounce 和 reload，但换来的是稳定的场景状态。

## 风险评估

当前风险评估为 4/10，中低风险。

主要风险：

- 时序变化：连续 prefab 修改会更串行。
- 等待变长：如果 soft reload 本身很慢，后续 prefab API 会等待更久。
- 覆盖边界：`waitForIdle()` 只覆盖 `PrefabService` 自己调度的 soft reload，不覆盖其他模块直接调用的 `Editor.reload()`。

主要风险缓解：

- 没有新增硬编码 timeout。
- 没有引入全局 editor lock。
- prefab dirty/undo contract 和 prefab e2e 都覆盖 create/apply/revert/unpack/unlink。

## 后续重构方向

当前方案修的是已知根因：prefab soft reload 与 prefab 修改交错执行。

但 prefab 模块长期仍建议重构。现在相关逻辑分散在：

- `PrefabService`
- `nodeOperation`
- `componentOperation`
- prefab undo commands
- asset change soft reload
- scene dump / prefab dump

后续可以考虑收敛出一个 prefab 编排层，例如 `PrefabMutationCoordinator`，统一负责：

- 修改前后的 snapshot。
- prefab asset save/load。
- soft reload 的保留 undo 历史、等待、取消逻辑。
- 记录 undo command。
- dirty 状态变化。
- asset-change 副作用隔离。

重构目标不是改变 prefab 业务语义，而是把“场景结构变更、asset 内容变更、reload、undo/dirty”放进同一条可验证、可维护的流程里。

## 验证建议

Prefab 或 soft reload 相关改动至少运行：

```bash
npm run build
npm test -- --runTestsByPath src/core/scene/test/prefab-soft-reload.test.ts --runInBand
npm test -- --runTestsByPath src/core/scene/test/scene.test.ts --runInBand --testNamePattern "Prefab dirty/undo contract"
```

较高风险改动需要补跑：

```bash
npm run test:all
```
