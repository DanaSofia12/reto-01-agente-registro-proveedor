# Agente de registro como proveedor

Agente conversacional que lee una solicitud de registro como proveedor, llena el formulario desde el repositorio maestro, arma el paquete de soportes y deja la firma y el envío a una persona.

Reto técnico 01 · Equipo Perxia 2.0 · Periferia IT Group.

---

## Arrancar en local

```bash
bun install
cp .env.example .env     # pon tu ANTHROPIC_API_KEY
bun run dev
```

Front en `http://localhost:5173`, API en `http://localhost:3000`. El front hace proxy a la API, así que basta con abrir el primero.

Un solo proceso en producción:

```bash
bun run build && bun run start     # sirve /api/* y el front en :3000
```

O con Docker:

```bash
docker build -t agente-proveedor .
docker run -p 3000:3000 -e ANTHROPIC_API_KEY=... agente-proveedor
```

> Requiere [Bun](https://bun.sh) 1.4 o superior. No es opcional: el servidor usa `Bun.serve`, `Bun.file` y `Bun.Glob`, y los tests usan `bun:test`.

---

## Verificar sin gastar un token

```bash
bun run demo.ts
```

Corre las cinco herramientas sobre los cuatro casos **sin clave de ningún proveedor** e imprime el resumen. Es el comando que demuestra que la lógica vive en las herramientas y el modelo solo las orquesta.

Salida esperada:

| Caso | País | Formato | Llenos | Confirmar | Faltan | Listo para firma |
|---|---|---|---|---|---|---|
| `co-industrias-delta` | CO | xlsx | 17 | 0 | 0 | sí |
| `ec-corp-andina` | EC | pdf | 13 | 1 | 1 | no — falta un soporte |
| `hn-agroexport-sula` | HN | xlsx | 9 | 1 | 1 | no — soporte vencido |
| `pa-logistica-istmo` | PA | portal | 8 | 1 | 0 | sí (formato no soportado) |

Los artefactos quedan en `out/`.

---

## Otros comandos

| Comando | Qué hace |
|---|---|
| `bun test` | 78 tests: dominio, contrato de herramientas y ciclo del agente |
| `bun run verificar` | Recorre los criterios automatizables de la rúbrica |
| `bun run typecheck` | TypeScript estricto, sin `any` |
| `bun run lint` | Biome: lint y formato |
| `bun run modulo` | Regenera `modulo/` desde las fuentes reales |
| `bun run modulo:check` | Falla si `modulo/` divergió (corre en CI) |

---

## Variables de entorno

Todas en `.env.example`. **La clave del modelo solo vive en el entorno del backend**: nunca en el repositorio, el front, los logs ni las respuestas de la API.

| Variable | Por defecto | Para qué |
|---|---|---|
| `LLM_PROVIDER` | `anthropic` | `anthropic`, `openai` o `mock` |
| `LLM_MODEL` | `claude-haiku-5-5` | Subir a `claude-sonnet-5-5` no requiere tocar código |
| `ANTHROPIC_API_KEY` | — | **Requerida** con el proveedor por defecto |
| `MAX_ITERACIONES_TURNO` | `25` | Tope de ciclos herramienta → modelo (CA1) |
| `MAX_TOKENS_SESION` | `200000` | Tope acumulado: nadie gasta la clave sin límite |
| `MAX_TOKENS_RESPUESTA` | `16000` | Cubre thinking + texto en una respuesta |
| `LLM_TIMEOUT_MS` | `60000` | Timeout al proveedor |
| `FECHA_REFERENCIA` | sin valor → hoy | Fecha contra la que se evalúan las vigencias |
| `PORT` | `3000` | — |

### Sobre `FECHA_REFERENCIA`

Los fixtures fueron diseñados para una ejecución alrededor del **2026-09-03**, y con esa fecha cada caso demuestra una regla distinta: `co` sale listo para firma, `hn` queda bloqueado por parafiscales vencido y `ec` por un soporte que no existe.

Con la fecha real del sistema, la cámara de comercio también vence (30/09/2026) y los tres casos saldrían bloqueados, perdiendo la demostración del camino feliz. Dejarla vacía usa la fecha de hoy.

---

## API

| Método | Ruta | Respuesta |
|---|---|---|
| `POST` | `/api/chat` | `{ sessionId, message }` → `{ reply, toolCalls[], needsConfirmation, uso, iteraciones }` |
| `GET` | `/api/sessions/:id` | Historial completo de la sesión |
| `GET` | `/api/health` | `{ ok, provider, model, claveConfigurada, herramientas[] }` — nunca la clave |
| `GET` | `/api/casos` | Casos disponibles, para el estado inicial del front |
| `GET` | `/api/artefactos/:caso` | Archivos generados para ese caso |
| `GET` | `/api/archivos/:caso/*` | Descarga un artefacto |

```bash
curl -s localhost:3000/api/health | jq
curl -s -X POST localhost:3000/api/chat \
  -H 'content-type: application/json' \
  -d '{"message":"Procesa el caso ec-corp-andina. No envíes nada todavía."}' | jq
```

---

## Estructura

```
reto-01/
├── agent/prompt.md                 comportamiento del agente
├── src/
│   ├── domain/                     reglas puras, sin IO — testeables sin disco
│   ├── infra/                      lectura de fixtures, escritura, xlsx, pdf, bitácora
│   ├── tools/proveedor.ts          las 5 herramientas (única fuente de valores)
│   ├── llm/                        adaptador + anthropic + openai + mock
│   ├── agent/                      ciclo y sesiones
│   ├── knowledge/                  conocimiento del proceso
│   └── server.ts                   API y estáticos
├── web/                            front de chat (React + Vite)
├── modulo/                         bonus §9.4 — generado, nunca editado a mano
├── fixtures/reto-01/               entregado por Periferia · no modificar
├── scripts/                        verificador de rúbrica y generador del módulo
├── tests/                          dominio · herramientas · ciclo
└── demo.ts                         verificación sin modelo
```

La separación que se evalúa: **comportamiento** en `agent/prompt.md`, **conocimiento** en `src/knowledge/`, **ejecución** en `src/tools/` y `src/domain/`. Cambiar una regla de negocio no toca `server.ts`.

---

## Probar el flujo completo

En una sesión nueva del chat:

```
Procesa el caso "ec-corp-andina". Dime qué campos quedaron llenos, cuáles
faltan, si el paquete está listo para firma y qué soportes debo actualizar.
No envíes nada todavía.
```

El agente ejecuta cuatro herramientas, resume y **termina con una pregunta**. El front resalta ese estado. Un segundo mensaje confirmando produce únicamente `out/ec-corp-andina/ENVIO-SIMULADO.md`.

---

## Link de prueba

Pendiente de desplegar. El `Dockerfile` y el `fly.toml` están listos:

```bash
fly launch --no-deploy
fly secrets set ANTHROPIC_API_KEY=...
fly deploy
```

El link no requiere clave de acceso.

---

Planteamiento completo de la solución: [`SOLUCION.md`](./SOLUCION.md).
