# 架构与安全边界

## 执行链路

```text
DSH 消费方（逐调用权限策略）
  → MxcSandboxProvider.confine()
  → runner.js（宿主侧）
  → SDK 1.0.1 的 wxc-exec.exe（Windows Job 管理）
  → 原生 ProcessContainer 内的控制 bootstrap
  → 目标程序
```

`cordis.patch.yml` 禁用默认 `sandbox-local`，插入一个 MXC provider。移除本 bundle 会重新暴露默认 provider，并不意味着默认 provider 同样不改 ACL。

## 模块职责

| 模块 | 职责 |
| --- | --- |
| `lib/index.js` | 模式和宿主校验、逐调用授权根、成功探测缓存、返回 DSH ConfinedArgv |
| `lib/policy.js` | 根目录校验、只读/可写集合、网络/UI 策略、错误分类元数据 |
| `lib/runner.js` | 清除 SDK 原生路径覆盖、固定 SDK 检查、每次请求探测、原生执行与 Job 回收 |
| `lib/control.js` | 经过认证的 loopback fd7 控制桥、目标启动确认、最终数据 drain |
| `lib/win32.js` | Windows 命令行参数转义 |

## rc.5 适配边界

当前插件包版本为 `0.2.2-rc.5`，精确面向同版本 DSH，版本号跟随适配的 DSH 版本。历史 `0.2.0-local.5` 适配时已经将 engine、peer、独立 runner 直接依赖及开发依赖固定到 rc.5；本次包版本更名不改变这些声明、原生运行逻辑或 Microsoft MXC SDK `1.0.1`。旧 local.5 提交和验证记录仍保留；新发行标签使用 `v0.2.2-rc.5`，旧命名的本地标签移除；更名不代表新包版本已独立重测原生行为。独立 runner 必须自己声明运行时依赖闭包，不能仅凭 Host provider 能导入就认定子进程依赖完整。

历史 local.5 适配审查中，rc.3 与 rc.5 的 sandbox、error、subprocess、win32-process、app-boot 五个核心包共 39 个实现源码逐字节一致，未发现这些接口需要核心运行逻辑迁移。但源码一致不能证明传递依赖、原生 ABI、文件策略或进程清理行为完全兼容。按新版实际回归、原生集成和在线激活分别验收，结果见 [测试记录](../TEST-RESULTS.md)；旧版 rc.3 的 34 项源码回归通过不自动延续到 rc.5。

安装、启用及 profile 重载/重启必须由用户明确执行，不是构建或测试的副作用。旧版 `local.4` 的 rc.3 engine 声明会被 rc.5 的正常版本门禁拒绝，不使用版本豁免绕过这一边界。

## 不可放宽的约束

1. 仅接受 `read-only` / `workspace-write`。完全权限由 DSH 消费方显式处理。
2. 仅接受原生 `base-container` 且明确不需要 DACL augmentation。
3. 不操作宿主 ACL/Low 标签；不自动修复遗留权限；不回退旧 ACL 或完全权限。
4. 额外可写根只能来自 DSH 本次调用的授权策略，不从插件全局设置或环境变量扩展。
5. 原生请求不能成立时拒绝，不能自动裁剪策略后重试。
6. 前台结束是进程树生命周期边界；不能以 detached 启动绕过回收。
7. 保持 `enforcement: partial`，不能把探测成功当成完整文件隔离保证。

## 控制通道

DSH fd7 双向管道通过宿主 loopback TCP 桥连接到容器内 bootstrap，再由 bootstrap 使用 `overlapped` 创建目标 fd7。桥使用随机凭据、恒定时间比较、认证长度限制、连接数限制和启动超时。凭据在启动目标前移除。

目标成功 spawn 后必须确认启动，避免执行器失败被误读为正常目标退出。前台退出时有界 drain 最终控制数据，随后回收 Job 内剩余进程；不能无限等待被后代持有的管道。

## 错误语义

- 探测明确不满足原生条件：专用退出 `78`。
- 普通导入/探测失败或超时：同样拒绝，但不误报为宿主缺少 PSEC。
- runner 故障：`127` 加 `windows-mxc-run:` 签名；单独的目标退出 `127` 不是 runner 故障。
- Windows 目标退出码保留完整 DWORD。
- 目标已运行后的 drain/Job/temp 清理异常可能覆盖其退出结果。此时目标副作用状态未知，应检查后再决定是否重试。

## 非目标和未覆盖边界

- 允许广泛宿主读取和网络访问，不治理机密读取或网络外传。
- 不保证硬链接别名安全，不承诺所有 Win32/注册表/DLL/命名管道工具兼容。
- 历史 rc.3 验证包括前台完成后的 detached 回收，不等同于 rc.5 已通过原生测试，也不等同于已完成宿主崩溃、runner 崩溃等所有生命周期组合的原生验证。
- 没有注入 Node 子进程 API shim，也没有将受限目标移到宿主执行。
- Windows x64 / DSH rc.3 的历史本机结果不能推广到当前 rc.5、其他系统或架构；当前版本的已验证组合以测试记录为准。

详细本机验证见 [测试记录](../TEST-RESULTS.md)，来源和许可证见 [NOTICE](../NOTICE.md)。
