# dsh-sandbox-mxc

面向 **Windows / DeepSeek Harness 0.2.2-rc.5** 的原生 MXC/PSEC 沙箱插件。

**核心目标：限制受限命令的文件写入，不修改宿主 ACL 或 Low 完整性标签；原生能力不足时直接拒绝，不自动降级。**

> 当前版本：`0.2.0-local.5`，实验性实现。不是 DeepSeek 或 Microsoft 官方插件，也不是 bitsmug 发布的同名 npm 包或 omdsh-dev 的 scoped 包。本项目保持 `private: true`，用于从源码打包、安装或发布 GitHub Release，不会通过 `pnpm publish` 覆盖公开同名包。

## 环境要求

| 项目 | 要求 |
| --- | --- |
| DSH | **恰好 `0.2.2-rc.5`**；其他版本必须重新适配和验证 |
| 系统 | Windows，实际具备原生 PSEC/BaseContainer 能力 |
| Node.js | `>=24.9.0`；本机验证使用 `24.21.0` |
| MXC SDK | Microsoft `@microsoft/mxc-sdk`，精确固定 `1.0.1` |
| 开发工具 | pnpm `11.28.5`；源码归档脚本另需 Python 3 |

Windows 支持情况以运行时功能探测为准，不能仅依据 Windows 版本号。管理员权限不是设计前提；不要用提权或版本豁免掩盖探测、依赖或兼容性问题。

`local.5` 将 DSH engine、peer、runner 直接依赖及开发依赖固定到 rc.5，SDK 仍为 `1.0.1`。适配审查中，rc.3 与 rc.5 的 sandbox、error、subprocess、win32-process、app-boot 五个核心包共 39 个实现源文件逐字节一致；这不等于传递依赖、原生行为或 profile 激活已通过验收。rc.5 正常版本门禁会拒绝旧版 `local.4` 的 rc.3 声明，应使用适配版本，不申请版本豁免。历史 `local.4` / rc.3 及 `local.2` / rc.1 的记录保留在 [版本记录](CHANGELOG.md) 和 [测试记录](TEST-RESULTS.md)。

## 安全与权限语义

- 替换 DSH 的 `sandbox` 服务，由 bundle patch 禁用默认 `sandbox-local` 提供方；不修改会话权限档位。
- `workspace-write`：允许写入工作区、本次调用由 DSH 授权的 `additionalWritableRoots` 和本次调用独享的临时目录。
- `read-only`：不给目标进程任何可写根，独享临时目录也不例外。
- 只接受 `base-container` 且 `needsDaclAugmentation === false`；每次实际请求再次检查原生能力。
- **不修改或清除宿主 ACL/完整性标签，不回退旧 ACL 后端，不在失败后自动转为完全权限。**
- 前台调用结束后以 Windows Job 回收进程树，包括 detached 子进程。持续后台任务应由 DSH 管理，而非脱离前台存活。
- 宿主读取和网络访问保持允许；禁止剪贴板访问及输入注入。这不是机密读取隔离或网络隔离产品。
- 如实报告 `enforcement: partial`；硬链接别名等边界仍存在，不能当作完整安全容器。
- 用户明确选择 `danger-full-access` 时，由 DSH 消费方正常绕过沙箱；这不是插件的故障回退。

额外目录请在 **DSH 的正式额外可写目录设置**中授权。本插件没有全局 `extraWritablePaths` 配置，不自行放行 `.cargo`、`.bun` 或 `.rustup`。额外授权目录应是已存在的绝对物理目录，不接受符号链接授权或整卷可写授权。

## 从源码安装

在 Windows PowerShell 中进入本仓库根目录：

```powershell
pnpm install --frozen-lockfile --ignore-scripts
pnpm test
pnpm run pack:plugin
```

安装包生成到 `dist/dsh-sandbox-mxc-0.2.0-local.5.tgz`。项目没有构建步骤：`lib/` 中的 JavaScript 就是直接维护的源码。上述安装依赖、测试和打包命令不会将插件自动安装或启用到任何 DSH profile；安装和启用须由用户明确执行。

### Desktop profile

1. 保存工作，结束正在运行的任务。
2. 使用 **DSH 应用内插件管理器**安装刚生成的本地 `.tgz`，或下载本项目 GitHub Release 的安装包。
3. 启用 bundle，按管理器实际提示重载或重启。
4. 不要同时启用另一个替换 `sandbox` 服务的插件；不要手改正在运行的 Desktop profile。

**请使用完整本地包路径，不要仅输入 `dsh-sandbox-mxc`，也不要更新到公开注册表里的另一个同名插件。** 已有同名包时先核对来源；切换插件影响该 profile 的其他会话。

### 独立 CLI profile

仅对没有被 Electron 管理、由 CLI 独立管理的 profile 使用：

```powershell
dsh plugin --profile <你的CLI-profile> add <安装包的绝对路径>
```

## 验证

```powershell
pnpm test
pnpm run probe
pnpm run test:integration
pnpm run test:control
```

- `pnpm test`：源码策略、真实 DSH 接口、bundle 和控制桥回归；不是原生容器验收。
- `probe`：探测并启动一次原生 MXC 目标，不满足条件则退出失败。
- 两组集成测试：在新建临时工作区验证文件策略、ACL 前后不变、fd7、退出码与 detached 子进程回收。文件测试还需要第二个挂载卷，以及安装在标准位置的 PowerShell 7。
- 原生测试须在能正常启动子进程的宿主终端执行，避免在现有 MXC 容器内嵌套测试；报告生成在仓库根目录，默认不提交。
- 本次确认：关闭自动 Host peers 的系统盘独立候选包通过 Node/Electron 探测及 11 项原生测试；非系统卷全局 pnpm store 的源码依赖位置曾因 PSEC 创建被拒而失败。依赖部署位置/权限仍是环境前提，不能用源码回归成功掩盖原生失败，详见测试记录。

安装后的在线验收也不可省略：创建 `workspace-write` 会话，执行一次受限命令，检查日志出现：

```text
Windows sandbox: native MXC/PSEC; no host ACL/integrity-label changes; no ACL fallback
```

确认工作区写入成功、未授权区外写入被拒、只读写入被拒，以及 ACL/完整性标签前后不变。**仅执行完全权限命令不能证明 MXC 已生效。**

按插件和 DSH 精确版本区分的实际测试与验证边界见 [TEST-RESULTS.md](TEST-RESULTS.md)。适配前旧版的 34 项源码回归通过只针对 rc.3；rc.5 的新版回归、原生测试和 Desktop 在线验收必须分别记录，未记录为通过的项目不能视作已完成。GitHub Actions 仅运行源码回归，不能代替原生 PSEC 或真实 Desktop 验收。

## 配置

唯一插件配置为正整数超时 `probeTimeoutMs`，默认 `15000` 毫秒。bundle patch 为：

```yaml
- id: sandbox
  name: '@deepseek-ai/dsh-sandbox-local'
  disabled: true
- insert:
    - id: sandbox-mxc
      name: dsh-sandbox-mxc
      config:
        probeTimeoutMs: 15000
```

DSH patch 的 `name` 是匹配断言，不是重命名；不能只改原条目的名称来替换服务。

## 限制与回滚

- 不恢复旧后端遗留的 Low 标签/ACE；恢复权限需要单独检查并明确授权。
- 某些 DLL、构建工具、注册表/UI 或命名管道操作仍可能不兼容；没有注入全局 Node API shim，也不偷偷把失败目标移到宿主执行。
- 未在真实 Cargo/Bun/Tauri 项目中验证完整构建；未验证其他 DSH、Windows 或 ARM64 组合。
- 目标执行后的控制 drain、Job 或临时目录清理失败也可能返回基础设施错误；**不代表目标未执行，有副作用的命令不能自动重复。**
- fd7 使用 Windows `overlapped` 双向控制管道；自行调用 runner 的程序不能用同步 `pipe` 代替。

回滚请在插件管理器中禁用或移除本 bundle，遵循重载/重启提示。没有其他覆盖层时，默认 ACL 后端重新生效，**后续 `workspace-write` 调用可能再次写 Low 标签**。若目标是始终避免新标签，回滚前由用户明确选择完全权限或另一种不改标签的隔离后端；本插件不会自动放开权限。

## 仓库导航

- `lib/`：provider、策略、runner、控制桥及 Windows 参数转义。
- `tests/`：源码回归。
- `scripts/`：原生集成测试、归档与发布验证。
- [架构与安全边界](docs/ARCHITECTURE.md)
- [打包与 GitHub 发布](docs/PUBLISHING.md)
- [贡献说明](CONTRIBUTING.md) / [安全报告](SECURITY.md)
- [版本记录](CHANGELOG.md)

## 许可证与来源

MIT，保留上游版权与来源说明。runner 和控制桥参考 ornithologist-love 的 DeepSeek Harness MIT 分支，并修改了服务接入、授权根、失败路径及控制生命周期。具体来源见 [NOTICE.md](NOTICE.md)，许可证见 [LICENSE](LICENSE)。
