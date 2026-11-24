# Agente de registro como proveedor

Agente conversacional que lee una solicitud de registro como proveedor, llena el formulario desde el repositorio maestro, arma el paquete de soportes y deja la firma y el envío a una persona.

Reto técnico 01 · Equipo Perxia 2.0 · Periferia IT Group.

| | |
|---|---|
| **Probarlo** | **<https://reto01-agente-proveedor.fly.dev>** — sin clave de acceso |
| **Sin modelo** | `bun install && bun run demo.ts` — recorre los cuatro casos sin clave de ningún proveedor |
| **Planteamiento** | [`SOLUCION.md`](./SOLUCION.md) |

Abre una solicitud de la bandeja, léela, y pídele al agente que la revise.
Prepara el formulario y el paquete; la firma y el envío siguen siendo de una
persona.

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
| `LLM_PROVIDER` | `anthropic` | `anthropic` o `mock` (sin red, para pruebas) |
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

Las dependencias van en una sola dirección: `server → agent → tools → domain`.
`domain/` no importa nada de las capas de arriba, así que las reglas de negocio
se prueban sin disco, sin red y sin clave.

```
reto-01/
├── agent/prompt.md          cómo se comporta el agente — texto, no código
├── src/
│   ├── domain/              reglas puras. Sin IO, sin framework, sin dependencias
│   │   ├── mapeo.ts           cruza los campos del cliente con el maestro
│   │   ├── vigencias.ts       qué soporte bloquea la firma y cuál no
│   │   ├── paises.ts          el identificador tributario cambia por país
│   │   └── etiquetas.ts       identificadores internos → lenguaje de oficina
│   ├── infra/               todo lo que toca el disco: fixtures, xlsx, pdf, bitácora
│   ├── tools/proveedor.ts   las 5 herramientas. Única fuente de valores del maestro
│   ├── llm/                 adaptador + Claude + uno falso para tests
│   ├── agent/               el bucle y el estado de sesión
│   ├── knowledge/           el proceso de registro — texto, no código
│   └── server.ts            API HTTP y archivos estáticos
├── web/src/                 front de chat (React + Vite)
│   ├── lenguaje.ts            traduce lo técnico antes de pintarlo
│   └── componentes/           correo · pasos del agente · expediente · confirmación
├── modulo/                  portable a otro agente — generado, no editar a mano
├── fixtures/reto-01/        datos entregados por Periferia — no modificar
├── scripts/                 verificador de requisitos y generador del módulo
├── tests/                   dominio · herramientas · bucle del agente
└── demo.ts                  recorre los 4 casos sin llamar a ningún modelo
```

### Por dónde empezar a leer

| Si quieres entender… | Abre |
|---|---|
| Qué hace el agente y cómo habla | [`agent/prompt.md`](./agent/prompt.md) |
| El bucle: pedir, ejecutar, repetir | [`src/agent/ciclo.ts`](./src/agent/ciclo.ts) |
| Qué puede hacer y qué no | [`src/tools/proveedor.ts`](./src/tools/proveedor.ts) |
| Por qué un campo queda vacío | [`src/domain/mapeo.ts`](./src/domain/mapeo.ts) |
| Por qué no se puede firmar | [`src/domain/vigencias.ts`](./src/domain/vigencias.ts) |
| Que nada se envía sin permiso | [`src/agent/ciclo.ts`](./src/agent/ciclo.ts) · `ejecutarLlamada` |
| Cómo se cubre cada requisito | [`scripts/verificar-rubrica.ts`](./scripts/verificar-rubrica.ts) |

Tres cosas viven fuera del código a propósito: el **comportamiento** en
`agent/prompt.md`, el **conocimiento del proceso** en `src/knowledge/` y los
**datos** en `fixtures/`. Cambiar una regla de negocio no obliga a tocar
`server.ts` ni a desplegar de nuevo el front.

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

**<https://reto01-agente-proveedor.fly.dev>**

No requiere clave de acceso ni registro. Abre el link, elige uno de los cuatro
casos del panel inicial y el agente trabaja sobre los archivos reales del
repositorio maestro.

El estado del despliegue se consulta sin autenticación:

```bash
curl -s https://reto01-agente-proveedor.fly.dev/api/health
```

Responde `claveConfigurada: true/false` —nunca la clave— y la fecha de
referencia contra la que se evalúan las vigencias.

### Reproducirlo

```bash
fly launch --no-deploy
fly secrets set ANTHROPIC_API_KEY=...   # solo el nombre viaja al repo
fly deploy --ha=false                   # una sola máquina, ver abajo
```

La clave vive únicamente como secreto de Fly: no está en el `fly.toml`, ni en
el repositorio, ni en la imagen, ni en las respuestas de la API (§8 del PRD).
La región es `gru` porque Fly retiró `bog`.

**`--ha=false` no es opcional.** Las sesiones viven en memoria y los artefactos
en el disco local del proceso, así que la aplicación sólo es correcta con una
instancia. Sin ese flag Fly levanta dos máquinas por alta disponibilidad
—`min_machines_running = 1` es un piso, no un techo— y el balanceador reparte
los turnos entre ambas: la mitad de las peticiones caen en una instancia que no
conoce la sesión ni tiene los archivos. Se detectó así en el primer despliegue.

Si ya quedaron dos:

```bash
fly scale count 1 --yes
```

Levantar la restricción es cuestión de mover el estado fuera del proceso
—sesiones en Redis y artefactos en un volumen u object storage—, que es
justo lo que pide producción y lo que el PRD deja fuera de alcance.

---

Planteamiento completo de la solución: [`SOLUCION.md`](./SOLUCION.md).
