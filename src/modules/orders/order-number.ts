/**
 * Human-facing order codes: short enough to read over the phone to support,
 * unambiguous enough not to be confused with a phone number. `0/O` and `1/I`
 * are excluded from the alphabet for exactly that reason.
 */
import { randomInt } from "node:crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const LENGTH = 6;

export function generateOrderNumber(): string {
  let code = "";
  for (let i = 0; i < LENGTH; i++) {
    code += ALPHABET[randomInt(0, ALPHABET.length)];
  }
  return `IR-${code}`;
}
