# 共享工具链构建验证

日期：2026-11-16；应用版本：1.1.0；Windows x64。

- Rust / Cargo 1.100.0 stable GNU：E:/DevTools/rustup、E:/DevTools/cargo。
- Node.js 26.13.1 LTS、npm 12.2.2：E:/DevTools/nodejs；npm 缓存 E:/DevTools/cache/npm。
- MSYS2 UCRT64 GCC 16.2.0、Binutils 2.47，复用 E:/DevTools/msys64/ucrt64/bin。
- 官方安装包校验后执行；普通构建不安装或升级共享工具。
- WebView2、Rust 许可及 Cargo 转发使用共享缓存，转发不覆盖共享 Cargo 配置。

## 验证结果

- 工具路径、MSYS2 根目录、包数据库、证书检查通过。GCC 包为 16.2.0-7，Binutils 为 2.47-4。
- 按锁文件 npm ci 成功，15 项前端测试、17 项 Rust 测试及 24 张示例图与署名校验通过。
- TypeScript/Vite、原生 EXE、中文 NSIS 与便携 ZIP 构建通过。
- 验收包位于 E:/DevTools/build-cache/chaoxi-wallpaper/validation-release，未覆盖已发布的本地 1.1.0 包。
- SHA-256、ZIP CRC/文件清单、EXE 与归档一致性、安装包 PE 文件头校验通过。
- EXE 导入表仅包含 Windows 系统 DLL 和随包 WebView2Loader.dll，没有 MSYS2 DLL 依赖。
- 用户环境变量、5 个 MSYS2 开始菜单快捷方式和卸载登记路径已更新至 E 盘。
- 共享 Cargo 配置未被修改；应用依赖版本保留原锁文件。

- 已清理 D:/DevTools、D:/msys64、项目 .tools 和旧 src-tauri/target，共移除约 7.43 GiB 的旧环境与缓存；D 盘可用空间约 19.71 GiB。
- 清理后再次执行共享环境检查，Rust、Node/npm、GCC 与 MSYS2 包数据库和证书检查通过；旧目录未被重建。

未进行新 Windows 虚拟机首次安装、原生窗口逐项交互及完整安装升级验收。
