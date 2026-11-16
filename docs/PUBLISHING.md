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

要求 Windows、Node >=24.9.0、pnpm 11.28.5；源码 ZIP 和归档校验另需 Python 3。

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

- `dsh-sandbox-mxc-0.2.0-local.4.tgz`：DSH 插件管理器安装包。
- `dsh-sandbox-mxc-0.2.0-local.4-source.zip`：源码、锁文件、测试与文档，不含依赖/诊断输出。

`verify:release` 校验包清单、源码字节、路径安全、依赖版本和 SHA-256；不会安装插件、修改 profile 或宿主 ACL。归档脚本拒绝覆盖已经存在的同版本源码 ZIP；重打时先确认旧文件位置，再手动归档或移除旧 ZIP。

## 创建 Release

确认待发布提交及测试结果后创建版本 tag（不要覆盖已发布 tag）：

```powershell
git tag v0.2.0-local.4
git push origin v0.2.0-local.4
```

在 GitHub Releases 创建 **Pre-release**，上传 `.tgz` 和源码 `.zip`，附上校验输出中的 SHA-256。GitHub 自动生成的 source archive 不能替代插件安装包。

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
