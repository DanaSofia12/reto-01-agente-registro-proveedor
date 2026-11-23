# Requerimientos funcionales — Agente "Registro como Proveedor"

> Derivado de `PRD-01-agente-registro-proveedor` v2.0 y del análisis de los fixtures de `reto-01.zip`.
> Cada RF es trazable a una historia de usuario (HU) o regla de negocio (RN) del PRD.

---

## 1. Problema y alcance

El área administrativa de Periferia recibe 8–12 solicitudes mensuales de registro como proveedor (CO, EC, PE, PA, HN). Hoy se transcriben a mano datos que ya existen en un repositorio maestro. El agente debe leer la solicitud, mapear los campos, generar el formulario en el formato pedido, armar el paquete de soportes y **dejar la firma y el envío a un humano**.

**Dentro de alcance:** lectura de fixtures, mapeo trazable, generación XLSX/PDF, paquete para firma, simulación de envío con confirmación explícita.
**Fuera de alcance:** firma electrónica, envío real, llenado de portales web (solo diseño documental), autenticación, base de datos.

---

## 2. Actores

| Actor | Interacción |
|---|---|
| Analista administrativa | **Usuario único del chat.** Pide procesar un caso, revisa faltantes, confirma. |
| Recepción | Deposita la solicitud (simulado por los fixtures). No usa el agente. |
| Representante legal | Recibe el paquete. No interactúa. |
| Cliente | Fuera del sistema. |

---

## 3. Inventario real de los fixtures

### 3.1 Casos entregados

| Caso | País | Formato | Campos | Soportes exigidos | Regla que ejercita |
|---|---|---|---|---|---|
| `co-industrias-delta` | CO | `xlsx` | 17 (2 hojas) | camara_comercio, rut, certificacion_bancaria, estados_financieros | Camino feliz · P0 |
| `ec-corp-andina` | EC | `pdf` | 15 | + `certificado_cumplimiento_tributario` | Soporte **ausente** + RN1 (RUC) + campo faltante |
| `hn-agroexport-sula` | HN | `xlsx` | 11 | camara_comercio, rut, **parafiscales** | Soporte **vencido** + RN1 (RTN) + campo faltante |
| `pa-logistica-istmo` | PA | `portal` | 9 | camara_comercio, rut | P2 · formato no soportado |

### 3.2 Repositorio maestro

`repositorio/maestro.json` — 1 objeto con claves `snake_case`, incluye objetos anidados (`representante_legal.*`, `contacto_comercial.*`, `contacto_financiero.*`, `banco.*`, `ingresos_ultimo_ano.*`). El glosario resuelve rutas con punto (ej. `"Banco" → banco.nombre`).

### 3.3 Vigencia de soportes (`repositorio/soportes/index.json`)

| Tipo | `vigencia_hasta` | Observación |
|---|---|---|
| `camara_comercio` | 2026-09-30 | Vence pronto |
| `rut` | `null` | **Sin vigencia → nunca vence** |
| `certificacion_bancaria` | 2026-12-31 | |
| `parafiscales` | **2026-08-31** | Vencido para cualquier ejecución posterior |
| `estados_financieros` | 2027-03-31 | |
| `certificado_iso_9001` | 2028-05-20 | No exigido por ningún caso |
| `certificado_cumplimiento_tributario` | — | **No existe.** Exigido por `ec-corp-andina` |

> **Hallazgo crítico.** Los fixtures fueron diseñados para una fecha de ejecución cercana al **2026-09-03** (fecha del PRD). Con esa ventana, `co` sale `listo_para_firma = true`, `hn` queda bloqueado por `parafiscales` vencido y `ec` por soporte ausente — cada caso demuestra una regla distinta. Si se ejecuta con la fecha real del sistema (p. ej. 2026-11-23), `camara_comercio` también vence y **los tres casos quedan bloqueados**, perdiendo la demostración del camino feliz.
> → **RF-30** resuelve esto con una fecha de referencia configurable.

---

## 4. Requerimientos funcionales

### HU-1 · Leer la solicitud

| ID | Requerimiento | Criterio de aceptación |
|---|---|---|
| RF-01 | `proveedor_leer_solicitud({ caso })` lee `solicitud.json` + la plantilla correspondiente + `soportes-exigidos.json`. | Devuelve `{ pais, cliente, formato, campos[], soportes[] }`. |
| RF-02 | Selecciona la plantilla por `formato`: `xlsx → plantilla-celdas.json`, `pdf → plantilla-campos.json`, `portal → ninguna`. | Caso `pa-logistica-istmo` no falla por ausencia de plantilla. |
| RF-03 | Normaliza los campos a una forma única independiente del formato: `{ etiqueta, obligatorio?, hoja?, celda_etiqueta?, celda_valor?, orden }`. | `mapear_campos` recibe la misma estructura venga de Excel o PDF. |
| RF-04 | Detecta etiquetas tributarias ambiguas (`Identificación tributaria`, `Número de identificación fiscal`, `RUC`, `RTN`) y las reporta con la equivalencia del país. | CO→NIT, EC/PE/PA→RUC, HN→RTN. |
| RF-05 | Caso inexistente o plantilla corrupta: `{ ok: false, error }` legible, sin traza cruda. | HU-5. |

### HU-2 · Mapear campos al maestro

| ID | Requerimiento | Criterio de aceptación |
|---|---|---|
| RF-06 | `proveedor_mapear_campos({ caso, campos[] })` cruza cada etiqueta contra `glosario-campos.json` y resuelve la ruta en `maestro.json`. | Devuelve `{ llenos[], faltantes[], requiere_confirmacion[] }`. |
| RF-07 | Cada campo termina en **exactamente uno** de tres estados: `lleno`, `faltante`, `requiere_confirmacion`. | Suma de los tres = total de campos solicitados. |
| RF-08 | Un campo `lleno` incluye la **ruta de origen** en el maestro (ej. `banco.numero_cuenta`) y la confianza del match. | Trazabilidad: HU-2. |
| RF-09 | **Nunca se inventa un valor.** Sin fuente en el maestro → `faltante` con `valor: null`. | Ningún campo faltante lleva texto plausible. |
| RF-10 | Match con confianza `< 0.8` → `requiere_confirmacion`. Match por debajo del piso mínimo → `faltante`. | Escala: exacto 1.0 · normalizado (minúsculas/sin tildes/sin puntuación) 0.95 · similitud difusa = score. |
| RF-11 | **RN1** — identificador tributario: el valor se llena con el NIT colombiano; si `pais ≠ CO`, se marca `requiere_confirmacion` con nota `"identificador extranjero"`. | `ec`, `pa`, `hn` marcan el campo; `co` no. |
| RF-12 | Los sinónimos del glosario se resuelven automáticamente, incluidas rutas anidadas con punto. | `"Ingresos anuales" → ingresos_ultimo_ano.valor`. |
| RF-13 | Produce `out/<caso>/faltantes.md` con la lista de campos sin fuente y por qué. | O2 del PRD. |

### HU-3 · Generar el formulario

| ID | Requerimiento | Prioridad |
|---|---|---|
| RF-14 | **XLSX** — `out/<caso>/formulario.xlsx`: escribe la **etiqueta** en `celda_etiqueta` y el **valor** en `celda_valor`, en la hoja indicada, respetando nombres exactos de hoja (`Datos Proveedor`, `Datos Bancarios`, `Registro`). | P0 |
| RF-15 | **PDF** — `out/<caso>/formulario.pdf` a partir de `plantilla-campos.json`, reproduciendo **todos** los campos con etiqueta y valor **en el orden dado**. Se acepta PDF generado (no AcroForm). | P1 |
| RF-16 | **Portal** — no se implementa. La herramienta responde `formato no soportado` y produce `out/<caso>/valores-portal.md` con los valores listos para copiar. | P2 |
| RF-17 | Campo `faltante` → celda/línea **vacía** más marca visual (relleno en Excel, `—` en PDF). Nunca un valor inventado. | P0 |
| RF-18 | Campo `requiere_confirmacion` → se escribe el valor y se marca visualmente + se lista aparte. | P0 |
| RF-19 | Soporta acentos y `ñ` en ambos formatos. | P0 |

### HU-4 · Armar el paquete para firma

| ID | Requerimiento | Criterio de aceptación |
|---|---|---|
| RF-20 | `proveedor_armar_paquete({ caso })` crea `out/<caso>/paquete/` con el formulario, las copias de los soportes exigidos **que existan**, `checklist.md` y `borrador-correo.md`. | HU-4. |
| RF-21 | `checklist.md` clasifica cada soporte exigido en **presente** / **ausente** / **vencido**, con `vigencia_hasta` y días restantes. | HU-4. |
| RF-22 | **RN3** — un soporte **vencido** o **ausente** fuerza `listo_para_firma = false`. Un campo `faltante` **no** bloquea, pero aparece en el checklist. | `co`→true · `ec`→false (ausente) · `hn`→false (vencido). |
| RF-23 | **RN2** — `borrador-correo.md` **nunca** incluye datos bancarios, ni siquiera si la plantilla los pidió. | Verificación automática por grep de `numero_cuenta`/`swift`. |
| RF-24 | Soporte exigido sin entrada en `index.json` → `ausente`, sin excepción. | `certificado_cumplimiento_tributario` en `ec`. |
| RF-25 | `vigencia_hasta: null` → nunca vence. | `rut`. |

### HU-4b · Confirmación humana y envío simulado

| ID | Requerimiento | Criterio de aceptación |
|---|---|---|
| RF-26 | **RN4 / CA3** — el agente termina el turno con una **pregunta explícita** antes de cualquier acción externa y solo procede si el mensaje siguiente del usuario confirma. | El front resalta ese estado. |
| RF-27 | `proveedor_simular_envio({ caso, confirmado })` con `confirmado = false` → `{ ok: false, error: "requiere confirmación explícita" }`. No escribe nada. | P1. |
| RF-28 | Con `confirmado = true` → escribe **únicamente** `out/<caso>/ENVIO-SIMULADO.md`. Ningún envío real. | P1. |

### HU-5 · Errores y trazabilidad

| ID | Requerimiento | Criterio de aceptación |
|---|---|---|
| RF-29 | Ninguna herramienta lanza excepción. Toda salida es `{ ok: true, data }` o `{ ok: false, error }` serializada como string. | Contrato 6.2. |
| RF-30 | **Fecha de referencia configurable** (`FECHA_REFERENCIA`, default = hoy). Se usa para calcular vigencias y se imprime en `demo.ts` y en el checklist. | Determinismo + demostrabilidad del camino feliz. |
| RF-31 | **CA4 / RN5** — toda llamada a herramienta se registra en `out/log.jsonl` (global) y `out/<caso>/log.jsonl` con `{ ts, herramienta, ok, resumen }`. | El PRD menciona ambas rutas; se escriben las dos. |
| RF-32 | Un caso con error no impide procesar el siguiente en `demo.ts`. | NFR Robustez. |
| RF-33 | El error de una herramienta o del proveedor LLM se muestra en el chat en lenguaje claro; la sesión sobrevive. | CA5. |

### Interfaz de chat

| ID | Requerimiento |
|---|---|
| RF-34 | Historial de conversación persistente por sesión, campo de entrada e indicador de "pensando". |
| RF-35 | **Cada llamada a herramienta se muestra**: nombre, argumentos y resultado resumido, expandible. |
| RF-36 | Cuando el agente pide confirmación, el front **resalta** el estado y ofrece la acción explícita. |
| RF-37 | Enlaces/rutas a los artefactos generados visibles desde el chat. |

---

## 5. Matriz de resultados esperados (oráculo de pruebas)

Calculado con `FECHA_REFERENCIA = 2026-09-03`.

| Caso | Llenos | Requiere confirmación | Faltantes | Artefacto | `listo_para_firma` | Causa |
|---|---|---|---|---|---|---|
| `co-industrias-delta` | 17 | 0 | 0 | `formulario.xlsx` | **true** | — |
| `ec-corp-andina` | 13 | 1 · `RUC` (RN1) | 1 · `Número de contribuyente especial` | `formulario.pdf` | **false** | `certificado_cumplimiento_tributario` **ausente** |
| `hn-agroexport-sula` | 9 | 1 · `RTN` (RN1) | 1 · `Referencias comerciales` | `formulario.xlsx` | **false** | `parafiscales` **vencido** (2026-08-31) |
| `pa-logistica-istmo` | 8 | 1 · `RUC` (RN1) | 0 | `valores-portal.md` | **false** | formato no soportado |

> El campo con `requiere_confirmacion` **sí lleva valor** (RN1 lo exige), por eso no se cuenta en `llenos`.
> Estos números son la aserción de los tests unitarios y del verificador automático de rúbrica.

---

## 6. Artefactos de salida por caso

```
out/
├── log.jsonl                      # RF-31 · global
└── <caso>/
    ├── log.jsonl                  # RF-31 · por caso
    ├── faltantes.md               # RF-13
    ├── formulario.xlsx | .pdf     # RF-14 / RF-15
    ├── valores-portal.md          # RF-16 (solo formato portal)
    ├── ENVIO-SIMULADO.md          # RF-28 (solo tras confirmación)
    └── paquete/
        ├── formulario.*           # copia
        ├── <soportes presentes>   # copias desde repositorio/soportes/
        ├── checklist.md           # RF-21
        └── borrador-correo.md     # RF-23
```

---

## 7. Ambigüedades del PRD y decisión adoptada

| # | Ambigüedad | Decisión | Justificación |
|---|---|---|---|
| A1 | HU-3 P2 pide responder `formato no soportado` **y** producir un archivo; el contrato es `{ok:true,data}` XOR `{ok:false,error}`. | Devolver `{ ok: false, error: "formato no soportado: 'portal'. Valores copiables en out/<caso>/valores-portal.md" }` **y escribir el archivo**. | Respeta el contrato literal y cumple el entregable. Se declara como supuesto en `SOLUCION.md`. |
| A2 | CA4 dice `out/log.jsonl`; RN5 dice `out/<caso>/log.jsonl`. | Escribir **ambos**. | Costo nulo, elimina el riesgo de que el evaluador busque en la ruta que no se implementó. |
| A3 | No se define qué escribir en una celda de campo `faltante`. | Celda vacía + relleno ámbar + entrada en `faltantes.md`. | RF-09: no inventar. La marca visual hace evidente el vacío. |
| A4 | No se define la fecha contra la que se evalúa `vigencia_hasta`. | `FECHA_REFERENCIA` (env), default = fecha actual. `.env.example` sugiere `2026-09-03`. | Determinismo (NFR) + permite demostrar el camino feliz de `co`. |
| A5 | `pais` en el maestro es `CO`, pero el caso es de HN/EC. | El campo "País" se llena con el país **del proveedor** (`CO`), no del cliente. | El formulario describe al proveedor. |
| A6 | No se define el nombre del reporte de faltantes (O2). | `out/<caso>/faltantes.md`. | Consistente con el resto de artefactos. |
| A7 | El zip trae la raíz `reto-01/`; el PRD referencia `fixtures/reto-01/casos/`. | Ubicar el contenido en `reto-01/fixtures/reto-01/`. | Las rutas del PRD funcionan literalmente. |

---

## 8. No-objetivos (confirmados)

- Integración real con correo, SharePoint, firma electrónica o portales.
- Autenticación, roles, multiusuario.
- Base de datos (sistema de archivos local es suficiente).
- Llenado real de portales web — **solo diseño** en `SOLUCION.md` §7.4.
