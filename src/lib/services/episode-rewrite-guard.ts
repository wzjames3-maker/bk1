export function hasRewriteLock(params: Record<string, unknown>): boolean {
  const lock = params.rewrite_in_progress
  return lock === true || (typeof lock === 'string' && lock.length > 0 && lock !== 'false')
}

export function buildRewriteLockParams(
  params: Record<string, unknown>,
  lockToken: string
): Record<string, unknown> {
  return {
    ...params,
    rewrite_in_progress: lockToken,
  }
}
