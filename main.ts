// Tiny stack VM, ISA v1. Pure interpreter, no WASM, no native code.
// Follows program/generator/subject/ISA.md and vm.mjs exactly:
// 32-bit wrapping arithmetic, 256-value stack, 64-deep call stack,
// 256 words of memory, traps 2-11 with their own exit codes, the
// 1,000,000-step and 65,536-byte output limits.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

function run(p, inp) {
  const D = new Int32Array(256);
  const C = new Int32Array(64);
  const M = new Int32Array(256);
  const out = new Uint8Array(65536);
  let sp = 0, csp = 0, pc = 0, steps = 0, ip = 0, olen = 0, exit = -1;
  L: for (;;) {
    if (steps === 1000000) { exit = 10; break; }
    if (pc < 0 || pc >= p.length) { exit = 9; break; }
    const op = p[pc];
    const ok = op <= 7 || (op >= 16 && op <= 34 && op !== 31) || (op >= 48 && op <= 52) || op === 64 || op === 65 || (op >= 80 && op <= 83);
    if (!ok) { exit = 5; break; }
    const imm = op === 1 ? 1 : op === 2 ? 4 : op >= 48 && op <= 51 ? 2 : 0;
    if (pc + imm >= p.length) { exit = 9; break; }
    steps++;
    const next = pc + 1 + imm;
    pc = next;
    switch (op) {
      case 0: exit = 0; break L;
      case 1:
        if (sp >= 256) { exit = 3; break L; }
        D[sp++] = (p[next - 1] << 24) >> 24; break;
      case 2:
        if (sp >= 256) { exit = 3; break L; }
        D[sp++] = p[next - 4] | (p[next - 3] << 8) | (p[next - 2] << 16) | (p[next - 1] << 24); break;
      case 3: if (sp < 1) { exit = 2; break L; } sp--; break;
      case 4:
        if (sp < 1) { exit = 2; break L; }
        if (sp >= 256) { exit = 3; break L; }
        D[sp] = D[sp - 1]; sp++; break;
      case 5:
        if (sp < 2) { exit = 2; break L; }
        { const t = D[sp - 1]; D[sp - 1] = D[sp - 2]; D[sp - 2] = t; } break;
      case 6:
        if (sp < 2) { exit = 2; break L; }
        if (sp >= 256) { exit = 3; break L; }
        D[sp] = D[sp - 2]; sp++; break;
      case 7:
        if (sp < 3) { exit = 2; break L; }
        { const a = D[sp - 3]; D[sp - 3] = D[sp - 2]; D[sp - 2] = D[sp - 1]; D[sp - 1] = a; } break;
      case 23:
        if (sp < 1) { exit = 2; break L; }
        D[sp - 1] = -D[sp - 1] | 0; break;
      case 27:
        if (sp < 1) { exit = 2; break L; }
        D[sp - 1] = ~D[sp - 1]; break;
      case 48: case 49: case 50: {
        const rel = ((p[next - 2] | (p[next - 1] << 8)) << 16) >> 16;
        let take = true;
        if (op !== 48) {
          if (sp < 1) { exit = 2; break L; }
          const v = D[--sp];
          take = op === 49 ? v === 0 : v !== 0;
        }
        if (take) pc = next + rel;
        break;
      }
      case 51:
        if (csp === 64) { exit = 7; break L; }
        C[csp++] = next;
        pc = p[next - 2] | (p[next - 1] << 8); break;
      case 52:
        if (csp === 0) { exit = 8; break L; }
        pc = C[--csp]; break;
      case 64:
        if (sp < 1) { exit = 2; break L; }
        { const a = D[sp - 1]; if (a < 0 || a >= 256) { exit = 6; break L; } D[sp - 1] = M[a]; } break;
      case 65:
        if (sp < 2) { exit = 2; break L; }
        { const a = D[sp - 1]; const v = D[sp - 2]; if (a < 0 || a >= 256) { exit = 6; break L; } sp -= 2; M[a] = v; } break;
      case 80: {
        if (sp < 1) { exit = 2; break L; }
        const b = Buffer.from(String(D[sp - 1]));
        if (olen + b.length > 65536) { exit = 11; break L; }
        sp--; out.set(b, olen); olen += b.length; break;
      }
      case 81:
        if (sp < 1) { exit = 2; break L; }
        if (olen + 1 > 65536) { exit = 11; break L; }
        out[olen++] = D[--sp] & 255; break;
      case 82:
        if (sp >= 256) { exit = 3; break L; }
        D[sp++] = ip < inp.length ? inp[ip++] : -1; break;
      case 83:
        if (sp < 1) { exit = 2; break L; }
        exit = D[--sp] & 255; break L;
      default: {
        if (sp < 2) { exit = 2; break L; }
        const b = D[sp - 1], a = D[sp - 2];
        let r = 0;
        if (op === 16) r = (a + b) | 0;
        else if (op === 17) r = (a - b) | 0;
        else if (op === 18) r = Math.imul(a, b);
        else if (op === 19) {
          if (b === 0) { exit = 4; break L; }
          r = a === -2147483648 && b === -1 ? a : (a / b) | 0;
        } else if (op === 20) {
          if (b === 0) { exit = 4; break L; }
          r = b === -1 ? 0 : (a % b) | 0;
        } else if (op === 21) {
          if (b === 0) { exit = 4; break L; }
          r = Math.floor((a >>> 0) / (b >>> 0)) | 0;
        } else if (op === 22) {
          if (b === 0) { exit = 4; break L; }
          r = ((a >>> 0) % (b >>> 0)) | 0;
        } else if (op === 24) r = a & b;
        else if (op === 25) r = a | b;
        else if (op === 26) r = a ^ b;
        else if (op === 28) r = a << (b & 31);
        else if (op === 29) r = a >> (b & 31);
        else if (op === 30) r = (a >>> (b & 31)) | 0;
        else if (op === 32) r = a === b ? 1 : 0;
        else if (op === 33) r = a < b ? 1 : 0;
        else if (op === 34) r = (a >>> 0) < (b >>> 0) ? 1 : 0;
        sp -= 2; D[sp++] = r; break;
      }
    }
  }
  return { out: out.slice(0, olen), code: exit };
}

const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
for (const id of readdirSync(I).sort()) {
  const r = run(new Uint8Array(readFileSync(join(I, id, 'program.bin'))), new Uint8Array(readFileSync(join(I, id, 'input.bin'))));
  mkdirSync(join(O, id), { recursive: true });
  writeFileSync(join(O, id, 'stdout.bin'), r.out);
  writeFileSync(join(O, id, 'exit.txt'), `${r.code}\n`);
}
