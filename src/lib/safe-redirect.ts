/** Accept only local paths, including after URL normalization. */
export function safeRedirectPath(value: string | null): string | null {
  if (!value?.startsWith("/") || value.startsWith("//") || /[\\\u0000-\u0020\u007f]/.test(value)) return null;
  const base = "https://local.invalid";
  const target = new URL(value, base);
  return target.origin === base ? target.pathname + target.search + target.hash : null;
}
