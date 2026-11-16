import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import z from '@deepseek-ai/schemastery';
import { HarnessError } from '@deepseek-ai/dsh-error';
import { SandboxProvider, SandboxUnavailableError, workspaceWritableRoots } from '@deepseek-ai/dsh-sandbox';
import { confinedArgv, policyFromJson, PROBE_UNAVAILABLE_EXIT } from './policy.js';

/** DSH rc.3 removed its unsupported-policy error; retain our fail-closed code. */
export class MxcUnsupportedPolicyError extends HarnessError {
  constructor() {
    super('MXC only confines read-only and workspace-write; permission consumers must handle danger-full-access explicitly', 'SANDBOX_UNSUPPORTED_POLICY');
  }
}

/** MXC-only provider: no legacy ACL path and no unconfined passthrough. */
export class MxcSandboxProvider extends SandboxProvider {
  static Config = z.object({ probeTimeoutMs: z.natural().default(15000) });
  internals = {};
  available = false;
  constructor(ctx, config = {}) {
    super(ctx);
    this.probeTimeoutMs = config.probeTimeoutMs ?? 15000;
    if (!Number.isSafeInteger(this.probeTimeoutMs) || this.probeTimeoutMs <= 0) throw new Error('dsh-sandbox-mxc: probeTimeoutMs must be a positive safe integer');
    this.runnerEntry = fileURLToPath(new URL('./runner.js', import.meta.url));
  }
  async confine(argv, policy, signal) {
    signal?.throwIfAborted();
    if (!policy || !['read-only', 'workspace-write'].includes(policy.mode)) throw new MxcUnsupportedPolicyError();
    const platform = this.internals.platform ?? process.platform;
    if (platform !== 'win32' || Number(process.versions.node.split('.')[0]) < 24 || !existsSync(this.runnerEntry)) {
      throw new SandboxUnavailableError(policy.mode, 'dsh-sandbox-mxc needs Windows, Node >=24 and its packaged runner; no ACL fallback');
    }
    const roots = policy.mode === 'workspace-write' ? workspaceWritableRoots(policy) : [policy.workspaceRoot];
    const resolved = policyFromJson(JSON.stringify({
      mode: policy.mode, roots,
      host: { systemDrive: process.env.SystemDrive, localAppData: process.env.LOCALAPPDATA },
    }));
    if (!this.available) {
      const result = this.internals.probe?.() ?? spawnSync(process.execPath, [this.runnerEntry, '--probe'], {
        timeout: this.probeTimeoutMs, stdio: 'ignore', windowsHide: true,
      });
      signal?.throwIfAborted();
      if (result.status !== 0) {
        throw new SandboxUnavailableError(policy.mode, result.status === PROBE_UNAVAILABLE_EXIT
          ? 'native MXC/PSEC unavailable; refusing ACL or unconfined fallback'
          : 'native MXC/PSEC probe failed or timed out; refusing ACL or unconfined fallback');
      }
      this.available = true;
      this.ctx.logger.info('Windows sandbox: native MXC/PSEC; no host ACL/integrity-label changes; no ACL fallback');
    }
    signal?.throwIfAborted();
    return confinedArgv([process.execPath, this.runnerEntry], argv, resolved);
  }
}
export default MxcSandboxProvider;
