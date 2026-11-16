# 潮汐壁纸

Windows 10/11 x64 桌面壁纸软件，项目名「潮汐」。React 用于绘制自定义界面，Tauri / Rust 提供独立窗口与 Windows 系统接口。发行版将界面和示例图片嵌入 EXE，使用时不需要 Node.js、浏览器或本地网页服务器。

> 当前本地版本为 1.1.0，安装程序和便携包位于 `release/1.1.0/`。此版本尚未上传 GitHub Releases。

## 使用发行版


- `release/1.1.0/Chaoxi.exe`：便携版，双击启动。请放在可写的目录中，并保留同目录的 `WebView2Loader.dll`。
- `release/1.1.0/Chaoxi-1.1.0-x64-Setup.exe`：中文安装程序，可选择安装目录并创建快捷方式。
- `release/1.1.0/Chaoxi-1.1.0-x64-Portable.zip`：便携版完整压缩包，解压后运行 `Chaoxi.exe`。
- Windows 需要 Microsoft Edge WebView2 运行环境；安装程序在缺少运行环境时会提示安装。便携版本也需要该运行环境。
- 收藏、导入图片及 WebView 数据保存在 EXE 旁的 `data/`，导出图片位于 `data/exports/`，设为桌面的图片位于 `data/wallpapers/`。移动便携版时请一起移动 `data/`。
- 请不要删除当前 Windows 桌面正在使用的图片文件。

## 当前源码功能范围

壁纸库与收藏页新增「管理壁纸库」：支持跨页多选、选择当前页、选择全部筛选结果、批量删除及确认提示。下载图片与导入副本实际删除（保留导入原文件、导出图片和当前桌面副本）；随包示例仅隐藏，可在偏好设置恢复。关联收藏同步清理，删除不会重置每日已下载量。下载或导入期间不可删除。

偏好设置新增「下载类型」，支持人物写真、山野、森林、海岸、湖泊、花卉、宇宙，多选自动保存，用于每日自动及手动追加下载。NASA 仅在勾选宇宙时参与，否则均分给其他已选来源；仅启用 NASA 时需选宇宙。关键词在线搜索不受类型配置限制。

已实现：今日精选、壁纸库、收藏、分类搜索、排序、图片预览、本地导入与内容去重、设置保存、Windows 桌面设置、应用运行期间的定时轮换、图片导出。

随包提供 24 张有来源与许可信息的离线示例。真实每日下载支持 Wikimedia Commons、Openverse 与 NASA：默认只勾选 Wikimedia，每天 24 张，可设为 12/24/48 张；在偏好设置中勾选多个来源后平均分配下载量。例如三源全选、每天 24 张时各下载 8 张。下载完自动加入图库，卡片与图片详情显示来源。图库显示总数，每页 12 张。

每日任务在启动时及程序运行期间检查，按来源记录当天完成数量，重启后只补齐不足的部分。来源设置自动保存，至少保留一个来源；旧设置自动沿用 Wikimedia。当天切换来源保留已下载图片并计入当天总量，完整平均分配从次日开始。单个来源失败或限流不会挤占其他来源配额，各自稍后重试。断网继续使用已有图片；限流按来源要求等待，失败时显示原因并稍后补齐。偏好设置可暂停自动下载。**托盘驻留、开机启动、多屏独立设置尚未实现**。关闭程序会停止下载和定时轮换，保留 Windows 当前壁纸。

图库提供人物写真、山野、森林、海岸、湖泊、花卉、宇宙和本地分类。Wikimedia 和 Openverse 轮流搜索人物写真及自然风景；NASA 提供宇宙图片。分类依据搜索词，结果可能有偏差，横屏比例与授权筛选仍生效。

侧栏「在线搜索」支持任意关键词，仅使用偏好设置中当前勾选的来源，每页最多 12 张，支持上一页、下一页、来源与许可查看。点击「下载到图库」后可收藏、预览和设为桌面；下载不占每日自动额度，且遵守现有去重与限流规则。预览图片在线加载，未下载的搜索结果不提供离线浏览。来源无结果或暂时不可用时显示提示，末页可能不足 12 张。

点击「再下载」可按当前勾选来源追加一批新壁纸，默认每批 24 张（跟随数量设置）。手动追加单独计数，不占每日自动下载额度；多来源平均分配，按图片标识和内容哈希去重。下载期间追加按钮置灰，来源选项锁定，任务结束后可再次点击。暂停或关闭程序保留已入库图片，下一次点击开启新的批次；限流等待仍然生效。


联网缓存位于 `data/library/images`，索引、每日计数、作者、来源、许可、内容哈希与搜索游标位于 `data/library/catalog.json`。请保留完整 data 目录。

导入图片目前使用 IndexedDB 保存，收藏和设置使用 localStorage；联网图片使用普通文件与 JSON 索引。后续统一迁移至 SQLite 与文件目录结构，详见 [开发路线](docs/ROADMAP.md)。

## 从源码构建（Windows x64）

项目复用共享开发工具，不再下载项目专属 Rust、npm 或 GCC，不生成 `.tools`。当前电脑共享目录为 `E:/DevTools`，编译器使用 `E:/DevTools/msys64/ucrt64/bin`。

| 工具 | 本次验证版本 | 使用方式 |
|---|---|---|
| Node.js | 26.13.1 LTS | DEVTOOLS_ROOT/nodejs 或 PATH |
| npm | 12.2.2 | 共享 Node 中的 npm |
| Rust / Cargo | 1.100.0 stable GNU x64 | 共享 RUSTUP_HOME 和 CARGO_HOME |
| GCC / G++ | MSYS2 UCRT64 16.2.0 | MSYS2_UCRT64_BIN 或 PATH |
| Binutils / windres | 2.47 | 同一套 MSYS2 编译器目录 |

build-tools.json 记录已验证版本；日常构建不安装或更新全机工具。应用依赖由 package-lock.json 和 src-tauri/Cargo.lock 锁定。

### 准备共享工具

安装 [Node.js 官方 LTS](https://nodejs.org/en/download)、[MSYS2](https://www.msys2.org/) 的 UCRT64 GCC 和 [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)。GNU 构建流程不要求 Visual Studio。

首次安装或更新共享 Rust：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/install-rust.ps1 -ToolsRoot E:/DevTools
```

脚本从官方源下载并校验 Rustup，安装当前 stable GNU，设置当前用户的 RUSTUP_HOME、CARGO_HOME 与 Cargo PATH。安装后重开终端。多个项目共用 Rust 与下载缓存。

本机 DEVTOOLS_ROOT 为 E:/DevTools，MSYS2_UCRT64_BIN 为 E:/DevTools/msys64/ucrt64/bin。环境脚本在当前进程优先使用它们。若系统 PATH 还有旧 Node，其他终端可能仍解析旧版本，可用 Get-Command node.exe 检查。

```powershell
. ./scripts/toolchain-env.ps1
npm.cmd ci
npm.cmd test
node.exe scripts/verify-assets.mjs
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/setup-build-tools.ps1
```

setup-build-tools.ps1 只检查共享工具，不安装项目内工具。升级 Node/npm、Rust 或 MSYS2 后需重新验证；MSYS2 按官方完整更新流程升级。

### 构建与打包

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/build-desktop.ps1 -RunTests
```

共享目录可用时，编译缓存默认位于 E:/DevTools/build-cache/chaoxi-wallpaper（由 CARGO_TARGET_DIR 指定），输出位于其中的 x86_64-pc-windows-gnu/release，包括 EXE 和 bundle/nsis 安装包。可用 -NoBundle 跳过安装程序，-DebugBuild 生成调试构建。

Cargo HTTPS 因证书吊销服务不可达而失败时可加 -LocalTransport。转发保留上游 TLS 及 Cargo 校验，缓存位于共享 CARGO_HOME/transport-cache，临时配置与日志位于项目 .local-data，不修改共享 Cargo 配置。

```powershell
. ./scripts/toolchain-env.ps1
node.exe scripts/prepare-release.mjs
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/package-portable.ps1
```

发行文件位于 release/<版本>。WebView2Loader.dll 来自锁定的共享 Cargo 依赖，许可汇总只收集本项目锁定的 Rust 包及编译器运行库。

开发调试：加载相同环境后执行 npm.cmd run dev，打开 Tauri 桌面窗口。dev:ui 是桌面程序内部的界面开发服务。

node_modules 是项目依赖，src-tauri/target 是编译缓存，仍会存在。不要清理保存用户壁纸的 data。验收范围见 [构建验证记录](docs/BUILD-VALIDATION.md)。


## 图片来源与许可

每张示例图的来源、作者、许可、原作分辨率与副本信息记录在 `src/data/wallpapers.json`，也可在应用图片详情中查看。发行包附带 `THIRD_PARTY_NOTICES.md`。遵守各图片的许可要求，包括署名和适用的相同方式共享要求。

## 发布状态

当前版本 **1.1.0**，已在 [GitHub Releases](https://github.com/edwardadrian302-hue/wallpaper/releases/tag/v1.1.0) 发布安装包和便携包。功能与验收范围见 [1.1.0 说明](docs/releases/v1.1.0.md) 和 [验证记录](docs/VALIDATION.md)。

升级时保留并复制 EXE 旁完整的 data 目录。收藏、偏好和导入图片在可读取原浏览器数据时迁移至当前存储名称；原数据保留。应用标识现为 com.chaoxi.wallpaper，未完成跨标识的安装升级验收，建议使用新的可写安装目录。
