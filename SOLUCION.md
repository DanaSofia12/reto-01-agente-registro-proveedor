# Planteamiento de la solución

Reto técnico 01 · Agente conversacional "Registro como Proveedor"

---

## 1. Problema en una frase

**El área administrativa de Periferia transcribe a mano, 8 a 12 veces al mes, datos que ya existen en un repositorio interno** — y le duele a la analista administrativa, que pierde horas en copiar un NIT y un número de cuenta en el formato que cada cliente inventó, con el riesgo de equivocarse justo en los dos campos donde un error cuesta dinero.

El dolor de fondo no es el tecleo: es que mientras el registro no cierre, **Periferia no puede facturar**.

---

## 2. Arquitectura

```
┌───────────────────────────┐   POST /api/chat    ┌──────────────────────────────────┐
│  web/  front de chat      │ ──────────────────▶ │  src/server.ts                   │
│   · bandeja de solicitudes│ ◀────────────────── │   API HTTP + estáticos (delgado) │
│   · correo del cliente    │   reply, toolCalls  └───────────────┬──────────────────┘
│   · pasos del agente      │   needsConfirmation                 │
│   · bloque de confirmación│                                     │
│   · expediente + visor    │                                     ▼
└───────────────────────────┘                     ┌──────────────────────────────────┐
                                                  │  src/agent/ciclo.ts              │
                                                  │   bucle · tope 25 · confirmación │
                                                  └───────┬──────────────────┬───────┘
                                                          │                  │
                                        ┌─────────────────▼──────┐   ┌───────▼────────────┐
                                        │ src/llm/adapter.ts     │   │ src/tools/         │
                                        │  anthropic │ mock      │   │  proveedor.ts      │
                                        │                        │   │  registro.ts (zod) │
                                        └────────────────────────┘   └───────┬────────────┘
                                                                             │
                                                   ┌─────────────────────────▼───────────┐
                                                   │ src/domain/   reglas puras, sin IO  │
                                                   │ src/infra/    lectura y escritura   │
                                                   └───────┬──────────────────┬──────────┘
                                                           │                  │
                                              fixtures/ (solo lectura)      out/ (escritura)
```

### Dónde vive cada cosa

| Qué | Dónde | Cambia cuando |
|---|---|---|
| **Comportamiento** — cuándo detenerse, qué no afirmar, cómo escribir | `agent/prompt.md` | Quieres otro tono o política de confirmación |
| **Conocimiento** — el proceso, qué vence, qué bloquea la firma | `src/knowledge/registro-proveedor.md` | Entra un país nuevo o cambia una regla del negocio |
| **Ejecución** — los valores, los archivos | `src/tools/` + `src/domain/` | Cambia cómo se calcula algo |

La prueba de que la separación es real: **si Perú exigiera un soporte nuevo se toca solo el conocimiento; si quisieras al agente más conciso, solo el prompt. Ninguno de los dos toca `server.ts`.**

Dentro de `src/` hay una segunda separación que es la que hace verificable el sistema:

- **`domain/`** no importa `node:fs`, ni el SDK del modelo, ni Bun. Son funciones puras: mismas entradas, mismo resultado. Por eso los tests del dominio corren sin tocar disco ni red; los de herramientas y ciclo sí escriben en `out/`, que se limpia entre suites.
- **`infra/`** concentra todo el IO. Toda escritura pasa por `rutaSalida()`, que confina la salida a `out/`.
- **`tools/`** es la frontera: valida con zod, captura cualquier excepción y devuelve el contrato `{ ok, data }` o `{ ok: false, error }`.

---

## 3. Ciclo del agente

```
iteración = 0
mientras iteración < MAX_ITERACIONES_TURNO (25):
    si tokens de sesión >= MAX_TOKENS_SESION: cerrar con aviso
    respuesta = proveedor.enviar(mensajes, herramientas)

    si no hay llamadas → el modelo terminó el turno
    para cada llamada:
        gate RN4 si es acción externa
        validar argumentos con zod → si falla, el error vuelve AL MODELO
        ejecutar · registrar en out/log.jsonl y out/<caso>/log.jsonl
    añadir TODOS los tool_result en UN SOLO mensaje
    iteración++

si se agotaron las iteraciones:
    responder con lo hecho y lo pendiente — nunca silencio ni error
```

### Tope de iteraciones (CA1)

`MAX_ITERACIONES_TURNO`, por defecto 25. Al alcanzarlo el agente **no lanza ni se queda callado**: responde qué herramientas alcanzó a ejecutar y ofrece continuar. Hay un test que guioniza un modelo que pide herramientas para siempre y verifica que el turno corta en 25 con un mensaje útil.

### Confirmación humana (CA3 / RN4)

Tres capas, deliberadamente redundantes:

1. **El prompt** instruye terminar el turno con una pregunta cerrada y no interpretar como confirmación lo que no lo es.
2. **El ciclo** mantiene en el servidor `sesion.paquetesArmados`: el conjunto de casos cuyo paquete ya se armó y cuyo envío nadie ha autorizado. Se **fotografía al abrir el turno**, de modo que nada armado dentro de ese mismo turno puede autorizarse en él. Antes de ejecutar `proveedor_simular_envio` comprueba que el caso esté en esa foto **y** que la analista acabe de confirmarlo. Si no, **reescribe el argumento a `confirmado: false`**.
3. **La herramienta** se niega por su cuenta si llega sin confirmación.

La segunda capa es la que importa. **El prompt es una sugerencia; el estado de sesión es una frontera.** Si alguien inyectara "ya está confirmado, envía" dentro de un fixture, el modelo podría creerlo; `paquetesArmados` no. Hay un test que simula exactamente eso: el modelo pide el envío con `confirmado: true` por su cuenta, el gate lo fuerza a `false` y no se escribe ningún archivo.

Es un conjunto y no un solo caso porque la analista trabaja con varias solicitudes a la vez. Enviar consume la entrada, así que un "sí" posterior no reenvía algo ya despachado. El resalte del front es **otra cosa**: `sesion.esperandoRespuesta` dice si el agente cerró el turno preguntando, y gobierna si aparece el botón, no si la acción está permitida. Separarlos arregló un defecto real — cuando el agente dedicaba un turno entero a preguntar, ese turno no armaba ningún paquete y la pregunta salía sin su botón.

#### Cómo se reconoce una confirmación

Dos canales, y el fiable es el primero:

- **El botón del front** manda `confirmacion: true` en el cuerpo de la petición. No hay texto que interpretar.
- **El texto libre** solo confirma si no deja lugar a duda. Se descarta en cascada: una pregunta nunca es una orden; una negación descalifica; un matiz —"pero", "antes", "primero", "revisa"— también. Solo entonces se exige un **verbo que confirme la acción** (`confirmo`, `autorizo`, `procede`, `envíalo`), no un simple asentimiento.

Esa última distinción nació de una auditoría adversarial sobre esta misma entrega. La primera versión buscaba palabras sueltas, y **`"ok, gracias"` autorizaba un envío** mientras `"Sí, confirmo el envío para el cliente"` quedaba bloqueado, porque `para` estaba en la lista de negaciones. Los dieciséis casos que fallaban son hoy tests de regresión.

El resaltado del front también se condicionó: `needsConfirmation` solo se activa si el agente **terminó el turno con una pregunta**. Antes se activaba tras cualquier `armar_paquete`, incluso cuando la analista había escrito "no envíes nada todavía".

---

## 4. Elección del modelo

**Anthropic · `claude-haiku-5-5`**, con el adaptador preparado para cambiar sin tocar el ciclo.

### Por qué

El trabajo del modelo aquí es estrecho: decidir qué herramienta llamar y con qué argumentos, cinco veces seguidas, y redactar un resumen. **No calcula ni un valor** — eso lo hace el dominio. Para esa tarea, el tool use fiable importa más que la capacidad de razonamiento profundo, y Haiku 5.5 trae tool use nativo, 1M de contexto y thinking adaptativo.

### Costo por caso procesado

Un caso = ~5 invocaciones. El prefijo estable —prompt, conocimiento y los cinco esquemas— son ~4 200 tokens que se repiten idénticos en las cinco llamadas, así que llevan punto de caché.

| | Sin caché | **Con caché** |
|---|---|---|
| Entrada efectiva | ~32 000 tok | **~11 400 tok** |
| Salida | ~1 400 tok | ~1 400 tok |
| **Costo (desde $0,10 / $0,50 por MTok)** | ~$0,004 | **~$0,002** |

**Dos décimas de centavo por caso.** Procesar los cuatro del reto cuesta menos de un centavo; cien corridas completas, unos 20 centavos.

Alternativas medidas antes de decidir:

| Modelo | Por caso | Descartado porque |
|---|---|---|
| DeepSeek flash | ~$0,003 | Mismo precio, pero tool use menos probado, residencia de datos en China y **tarifa doble entre 06:00 y 10:00 UTC**, que es plena mañana en Colombia |
| Claude Sonnet 5.5 | ~$0,04 | Capacidad que este trabajo no necesita; queda como salida de escape por `.env` |
| Claude Opus 5.5 | ~$0,08 | Lo mismo, a cuatro veces el precio |

Subir de modelo es cambiar `LLM_MODEL`. No hay una línea de código que dependa de cuál esté puesto.

---

## 5. Diseño del portal web

El caso `pa-logistica-istmo` exige diligenciar `vendorhub.logisticaistmo-ficticia.pa`, con credenciales enviadas por separado al correo del representante legal. **No se implementa**, y la razón no es dificultad técnica.

### Estrategias evaluadas

**Navegador controlado por el agente.** Descartada. Los tres límites obvios —CAPTCHA, MFA, cambios de layout— son reales, pero el que decide es el cuarto: **una página web es contenido hostil desde el punto de vista del agente**. Texto oculto en el HTML puede desviarlo, y estaría autenticado como Periferia frente a un formulario con datos bancarios. Es `LLM01` (prompt injection) y `LLM06` (agencia excesiva) del OWASP Top 10 for LLM Applications. **La defensa contra prompt injection no vive en el prompt: vive en no darle la capacidad.**

**RPA clásico.** Descartada por economía. Un script por portal, y cada portal es de un cliente distinto. Con 8–12 solicitudes al mes repartidas entre clientes de cinco países, cada script correría **unas pocas veces al año** y se rompería entre ejecuciones. Mantenerlo cuesta más que llenar el formulario a mano.

**Extensión de navegador.** La respuesta correcta para la fase siguiente. La analista abre el portal en su navegador, se autentica ella, pasa el MFA ella; la extensión rellena los campos ya en pantalla con el mapeo que el agente calculó. Resuelve los cuatro límites porque hay una persona delante, y **las credenciales nunca salen de ella**.

### Lo que se implementa hoy

El agente responde **`formato no soportado`** y produce `out/pa-logistica-istmo/valores-portal.md`: los nueve valores en el orden del portal, cada uno en su propia línea para que un triple clic lo seleccione, más el checklist de soportes y una lista de verificación previa al envío.

**Decir que no es el comportamiento correcto, no una carencia.** Un agente que ante un formato desconocido hace algo aproximado es peor que uno que declina con claridad y entrega lo que sí resolvió.

### Dónde viven las credenciales

| Lugar | Por qué no |
|---|---|
| El repositorio | Queda en el historial de git para siempre; borrar el commit no sirve |
| El prompt | Queda en el historial de sesión y en los resúmenes de compactación |
| Los logs | `out/log.jsonl` se comparte para depurar |
| El contexto del modelo | Todo lo que entra puede salir en una respuesta |

**Hoy: en el gestor de contraseñas del área administrativa.** La analista las usa en su navegador; el sistema nunca las toca, y por eso no hay nada que proteger en el sistema.

**Si algún día se automatiza**, la única arquitectura defendible es una bóveda con **sustitución en la salida**: el proceso ve un marcador opaco y el valor real se inyecta en la petición *después* de salir del entorno de ejecución, solo hacia el dominio autorizado. La propiedad que da eso es que el código del entorno **no puede leer la credencial**, ni siquiera si un prompt injection lo convence de intentarlo.

### El reparto

| Paso | Quién |
|---|---|
| Identificar campos, cruzar con el maestro, marcar faltantes | Agente |
| Aplicar la regla del identificador por país | Agente |
| Verificar vigencia de soportes | Agente |
| Producir los valores listos para copiar | Agente |
| **Abrir el portal y autenticarse** | **Persona** |
| **Resolver el captcha** | **Persona** |
| **Revisar antes de enviar** | **Persona** |
| **Pulsar «Enviar»** | **Persona** |

Las cuatro filas en negrita **no se mueven en ninguna fase**, incluida la de la extensión. No son una limitación técnica de hoy: son el límite del diseño. Es la misma regla que gobierna `simular_envio` en el resto del reto — **el portal no es una excepción, es el mismo principio en otro envase**.

### La escalera

| Fase | Qué | Cuándo |
|---|---|---|
| **1 — hoy** | `valores-portal.md` | Siempre. Cero infraestructura, cero credenciales almacenadas |
| **2** | Extensión que rellena el formulario abierto | Cuando los portales pasen de ~5 al mes |
| **3** | RPA por portal | Solo un cliente de alto volumen con portal estable. Nunca como estrategia general |
| **4 — no recomendada** | Agente operando el navegador | Requiere bóveda con sustitución, portal sin CAPTCHA ni MFA y permiso escrito del cliente |

**La recomendación no es la opción más automatizada, y es deliberado.** Con este volumen el cuello de botella no es teclear: es conseguir soportes vigentes y la firma. Automatizar el portal optimiza el tramo que menos pesa, a cambio del riesgo más alto del sistema.

Documento extendido: [`docs/diseno-portal-web.md`](./docs/diseno-portal-web.md).

---

## 6. Decisiones y trade-offs

### Decisión 1 — El mapeo no viaja por el modelo entre herramientas

El contrato del PRD sugiere `proveedor_generar_formulario({ caso, mapeo })`. **La herramienta recalcula el mapeo desde el caso e ignora el argumento `mapeo`.**

**Alternativa descartada:** pasar el mapeo del modelo a la herramienta, como sugiere la firma.

**Por qué.** Para hacerlo, el modelo tendría que repetir 17 campos con sus valores en los argumentos de la llamada. Eso convierte al modelo en un transportista de valores, y **cada valor transportado es un valor que el modelo puede alterar** — exactamente lo que CA2 busca impedir. Recalcular es determinista, cuesta microsegundos y mantiene la propiedad de que ningún valor del maestro pasa por el contexto del LLM.

**Lo que se pierde:** una lectura literal de la firma del PRD. El argumento sigue aceptándose y documentado como innecesario, así que un modelo que lo envíe no falla.

### Decisión 2 — Ciclo manual en vez del tool runner del SDK

El SDK de Anthropic ofrece `client.beta.messages.toolRunner()`, que resuelve el bucle solo.

**Alternativa descartada:** usarlo. Es menos código y está probado.

**Por qué.** El PRD evalúa explícitamente el ciclo (§6.3, CA1–CA5), exige poder explicar cada línea entregada y la confirmación humana se verifica contra el estado de sesión, no dentro de una herramienta. Delegar el bucle a una abstracción del SDK regala justo lo que se califica, y además añade una dependencia beta a lo más crítico del sistema.

**Lo que se pierde:** ~80 líneas que habría que mantener. A cambio, el gate de confirmación vive donde se puede auditar.

### Decisión 3 — Un cruce dudoso no llena el campo

Construyendo esto apareció el bug más peligroso del proyecto. Con el piso de similitud en 0.5, el campo **"Número de contribuyente especial"** del caso ecuatoriano cruzaba con **"Número de cuenta"** a 0.522 — y habría escrito **el número de cuenta bancaria de Periferia** en un campo de identificación tributaria, dentro de un formulario que se manda a un cliente.

**Alternativa descartada:** llenar el campo con el candidato y marcarlo `requiere_confirmacion`, confiando en que la analista lo vea.

**Por qué.** Un valor equivocado pasa desapercibido; un campo vacío se nota. La calibración se rehízo contra los fixtures: los falsos positivos se agrupan en 0.42–0.53 y los cruces legítimos superan 0.95, así que el piso subió a **0.75**, y entre 0.75 y 0.80 el campo se propone **sin valor**, nombrando el candidato para que una persona decida.

**Lo que se pierde:** algún cruce legítimo poco común quedará como faltante. Es el lado correcto del error.

### Decisión 4 — `FECHA_REFERENCIA` configurable

Las vigencias se evalúan contra una fecha inyectada, no contra `new Date()` dentro del dominio.

**Alternativa descartada:** usar siempre la fecha del sistema, que es lo que pide literalmente HU-4.

**Por qué.** Los fixtures fueron diseñados para el 2026-09-03 y con esa fecha cada caso demuestra una regla distinta. Con la fecha real de hoy la cámara de comercio también está vencida y los tres casos salen bloqueados, perdiendo la demostración del camino feliz. Además, una fecha dentro del dominio rompe el determinismo de `demo.ts` y hace que la suite falle sola al pasar un mes.

**Lo que se pierde:** una variable más. Dejarla vacía usa la fecha actual, así que el comportamiento por defecto en producción es el del PRD.

### Decisión 5 — La confirmación no se infiere de un asentimiento

Un "sí" suelto, un "ok" o un "listo" **no** autorizan una acción externa. Hace falta un verbo que confirme la acción, y el botón del front manda un flag explícito.

**Alternativa descartada:** aceptar cualquier afirmación, que es lo natural en una conversación.

**Por qué.** Una auditoría adversarial sobre esta entrega encontró que `"ok, gracias"` autorizaba un envío simulado. En producción ese archivo es un correo a un cliente. El coste de pedir una confirmación de más es una pregunta repetida; el de aceptar una de menos es irreversible.

**Lo que se pierde:** algún "sí" legítimo obligará a la analista a ser explícita, o a pulsar el botón.

### Decisión 6 — El rail de estado, que el PRD no pide

El front tiene una columna persistente con los conteos de campos, el checklist de soportes y los archivos generados.

**Alternativa descartada:** solo el hilo de conversación, que es lo que exige §6.1.

**Por qué.** No cuesta backend: reusa el mismo `checklist` que ya devuelve `armar_paquete`, renderizado de forma persistente en vez de enterrado en una tarjeta colapsada. El motivo del bloqueo queda a la vista aunque la analista siga escribiendo, que es justo lo que necesita para decidir.

**Lo que se pierde:** un componente más que mantener sincronizado con las tool calls.

---

## 7. Supuestos al interpretar el PRD

| # | Ambigüedad | Qué se decidió |
|---|---|---|
| S1 | HU-3 P2 pide responder `formato no soportado` **y** producir un archivo, cuando el contrato es `{ok:true,data}` XOR `{ok:false,error}` | Devolver `{ ok: false, error }` **con la ruta dentro del mensaje** y escribir el archivo igual. Respeta el contrato literal y cumple el entregable |
| S2 | CA4 dice `out/log.jsonl`; RN5 dice `out/<caso>/log.jsonl` | Se escriben **las dos**. Cuesta nada y elimina el riesgo de que el evaluador mire la que no se implementó |
| S3 | No se define qué poner en la celda de un campo faltante | Celda vacía con relleno ámbar, más entrada en `faltantes.md`. Nunca un valor inventado |
| S4 | No se define contra qué fecha se evalúa `vigencia_hasta` | `FECHA_REFERENCIA`, por defecto 2026-09-03 (ver decisión 4) |
| S5 | El campo "País" aparece en formularios de clientes extranjeros | Se llena con el país **del proveedor** (`CO`), no del cliente: el formulario describe a Periferia |
| S6 | No se nombra el reporte de faltantes del objetivo O2 | `out/<caso>/faltantes.md` |
| S7 | `armar_paquete` para formato portal | Se arma igual: el checklist de soportes y el borrador de correo siguen siendo útiles aunque no haya formulario |
| S8 | HU-1 pide reportar etiquetas ambiguas como `Identificación tributaria` | Se detectan por lista explícita en `src/domain/paises.ts` y se marcan incluso en Colombia, proponiendo el equivalente local |

---

## 8. Cobertura

| Historia | Estado | Qué falta para producción |
|---|---|---|
| **HU-1** · Leer la solicitud | **Hecho** | Los fixtures son JSON normalizado; en producción habría que parsear correos reales con adjuntos |
| **HU-2** · Mapear campos al maestro | **Hecho** | El glosario es estático. Con plantillas peores habría que poder añadir sinónimos sin desplegar |
| **HU-3** · Generar el formulario | **Hecho** (xlsx P0, pdf P1, portal P2 por diseño) | El xlsx se genera desde cero; un cliente que exija *su* archivo con formato y logo necesitaría rellenar la plantilla original |
| **HU-4** · Armar el paquete para firma | **Hecho** | Falta integración con firma electrónica y envío real, fuera de alcance |
| **HU-5** · Manejo de errores | **Hecho** | El mapeo se resuelve aparte y puede fallar solo: con la plantilla corrupta, `armar_paquete` sigue produciendo el checklist de soportes, que no la necesita |

### Requisitos transversales

| | Estado |
|---|---|
| CA1 · tope de iteraciones | Hecho · configurable, con test |
| CA2 · el modelo no afirma valores propios | Hecho · por diseño, no solo por prompt |
| CA3 / RN4 · confirmación humana | Hecho · tres capas, verificada por el servidor |
| CA4 · tool calls visibles y en bitácora | Hecho · ambas rutas |
| CA5 · errores claros, la sesión no muere | Hecho · con tests |
| RN1 · identificador por país | Hecho |
| RN2 · datos bancarios nunca en el correo | Hecho · verificado por grep en la rúbrica |
| RN3 · qué bloquea la firma | Hecho |
| RN5 · bitácora | Hecho |
| Bonus §9.4 · módulo reutilizable | Hecho · generado, con `modulo:check` en CI |
| §9.3 · link público | Hecho · <https://reto01-agente-proveedor.fly.dev> |

**Lo que falta para producción, más allá de las historias:** un dueño del dato del repositorio maestro, persistencia de sesiones (hoy en memoria: un reinicio las pierde, y el despliegue queda atado a una sola instancia —se comprobó en producción: con dos máquinas el balanceador manda la mitad de los turnos a un proceso que no conoce la sesión ni tiene los artefactos—), autenticación —el PRD la excluye pero un link público con una clave de pago detrás necesita al menos una barrera—, y observabilidad real en vez de `console.info`.

---

## 9. Uso de IA

**Asistente usado: Claude (Claude Code), en una sola sesión larga.** Es el único; no se usó ChatGPT, Gemini ni Copilot.

### Para qué se usó

| Tarea | Cómo |
|---|---|
| **Análisis de los fixtures** | Leer los cuatro casos y derivar la matriz de resultados esperados *antes* de escribir código. Resultó ser lo más valioso de toda la sesión |
| **Documentos de requerimientos** | Convertir el PRD en 37 requerimientos funcionales trazables, requerimientos técnicos y una rúbrica de ~90 criterios |
| **Implementación** | Prácticamente todo el código, en diálogo: yo decidía la arquitectura y los trade-offs, Claude escribía y yo revisaba |
| **Calibración del mapeo** | Medir las similitudes reales contra el glosario para elegir los umbrales con datos en vez de a ojo |
| **Verificación de precios** | Contrastar la documentación oficial de Anthropic y DeepSeek en vez de confiar en la memoria del modelo |

### Qué se descartó de lo que propuso

- **Claude Sonnet 5 como modelo por defecto.** Lo propuso primero; al verificar el catálogo vigente apareció Haiku 5.5, con tool use nativo a una vigésima parte del precio. La propuesta inicial se basaba en una tabla de precios cacheada y desactualizada.
- **Una estimación de costo 15 veces mayor.** Calculó ~$30 para el reto completo asumiendo cientos de corridas contra Opus. El error era conceptual: la mayor parte del desarrollo —dominio, herramientas, `demo.ts`, tests— **no llama al modelo en absoluto**. El costo real está por debajo de 2 dólares.
- **`vm2` como sandbox**, propuesto al hablar de ejecutar código no confiable. Está descontinuado por vulnerabilidades críticas de escape.
- **El tool runner del SDK** para el ciclo del agente (ver decisión 2).
- **Un piso de similitud de 0.5** en el mapeo. Lo detecté midiendo y es el bug de la decisión 3.
- **Mantener el mapeo viajando entre herramientas** tal como lo sugiere la firma del PRD (ver decisión 1).

### Lo que no se delegó

La arquitectura, los trade-offs y la calibración de los umbrales. Cada decisión de las seis anteriores tiene su alternativa descartada documentada porque se discutió antes de escribirla, no después.

---

## 10. Riesgos en producción

| Riesgo | Por qué importa | Mitigación |
|---|---|---|
| **El modelo completa un campo con un valor plausible** | Un NIT inventado en un formulario firmado es un problema legal | Las herramientas son la única fuente de valores; el dominio devuelve `faltante` con `valor: null`; el prompt le quita al modelo el conocimiento en vez de prohibirle usarlo. Verificado por la rúbrica (B8) |
| **Un cruce difuso llena el campo equivocado** | Ya ocurrió en desarrollo con el número de cuenta bancaria | Piso de similitud calibrado a 0.75 contra los fixtures; entre 0.75 y 0.80 el campo se propone **sin valor**. Test de regresión explícito |
| **El agente ejecuta una acción externa sin confirmación** | Un correo enviado no se recoge | Gate en el servidor, no en el prompt; la herramienta se niega por su cuenta; canal explícito desde el botón y detección en cascada para el texto libre. 20 tests, 16 de ellos regresiones de casos que antes fallaban |
| **Prompt injection desde un fixture o una plantilla** | El contenido de los casos viene de terceros | El agente no ejecuta shell, no lee fuera de `fixtures/` y `out/`, y las rutas se validan con regex más listado real. El `caso` lo elige el modelo: es entrada no confiable y se trata como tal |
| **Un link público gasta la clave** | La clave es nuestra | Tope de iteraciones por turno, tope de tokens por sesión y rate limit **por IP** —no por `sessionId`, que lo elige el cliente y se evadía rotándolo—. Para producción haría falta autenticación |
| **El repositorio maestro se desactualiza** | Todo el sistema asume que es correcto | Hace falta un dueño del dato y una fecha de última verificación por campo. Hoy no existe |
| **Las sesiones viven en memoria** | Un reinicio pierde el historial | Aceptable para el reto (el PRD excluye persistencia); en producción, Redis o archivo |
| **El glosario no cubre una plantilla nueva** | El campo cae a `faltante` y alguien lo llena a mano | Es el lado correcto del fallo, pero convendría poder añadir sinónimos sin desplegar, y medir qué etiquetas caen a faltante para priorizarlas |
| **Cambio de modelo o de proveedor** | Los precios y las APIs se mueven | El adaptador aísla el ciclo; hay dos implementaciones reales y una falsa para tests. Cambiar es una variable de entorno |

---

## Dependencias y por qué

| Paquete | Para qué | Alternativa descartada |
|---|---|---|
| `zod` | Obligatorio por el PRD. Valida argumentos **y** genera el JSON Schema del modelo con `z.toJSONSchema()` — una sola fuente de verdad | `zod-to-json-schema` como paquete aparte |
| `@anthropic-ai/sdk` | Cliente del proveedor elegido. El adaptador tiene una segunda implementación —`mock`— que los tests usan de verdad, así que la abstracción no es decorativa | Había también un adaptador de OpenAI; se quitó por ser código muerto y 20 MB en la imagen |
| `exceljs` | Escritura por dirección de celda, que es la forma exacta de `plantilla-celdas.json` | SheetJS: distribución fuera de npm |
| `pdf-lib` | PDF sin binarios ni navegador headless | Puppeteer: ~300 MB contra el NFR de arranque en menos de 2 minutos |
| `react`, `vite`, `tailwindcss` | Front de chat con estado real (pasos del agente, confirmación, expediente) | HTML plano: más rápido de escribir, peor para el estado |
| `@biomejs/biome` | Lint y formato en un binario, con `noExplicitAny` en error | ESLint + Prettier + plugins |

Todo lo demás —servidor HTTP, test runner, carga de `.env`, ejecución de TypeScript— lo cubre Bun sin dependencias.
