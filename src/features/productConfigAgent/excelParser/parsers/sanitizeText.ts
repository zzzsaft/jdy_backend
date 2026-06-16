const JSONB_UNSUPPORTED_CONTROL_CHARS = /[\u0000]/g;
const C1_CONTROL_CHARS = /[\u0080-\u009f]/;
const UNSAFE_CONTROL_CHARS = /[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

export function sanitizeExcelText(input: unknown) {
  if (input === undefined || input === null) return "";

  const text = String(input);
  const unsafeControlMatches = text.match(UNSAFE_CONTROL_CHARS);

  if (C1_CONTROL_CHARS.test(text) || (unsafeControlMatches?.length ?? 0) >= 2) {
    return "";
  }

  return text
    .replace(JSONB_UNSUPPORTED_CONTROL_CHARS, "")
    .replace(UNSAFE_CONTROL_CHARS, "");
}
