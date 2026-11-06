# 青野壁纸

Windows 10/11 x64 桌面壁纸软件，暂定名「青野」。React 用于绘制自定义界面，Tauri / Rust 提供独立窗口与 Windows 系统接口。发行版将界面和示例图片嵌入 EXE，使用时不需要 Node.js、浏览器或本地网页服务器。

## 使用发行版

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

## 本机开发

所有工具链在项目 `.tools/` 下，不修改系统 PATH。Rust 已安装 MSVC 和 GNU 主机工具链；本机缺少 Visual Studio C++ 工具，因此当前构建脚本使用 GNU 工具链并复用 `D:\msys64\ucrt64\bin` 下的编译器。其他机器可调整脚本路径，或安装微软 C++ 构建工具后改用 MSVC 目标。

```powershell
npm.cmd ci
npm.cmd test
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/build-desktop.ps1
node scripts/prepare-release.mjs
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/package-portable.ps1
```

若本机 Cargo 因 Windows 证书吊销服务不可达而下载失败，可给构建脚本增加 `-LocalTransport`。它会启动仅监听本机的 Node 下载中转，从 Rust 官方 GitHub 索引和 static.crates.io 获取依赖，保持上游 HTTPS 证书验证及 Cargo 的包校验和验证。中转缓存也在 `.tools/`；脚本结束后关闭它自己启动的中转进程并恢复 Cargo 配置。

运行桌面开发窗口：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/dev-desktop.ps1
```

`npm.cmd run dev` 启动 Tauri 桌面开发窗口。`dev:ui` 是由 Tauri 内部调用的界面开发服务；项目不再提供独立浏览器预览或网站部署入口。`index.html`、React、Vite 和 WebView2 是桌面程序内部的界面与构建依赖。

0.1.2 已清理浏览器版备用逻辑、浏览器专用文案、独立网页预览命令，以及未使用的 Playwright 测试依赖。桌面程序的图片详情、桌面效果预览、每日下载、收藏和分页继续保留。

## 图片来源与许可

每张示例图的来源、作者、许可、原作分辨率与副本信息记录在 `src/data/wallpapers.json`，也可在应用图片详情中查看。发行包附带 `THIRD_PARTY_NOTICES.md`。遵守各图片的许可要求，包括署名和适用的相同方式共享要求。

## 发布状态

此版本为开发预览版，未做代码签名。检查结果见 [0.1.1 验证记录](docs/VALIDATION-0.1.1.md)。安装升级、长期后台运行和多设备兼容性仍需继续验证。[其他来源调查](docs/IMAGE_SOURCES.md) 包含 NASA、Openverse 及开放馆藏的接入条件，尚未接入这些来源。
