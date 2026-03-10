export function hasOpaqueToken(value: string | null | undefined) {
  return Boolean(value && value.trim().length >= 8);
}
