# 0.1.0 桌面预览版验证记录

日期：2026-11-06（Asia/Shanghai）。本机为 Windows 11 x64。

## 已完成

- `npm.cmd run build`：TypeScript 严格检查与 Vite 生产构建通过。
- `npm.cmd test`：5 项通过，覆盖每日精选稳定性、日期边界、分类搜索、轮换候选与损坏设置恢复。
- `cargo test --target x86_64-pc-windows-gnu --release --locked --offline`：1 项通过，覆盖图片标识符拒绝路径输入。
- `node scripts/verify-assets.mjs`：10 张本地图片存在，文件尺寸与元数据一致，作者、来源与许可字段完整。
- Tauri Windows GNU release 编译成功，主程序约 13.7 MiB。
- NSIS 中文 x64 安装包生成成功，约 9.45 MiB。
- 检查安装脚本：含安装目录选择页、简体中文资源、主程序、WebView2Loader、图片署名与软件许可文件。
- 检查 EXE 导入表：除随包附带的 WebView2Loader 外，其余均为 Windows 系统 DLL；不依赖 Node.js、Vite 或 MinGW 的开发环境 DLL。
- 双击等效启动 `release/Qingye.exe` 成功，观察到独立窗口、完整图片及自定义界面。
- 实际点击收藏，收藏数量从 0 变为 1，收藏页正确显示对应图片。
- 实际打开图片详情，显示作者 Smilla Heckel、CC BY-SA 4.0、来源入口及图片尺寸。
- 实际执行原生图片导出，生成 `data/exports/commons-132453708.png`，约 6 MB。
- 桌面版数据实际位于 EXE 旁的 `data/`，本次测试数据已单独保留于项目 `.local-data/desktop-smoke-20261106`，不纳入便携包。

## 验证边界

- 没有为测试修改用户的 Windows 桌面壁纸；`IDesktopWallpaper` 调用已编译通过，实际设置与适配效果仍需人工验证。
- 本地导入已打开系统文件选择框并填入项目内样例路径，但自动化点击被工具拒绝：`point ... is over msedgewebview2.exe ... not target window Qingye.exe`。导入、去重及重启恢复的完整 UI 流程尚未验证。
- 未执行实际安装、卸载或升级；已检查安装包生成结果及安装脚本内容。
- 未验证 Windows 10、其他设备、多显示器、休眠恢复及长时间轮换。
- 每日联网下载、托盘驻留、开机启动尚未实现。
- 当前为未签名开发预览版。

## 构建环境与网络处理

Rust MSVC 和 GNU 主机工具链位于项目 `.tools/`，构建使用 GNU 主机及 `D:\msys64\ucrt64\bin` 的现有编译器；没有修改系统 PATH。

Cargo 的 Schannel 下载曾遇到证书吊销服务不可达。构建期间使用仅监听 127.0.0.1 的 Node 依赖中转，从 Rust 官方索引仓库和 static.crates.io 下载，保持正常 HTTPS 证书验证和 Cargo 校验和验证。

NSIS 官方压缩包校验成功，但 Tauri 自动解压后的目录重命名返回 Windows error 5。已将解压结果复制至项目内预期工具路径，校验 NSIS.exe SHA-1 与 Tauri 官方插件 SHA-1 后重新打包成功。没有修改系统安全设置。
