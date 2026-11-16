/** Quote one argument using the Windows CommandLineToArgvW/CRT rules. */
export function quoteArg(value) {
  if (typeof value !== 'string' || value.includes('\0')) throw new Error('invalid Windows argument');
  if (value.length > 0 && !/[\s"]/u.test(value)) return value;
  // Backslashes are doubled before quotes and before the closing quote only.
  return '"' + value.replace(/(\\*)"/gu, '$1$1\\"').replace(/(\\+)$/u, '$1$1') + '"';
}
