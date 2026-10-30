# SDK 拆分实施与验收清单

## 已完成

- [x] 拆分 CLI 与 Engine SDK 的安装、构建和打包命令。
- [x] 支持命令行、API、项目和本机默认引擎路径。
- [x] 校验版本范围、精确身份、必需文件及运行时接口。
- [x] 提供 doctor 诊断和项目实际引擎身份记录。
- [x] 按 Git tag 准备历史引擎，固定引擎与 external commit。
- [x] 每组执行完整 unit / E2E，保存结构化结果并在失败时返回非零退出码。
- [x] 在 Windows 验证 alpha.32、alpha.33 tag 及 v4.0.0 分支基线；每组 unit 2458/2458、E2E 178/178。
- [x] 配置 PR、定时和手动 CI，覆盖 Windows 2022 与 macOS。
- [x] 各引擎完整测试分发到独立 runner，最多并发 4 组，汇总检查完整覆盖和 SDK 身份。

## 待验收

- [ ] 通过 PR 验证远端 runner 的环境准备、完整矩阵及报告上传。
- [ ] 验证 macOS 实际结果。
- [ ] 正式引擎 tag 发布后验证稳定版历史范围。
- [ ] 完整历史 ZIP 可用后接入下载、校验和解压。
- [ ] 将旧发布入口统一接入矩阵门禁。

详见 [方案](方案.md)、[测试矩阵操作说明](docs/sdk-tag-matrix.md)和[验证结果](docs/sdk-full-ci-results.md)。
