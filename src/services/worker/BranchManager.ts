/**
 * BranchManager: disabled in opencode-mem
 *
 * Upstream versions supported switching the installed plugin between git branches
 * under a Claude marketplace install path.
 *
 * In opencode-mem we must not read/assume/operate on those paths, so branch
 * switching is intentionally disabled.
 */

const BRANCH_SWITCHING_DISABLED_ERROR =
  'Branch switching is not supported in opencode-mem.';

export interface BranchInfo {
  branch: string | null;
  isBeta: boolean;
  isGitRepo: boolean;
  isDirty: boolean;
  canSwitch: boolean;
  error?: string;
}

export interface SwitchResult {
  success: boolean;
  branch?: string;
  message?: string;
  error?: string;
}

/**
 * Get current branch information
 */
export function getBranchInfo(): BranchInfo {
  return {
    branch: null,
    isBeta: false,
    isGitRepo: false,
    isDirty: false,
    canSwitch: false,
    error: BRANCH_SWITCHING_DISABLED_ERROR
  };
}

/**
 * Switch to a different branch
 *
 * Steps:
 * 1. Discard local changes (from rsync syncs)
 * 2. Fetch latest from origin
 * 3. Checkout target branch
 * 4. Pull latest
 * 5. Clear install marker and run npm install
 * 6. Restart worker (handled by caller after response)
 */
export async function switchBranch(targetBranch: string): Promise<SwitchResult> {
  void targetBranch;
  return {
    success: false,
    error: BRANCH_SWITCHING_DISABLED_ERROR
  };
}

/**
 * Pull latest updates for current branch
 */
export async function pullUpdates(): Promise<SwitchResult> {
  return {
    success: false,
    error: BRANCH_SWITCHING_DISABLED_ERROR
  };
}

/**
 * Get installed plugin path (for external use)
 */
export function getInstalledPluginPath(): string {
  return '';
}
