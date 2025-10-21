# Tool Download Script Documentation

This script downloads and extracts development tools from Cocos official servers, supporting Windows, macOS, and Linux platforms.

## Usage

### Using npm script (Recommended)

```bash
npm run download-tools
```

### Run script directly

```bash
node workflow/download-tools.js
```

## Script Description

### download-tools.js

- **Cross-platform Support**: Windows, macOS, Linux
- **Features**: Download, extract, progress display, error handling
- **Characteristics**:
  - Automatically detect platform and download corresponding tools
  - Display download progress and file size
  - Automatically handle redirects
  - Intelligently skip existing tools
  - Automatically clean temporary files
  - Detailed error information and statistics

## Downloaded Tools

### Windows Platform Tools

- unzip.exe - Extraction tool
- PVRTexTool_win32 - Texture compression tool
- mali_win32 - Mali GPU tool
- libwebp_win32 - WebP image processing
- openSSLWin64 - SSL encryption library
- Python27-win32 - Python 2.7
- astc-encoder - ASTC texture encoder
- xiaomi-pack-tools - Xiaomi packaging tools
- lightmap-tools - Lightmap tools
- LightFX - UV unwrapping tool
- cmft - Cubemap tool
- cmake - Build tool
- windows-process-tree - Process tree tool

### macOS Platform Tools

- PVRTexTool_darwin - Texture compression tool
- mali_darwin - Mali GPU tool
- libwebp_darwin - WebP image processing
- astc-encoder - ASTC texture encoder
- xiaomi-pack-tools - Xiaomi packaging tools
- lightmap-tools - Lightmap tools
- LightFX - UV unwrapping tool
- cmft - Cubemap tool
- cmake - Build tool
- process-info - Process information tool

### Universal Tools

- quickgame-toolkit - Quick game toolkit
- huawei-rpk-tools - Huawei RPK tools
- keystore - Debug keystore

## Directory Structure

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

## Notes

1. **Network Requirements**: Need access to `ftp.cocos.org`
2. **Disk Space**: Ensure sufficient disk space (approximately 2-3GB)
3. **Permissions**: Need write permissions to `static/tools` directory
4. **Repeated Runs**: Script will skip existing tools to avoid duplicate downloads
5. **Temporary Files**: Downloaded zip files are first saved in `.temp` directory, automatically deleted after extraction

## Troubleshooting

### Download Failures

- Check network connection
- Confirm firewall settings
- Try using proxy
- Re-run script to retry

### Extraction Failures

- Check disk space
- Confirm file permissions
- Test manual extraction

### Missing Extraction Tools

- **Windows**: Ensure PowerShell is available
- **macOS/Linux**: Install unzip tool

  ```bash
  # macOS
  brew install unzip
  
  # Ubuntu/Debian
  sudo apt-get install unzip
  
  # CentOS/RHEL
  sudo yum install unzip
  ```

## Update Tools

To update tool versions, modify the URL addresses in `static/tools/config.js`, then re-run the download script.
