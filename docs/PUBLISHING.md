# 打包与 GitHub 发布

## 上传仓库

本仓库根目录就是插件项目，不包含父目录中的旧插件、安装备份、上游快照或运行时审查资料。

在 GitHub 创建一个空仓库。已有本地首次提交时，建议不要在 GitHub 同时初始化 README、License 或 gitignore，避免产生无关历史冲突。

在本仓库根目录执行（替换 URL）：

```powershell
git remote add origin https://github.com/<你的账号>/<仓库名>.git
git push -u origin main
```

仓库已经配置 origin 时先用 `git remote -v` 核对，不要重复添加。上传前可检查 `git status` 和 `git log -1`；提交作者来自本机现有 Git 配置。如需隐藏邮箱，在 push 前按 GitHub 提供的 noreply 邮箱配置本仓库身份，并修改尚未推送的首次提交作者。

## 构建发布附件

当前插件包及附件版本为 `0.2.2-rc.5`，与精确适配的 DSH 版本一致；Microsoft MXC SDK 保持 `1.0.1`。此命名由历史 `0.2.0-local.5` 调整而来，不改变 engine、DSH 依赖或原生运行逻辑。旧 local.5 归档、提交和验证记录保留，不覆盖或重写；本地旧标签 `v0.2.0-local.5` 移除，新发行标签统一为 `v0.2.2-rc.5`，远程标签变更另行处理；新包版本不能仅因更名就宣称原生已独立重测。要求 Windows、Node >=24.9.0、pnpm 11.28.5；源码 ZIP 和归档校验另需 Python 3。

以下命令是待执行的发布检查流程，不代表当前版本已经通过全部检查；如实记录结果到 [测试记录](../TEST-RESULTS.md)。旧版 rc.3 的 34 项源码回归通过不能充作 rc.5 证据；核心五包 39 个实现源码一致也不能代替原生 PSEC、独立 runner 依赖闭包及真实 Desktop 验收。打包和测试不会自动安装或启用 profile。

```powershell
pnpm install --frozen-lockfile --ignore-scripts
pnpm test
pnpm run probe
pnpm run test:integration
pnpm run test:control
pnpm run pack:plugin
pnpm run pack:source
pnpm run verify:release
```

生成于 `dist/`：

- `dsh-sandbox-mxc-0.2.2-rc.5.tgz`：面向 DSH `0.2.2-rc.5` 的插件管理器安装包。
- `dsh-sandbox-mxc-0.2.2-rc.5-source.zip`：源码、锁文件、测试与文档，不含依赖/诊断输出。

`verify:release` 校验包清单、源码字节、路径安全、依赖版本和 SHA-256；不会安装插件、修改 profile 或宿主 ACL。归档脚本拒绝覆盖已经存在的同版本源码 ZIP；重打时先确认旧文件位置，再手动归档或移除旧 ZIP。

## 创建 Release

确认待发布提交及测试结果后创建附注版本 tag `v0.2.2-rc.5`，并确认其指向提交的插件包版本为 `0.2.2-rc.5`。旧命名的本地 `v0.2.0-local.5` 标签已移除；删除本地标签不会删除 GitHub 上的同名远程标签。不要覆盖已经发布的新版本 tag，示例命令也不表示已推送远程：

```powershell
git tag -a v0.2.2-rc.5 -m "MXC sandbox 0.2.2-rc.5 for DSH 0.2.2-rc.5"
git push origin v0.2.2-rc.5
```

在 GitHub Releases 创建 **Pre-release**，上传 `.tgz` 和源码 `.zip`，附上校验输出中的 SHA-256。GitHub 自动生成的 source archive 不能替代插件安装包。

### GitHub 源码安装地址

本项目的 GitHub 仓库为 `TechEnergyGH/dsh-sandbox-mxc`。仓库根目录包含包清单、bundle patch 及可直接运行的 `lib/`；通过 `github:` 安装时取的是仓库源码，不要求先创建 Release，也不需要从源码 ZIP 安装。`private: true` 防止误发布到 npm，不阻止 GitHub 安装。

| 安装地址 | 发布要求与含义 |
| --- | --- |
| `github:TechEnergyGH/dsh-sandbox-mxc` | 使用远程默认分支当时的提交；默认分支可以不是 `main` |
| `github:TechEnergyGH/dsh-sandbox-mxc#main` | 使用明确指定的远程 `main` 分支 |
| `github:TechEnergyGH/dsh-sandbox-mxc#v0.2.2-rc.5` | 必须先创建并推送这个 tag；不自动选择最新 Release |
| `github:TechEnergyGH/dsh-sandbox-mxc#<40-character-commit-sha>` | 替换成远程已有的完整 40 位提交 SHA；适合固定安装来源 |

创建并推送 tag 后，可向用户提供：

```powershell
dsh plugin --profile <your-profile> add "github:TechEnergyGH/dsh-sandbox-mxc#v0.2.2-rc.5"
```

不要移动已经发布的 tag 来替换内容。默认分支和指定分支适合开发试用，固定 tag 或完整提交 SHA 更适合版本分发；安装后的副本不会因后续 GitHub 提交自动更新。每个安装来源仍须满足宿主的 DSH engine、Node 和平台要求，不能用版本豁免跳过适配。

本地 `.tgz`、无后缀、分支、tag 和完整 SHA 的安装命令，以及 Desktop 退出/重启和构建脚本审批注意事项，见 [README 安装说明](../README.md)。已有 `.tgz` 验证结果不代表 `github:` 的下载和包准备链路也经过验收；发布前应分别验证实际提供的安装形式。

Release Notes 应列出：

1. 精确目标 DSH、SDK、Node 和实测 Windows/架构。
2. 无 ACL/Low 修改、无故障回退，以及 `partial` enforcement。
3. 实际测试通过、失败和跳过项目；区分源码回归、原生 runner、真实 Desktop 在线验收。
4. 构建工具、硬链接、读取/网络及崩溃场景的未验证边界。
5. 回滚到默认 provider 后可能重新写 Low 标签的提醒。

## 发布约束

- 包名与另一个公开 npm 包相同，保持 `private: true`；**不要执行 npm/pnpm publish**。
- 不虚构官方归属，不填入尚未确认的仓库地址或作者信息。
- 安装/验证日志可能含本机路径和用户名，不提交原始 JSON、日志、profile 配置或上游提取文件。
- 不提交 `node_modules/`、`dist/`、私钥、token 或注册表凭据。
- DSH 版本升级需要重新适配、测试并更新锁文件，不用版本豁免代替验证。
