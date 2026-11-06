# 固定工具链构建验证

日期：2026-11-06；平台：Windows x64、Windows PowerShell。

使用 Node.js 24.15.0、项目 npm 11.14.1、Rust 1.99.1 GNU x64、w64devkit 2.5.0（GCC 15.2.0 / Binutils 2.45）。版本由仓库中的 build-tools.json 管理。

已验证：

- 从官方 Release 下载便携编译器，校验固定 SHA-256 后解压至项目 `.tools/`；重复运行安装脚本成功。
- 官方 Rust 1.99.1 安装清单可访问，包含 Windows GNU x64 目标；本机复用精确版本一致的项目内 Rust 工具链。
- 使用项目 npm 从 package-lock.json 执行 `npm ci` 成功。
- 前端 8 项检查、24 张示例图片校验通过。
- 使用项目 GCC 和 Rust 自带 GNU 运行库执行原生测试，4 项通过。
- 执行 `scripts/build-desktop.ps1 -LocalTransport -RunTests` 成功，包含 TypeScript/Vite 生产构建、Windows EXE、NSIS 中文安装程序（约 20.84 MiB）。
- EXE 的导入表未要求额外的 GCC / pthread DLL；仍需 WebView2Loader.dll 和系统 WebView2 运行环境。
- 新增 JavaScript、PowerShell 脚本语法检查与 Git 差异空白检查通过。
- 未整理或覆盖已有 release/0.1.2 文件；已发布 EXE、安装程序、便携 ZIP 的 SHA-256 保持一致。

构建脚本已移除对 `D:\msys64` 的依赖。w64devkit 不单独提供 libgcc_eh，环境脚本通过进程内 LIBRARY_PATH 使用固定 Rust 自带的运行库，实际测试和链接均通过。许可汇总新增该编译器包提供的 MinGW-w64 运行库许可。

验证边界：此次使用现有 Windows 开发机，重新安装了项目 npm 依赖和便携 GCC，复用了 Rust、Cargo 包及 NSIS 缓存；尚未在全新 Windows 虚拟机中走完首次安装，也未重新执行安装向导或完整应用 UI 回归。首次 NSIS 工具初始化曾遇到 Windows 目录重命名 error 5，历史情况见 [早期验证记录](VALIDATION.md)。本次工具链改动未重新发布 0.1.2 附件。
