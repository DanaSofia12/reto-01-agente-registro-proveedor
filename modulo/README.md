# Módulo reutilizable

Bonus §9.4. Las tres piezas que necesita otra plataforma de agentes:

| Pieza | Qué es |
|---|---|
| `agent.md` | El system prompt, con `mode: primary` y `permission: {edit: deny, bash: deny}` |
| `skill/registro-proveedor/SKILL.md` | El conocimiento del proceso |
| `tools/proveedor.ts` | Las cinco herramientas, importables sin servidor ni clave |

## No son copias

`agent.md` y `SKILL.md` se **generan** desde `agent/prompt.md` y
`src/knowledge/registro-proveedor.md`; `tools/proveedor.ts` **re-exporta** desde
`src/tools/proveedor.ts`. Nada aquí se edita a mano:

```bash
bun run modulo         # regenera
bun run modulo:check   # falla si divergió — corre en CI
```

Es deliberado. El PRD evalúa «que las tres piezas sean las mismas que usa tu
aplicación, no copias divergentes», y una copia que se puede editar por separado
diverge el primer día que alguien toca el prompt y olvida el módulo.

## Llevárselo a otro proyecto

El módulo vive dentro del repositorio porque las herramientas dependen de
`src/domain/` y `src/infra/`. Para integrarlo en otra plataforma hay dos vías:

1. **Montar el repositorio** y apuntar a `modulo/`. Las herramientas se importan
   sin levantar `src/server.ts` ni configurar ninguna clave:
   ```ts
   import { HERRAMIENTAS } from "./modulo/tools/proveedor.ts"
   ```
2. **Empaquetar** con `bun build --target=bun modulo/tools/proveedor.ts --outdir=dist`,
   que resuelve `src/domain/` y `src/infra/` en un solo archivo.

La alternativa —vendorizar una copia de las herramientas dentro de `modulo/`— es
justo lo que el PRD descarta.
