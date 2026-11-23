# Rúbrica de verificación — Reto 01

> Lista de control exhaustiva contra el PRD. Se corre **antes de entregar**.
> Columna **Auto**: `SÍ` = cubierto por `bun run verificar` (`scripts/verificar-rubrica.ts`) · `MAN` = revisión manual.
> Estado: `[ ]` pendiente · `[~]` parcial · `[x]` cumplido.

**Puntaje total: 100 + 10 de bonus.** Los pesos son una estimación propia para priorizar el trabajo; el PRD solo define explícitamente `-10` por no desplegar y `+10` por el módulo.

---

## A · Herramientas y contrato (25 pts)

| ID | Criterio | PRD | Auto | Pts | Estado |
|---|---|---|---|---|---|
| A1 | Existen las 5 herramientas con el nombre exacto `proveedor_<export>` | §6.2 | SÍ | 4 | [ ] |
| A2 | Cada una tiene `description` de una frase, precisa | §6.2 | MAN | 2 | [ ] |
| A3 | Cada campo de `args` es zod y tiene `.describe()` | §6.2 | SÍ | 3 | [ ] |
| A4 | El backend valida con zod **antes** de ejecutar y devuelve el error al modelo | §6.2 | SÍ | 3 | [ ] |
| A5 | `execute` devuelve **string** JSON `{ok:true,data}` / `{ok:false,error}` | §6.2 | SÍ | 3 | [ ] |
| A6 | **Ninguna herramienta lanza** — fuzz con args inválidos, caso inexistente, JSON corrupto | HU-5 | SÍ | 4 | [ ] |
| A7 | `ctx.directory` se usa para todas las rutas; cero rutas absolutas | §6.2 | SÍ | 2 | [ ] |
| A8 | Las herramientas son importables sin servidor y sin clave LLM | §6.6 | SÍ | 2 | [ ] |
| A9 | Ninguna herramienta ejecuta comandos de shell | §8 | SÍ | 2 | [ ] |

---

## B · Correctitud funcional por caso (25 pts)

Oráculo: `01-requerimientos-funcionales.md` §5, con `FECHA_REFERENCIA=2026-09-03`.

| ID | Criterio | PRD | Auto | Pts | Estado |
|---|---|---|---|---|---|
| B1 | `co-industrias-delta`: 17 llenos · 0 faltantes · 0 requiere_confirmacion | O1 | SÍ | 3 | [ ] |
| B2 | `co`: `formulario.xlsx` con etiqueta en `celda_etiqueta` y valor en `celda_valor`, hojas `Datos Proveedor` y `Datos Bancarios` | HU-3 P0 | SÍ | 4 | [ ] |
| B3 | `ec-corp-andina`: 13 llenos · 1 req_conf (`RUC`) · 1 faltante (`Número de contribuyente especial`) | HU-2 | SÍ | 3 | [ ] |
| B4 | `ec`: `formulario.pdf` con los **15** campos, etiqueta + valor, **en el orden de la plantilla** | HU-3 P1 | SÍ | 4 | [ ] |
| B5 | `hn-agroexport-sula`: 9 llenos · 1 req_conf (`RTN`) · 1 faltante (`Referencias comerciales`) | HU-2 | SÍ | 3 | [ ] |
| B6 | `hn`: `formulario.xlsx`, hoja `Registro`, celdas `A2:B12` | HU-3 P0 | SÍ | 2 | [ ] |
| B7 | `pa-logistica-istmo`: responde `formato no soportado` **y** produce `valores-portal.md` | HU-3 P2 | SÍ | 3 | [ ] |
| B8 | Ningún campo faltante trae un valor inventado (celda/línea vacía) | HU-2, O2 | SÍ | 3 | [ ] |

---

## C · Reglas de negocio (15 pts)

| ID | Criterio | PRD | Auto | Pts | Estado |
|---|---|---|---|---|---|
| C1 | **RN1** — `RUC`/`RTN` se llenan con el NIT y se marcan `requiere_confirmacion` con nota "identificador extranjero" en EC/PE/PA/HN; en CO **no** se marca | RN1 | SÍ | 3 | [ ] |
| C2 | **RN2** — datos bancarios solo si la plantilla los pide; **nunca** en `borrador-correo.md` (grep de `numero_cuenta`, `03100012345`, `swift`) | RN2 | SÍ | 3 | [ ] |
| C3 | **RN3** — soporte **vencido** bloquea `listo_para_firma` (`hn`/`parafiscales`) | RN3 | SÍ | 2 | [ ] |
| C4 | **RN3** — soporte **ausente** bloquea (`ec`/`certificado_cumplimiento_tributario`) | RN3 | SÍ | 2 | [ ] |
| C5 | **RN3** — un campo `faltante` **no** bloquea, pero aparece en el checklist | RN3 | SÍ | 2 | [ ] |
| C6 | `vigencia_hasta: null` (RUT) nunca vence | fixture | SÍ | 1 | [ ] |
| C7 | Confianza `< 0.8` → `requiere_confirmacion`; sinónimos del glosario se resuelven solos, incluidas rutas con punto | HU-2 | SÍ | 2 | [ ] |

---

## D · Ciclo del agente y confirmación humana (15 pts)

| ID | Criterio | PRD | Auto | Pts | Estado |
|---|---|---|---|---|---|
| D1 | Tope de iteraciones por turno configurable (default 25); al alcanzarlo responde con lo que tiene y lo que falta | CA1 | SÍ | 3 | [ ] |
| D2 | El prompt prohíbe afirmar valores que no vengan de una herramienta | CA2 | MAN | 2 | [ ] |
| D3 | **RN4/CA3** — el turno termina con pregunta explícita antes de cualquier acción externa | CA3 | MAN | 3 | [ ] |
| D4 | `proveedor_simular_envio` con `confirmado:false` → `{ok:false,error:"requiere confirmación explícita"}` y **no escribe nada** | §6.2 | SÍ | 3 | [ ] |
| D5 | Con confirmación explícita escribe **solo** `out/<caso>/ENVIO-SIMULADO.md` | HU-4 | SÍ | 2 | [ ] |
| D6 | Error de herramienta o del proveedor → mensaje claro en el chat; la sesión no muere | CA5 | MAN | 2 | [ ] |

---

## E · Front de chat (10 pts)

| ID | Criterio | PRD | Auto | Pts | Estado |
|---|---|---|---|---|---|
| E1 | Historial, campo de entrada e indicador de "pensando" | §6.1 | MAN | 2 | [ ] |
| E2 | **Muestra cada tool call**: nombre, argumentos y resultado resumido | §6.1 | MAN | 4 | [ ] |
| E3 | **Resalta** visualmente el estado "pide confirmación" | §6.1, CA3 | MAN | 3 | [ ] |
| E4 | Enlaces a los artefactos generados | extra | MAN | 1 | [ ] |

---

## F · Arquitectura y NFR (10 pts)

| ID | Criterio | PRD | Auto | Pts | Estado |
|---|---|---|---|---|---|
| F1 | System prompt en `agent/prompt.md`, **no embebido en código** | §6.1 | SÍ | 2 | [ ] |
| F2 | Conocimiento en `src/knowledge/`, separado del comportamiento | §6.5 | MAN | 1 | [ ] |
| F3 | Adaptador LLM: cambiar de proveedor no toca el ciclo (2 implementaciones) | §6.1 | MAN | 2 | [ ] |
| F4 | `POST /api/chat`, `GET /api/sessions/:id`, `GET /api/health` funcionan y están documentados | §6.4 | SÍ | 1 | [ ] |
| F5 | `/api/health` no expone la clave ni fragmentos de ella | §8 | SÍ | 1 | [ ] |
| F6 | `bun run dev` levanta front + backend en **< 2 min** en máquina limpia | §8 | MAN | 1 | [ ] |
| F7 | `demo.ts` determinista; `out/` se limpia al inicio | §8 | SÍ | 1 | [ ] |
| F8 | TS estricto, **cero `any`**, `tsc --noEmit` limpio | §8 | SÍ | 1 | [ ] |

---

## G · Trazabilidad y logs (5 pts)

| ID | Criterio | PRD | Auto | Pts | Estado |
|---|---|---|---|---|---|
| G1 | `out/log.jsonl` y `out/<caso>/log.jsonl` con `{ts, herramienta, ok, resumen}` | CA4, RN5 | SÍ | 2 | [ ] |
| G2 | Toda tool call aparece en el historial visible del chat | CA4 | MAN | 1 | [ ] |
| G3 | Cada campo `lleno` trae la **ruta de origen** en el maestro | HU-2 | SÍ | 2 | [ ] |

---

## H · Paquete para firma (incluido en B/C, verificación de artefactos)

| ID | Criterio | PRD | Auto | Estado |
|---|---|---|---|---|
| H1 | `out/<caso>/paquete/` contiene el formulario | HU-4 | SÍ | [ ] |
| H2 | Contiene copia de **cada soporte exigido que exista** en `repositorio/soportes/` | HU-4 | SÍ | [ ] |
| H3 | `checklist.md` clasifica presente / ausente / vencido con fechas | HU-4 | SÍ | [ ] |
| H4 | `borrador-correo.md` existe y no contiene datos bancarios | HU-4, RN2 | SÍ | [ ] |
| H5 | `out/<caso>/faltantes.md` lista todo campo sin fuente | O2 | SÍ | [ ] |

---

## I · Entregables documentales (bloqueantes — sin esto se pierde puntaje transversal)

| ID | Criterio | PRD | Estado |
|---|---|---|---|
| I1 | `SOLUCION.md` con **las 10 secciones obligatorias en orden** | §9.1 | [ ] |
| I2 | §1 Problema en una frase y a quién le duele | §9.1 | [ ] |
| I3 | §2 Arquitectura con diagrama y ubicación de prompt / conocimiento / ejecución | §9.1 | [ ] |
| I4 | §3 Ciclo del agente: bucle, tope de iteraciones, confirmación humana | §9.1 | [ ] |
| I5 | §4 Elección del modelo + **costo estimado por caso procesado** (en USD, con tokens medidos) | §9.1 | [ ] |
| I6 | §5 Diseño del portal web (§7.4): estrategia, límites (CAPTCHA/MFA/layout), dónde viven las credenciales, qué hace el humano | §7.4, §9.1 | [ ] |
| I7 | §6 **Mínimo 3** decisiones y trade-offs, con la alternativa descartada y por qué | §9.1 | [ ] |
| I8 | §7 Supuestos al interpretar el PRD (usar §7 del doc funcional: A1–A7) | §9.1 | [ ] |
| I9 | §8 Tabla de cobertura HU-1..HU-5 con estado y qué falta para producción | §9.1 | [ ] |
| I10 | §9 **Uso de IA**: qué asistentes, para qué, y **qué descartaste de lo que te propusieron y por qué** | §9.1 | [ ] |
| I11 | §10 Riesgos de producción y mitigaciones | §9.1 | [ ] |
| I12 | `README.md`: un comando para levantar, variables requeridas, cómo correr `demo.ts`, link de prueba, clave de acceso si aplica | §9.2 | [ ] |
| I13 | Dependencias justificadas en `SOLUCION.md` | §8 | [ ] |

---

## J · Despliegue y entrega

| ID | Criterio | PRD | Estado |
|---|---|---|---|
| J1 | **Link público activo** durante la defensa (si no: **−10**) | §9.3 | [ ] |
| J2 | `bun install && bun run demo.ts` funciona **sin ninguna clave** | §6.6 | [ ] |
| J3 | Repo con **historial de commits** real (no un único commit) | §9.5 | [ ] |
| J4 | Sin `node_modules/`, sin `out/`, sin `.env` en la entrega | §9.5 | [ ] |
| J5 | `.env.example` con las variables requeridas y **sin valores** | §6.5 | [ ] |
| J6 | `fixtures/` sin modificar respecto al zip original (diff limpio) | §6.5 | [ ] |

---

## K · Bonus: módulo reutilizable (+10)

| ID | Criterio | PRD | Auto | Estado |
|---|---|---|---|---|
| K1 | `modulo/agent.md` con frontmatter `description`, `mode: primary`, `permission {edit: deny, bash: deny}` y el system prompt en el cuerpo | §9.4 | SÍ | [ ] |
| K2 | `modulo/tools/proveedor.ts` importable sin el servidor | §9.4 | SÍ | [ ] |
| K3 | `modulo/skill/registro-proveedor/SKILL.md` con frontmatter `name`, `description` y el conocimiento en el cuerpo | §9.4 | SÍ | [ ] |
| K4 | **Las tres piezas son las mismas que usa la app, no copias divergentes** (verificado por `construir-modulo --check` en CI) | §9.4 | SÍ | [ ] |

---

## L · Preparación de la defensa (no puntúa, pero decide)

| ID | Criterio | Estado |
|---|---|---|
| L1 | El prompt de demo de la §11 del PRD produce el resultado esperado de punta a punta | [ ] |
| L2 | Un segundo mensaje "envía" produce **solo** `ENVIO-SIMULADO.md` tras confirmación explícita | [ ] |
| L3 | Puedo **explicar cada línea** del código entregado (requisito explícito del PRD) | [ ] |
| L4 | Sé responder: ¿por qué Bun? ¿por qué este modelo? ¿cómo evito que el modelo alucine un valor? ¿cómo cambio de proveedor? | [ ] |
| L5 | Plan B si el link público cae durante la defensa (correr en local, con el costo de −10 asumido) | [ ] |

---

## Comando único de verificación

```bash
bun run verificar
```

Debe imprimir el estado de cada criterio marcado `Auto = SÍ` y salir con código ≠ 0 si alguno falla.
