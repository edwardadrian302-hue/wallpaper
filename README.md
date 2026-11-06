# 青野壁纸

Windows 10/11 x64 桌面壁纸软件，暂定名「青野」。React 用于绘制自定义界面，Tauri / Rust 提供独立窗口与 Windows 系统接口。发行版将界面和示例图片嵌入 EXE，使用时不需要 Node.js、浏览器或本地网页服务器。

## 使用发行版

从 [GitHub Releases](https://github.com/edwardadrian302-hue/wallpaper/releases/tag/v0.1.2) 下载：[Windows 安装版](https://github.com/edwardadrian302-hue/wallpaper/releases/download/v0.1.2/Qingye-0.1.2-x64-Setup.exe) · [完整便携版](https://github.com/edwardadrian302-hue/wallpaper/releases/download/v0.1.2/Qingye-0.1.2-x64-Portable.zip)。

- `release/0.1.2/Qingye.exe`：便携版，双击启动。请放在可写的目录中，并保留同目录的 `WebView2Loader.dll`。
- `release/0.1.2/Qingye-0.1.2-x64-Setup.exe`：中文安装程序，可选择安装目录并创建快捷方式。
- `release/0.1.2/Qingye-0.1.2-x64-Portable.zip`：便携版完整压缩包，解压后运行 `Qingye.exe`。
- Windows 需要 Microsoft Edge WebView2 运行环境；安装程序在缺少运行环境时会提示安装。便携版本也需要该运行环境。
- 收藏、导入图片及 WebView 数据保存在 EXE 旁的 `data/`，导出图片位于 `data/exports/`，设为桌面的图片位于 `data/wallpapers/`。移动便携版时请一起移动 `data/`。
- 请不要删除当前 Windows 桌面正在使用的图片文件。

## 0.1.1 范围

已实现：今日精选、壁纸库、收藏、分类搜索、排序、图片预览、本地导入与内容去重、设置保存、Windows 桌面设置、应用运行期间的定时轮换、图片导出。

随包提供 24 张有来源与许可信息的离线示例。真实每日下载已接入 Wikimedia Commons：默认每天 24 张，允许设置为 12/24/48 张；下载完自动加入图库。图库显示总数，每页 12 张。

每日任务在启动时及程序运行期间检查，重启后只补齐当天不足的部分。断网继续使用已有图片；限流按来源要求等待，失败时显示原因并稍后补齐。偏好设置可暂停自动下载。**托盘驻留、开机启动、多屏独立设置尚未实现**。关闭程序会停止下载和定时轮换，保留 Windows 当前壁纸。

联网缓存位于 `data/library/images`，索引、每日计数、作者、来源、许可、内容哈希与搜索游标位于 `data/library/catalog.json`。请保留完整 data 目录。

导入图片目前使用 IndexedDB 保存，收藏和设置使用 localStorage；联网图片使用普通文件与 JSON 索引。后续统一迁移至 SQLite 与文件目录结构，详见 [开发路线](docs/ROADMAP.md)。

## 从源码构建（Windows x64）

本项目提供项目内的便携 GNU 编译环境。无需已有的 MSYS2，也无需把编译器放在特定盘符。Rust、GCC、项目 npm 和下载缓存保存在 `.tools/`，安装及构建脚本只修改当前进程的环境变量，不永久修改系统 PATH 或全局 npm。

### 固定版本

[build-tools.json](build-tools.json) 是安装和构建脚本使用的版本清单：

| 工具 | 固定版本 | 安装位置 / 锁定方式 |
|---|---|---|
| Node.js x64 | 24.15.0 | 先安装官方 Node，`.node-version` 和 `package.json` 声明版本 |
| npm | 11.14.1 | 自动安装至 `.tools/npm`，通过 `.tools/npm-shim/npm.cmd` 使用 |
| Rust | 1.99.1，Windows GNU x64 | `.tools/rustup`、`.tools/cargo`；`rust-toolchain.toml` 固定工具链 |
| 便携 C/C++ 编译器 | w64devkit 2.5.0 | `.tools/w64devkit-2.5.0/w64devkit/bin` |
| GCC / G++ | 15.2.0 | 上述固定编译器包提供 |
| GNU Binutils / windres | 2.45 | 上述固定编译器包提供 |
| JavaScript 依赖 | `package-lock.json` 中的精确版本 | 使用 `npm ci` |
| Rust 依赖 | `src-tauri/Cargo.lock` 中的精确版本 | 默认使用 `--locked` |

构建脚本会检查 Node、npm、Rust 和 GCC 版本。已经存在的项目内 `stable` GNU Rust 工具链，只有在 `rustc` 精确等于 1.99.1 时才会复用；其他情况下安装明确版本的工具链，不依赖未来的 `stable` 更新。

编译器从 [w64devkit 官方 v2.5.0 Release](https://github.com/skeeto/w64devkit/releases/tag/v2.5.0) 下载。安装脚本在执行自解压包前校验 SHA-256：

```text
7ac8f55befb93720f048f2c788704543fbc632c0164a8239ecbdefc9559481c5
```

`.tools/` 是可重新安装的本地环境，不提交 Git。源码仓库提交安装脚本、固定版本清单及依赖锁文件。

### 1. 安装系统前置条件

- Windows 10/11 x64、Windows PowerShell 5.1 或更高版本。
- [Git for Windows](https://git-scm.com/downloads/win)。
- [Node.js 24.15.0 x64 官方安装包](https://nodejs.org/dist/v24.15.0/node-v24.15.0-x64.msi)，也可使用 [官方便携 ZIP](https://nodejs.org/dist/v24.15.0/node-v24.15.0-win-x64.zip)。校验信息见 [官方 SHASUMS256.txt](https://nodejs.org/dist/v24.15.0/SHASUMS256.txt)。安装后重新打开终端，确保 `node.exe` 和 `npm.cmd` 可用。
- [Microsoft Edge WebView2 Evergreen Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)，用于运行桌面窗口。Windows 11 通常已提供；其他环境按需安装。WebView2 随安全更新维护，不锁定运行时补丁版本。
- 建议预留至少 8 GB 可用空间。首次安装和构建需要访问 GitHub、Rust 官方下载源、npm 和 crates.io。

这条 GNU 构建流程不要求 Visual Studio C++ Build Tools。Tauri 官方 Windows 默认推荐 MSVC；如自行切换到 MSVC，需要另行配置微软编译器并调整本项目的 GNU 打包路径，不能只更换 Rust 目标。

### 2. 拉取代码并安装项目工具

在 PowerShell 中执行：

```powershell
git clone https://github.com/edwardadrian302-hue/wallpaper.git
Set-Location wallpaper
node.exe --version
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/setup-build-tools.ps1
```

`node.exe --version` 应为 `v24.15.0`。系统 Node 自带的 npm 版本可以不同：安装脚本会额外安装本项目固定的 npm 11.14.1，无需执行全局 npm 升级。

安装脚本会依次下载并校验便携 GCC，安装项目 npm，安装或复用精确版本的 Rust，最后检查工具版本。脚本可以重复运行；已有且版本正确的工具会复用。这里的 `-ExecutionPolicy Bypass` 只用于本次 PowerShell 进程。

### 3. 按锁文件安装依赖并检查

```powershell
& .\.tools\npm-shim\npm.cmd ci
& .\.tools\npm-shim\npm.cmd test
node.exe scripts/verify-assets.mjs
```

仓库已包含 24 张示例图片及署名数据，构建时无需运行 `fetch-assets.mjs`，也无需申请壁纸来源 API key。

### 4. 构建桌面 EXE 和安装程序

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/build-desktop.ps1
```

脚本会加载项目工具链、获取锁定的 Rust 依赖、准备 WebView2 加载文件和许可说明，再构建 Windows x64 EXE 与 NSIS 中文安装程序。无需手动配置 GCC、链接器或 `windres` 路径。环境脚本也会将固定 Rust 自带的 GNU 运行库加入进程内的 `LIBRARY_PATH`，供便携 GCC 链接使用；发行许可汇总包含编译器包的运行库许可。

本版构建输出：

```text
src-tauri/target/x86_64-pc-windows-gnu/release/qingye-wallpaper.exe
src-tauri/target/x86_64-pc-windows-gnu/release/bundle/nsis/青野壁纸_0.1.2_x64-setup.exe
```

其他可选命令：

```powershell
# 在构建前运行原生 Rust 检查
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/build-desktop.ps1 -RunTests

# 只构建 EXE，跳过安装程序；不用于后面的完整发行整理
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/build-desktop.ps1 -NoBundle
```

### 5. 整理完整发行文件

完成包含安装程序的构建后执行：

```powershell
node.exe scripts/prepare-release.mjs
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/package-portable.ps1
```

得到 `release/0.1.2/` 下的安装程序、完整便携 ZIP、SHA-256 校验文件与许可说明。便携版运行所需的 `WebView2Loader.dll` 会自动从锁定的 Rust 依赖中获取，不需要从别人的电脑复制。

### 开发调试

```powershell
& .\.tools\npm-shim\npm.cmd run dev
```

这会启动 Tauri 桌面窗口。`dev:ui` 是由 Tauri 内部调用的界面开发服务；项目不提供独立浏览器预览或网站部署入口。`index.html`、React、Vite 和 WebView2 是桌面程序内部的界面与构建依赖。

如需在当前 PowerShell 会话手动调用 `cargo` 或查看工具版本，先加载相同环境：

```powershell
. .\scripts\toolchain-env.ps1
cargo.exe --version
rustc.exe --version
gcc.exe --version
npm.cmd --version
```

### 常见构建问题

- **找不到编译器 / 工具版本不匹配**：确认 Node 为 24.15.0，然后重新运行 `scripts/setup-build-tools.ps1`。构建脚本不会回退到其他盘符上的 MSYS2 或全局 Rust。
- **Cargo 报 Windows 证书吊销服务不可达、索引下载失败**：在构建命令末尾增加 `-LocalTransport`。它仅在构建期间通过本机 Node 中转下载公开依赖，保持上游 HTTPS 证书验证与 Cargo 包校验，缓存位于 `.tools/`，结束后恢复 Cargo 配置并关闭自身启动的进程。

  ```powershell
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/build-desktop.ps1 -LocalTransport
  ```

- **离线构建失败**：首次安装必须联网。工具、npm 依赖、Rust 包及 NSIS 工具均已缓存之后才具备离线构建条件。
- **锁文件需要更新**：普通构建保留锁文件。只有维护者有意升级依赖时才使用 `-UpdateLock`，检查并提交更新后的锁文件。
- **升级开发工具版本**：同步更新 `build-tools.json`、`.node-version`、`rust-toolchain.toml`、`package.json` 的版本声明及编译器 SHA-256，并重新验证安装、检查和打包流程。仅修改 README 不会更改实际版本。

固定工具版本和锁文件用于稳定构建环境；不同系统时间和 Windows 环境生成的安装包不保证逐字节一致，Release 校验和用于验证已发布附件本身。

这套工具链已在现有 Windows 开发机上完成测试及 EXE / 安装包构建；尚未完成全新 Windows 虚拟机首次安装验证。详细范围见 [固定工具链构建验证](docs/BUILD-VALIDATION.md)。

## 图片来源与许可

每张示例图的来源、作者、许可、原作分辨率与副本信息记录在 `src/data/wallpapers.json`，也可在应用图片详情中查看。发行包附带 `THIRD_PARTY_NOTICES.md`。遵守各图片的许可要求，包括署名和适用的相同方式共享要求。

## 发布状态

此版本为开发预览版，未做代码签名。清理记录见 [0.1.2 验证记录](docs/VALIDATION-0.1.2.md)，下载与分页检查见 [0.1.1 验证记录](docs/VALIDATION-0.1.1.md)。安装升级、长期后台运行和多设备兼容性仍需继续验证。[其他来源调查](docs/IMAGE_SOURCES.md) 包含 NASA、Openverse 及开放馆藏的接入条件，尚未接入这些来源。
