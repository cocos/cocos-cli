# 工具下载脚本说明

这个脚本用于从 Cocos 官方服务器下载和解压开发工具，支持 Windows、macOS 和 Linux 平台。

## 使用方法

### 使用 npm 脚本（推荐）

```bash
npm run download-tools
```

### 直接运行脚本

```bash
node workflow/download-tools.js
```

## 脚本说明

### download-tools.js

- **跨平台支持**：Windows、macOS、Linux
- **功能**：下载、解压、进度显示、错误处理
- **特点**：
  - 自动检测平台并下载对应工具
  - 显示下载进度和文件大小
  - 自动处理重定向
  - 智能跳过已存在的工具
  - 自动清理临时文件
  - 详细的错误信息和统计

## 下载的工具

### Windows 平台工具

- unzip.exe - 解压工具
- PVRTexTool_win32 - 纹理压缩工具
- mali_win32 - Mali GPU 工具
- libwebp_win32 - WebP 图像处理
- openSSLWin64 - SSL 加密库
- Python27-win32 - Python 2.7
- astc-encoder - ASTC 纹理编码器
- xiaomi-pack-tools - 小米打包工具
- lightmap-tools - 光照贴图工具
- LightFX - UV 展开工具
- cmft - 立方体贴图工具
- cmake - 构建工具
- windows-process-tree - 进程树工具

### macOS 平台工具

- PVRTexTool_darwin - 纹理压缩工具
- mali_darwin - Mali GPU 工具
- libwebp_darwin - WebP 图像处理
- astc-encoder - ASTC 纹理编码器
- xiaomi-pack-tools - 小米打包工具
- lightmap-tools - 光照贴图工具
- LightFX - UV 展开工具
- cmft - 立方体贴图工具
- cmake - 构建工具
- process-info - 进程信息工具

### 通用工具

- quickgame-toolkit - 快游戏工具包
- huawei-rpk-tools - 华为 RPK 工具
- keystore - 调试密钥库

## 目录结构

```
static/tools/
├── unzip.exe/
├── PVRTexTool_win32/
├── mali_win32/
├── libwebp_win32/
├── openSSLWin64/
├── Python27-win32/
├── astc-encoder/
├── xiaomi-pack-tools/
├── lightmap-tools/
├── LightFX/
├── cmft/
├── cmake/
├── windows-process-tree/
├── quickgame-toolkit/
├── huawei-rpk-tools/
└── keystore/
```

## 注意事项

1. **网络要求**：需要能够访问 `ftp.cocos.org`
2. **磁盘空间**：确保有足够的磁盘空间（约 2-3GB）
3. **权限要求**：需要写入 `static/tools` 目录的权限
4. **重复运行**：脚本会跳过已存在的工具，避免重复下载
5. **临时文件**：下载的 zip 文件会先保存在 `.temp` 目录，解压后自动删除

## 故障排除

### 下载失败

- 检查网络连接
- 确认防火墙设置
- 尝试使用代理
- 重新运行脚本重试

### 解压失败

- 检查磁盘空间
- 确认文件权限
- 手动解压测试

### 缺少解压工具

- **Windows**: 确保 PowerShell 可用
- **macOS/Linux**: 安装 unzip 工具

  ```bash
  # macOS
  brew install unzip
  
  # Ubuntu/Debian
  sudo apt-get install unzip
  
  # CentOS/RHEL
  sudo yum install unzip
  ```

## 更新工具

如需更新工具版本，请修改 `static/tools/config.js` 中的 URL 地址，然后重新运行下载脚本。
