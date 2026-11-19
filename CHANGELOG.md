# 版本记录

## Unreleased

- 整理独立 GitHub 仓库的文档、忽略规则、源码回归 CI 和发布校验流程。
- 保持运行时源码、插件身份和安全边界不变；不修改已安装的 profile。
- 修复 Windows CI 临时目录使用 8.3 短路径时的 provider 测试夹具：创建后转为真实物理路径，保留额外可写目录的严格授权校验。

## 0.2.0-local.5 — 2026-11-19

- 将目标 DSH 更新为 `0.2.2-rc.5`，同步固定 engine、DSH peer、独立 runner 直接依赖及开发依赖；保留 Microsoft MXC SDK `1.0.1`。
- 适配审查确认 sandbox、error、subprocess、win32-process、app-boot 五个核心包共 39 个实现源文件与 rc.3 逐字节一致；不以此替代原生或部署验证。
- 不自动安装或启用 profile，不授予版本豁免；运行时无 ACL/Low 修改、无降级及自动完全权限回退的边界不变。
- 新版 36 项源码回归通过；关闭自动 Host peers 的系统盘独立候选包通过 Node/Electron 原生探测、7 项文件策略及 4 项控制/生命周期测试。非系统卷全局依赖位置的 PSEC 创建失败及未上线边界见 [TEST-RESULTS.md](TEST-RESULTS.md)，不将候选包成功视作 Desktop 已启用。
- 保留仅针对 21 个精确 rc.5 DSH 包的 pnpm 发布时龄策略及其源码归档校验；不关闭包完整性校验或 DSH 兼容性门禁。

## 0.2.0-local.4 — 2026-11-16

- 将 runner 所需 `@deepseek-ai/dsh-error@0.2.2-rc.3` 声明为直接依赖，修复 Desktop 不自动安装 Host peers 时的独立 runner 导入失败。
- 用专用探测退出 `78` 表示原生能力不满足，普通退出 `1` 不再误报缺少 PSEC。
- 保留 SDK `1.0.1`、DSH `0.2.2-rc.3` 固定版本，无 ACL/Low 修改、无降级或自动完全权限回退。
- 验证记录及未覆盖场景见 [TEST-RESULTS.md](TEST-RESULTS.md)。

## 历史实验版本

- `local.3`：适配 DSH rc.3，但独立 Node 测试未发现真实 Desktop 的 runner 依赖缺口，不应作为 Desktop 可用证明。
- `local.2`：针对 DSH rc.1 的早期检查点，不适用于后续 rc.3 或当前 rc.5。

历史安装包和本机审查材料保留在仓库之外，不纳入本仓库公开历史。
