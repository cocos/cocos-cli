# LightFX 历史验证记录

以下为整改前的开发与联调记录，仅用于追溯。目录、接口和验收状态以 [当前文档](../lightfx-bake.md) 为准；临时路径不保证仍存在。

## 2026-09-11 最新产品决定与实施顺序

用户已明确不再为普通重烘焙 Undo 保留旧贴图。成功重烘焙应替换并清理旧产物；Clear 后同样不能恢复旧图／UV／效果，节点移动等普通编辑历史和探针 SH 撤销不变。此决定覆盖本文历史版本关于保留所有成功烘焙版本的描述。

当前 `455e8687` 已按场景 UUID 持久记录实际导入的根资产 UUID，Clear 合并当前绑定和已知旧产物，逐项核对引用、删除结果和源文件存在性；不保存历史像素副本，不做项目 GC。

本批补齐成功重烘焙的收尾链路：修改场景前校验 Host 的内部 `lightmapRebakeCleanupVersion === 1` 并读取旧候选；新结果应用、录制和保存确认后，使旧 Lightmap 历史失效（保留本次新结果的 Redo 和普通历史），检查实时剩余引用并清理旧候选。Host 只接受仍持有正确 Bake reservation 且原生已 commit 的 `action:bake` 清理。当前新结果、其他字段／场景／材质引用必须保留。删除失败、引用保留或回应不明时返回包含 `New Lightmap result is saved and retained` 的错误，保留已完成的新结果并明确报告，不再恢复旧内存冒充回滚；不能把它解释成 Bake 没有修改场景。

`saveScene:false` 不授权删除磁盘已保存场景仍依赖的贴图，不隐式保存，也不删除旧产物或固定发布；成功后的旧结果历史仍失效。保存失败／取消／应用失败不触发旧产物清理。下一次成功保存的 Bake 或删除模式 Clear 可重试已记录产物。`31598b0a` 已接入保存后的固定 PNG 发布；`2b13cfce` 已接入原生配套文件发布与清理，真实面板正常主链路已通过，异常与同场景 Creator 对照仍待专项验收。

## Lightmap 资产规则

### 原生配套文件接入（实施前记录）

下一批复用 PNG 的暂存／保存后发布事务：原生完成时将实际 `tmp/lfx.in`、`output/lfx.out` 和存在的 `lfx.log` 导入本轮暂存目录，记录其根 UUID 为独立 auxiliary 成员，不混入贴图预览或纹理数量。保存后发布为 `<根>/tmp/lfx.in`、`<根>/output/lfx.out`、`<根>/lfx.log`。这比延长原生工作目录生命周期更小，commit 仍可按原机制清理工作目录。日志缺失不伪造文件，输入／输出缺失仍按实际失败处理。

成功重烘焙和删除式 Clear 清理已记录的旧配套资产；Bake 排除本次 UUID。配套文件不是 Lightmap 绑定，因此不得忽略当前场景对它的其他引用。删除／移动均核对磁盘、UUID 和元数据，固定目标冲突不覆盖。显式不保存和保存失败不提前删旧产物。复用现有归属文件的可选 auxiliary 字段，读写保留旧格式兼容，损坏字段在修改场景前报错；不扫描项目、不按目录猜归属、不留成功历史副本。新增内部能力位约束新旧 Host 混用；公共 MCP 不扩展新入口。

实现 `2b13cfce`：上述配套文件以独立 auxiliary UUID 记录，与 PNG 同批预检并移动；返回的 textureUrls 只含 PNG。Scene 在无纹理候选时仍执行 Host 清理以支持辅助资产失败重试，Clear 的资产计数包括辅助文件，绑定计数不变。内部能力位为 `lightmapAuxiliaryAssetsVersion:1`。原生输入文件可能引用临时纹理源，此批未承诺把全部纹理源附件发布成可脱离项目重放的输入包；不扩展为原生工程归档器。

先 `tsc -b`／Scene 与 editor-extends 构建，再定点 6 套／144 项、扩展 32 套／535 项通过（`/tmp/pink-native-products-final-tests.log`）；定点 ESLint 无代码错误，保留已有配置告警。覆盖实际文件移动、固定冲突前置拒绝、部分移动失败、辅助字段损坏、回滚保留上轮、同场景其他引用保留和无纹理候选重试。

隔离工程 `/tmp/pink-native-products.SjK8Ju` 由主 agent 准备新 Host 后交全局 ui_verifier 执行真实按钮，证据 `/tmp/codex-ui-verifier.10oRvd`：128 Bake 产生固定 3 PNG＋3 配套文件，256 Bake 替换为 2 PNG＋3 新 UUID 配套文件；无缺图，保存成功。Clear 后这 5 个当前资产及 meta 实际不存在，归属 textures／auxiliary 为空，绑定及 UV 清空，43 点 SH 哈希不变，一次 Undo／Redo 未恢复。主 agent 已复核磁盘／JSON／截图。空目录及目录 meta 保留；旧版无归属历史不扫描删除。未直接查询 Asset DB 旧 UUID 缓存，也未在本批重复关闭重开或注入异常；不把正常主链路扩展为所有边界已验收。既有告警及点击 Clear 时瞬时 Console 计数差异均保留原始证据。

固定贴图发布的最小接入（实施前记录）：继续使用独立临时导入目录完成纹理加载和场景保存；保存确认、旧产物清理完成后，通过 Asset DB 保留 UUID 移动到默认 `db://assets/LightFX/output`，指定 `outputUrl` 时移动到 `<outputUrl>/output`。固定发布由原 Bake reservation 和实际 operation ID 校验，不接受任意外部 UUID。所有目标先检查冲突，逐项移动后核对 UUID、URL 和磁盘源／目标；不覆盖同名资产、不先复用旧 UUID。失败保留已保存的新结果位置，不删除新贴图。只用非递归空目录删除收敛已清空的 `bake-UUID`，其他文件存在时保留。`saveScene:false` 暂不固定发布，保护磁盘旧引用。本批不宣称 `lfx.in/out/log` 配套文件已经对齐。

Lightmap 先按每次烘焙的 operation UUID 导入到独立暂存目录（以下为省略 `outputUrl` 时的模板），这不是成功后保留的历史版本：

```text
db://assets/<scene-name>/lightmap/bake-<operation-uuid>/
```

指定 `outputUrl` 时暂存到 `<outputUrl>/bake-<operation-uuid>/`，例如 `db://assets/烘焙结果 Room A`。选择目录必须已存在且真实路径位于当前项目 assets 内；不接受任意磁盘路径、路径穿越或指向 assets 外的符号链接。参数仅改变本次输出位置，不自动保存为场景设置。Scene 的 `queryCapabilities().outputDirectory === true` 来自实际 Host 的 `lightmapOutputDirectory` 支持位；旧 Host 不支持时明确报错，不忽略选择后写入默认目录。

保存与旧图清理成功后，当前 PNG 保留 UUID 移动到 `db://assets/LightFX/output`；选择 `db://assets` 与省略参数相同，选择子目录则发布到 `<outputUrl>/output`。固定发布额外要求内部 Host 的 `lightmapPublicationVersion === 1`。更新 CLI 后若出现能力不支持错误，需要重启实际 Cocos Host；单独 Reload Window 可能仍连接旧 Host。

典型文件包括：

```text
LFX_Mesh_0000.png
LFX_Terrain_0000.png
```

- Mesh 与 Terrain 使用独立的类型和索引映射，避免两者均从索引 0 开始时串绑贴图。
- 每次生成新 Asset UUID，不直接覆盖已发布像素。保存确认后精确删除旧产物，再把新图移动到固定 URL，不再供旧结果 Undo 使用；`saveScene:false` 的新结果留在独立暂存位置，不会改写或删除磁盘旧场景依赖的贴图。目标仍被占用时明确报错，不覆盖。
- 旧版平铺目录中的 PNG／`.meta` 原样保留，不自动迁移、不复用其 UUID。调用方必须使用返回的 textureUrls 或真实绑定查询，不拼接固定文件路径。
- 旧产物从场景归属记录及替换前实时绑定收集，不扫描目录猜测归属。成功保存的 Bake 和删除模式 Clear 会清理无引用候选；引用保留／失败项可以重试。旧版已解绑且从未记录归属的资产不自动猜测删除；已清空的 `bake-UUID` 目录只做非递归删除并刷新 Asset DB，含其他内容的目录保留。
- 导入后将 `fixAlphaTransparencyArtifacts` 设置为 `false`，再加载 Texture2D 子资源并绑定。
- 原生提交确认前的导入／加载失败尝试回滚本次新目录；提交确认后不再删除产物。应用失败恢复旧绑定，保存失败保留已录制结果，规则见“提交与保存失败”。旧版本目录不受影响。
- 成功、失败、取消和超时进入 workspace 清理；回滚或 Asset DB 刷新失败时保留备份和互斥以便恢复，不能宣称所有错误都会完成清理。

## 错误与事务

### 2026-09-12 重新推进共享引用保护与面板日志

用户重新授权处理两项。修改前核对：清理只查询图片主 UUID，但资产依赖索引精确保存 Texture 子 UUID（如 `@6c48a`），导致其他保存场景的引用漏检。最小修复在 LightFX 删除入口同时检查主资源及其实际子资源的使用者，查询失败保留，不改通用依赖 API、不做项目 GC。Clear 与重烘焙共用该检查。

面板日志目前直接追加原始 `lfx.log`（时间戳、版本、线程等），缺 Creator 的生成图片阶段及场景统计。计划由实际导出 world 计算对象／灯光／三角形统计，通过内部 Host 诊断传递；真实原生进度100%触发生成图片阶段，实际输出提供UV信息，原始日志文件照常保留，不将其诊断噪声混入产品面板。失败仍显示真实错误，探针日志不改。先类型检查／构建、自动测试，再在新隔离窗口由全局 ui_verifier 核验真实按钮、磁盘文件与另一个场景的有效贴图。

实机补充依赖：共享引用保留正确，但原有重烘焙策略仍报告旧产物清理未完成，保存新结果而不固定发布；本次不改变该策略。PinK失败终态仅保留最后轮询的进度，漏掉原生结束日志。最小接入为Host诊断附带内部operationId，PinK终态查询仅接收与启动前不同的本轮诊断，避免GI参数前置拒绝时误取上一轮日志；不新增公开任务或重试Bake。

完成：`b21aa0f3` 修复主图／子资源引用保护，`dba06b7c` 实现阶段统计日志和内部任务标识。先 `tsc -b`／Scene bundle，再33套件／565项及定点ESLint通过。PinK同步终态诊断读取，客户端类型检查／构建后15项桥接测试通过。原始日志文件保留详细诊断，产品面板不再读取整份原生日志；以下旧批次关于读取原生日志的记录仅为历史。

全局 ui_verifier 实机证据 `/tmp/codex-ui-verifier.nd2IMr`、`/tmp/codex-ui-verifier.CctL3q`，均父代理准备隔离配置／临时工程后交控制并独立核对：共享场景Clear后文件hash保持，真正打开另一场景无粉红／missing，纹理和UV有效；正常GI25／1024生成到固定目录，完整进度及2对象／1灯／4108三角形统计与Creator同场景证据一致。GI65535前置拒绝不串旧日志、不改旧图；正常Clear实际删除本轮PNG/meta和三个辅助文件、绑定UV清空，43点完整SH不变。第二窗口单次重烘焙仍按既有策略因2个共享引用保留而报告清理未完成，但此次失败面板完整显示100%、统计、UV、End及失败；新结果有效保存、共享文件hash保持。保留Terrain UV扩展行，不宣称日志全文完全相同；没有扩大处理导入元数据或既有告警。

### Lightmap GI Samples 整数溢出防护（2026-09-12）

已在隔离 PinK 实测 `giSamples=65535` 触发原生 `GenerateIntegrationSamples` 的 vector length_error／SIGABRT。随包 LightFX 对 Lightmap 采样数组长度以有符号32位计算 `giSamples² × 64 × 5`，故最大不溢出整数为2590（不是推荐值，也不保证大值在所有设备上的内存和耗时）。修复仅在公开参数schema、Scene直接入口及输入编码处前置拒绝非法值，不启动原生计算、不修改上一份结果、不静默clamp；Light Probe采样参数保持原契约。用户已决定暂不处理日志对齐，引用保护的隔离失败与用户手测不一致另行保留，不混入本次修复。

产品提交 `21e3b27d`。先通过 `tsc -b` 与 Scene bundle 构建，再通过32套件／556项回归测试及定向 ESLint。全局 ui_verifier 在新夹具 `/tmp/pink-gi-overflow.BNB4DT` 实际执行 GI25 生成 → GI65535 明确拒绝 → 改回25生成成功；拒绝前后场景、PNG、meta 的 hash 及绑定／UV不变，全量43点SH hash一致，两次正常生成均 `dirty:false`、无缺图。Host仅有两次正常任务的 begin/run，65535没有启动原生任务。原始截图、运行时及文件证据 `/tmp/codex-ui-verifier.Uszw6E`。未实机运行2590，不将算术上限当作性能验收；既有告警仍存在。

常见错误包括：

- 当前没有打开已保存场景。
- 探针不足、未生成或没有可烘焙 Mesh/Terrain。
- 场景依赖资产缺失。
- LightFX 缺失、启动失败、连接失败、超时或异常退出。
- 输出协议不兼容或结果损坏。
- Asset DB 导入、Texture2D 加载或场景保存失败。
- 已有另一个 LightFX 任务运行。
- 当前可见场景尚未加载完成，或同时存在多个可见的场景渲染器。

Bake 和非删除模式 Clear 的结果作为单次 Undo 记录。Lightmap 明确录制参与结果修改的 MeshRenderer／Terrain 组件（同一 Terrain 多 block 去重）及 Scene 标记，不能只录制不递归的 Scene 根节点；旧引擎缺类型的空纹理引用也会保留在快照中。成功自动保存后以该记录作为保存点；saveScene:false 不隐式保存场景。`deleteAssets:true` 是例外：保存成功后只取消本次 Clear 录制，不清空整个 Scene Undo／Redo 历史。恢复快照时使 Clear 前的所有烘焙绑定、UV 和标志失效，而节点移动、其他组件参数及探针系数仍按原历史恢复；即使旧纹理因其他引用保留，也不通过本场景旧快照恢复其烘焙效果。Clear 后新生成的烘焙记录仍可撤销。没有删除候选或全部资产保留时同样推进结果代次而保留普通历史。失败必须区分原生提交前、结果应用中和结果录制后保存阶段，不能对所有错误统一恢复绑定或删除资产，详见“提交与保存失败”。

成功 Lightmap Bake 使先前结果历史失效，保存确认后再清理旧像素；本次结果 Redo、普通属性和探针 SH 历史保留。非删除 Clear 仍可撤销恢复未失效的当前结果。`deleteAssets:true` 合并场景归属记录与实际绑定中可验证的 LightFX 根贴图 UUID，不删除整个目录；实时场景或其他磁盘资产仍引用的贴图保留并报告，删除不可撤销。此前已丢失的像素无法靠此修复找回。

## 验证范围

固定 PNG 发布依赖补充：Asset DB 的普通非覆盖移动原先先移 `.meta`，再移源文件，失败后仍吞错并刷新。仅对非覆盖移动补充错误传播；普通同级移动若源文件尚在、目标文件尚未生成，则无覆盖地回放已移动的元数据，阻止后续刷新生成不同 UUID。覆盖模式不在本次修改范围。该最小共用依赖必须用真实文件与故障注入验证，不能只靠 `moveAsset()` resolve 判成功。

默认入口补充：PinK 目录选择器总会传入 `outputUrl`，默认选中 `db://assets` 与省略参数同样发布到 `db://assets/LightFX/output`；选择 assets 内子目录才使用 `<outputUrl>/output`。这保证直接接受目录选择器默认值也得到 Creator 风格目录，不要求 UI 绕过既有选择入口。

本轮首次 UI 验证发现 PinK 桥接仍硬编码 `saveScene:false`，实际跳过以上发布和旧图清理，虽然面板提示生成成功。该次结果不作为通过证据。PinK 面板入口改为显式保存，并在生成前告知保存／替换语义；CLI 非 UI 调用显式传 `saveScene:false` 仍保持不保存、不删除磁盘旧依赖的安全契约。证据 `/tmp/codex-ui-verifier.aG5Cnt`。

固定 PNG 发布 `31598b0a`、非覆盖移动保护 `60f9a975`：先 `tsc -b` 和 Scene／editor-extends 构建，再 **32 套／524 项**通过（`/tmp/pink-fixed-output-final2-tests.log`）；定点 ESLint 无代码错误，保留已有 unused catch 和配置警告。PinK `17a0a25b7cb` 接通面板保存式 Bake，客户端类型检查／构建和扩展构建后，15 项 Electron 桥接测试、69 项扩展宿主测试及 1 套编译面板测试通过。实机结果另行记录，不以这些自动测试代替。

本轮最终隔离实机 `/tmp/codex-ui-verifier.4fxdtg`：真实面板 128→256 两次 Bake 均发布到 `LightFX/output`，由原生实际打包产生 3→2 张 PNG；旧 PNG／meta 和已空暂存版本目录实际删除、保存场景和运行时 UUID 一致。真实 Clear 后当前 PNG／meta 删除、Mesh 和两个 Terrain block 纹理／UV 清空，节点 X=1 不回退；Scene Undo 节点／最近一条 Bake、Redo Bake／节点不恢复旧图。真实保存、关闭 Scene 标签并从 Assets 重开后仍无绑定／缺图，X=1、dirty=false，43 点完整 SH 哈希不变。主 agent 准备隔离工程与新 Host 后交全局 `ui_verifier` 控制，并独立核对原始数据。旧版未记录归属且已解绑文件未猜删；没有验证所有更早历史、异常／取消／外部引用、禁用 Terrain 或保留历史软重载。原生配套文件固定发布及 Creator 同场景日志／预览对照仍待完成，不将本主链路称为全量产品对齐。已有 dump null／argv.json 告警不宣称消除。

前一批 `02f099e7`：成功保存后的旧产物精确清理和旧结果历史失效已接通。先 `tsc -b`／Scene 与 editor-extends 构建，后定点 5 套／120 项、扩展 29 套／472 项通过（`/tmp/pink-rebake-cleanup-final-tests.log`）；定点 ESLint 无代码错误，已有配置提示保留。新增测试核对真实临时文件、Host 归属、保存失败／结果不明、当前有效 Redo 和普通历史，不等同实机。以下独立版本完整 Undo 的旧实机记录只作为历史证据，不能作为最新策略验收。

2026-09-11 产品对齐补充：Lightmap 日志保留真实 Log／Progress 顺序，原生结束后在临时目录清理前读取 `lfx.log`，补充真实 Mesh／Terrain 输出索引与 UV。日志最多 128 条、每条 2048 字符，原生日志文件读取上限 256 KiB，超限明确提示，缺失日志不伪造成几何统计，也不让烘焙失败。探针日志行为保持原状。此处日志修复不代表原生配套文件已固定发布，也不代替资源删除实机证据。

当前实现已经验证：

- Light Probe Bake/Clear，包含 SH 数据保存和重新加载。
- Mesh Lightmap Bake/Clear。
- Terrain Lightmap Bake/Clear。
- Mesh 与 Terrain 混合场景的独立贴图绑定。
- 重复烘焙的独立版本目录／UUID、旧像素保留及旧平铺资产兼容。
- Pink 当前可见场景中的即时结果应用、清理和取消。
- TypeScript 编译、ESLint、API、协议和资产事务测试。

新增材质类型、灯光类型、LightFX 版本或目标平台时，应补充对应真实场景回归。

2026-09-10 结果历史专项：macOS arm64／隔离 PinK，真实带第二套 UV 的 Mesh 烘焙 128px 标准／高精度贴图；Bake、保留资产的 Clear、独立 Undo／Redo、渲染模型 UV、显式／自动保存、真正关闭重开通过，旁侧 43 点探针全部 SH 保持。Terrain 多 block 录制目标及失败恢复由服务测试覆盖，未在本次专项重做 Terrain 原生场景实测；也没有验收旧 PNG 像素版本撤销、资产删除撤销或最终画面质量。

随后版本隔离专项补验：三次真实 Mesh Bake 使用不同 URL／UUID，标准／高精度 PNG 的 SHA256 随 Undo／Redo 精确对应旧／新结果，关闭重开保留；未保存新 Bake 时磁盘 Scene 仍引用未变更的旧 PNG。旧平铺资产保持。真实文件事务测试覆盖同名场景多次输出互不覆盖、本次回滚／导入失败不影响旧版本；取消故障不作为新增实机验收，资产删除与历史 GC 仍待专门的归属协议。

Terrain 专项补验：快照恢复数组后，对已有 TerrainBlock 重新绑定对应 lightmap info（无元素时解绑）并让材质失效，避免 Terrain.onRestore 的 valid 快路径保留旧引用。实际单块和持久化 `.terrain` 双块＋Mesh 混合场景，Bake／Clear、Undo／Redo、自动／显式保存、关闭重开通过；每个 block 的实际 texture／UV 与序列化结果一致，43 点探针 SH 不变。`bake().terrainCount` 当前是原生输出 block 条目数，`queryBakeInfo().terrainCount` 是拥有绑定的 Terrain 组件数，两者不应直接比较。地形尺寸／高度保存在 `.terrain` 资产，夹具通过 Terrain.saveManage／saveAssetDialog 正式写入，不靠修改内存后只保存 Scene 冒充持久化。

编辑与诊断专项补验（同为 macOS arm64／隔离 PinK）：两组 16／27 点切组全选、真实复制／删除按钮、空白／球起手及 Shift 追加框选通过；复制→Undo→改父节点保持组件与全局表一致的 43 点，Undo 恢复原 SH、Redo 恢复新位置与失效状态。自身旋转／非均匀缩放的探针球与采样位置一致，祖先变换同步和 Undo 通过。真实 Probe Bake 显示 `Build lighting 100%`；Mesh＋双块 Terrain Bake 观察到 `Build lighting 25%` 后取消，前后结果、历史以及 83 个资产／元数据文件哈希一致。另一场景不接收任务日志。上述不包含持久恢复、安全资产回收、跨磁盘失败原子性或其他 OS 的验收。
