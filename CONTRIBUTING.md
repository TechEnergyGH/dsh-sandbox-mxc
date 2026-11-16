# 贡献说明

这是针对 Windows / DSH `0.2.2-rc.3` 的实验性插件。`lib/` 是直接维护的 JavaScript 源码，无额外编译步骤。

## 开发

```powershell
pnpm install --frozen-lockfile --ignore-scripts
pnpm test
```

使用 Node `24.21.0` 和 pnpm `11.28.5` 可复现当前验证环境。安装脚本默认禁用；需要新增依赖构建时先审查具体包和脚本，不要全局打开脚本执行。

原生测试见 [README](README.md)；执行前确认测试宿主是正常终端，而非另一个受限 MXC 容器。GitHub CI 只验证源码回归，不保证其 runner 有 PSEC。

## 提交要求

- 小范围修改，附上复现、目标版本和测试结果；清楚区分通过、跳过及未验证。
- provider/策略变更补充 `tests/` 回归；控制桥/Job 变更还需原生集成验证。
- 不修改宿主 ACL、不新增 Low 标签、不自动回退或裁剪权限策略。这些是核心约束。
- 不直接扩大 DSH peer/engine 范围；先核对新版本实际 API、runner 依赖及部署行为。
- SDK 版本必须精确固定；更新时重新审查原生探测、策略和执行器行为。
- 保留来源与许可证；不要提交本机日志、profile、依赖缓存、密钥或上游安装提取物。
- 不把测试成功描述为完整安全隔离，保持 `partial` 的真实边界。

发布前运行源码回归和归档校验，检查 `git diff --check`、文件列表与文档链接。打包步骤见 [发布说明](docs/PUBLISHING.md)。
