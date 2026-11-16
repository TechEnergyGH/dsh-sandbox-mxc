# 版本记录

## Unreleased

- 整理独立 GitHub 仓库的文档、忽略规则、源码回归 CI 和发布校验流程。
- 保持运行时源码、插件身份和安全边界不变；不修改已安装的 profile。

## 0.2.0-local.4 — 2026-11-16

- 将 runner 所需 `@deepseek-ai/dsh-error@0.2.2-rc.3` 声明为直接依赖，修复 Desktop 不自动安装 Host peers 时的独立 runner 导入失败。
- 用专用探测退出 `78` 表示原生能力不满足，普通退出 `1` 不再误报缺少 PSEC。
- 保留 SDK `1.0.1`、DSH `0.2.2-rc.3` 固定版本，无 ACL/Low 修改、无降级或自动完全权限回退。
- 验证记录及未覆盖场景见 [TEST-RESULTS.md](TEST-RESULTS.md)。

## 历史实验版本

- `local.3`：适配 DSH rc.3，但独立 Node 测试未发现真实 Desktop 的 runner 依赖缺口，不应作为 Desktop 可用证明。
- `local.2`：针对 DSH rc.1 的早期检查点，不适用于当前 rc.3。

历史安装包和本机审查材料保留在仓库之外，不纳入本仓库公开历史。
