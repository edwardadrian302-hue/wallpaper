# 固定工具链构建验证

当前版本：1.1.0；平台：Windows x64、Windows PowerShell。

Node.js 24.15.0、项目 npm 11.14.1、Rust 1.99.1 GNU x64、w64devkit 2.5.0（GCC 15.2.0 / Binutils 2.45），版本由 build-tools.json 管理。

构建使用项目内工具链、锁定依赖与缓存；流程为 scripts/build-desktop.ps1 -LocalTransport -RunTests，再执行 prepare-release.mjs 和 package-portable.ps1。

工具链只修改当前进程环境变量；本地依赖中转保留上游 TLS 校验及 Cargo 校验和。运行环境仍需要 WebView2，发行包包含 WebView2Loader.dll。

当前功能测试与验收范围见 [验证记录](VALIDATION.md)。未进行全新 Windows 虚拟机首次安装、完整升级流程或多设备兼容性验收。
