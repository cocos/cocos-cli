# Linux 平台 FBX-glTF-conv 适配指南

> 本文档记录了在 Linux 平台上编译 FBX-glTF-conv 并将其集成到 cocos-cli 的完整步骤，
> 使 Linux 上也能使用 Cocos 官方的 FBX-glTF-conv 转换器，而非回退到 Facebook 的 FBX2glTF。
>
> **适用版本**: FBX-glTF-conv `release-v1.0.0-alpha.49.editor.1` / cocos-cli `0.0.1-alpha.38`
>
> **编写日期**: 2026-08-11
>
> **测试环境**: Ubuntu 26.04 LTS, GCC 15.2.0, CMake 4.2.3

---

## 背景

### 问题

cocos-cli 导入 FBX 文件时，通过 `@cocos/fbx-gltf-conv` npm 包调用 FBX-glTF-conv 二进制进行格式转换。
但该 npm 包**只提供 Windows 和 macOS 二进制**，没有 Linux 版本：

```
@Cocos/fbx-gltf-conv npm 包
  ├── index.js          ← 只处理 win32 和 darwin，Linux 会错误走到 darwin 分支
  └── bin/
      ├── darwin/FBX-glTF-conv       ← 官方提供
      └── win32/FBX-glTF-conv.exe    ← 官方提供
                                      ← 没有 linux/
```

### 官方代码行为

cocos-cli 官方代码（`src/core/assets/asset-handler/assets/gltf/reader-manager.ts`）的逻辑：

```typescript
if (userData.legacyFbxImporter) {
    // 旧路径：调用 Facebook 的 FBX2glTF
    outGLTFFile = await fbxToGlTf(asset, asset._assetDB, importerVersion);
} else {
    // 新路径：调用 Cocos 官方的 FBX-glTF-conv
    const fbxConverter = createFbxConverter(options);
    const converted = await modelConvertRoutine('fbx.FBX-glTF-conv', ...);
}
```

- Windows/macOS：默认走新路径（FBX-glTF-conv）✅
- Linux：由于 `@cocos/fbx-gltf-conv` 包没有 Linux 二进制，`require('@cocos/fbx-gltf-conv')` 解析到的路径不存在，转换会失败

### 解决方案

1. 在 Linux 上从源码编译 FBX-glTF-conv
2. 将编译产物放入 `node_modules/@cocos/fbx-gltf-conv/bin/linux/`
3. 修改 `node_modules/@cocos/fbx-gltf-conv/index.js` 添加 Linux 平台分支

这样 Linux 上也会走官方的 FBX-glTF-conv 路径，无需修改 cocos-cli 源码。

---

## 第一部分：编译 FBX-glTF-conv

### 1.1 系统依赖安装

```bash
# 基础编译工具
sudo apt update
sudo apt install -y build-essential cmake git curl

# FBX SDK 运行时依赖
sudo apt install -y libxml2-dev zlib1g-dev libstdc++-15-dev
```

验证版本：
```bash
gcc --version    # 需要 GCC 11+ (本项目使用 C++20)
cmake --version  # 需要 CMake >= 3.15
```

### 1.2 安装 vcpkg

```bash
cd /root
git clone https://github.com/microsoft/vcpkg.git
cd vcpkg
./bootstrap-vcpkg.sh
```

### 1.3 安装 vcpkg 依赖

FBX-glTF-conv 通过 vcpkg 安装以下 C++ 库：

| 包名 | 版本 | 用途 |
|------|------|------|
| cxxopts | 3.3.1 | 命令行参数解析 |
| fmt | 12.2.0 | 格式化库 |
| doctest | 2.5.3 | 单元测试框架 |
| cppcodec | 0.2 | Base64 编解码 |
| nlohmann-json | 3.12.0 | JSON 解析 |
| glm | 1.0.3 | 数学库 |
| range-v3 | 0.12.0 | C++ ranges 库 |
| utfcpp | 4.1.1 | UTF-8 处理 |
| libxml2 | 2.15.3 | XML 解析 (FBX SDK 依赖) |
| zlib | 1.3.2 | 压缩库 (FBX SDK 依赖) |
| libiconv | 1.19 | 字符编码转换 |

```bash
/root/vcpkg/vcpkg install \
    cxxopts fmt doctest cppcodec nlohmann-json glm range-v3 utfcpp \
    libxml2 zlib libiconv
```

### 1.4 安装 FBX SDK 2020.2.1

```bash
mkdir -p /root/fbxsdk && cd /root/fbxsdk

# 下载 FBX SDK 2020.2.1 Linux 版本
curl -L -o fbxsdk.tar.gz \
    'https://www.autodesk.com/content/dam/autodesk/www/adn/fbx/2020-2-1/fbx202021_fbxsdk_linux.tar.gz'

# 解压
tar xzf fbxsdk.tar.gz

# 运行安装程序（交互式，接受许可协议后安装到 ./install 目录）
chmod +x fbx202021_fbxsdk_linux
./fbx202021_fbxsdk_linux install
# 按提示输入安装路径：./install
```

安装完成后验证：
```bash
ls /root/fbxsdk/install/lib/gcc/x64/release/
# 应该看到：libfbxsdk.a  libfbxsdk.so
```

### 1.5 克隆 FBX-glTF-conv 仓库

```bash
cd /root
git clone https://github.com/cocos/FBX-glTF-conv.git
cd FBX-glTF-conv

# 确认版本
git checkout release-v1.0.0-alpha.49.editor.1
# 或使用 dev 分支（当前 HEAD 即为此 tag）
```

### 1.6 修改 CMakeLists.txt（Linux 链接修复）

**问题**：GNU ld 按从左到右顺序解析符号。BeeCore（静态库）链接 FBX SDK，FBX SDK 又依赖 LibXml2 和 ZLIB，
这些库之间存在循环依赖。不加处理会导致链接错误（undefined reference）。

**修改文件**：`Cli/CMakeLists.txt`

在 `target_link_libraries(FBX-glTF-conv PRIVATE fmt::fmt-header-only)` 之后，
`# Set @rpath` 注释之前，添加以下内容：

```cmake
# On Linux (GNU ld), the linker resolves symbols left-to-right. Since BeeCore
# (a static library) links against FBX SDK which in turn depends on LibXml2
# and ZLIB, those must appear AFTER libfbxsdk.a on the link line. Using
# --start-group/--end-group lets the linker resolve circular dependencies
# between the static libraries.
if (CMAKE_CXX_COMPILER_ID STREQUAL "GNU")
    find_package(LibXml2 REQUIRED)
    find_package(ZLIB REQUIRED)
    # Wrap all static libraries in a linker group so GNU ld resolves
    # circular dependencies between BeeCore, FBX SDK, LibXml2 and ZLIB.
    target_link_options(FBX-glTF-conv PRIVATE
        "LINKER:--whole-archive"
        "LINKER:--start-group"
    )
    target_link_libraries(FBX-glTF-conv PRIVATE
        BeeCore
        ${FbxSdkHome}/lib/gcc/x64/release/libfbxsdk.a
        LibXml2::LibXml2
        ZLIB::ZLIB
    )
    target_link_options(FBX-glTF-conv PRIVATE
        "LINKER:--end-group"
        "LINKER:--no-whole-archive"
    )
endif ()
```

**说明**：
- `--start-group` / `--end-group`：让 GNU ld 在组内反复扫描，解决循环依赖
- `--whole-archive` / `--no-whole-archive`：强制包含静态库所有符号
- 此修改仅影响 GNU 编译器（Linux），不影响 MSVC（Windows）和 Clang（macOS）

### 1.7 编译

```bash
cd /root/FBX-glTF-conv

# 创建构建目录
mkdir -p out/build/Release

# CMake 配置
cmake -B out/build/Release \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_TOOLCHAIN_FILE=/root/vcpkg/scripts/buildsystems/vcpkg.cmake \
    -DFbxSdkHome:STRING=/root/fbxsdk/install \
    -DPOLYFILLS_STD_FILESYSTEM=ON

# 编译
cmake --build out/build/Release --config Release
```

### 1.8 验证编译产物

```bash
# 查看二进制类型
file out/build/Release/FBX-glTF-conv
# 预期: ELF 64-bit LSB pie executable, x86-64, dynamically linked

# 查看动态库依赖
ldd out/build/Release/FBX-glTF-conv
# 预期: 只依赖 libstdc++.so.6, libm.so.6, libgcc_s.so.1, libc.so.6
# FBX SDK 已被静态链接进去，不需要额外的 .so

# 运行测试
out/build/Release/FBX-glTF-conv --version
out/build/Release/FBX-glTF-conv --help

# 实际转换测试
mkdir -p /tmp/fbx-test
out/build/Release/FBX-glTF-conv \
    /path/to/test.fbx \
    --out /tmp/fbx-test/out.gltf \
    --log-file /tmp/fbx-test/log.json \
    --fbm-dir /tmp/fbx-test/.fbm \
    --verbose
# 预期: 生成 out.gltf + out.bin，log.json 中无 error 级别日志
```

### 1.9 Strip（可选，减小体积）

```bash
cp out/build/Release/FBX-glTF-conv /tmp/FBX-glTF-conv
strip /tmp/FBX-glTF-conv
# 体积从 ~12MB 减小到 ~9.8MB
```

---

## 第二部分：集成到 cocos-cli

### 2.1 放入 Linux 二进制

```bash
cd /root/cocos-cli

# 创建 Linux 二进制目录
mkdir -p node_modules/@cocos/fbx-gltf-conv/bin/linux

# 复制编译产物（建议使用 strip 后的版本）
cp /root/FBX-glTF-conv/out/build/Release/FBX-glTF-conv \
   node_modules/@cocos/fbx-gltf-conv/bin/linux/FBX-glTF-conv

# 赋予执行权限
chmod +x node_modules/@cocos/fbx-gltf-conv/bin/linux/FBX-glTF-conv
```

验证：
```bash
ls -la node_modules/@cocos/fbx-gltf-conv/bin/
# 预期: darwin/  linux/  win32/
```

### 2.2 修改 index.js 添加 Linux 支持

**文件**：`node_modules/@cocos/fbx-gltf-conv/index.js`

**原始内容**（官方 npm 包）：
```javascript
const ps = require('path');

module.exports = {
    tool: process.platform === 'win32' ?
        ps.join(__dirname, 'bin', 'win32', 'FBX-glTF-conv.exe') :
        ps.join(__dirname, 'bin', 'darwin', 'FBX-glTF-conv'),
};
```

**修改后**：
```javascript
const ps = require('path');

module.exports = {
    tool: process.platform === 'win32' ?
        ps.join(__dirname, 'bin', 'win32', 'FBX-glTF-conv.exe') :
        process.platform === 'linux' ?
            ps.join(__dirname, 'bin', 'linux', 'FBX-glTF-conv') :
            ps.join(__dirname, 'bin', 'darwin', 'FBX-glTF-conv'),
};
```

**改动说明**：添加 `process.platform === 'linux'` 分支，指向 `bin/linux/FBX-glTF-conv`。
原来 Linux 会错误地走到 `darwin` 分支，导致路径不存在。

### 2.3 验证集成

```bash
cd /root/cocos-cli

# 验证 require 能正确解析到 Linux 二进制
node -e "const {tool} = require('@cocos/fbx-gltf-conv'); console.log(tool);"
# 预期输出: /root/cocos-cli/node_modules/@cocos/fbx-gltf-conv/bin/linux/FBX-glTF-conv

# 验证二进制存在且可执行
node -e "
const {tool} = require('@cocos/fbx-gltf-conv');
const fs = require('fs');
console.log('exists:', fs.existsSync(tool));
fs.accessSync(tool, fs.constants.X_OK);
console.log('executable: ok');
"
```

### 2.4 验证 FBX 导入流程

cocos-cli 导入 FBX 时的调用链路：

```
asset-db 扫描 .fbx 文件
    ↓
FbxHandler (fbx.ts) → 继承 GltfHandler
    ↓
reader-manager.ts: getFbxFilePath()
    ↓ userData.legacyFbxImporter = false (默认)
    ↓
fbx-converter.ts: createFbxConverter()
    ↓ require('@cocos/fbx-gltf-conv') → tool 路径
    ↓ spawn(toolPath, cliArgs)
    ↓
FBX-glTF-conv 二进制执行转换
    ↓
生成 out.gltf + out.bin + log.json
    ↓
GltfHandler 解析 glTF → 拆分为子资产
```

验证 `reader-manager.ts` 中的逻辑（确认无 Linux 强制回退）：
```bash
grep -n "legacyFbxImporter\|process.platform\|linux" \
    src/core/assets/asset-handler/assets/gltf/reader-manager.ts
# 预期: 只有 if (userData.legacyFbxImporter) { 一行
# 不应该有 process.platform === 'linux' 的强制回退
```

---

## 第三部分：npm install 后的持久化

### 问题

`node_modules/` 目录不纳入 git 版本控制。每次执行 `npm install` 会重新解压 npm 包，
覆盖 `node_modules/@cocos/fbx-gltf-conv/` 目录，导致：
1. `bin/linux/` 目录被清除
2. `index.js` 被还原为官方版本（无 Linux 分支）

### 解决方案

以下两种方式任选其一：

#### 方式 A：手动补齐（简单）

每次 `npm install` 后手动执行：

```bash
# 1. 放入二进制
mkdir -p node_modules/@cocos/fbx-gltf-conv/bin/linux
cp /root/FBX-glTF-conv/out/build/Release/FBX-glTF-conv \
   node_modules/@cocos/fbx-gltf-conv/bin/linux/FBX-glTF-conv
chmod +x node_modules/@cocos/fbx-gltf-conv/bin/linux/FBX-glTF-conv

# 2. 修改 index.js（添加 linux 分支，见 2.2 节）
```

#### 方式 B：postinstall 脚本（自动化）

创建 `workflow/ensure-fbx-gltf-conv-linux.js`：

```javascript
const fs = require('fs');
const path = require('path');

function getPackageRoot() {
    try {
        return path.dirname(require.resolve('@cocos/fbx-gltf-conv'));
    } catch (e) {
        return null;
    }
}

function ensureLinuxBinary() {
    const pkgRoot = getPackageRoot();
    if (!pkgRoot) return false;

    const binDir = path.join(pkgRoot, 'bin', 'linux');
    const targetPath = path.join(binDir, 'FBX-glTF-conv');
    const sourcePath = process.env.FBX_GLTF_CONV_BIN ||
        '/root/FBX-glTF-conv/out/build/Release/FBX-glTF-conv';

    if (fs.existsSync(targetPath)) {
        try {
            fs.accessSync(targetPath, fs.constants.X_OK);
            return true;
        } catch {
            fs.chmodSync(targetPath, 0o755);
            return true;
        }
    }

    if (!fs.existsSync(sourcePath)) {
        console.warn('FBX-glTF-conv 二进制不存在:', sourcePath);
        return false;
    }

    fs.mkdirSync(binDir, { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
    fs.chmodSync(targetPath, 0o755);
    return true;
}

function patchIndexJs() {
    const pkgRoot = getPackageRoot();
    if (!pkgRoot) return;

    const indexPath = path.join(pkgRoot, 'index.js');
    let content = fs.readFileSync(indexPath, 'utf-8');

    if (content.includes("process.platform === 'linux'")) return;

    const oldPattern = `process.platform === 'win32' ?
        ps.join(__dirname, 'bin', 'win32', 'FBX-glTF-conv.exe') :
        ps.join(__dirname, 'bin', 'darwin', 'FBX-glTF-conv')`;

    const newPattern = `process.platform === 'win32' ?
        ps.join(__dirname, 'bin', 'win32', 'FBX-glTF-conv.exe') :
        process.platform === 'linux' ?
            ps.join(__dirname, 'bin', 'linux', 'FBX-glTF-conv') :
            ps.join(__dirname, 'bin', 'darwin', 'FBX-glTF-conv')`;

    if (content.includes(oldPattern)) {
        fs.writeFileSync(indexPath, content.replace(oldPattern, newPattern), 'utf-8');
    }
}

async function ensureFbxGlTfConvLinux() {
    if (process.platform !== 'linux') return;
    if (ensureLinuxBinary()) patchIndexJs();
}

module.exports = { ensureFbxGlTfConvLinux };
if (require.main === module) ensureFbxGlTfConvLinux();
```

在 `workflow/postinstall.js` 中调用：

```javascript
// 在文件头部添加
const { ensureFbxGlTfConvLinux } = require('./ensure-fbx-gltf-conv-linux');

// 在 mockNpmModules() 函数末尾（download-tools 之后）添加
await ensureFbxGlTfConvLinux();
```

> **注意**：`ensure-fbx-gltf-conv-linux.js` 中默认二进制路径为硬编码的绝对路径
> `/root/FBX-glTF-conv/out/build/Release/FBX-glTF-conv`。
> 如果其他开发者使用不同路径，可通过环境变量 `FBX_GLTF_CONV_BIN` 指定：
> ```bash
> export FBX_GLTF_CONV_BIN=/path/to/your/FBX-glTF-conv
> npm install
> ```

---

## 第四部分：改动文件清单

### FBX-glTF-conv 仓库改动

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `Cli/CMakeLists.txt` | 新增 26 行 | GNU ld 链接组修复（`--start-group`/`--end-group`） |

### cocos-cli 仓库改动

| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `node_modules/@cocos/fbx-gltf-conv/bin/linux/FBX-glTF-conv` | 新增文件 | Linux 二进制（不进 git） |
| `node_modules/@cocos/fbx-gltf-conv/index.js` | 修改 | 添加 linux 平台分支（不进 git） |
| `workflow/ensure-fbx-gltf-conv-linux.js` | 新增文件（可选） | postinstall 自动补齐脚本 |
| `workflow/postinstall.js` | 修改（可选） | 调用补齐脚本 |

### cocos-cli 源码改动

**无**。官方源码不需要任何修改。`reader-manager.ts` 中的逻辑已经正确：
- `legacyFbxImporter = false`（默认）→ 走 FBX-glTF-conv 路径
- `legacyFbxImporter = true` → 走 FBX2glTF 路径（用户手动选择）

Linux 上只要 `@cocos/fbx-gltf-conv` 包中有二进制且 `index.js` 有 linux 分支，
就会自动走 FBX-glTF-conv 路径，与 Windows/macOS 行为一致。

---

## 第五部分：FBX-glTF-conv CLI 参数映射

cocos-cli 的 `fbx-converter.ts` 调用 FBX-glTF-conv 时使用的参数：

| cocos-cli userData | CLI 参数 | 默认值 | 说明 |
|---------------------|----------|--------|------|
| `fbx.unitConversion` | `--unit-conversion` | `geometry-level` | 单位转换模式 |
| `fbx.animationBakeRate` | `--animation-bake-rate` | `0` (自动) | 动画烘焙帧率 |
| `fbx.preferLocalTimeSpan` | `--prefer-local-time-span` | `true` | 优先使用本地时间跨度 |
| `fbx.matchMeshNames` | `--match-mesh-names` | `true` | 匹配网格名称 |
| `fbx.smartMaterialEnabled` | `--export-fbx-file-header-info` + `--export-raw-materials` | `false` | 导出原始材质 |
| (固定) | `--out` | — | 输出路径 |
| (固定) | `--fbm-dir` | — | 嵌入媒体目录 |
| (固定) | `--log-file` | — | JSON 日志路径 |

退出码处理：
| 退出码 | 含义 | cocos-cli 处理 |
|--------|------|----------------|
| 0 | 成功 | 正常继续 |
| 1 | 转换出错（但日志已记录） | 静默，读取 log.json |
| 3221225781 | Windows DLL 缺失 | 打印 missing_dll 错误 |
| 126 (macOS) | CPU 架构不匹配 | 打印 bad_cpu 错误 |
| 其他 | 未知错误 | 打印非零退出码 |

---

## 附录：环境信息

### 编译环境（本次验证）

| 项目 | 版本 |
|------|------|
| 操作系统 | Ubuntu 26.04 LTS |
| GCC | 15.2.0 |
| CMake | 4.2.3 |
| vcpkg | 2026-07-27 |
| FBX SDK | 2020.2.1 |
| FBX-glTF-conv | release-v1.0.0-alpha.49.editor.1 |

### 编译产物

| 项目 | 值 |
|------|-----|
| 路径 | `out/build/Release/FBX-glTF-conv` |
| 类型 | ELF 64-bit LSB pie executable, x86-64 |
| 体积 | 12MB (未 strip) / 9.8MB (strip 后) |
| 动态依赖 | libstdc++.so.6, libm.so.6, libgcc_s.so.1, libc.so.6 |
| 静态链接 | FBX SDK (libfbxsdk.a), LibXml2, ZLIB |

### vcpkg 依赖完整列表

```
cppcodec:x64-linux          0.2
cxxopts:x64-linux           3.3.1
doctest:x64-linux           2.5.3
fmt:x64-linux                12.2.0
glm:x64-linux                1.0.3
libiconv:x64-linux           1.19
libxml2:x64-linux            2.15.3
nlohmann-json:x64-linux      3.12.0
range-v3:x64-linux           0.12.0
utfcpp:x64-linux             4.1.1
zlib:x64-linux               1.3.2
```

### apt 系统依赖

```
build-essential
cmake
libxml2-dev
zlib1g-dev
libstdc++-15-dev (或系统对应版本)
```
