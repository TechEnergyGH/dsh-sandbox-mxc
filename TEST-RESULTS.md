# 本机验证记录

## 0.2.2-rc.5 版本同号调整 — 2026-11-19

当前源码包版本改为 `0.2.2-rc.5`，与 `engines.dsh` 的精确适配版本一致；此前的 `0.2.0-local.5` 及其原生验收记录保留在下面的历史章节。此调整不修改 `lib/` 运行时代码、DSH 依赖、锁文件或 Microsoft MXC SDK `1.0.1`。

- 在当前 `workspace-write` 会话中使用 Standalone Node `24.21.0` 运行标准 Node test：**36 通过、0 失败、0 跳过**。
- bundle 和兼容性测试增加 `version === engines.dsh === 0.2.2-rc.5` 约束；归档验证器同样要求插件版本与适配 DSH 版本一致。
- 新版归档名称为 `dsh-sandbox-mxc-0.2.2-rc.5.tgz` 和 `dsh-sandbox-mxc-0.2.2-rc.5-source.zip`，由发布脚本检查清单、版本、路径和源码字节。
- 此次未重新执行原生 MXC/PSEC 集成测试、GitHub 安装或新命名版本的 Desktop 在线安装验收，不把历史 local.5 结果改写为新包的独立验收结果。
- 当前已安装的 Desktop 插件不因源码版本调整而自动改变；旧命名的本地 `v0.2.0-local.5` tag 移除，新发行标签使用 `v0.2.2-rc.5`；旧提交和验证记录不改写，远程发布另行执行。

## 历史：local.5 / DSH rc.5 适配 — 2026-11-19

插件：`0.2.0-local.5`。目标 DSH：精确 `0.2.2-rc.5`。验证环境：Windows x64、Standalone Node `24.21.0`、实际 Desktop Electron `44.7.0` / 内嵌 Node `24.21.0`、MXC SDK `1.0.1`。本节与下面的 local.4 / rc.3 历史记录分开，不继承旧版通过结论。

### 适配范围

- 更新 engine、sandbox peer、error/subprocess/win32-process 直接依赖及 app-boot 开发依赖到 rc.5，由 pnpm 重新生成锁文件；保留 SDK `1.0.1`。
- rc.3 与实际 rc.5 的 sandbox、error、subprocess、win32-process、app-boot 五包共 39 个实现源码逐字节一致；未发现需要修改核心执行逻辑的接口变化。
- `lib/` 的 provider、runner、策略和控制桥保持不变。独立 runner 的直接依赖闭包没有退回仅声明 Host peers。
- 不扩大兼容版本范围、不授予 DSH 版本豁免、不修改 profile 或会话默认权限。
- pnpm 11 新生成的 `pnpm-workspace.yaml` 仅列出本次 21 个精确 rc.5 DSH 包的发布时龄例外，随源码 ZIP 保存；这不是 DSH 版本豁免，也不关闭包完整性校验或普遍放行新依赖。

### 源码回归：36 项通过

使用仓库实际安装的 rc.5 依赖运行标准 Node test：**36 通过、0 失败、0 跳过**。

包括原有策略、provider、bundle、控制桥和独立导入测试，并增加：

- rc.5 版本门禁接受新版，拒绝 rc.1、rc.3、rc.4、未经验证的 rc.6 和稳定版 0.2.2。
- 旧 local.4 的 rc.3 engine 在 rc.5 下明确被拒绝，不能悄悄豁免。
- 锁文件中所有 DSH 包身份均为 rc.5，实际接口包和独立 runner 的直接依赖版本一致。
- 源码归档保留 pnpm 发布时龄策略，例外仅允许精确 rc.5 包身份。

源码回归不是原生容器验收。`pnpm test` 是复现入口。

### 独立候选包：关闭自动 Host peers 后通过

在干净的系统盘临时目录，仅声明本次候选 `.tgz`，安装禁用构建脚本和自动 peers。明确确认从插件位置不能解析 `@deepseek-ai/cordis` 和 `@deepseek-ai/dsh-sandbox`，但：

1. runner 导入成功。
2. 清除 Host resolver/loader 环境后，Standalone Node 完整 `runner --probe` 退出 0。
3. 实际 Desktop Electron（`ELECTRON_RUN_AS_NODE=1`）完整 `runner --probe` 退出 0。

不是仅运行 SDK raw probe；原生目标实际启动。最终发布包和源码 ZIP还由归档验证器检查清单、固定依赖、源码字节和路径安全，SHA-256 由 `verify:release` 输出，不在归档内部重复嵌入自身哈希。

### Desktop Electron + 独立候选包原生文件策略：7 项通过

使用候选包的 runner，在新建临时工作区运行目标，结果：

| 验证 | 结果 |
| --- | --- |
| 工作区与本次显式授权额外目录写入 | 通过 |
| 未授权区外写入 | 被拒绝，目标未创建 |
| read-only 工作区和额外目录写入 | 被拒绝 |
| 跨卷目录枚举及空格/尾反斜杠参数 | 通过 |
| PowerShell 写入和 Remove-Item 清理 | 通过 |
| 工作区与既有文件 ACL/完整性标签前后比较 | 完全不变 |
| 普通非零退出码 42 镜像 | 通过 |

### Desktop Electron + 独立候选包原生控制/生命周期：4 项通过

- 原生 fd7 双向通信、最终数据完整保留与桥凭据移除。
- 启动后立即输出 20KB 控制数据并退出，字节完整收到。
- 完整 DWORD `0xf1234567` 退出码镜像。
- detached 子进程随前台目标结束被回收。

两组原生测试宿主在完全权限下运行，**实际测试目标仍在 MXC/PSEC 中**。测试仅写入独立临时工作区，不改 ACL、系统服务或 profile。

### 本次发现的依赖位置边界

新依赖在非系统卷的全局 pnpm store 位置执行时，原生执行器创建 PSEC 失败：`CreateProcessSecurityEnvironment failed (HRESULT = 0x80070005)`；runner 返回 127，目标未成功启动，保持拒绝执行。相同宿主和新建临时工作目录下，旧已安装 local.4 探测成功；同一 local.5 候选包独立安装到系统盘临时目录后，Node/Electron 探测及上述 11 项原生测试全部成功。

只读比较确认新旧 runner/策略/控制桥及 SDK x64 的 14 个二进制文件逐字节相同，执行器均有有效 Microsoft 签名；依赖目录的继承权限不同。**这支持依赖部署位置/权限是调查方向，但未证明某条权限项的因果，不能宣称任意位置都兼容。** 本次没有修复这些目录权限、复制执行器绕过限制、开启 ACL augmentation 或进行未授权重试。不要把源码目录中失败的原生测试改记为通过；这里的原生通过结论只属于上述独立候选包部署组合。

### 上线与安全边界

- 未安装或启用到实际 Desktop profile；在线 fiber、bundle 应用状态及新会话中的受限命令仍须安装后单独验收。候选包成功不等于当前 GUI 已启用 MXC。
- 未验证宿主/runner 崩溃、所有取消组合、其他 Windows/ARM64、其他 DSH 版本或真实 Cargo/Bun/Tauri 完整构建。
- 保持 `enforcement: partial`；不保证机密读取隔离、硬链接别名安全或网络隔离。
- 目标执行后的 drain/Job/temp 清理失败不能证明目标未执行，有副作用命令不能自动重跑。
- 不恢复历史 Low 标签；移除本 bundle 后默认 ACL 后端可能再次写标签。

## 历史：local.4 Desktop runner 修复

日期：2026-11-16（Asia/Shanghai）。插件：`0.2.0-local.4`，目标宿主：`DSH 0.2.2-rc.3`。

## 本次实际故障与根因

local.3 在真实 Desktop 中已激活，默认 ACL backend 已禁用，但受限命令无法启动。原 provider 把退出1标记为原生能力不满足；Windows服务与SDK原始探测实际正常。

通过同一已安装 runner 的独立 Node 与 Desktop Electron 功能探测，真实复现：

```text
ERR_MODULE_NOT_FOUND: Cannot find package '@deepseek-ai/dsh-error'
imported from .../@deepseek-ai/dsh-win32-process/lib/index.js
```

Desktop宿主能解析Host peers，但新启动的runner子进程不能继承该解析器。local.3把dsh-error只列为peer，普通pnpm测试又默认自动安装peers，因而掩盖了实际部署缺口。SDK raw probe不导入Win32 runner模块，只证明PSEC能力，不能证明执行链路。

## 修复

- `@deepseek-ai/dsh-error@0.2.2-rc.3` 从Host peer改为**直接运行依赖**，闭合runner的真实依赖链。
- subprocess/control只用node:net，Win32模块其他运行依赖lazy-require/koffi已经是直接依赖；不额外复制Cordis/sandbox/http-proxy宿主服务。
- 原生能力明确不满足使用探测专用退出码78；普通退出1（例如导入失败）改报探测启动失败，仍fail-closed。
- 不修改Electron/Node执行路径或启动环境，不引入未被根因支持的nodePath配置，不更换SDK。
- 保持无ACL/Low标签操作、无ACL回退、无自动完全权限回退；extra roots权限、fd7协议与Job回收行为不变，enforcement仍partial。

## 环境

- DSH：实际安装的rc.3。
- Standalone Node：24.21.0，Windows x64。
- Desktop Electron：44.7.0，内嵌Node24.21.0，Windows x64。
- MXC SDK：1.0.1。
- 验证命令宿主按用户明确授权使用完全权限，以排除外层受限启动的影响；**真正的文件/控制测试目标仍在原生MXC内**。
- 未修改系统服务、ACL配置、会话默认权限或历史标签；依赖安装全部禁用构建脚本。

## 发布前验证结果

### 29项源码回归：全部通过

在标准Node test隔离模式运行，29通过、0失败、0跳过。

包括既有26项策略/provider/bundle/控制桥回归，以及：

1. 直接依赖闭包必须包含dsh-error/subprocess/win32-process的rc.3固定版本。
2. 清除NODE_OPTIONS、NODE_PATH、TSX_及DSH_环境后，独立Node子进程仍能仅导入runner，不使用Host解析器。
3. 普通启动退出1不再误标为原生能力不满足；原生拒绝78与其他异常均拒绝执行。

原始回归输出保留在维护者本机验证材料中，不随本仓库发布。可用 `pnpm test` 在当前源码复现回归。

### 禁用自动peers的真实候选包：通过

独立测试目录仅声明候选tgz，安装使用`--ignore-scripts --config.auto-install-peers=false`。确认从插件位置不能解析Cordis/sandbox两个Host peers，但：

- runner导入成功。
- Standalone Node执行完整`runner --probe`退出0。
- 实际Desktop Electron（ELECTRON_RUN_AS_NODE=1）执行完整`runner --probe`退出0。

不是仅检查清单或 SDK rawprobe。原始候选包报告保留在维护者本机，不随本仓库发布；该历史报告不等于当前新打包文件已经完成相同部署验收。

### 实际Desktop Electron原生文件策略：7项通过

使用实际Electron作为脚本宿主，运行原生runner和容器目标：

| 验证 | 结果 |
| --- | --- |
| 工作区及本次显式授权额外缓存目录写入 | 通过 |
| 工作区外未授权写入 | 被拒绝，目标未创建 |
| read-only工作区及额外目录写入 | 被拒绝 |
| 跨卷目录枚举及空格/尾反斜杠参数 | 通过 |
| PowerShell写入及Remove-Item清理 | 通过 |
| 工作区及既有文件icacls前后比较 | 完全不变 |
| 普通非零退出码42镜像 | 通过 |

原始文件测试输出保留在维护者本机，不随本仓库发布。源码复现入口：`pnpm run test:integration`；需要满足 README 中的宿主、挂载卷和 PowerShell 前提。

### 实际Desktop Electron原生控制/生命周期：4项通过

- fd7双向ping/pong、最终字节保留、桥凭据移除。
- 目标启动立即写20KB控制数据并退出，字节完整收到。
- 完整DWORD `0xf1234567` 镜像。
- detached子进程随前台结束回收。

原始控制测试输出保留在维护者本机，不随本仓库发布。源码复现入口：`pnpm run test:control`。

## 发布与上线验证边界

本记录描述正式打包前验证；通过插件管理器更新后的实际fiber状态、是否需要重启及当前会话命令结果，应另行检查，不能用候选包测试冒充在线激活成功。

- 未在真实Cargo/Bun/Tauri项目中构建，不能据此保证所有DLL/安装器兼容。
- 未验证其他DSH/Windows/ARM64版本。
- 不宣称绝对读取隔离、硬链接别名安全、网络隔离或full enforcement。
- 目标执行后的控制drain/Job/temp清理错误不证明目标未执行，有副作用命令不能据此自动重复。
- MXC不恢复遗留Low标签；移除bundle恢复旧ACL后端后，后续workspace-write可能再次写标签。

## 历史

local.2的rc.1测试、local.3的独立Node测试记录保留在旧归档中。local.3后来在真实profile中暴露缺失peer，不能继续把其独立测试当作Desktop可用性的证明。local.4补齐关闭自动peers及实际Electron执行场景。
