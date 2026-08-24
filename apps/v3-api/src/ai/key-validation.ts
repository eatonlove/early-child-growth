export function isStandardQwenApiKey(value: string | undefined) {
  return Boolean(value && /^sk-(?!sp-)\S{8,}$/.test(value));
}
