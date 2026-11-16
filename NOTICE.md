# Attribution and provenance

The runner and fd-7 control bridge are adapted from the MIT-licensed DeepSeek Harness fork by ornithologist-love:

- Repository: https://github.com/ornithologist-love/deepseek-harness
- Reviewed commit: `5db3dc66455fe2c301d2c7baad817ae0d8772d8d`
- Source: `packages/sandbox/sandbox-windows-acl/src/mxc-runner.ts`
- Source: `packages/sandbox/sandbox-windows-acl/src/mxc-control.ts`
- Original DeepSeek copyright: Copyright (c) 2026 DeepSeek.

This independent package changes the provider integration, carries explicit additional writable roots, has no legacy ACL fallback, and hardens control-channel authentication/startup/cleanup. It is not an official DeepSeek or Microsoft plugin and is not the existing registry package from bitsmug or the scoped package from omdsh-dev.

Microsoft's `@microsoft/mxc-sdk` is a separate dependency, pinned to 1.0.1. It and DSH dependencies retain their own licenses. They are downloaded by the package manager, not copied into this package.

The original local.2 checkpoint targeted DSH `0.2.2-rc.1`. The local.3 migration targeted DSH `0.2.2-rc.3`; local.4 fixes its independent runner's missing error-module dependency in the actual Desktop profile. See [TEST-RESULTS.md](./TEST-RESULTS.md) for the precise validation scope. Application files, system services and ACL configuration are not modified by this package; profile installation is an explicit user-controlled Plugin Manager operation.
