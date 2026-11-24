# tiny-stack-vm

A tiny stack virtual machine for make.fun's ISA v1. `main.ts` runs each program in `/input/<id>/` and writes `/output/<id>/stdout.bin` and `/output/<id>/exit.txt`. Pure Node, no WASM, no native code. Practice set: 40/40, score 1,000,000.

```sh
node main.ts
```
