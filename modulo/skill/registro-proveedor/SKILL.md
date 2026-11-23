---
name: registro-proveedor
description: El proceso de registro como proveedor ante clientes de Colombia, Ecuador, Perú, Panamá y Honduras — formatos de salida, identificador tributario por país, vigencia de soportes y qué bloquea la firma del representante legal.
---

<!-- Generado por scripts/construir-modulo.ts. No editar a mano. -->

# El proceso de registro como proveedor

## Qué es

Antes de poder facturarle a un cliente, Periferia tiene que quedar dada de alta como proveedor en sus sistemas. El cliente manda un formulario y una lista de soportes; Periferia los devuelve diligenciados y firmados por el representante legal.

Llegan entre 8 y 12 al mes desde Colombia, Ecuador, Perú, Panamá y Honduras. La información es casi siempre la misma; lo que cambia es **el formato en que cada cliente la pide**. Por eso el proceso se automatiza: el contenido es estable, el envase no.

Mientras el registro no se cierre, Periferia no puede facturar. Un registro trabado retrasa el cobro.

## Anatomía de una solicitud

| Pieza                    | Qué contiene                                                                    |
| ------------------------ | ------------------------------------------------------------------------------- |
| `solicitud.json`         | El correo del cliente: quién, de qué país, qué formato pide, qué soportes exige |
| `plantilla-celdas.json`  | Solo en formato `xlsx`. Qué etiqueta va en qué celda de qué hoja                |
| `plantilla-campos.json`  | Solo en formato `pdf`. La lista ordenada de campos y cuáles son obligatorios    |
| `soportes-exigidos.json` | Los tipos de documento que ese cliente exige adjuntar                           |

El **repositorio maestro** guarda los datos de Periferia en `snake_case`, con objetos anidados para el representante legal, los contactos y el banco. El **glosario** traduce las etiquetas que usan los clientes a las claves del maestro: `"Nombre de la empresa"`, `"Razón social"` y `"Nombre o razón social del proveedor"` apuntan todas a `razon_social`.

## Los tres formatos

**Excel.** El cliente manda su plantilla y espera esa misma plantilla de vuelta. Cada etiqueta y cada valor van en una celda concreta de una hoja concreta. Reformatear no es una opción: su sistema lee celdas fijas.

**PDF.** El cliente manda un formulario. Se devuelve un PDF con todos los campos en el orden que él definió.

**Portal web.** El cliente no manda nada: da una URL y credenciales por separado. Nadie automatiza esto: hay CAPTCHA, hay MFA y el layout cambia sin avisar. Lo que sí se puede hacer es dejar los valores listos para copiar, y que una persona los pegue.

## El identificador tributario

Cada país le pone un nombre distinto al mismo dato:

| País                  | Cómo lo llama |
| --------------------- | ------------- |
| Colombia              | NIT           |
| Ecuador, Perú, Panamá | RUC           |
| Honduras              | RTN           |

**Periferia es una empresa colombiana y solo tiene NIT.** Cuando un cliente extranjero pide RUC o RTN, el valor que se escribe es el NIT colombiano — es el único identificador tributario que Periferia tiene.

Eso casi siempre es lo correcto: los formularios para proveedores extranjeros esperan el identificador del país de origen. Pero no siempre, y el cliente puede rechazarlo. Por eso el campo se llena **y se marca para que una persona lo confirme** antes de firmar. No es un error; es una decisión que no le corresponde al sistema.

## Los soportes

| Tipo                     | Qué es                                                                  | Vence                                                  |
| ------------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------ |
| `camara_comercio`        | Certificado de existencia y representación legal                        | Sí — los clientes suelen exigirlo con menos de 30 días |
| `rut`                    | Registro Único Tributario                                               | No                                                     |
| `certificacion_bancaria` | Carta del banco certificando la cuenta                                  | Sí                                                     |
| `parafiscales`           | Certificación de aportes a seguridad social, firmada por revisor fiscal | Sí — es mensual, vence rápido                          |
| `estados_financieros`    | Estados financieros auditados del último año                            | Sí                                                     |
| `certificado_iso_9001`   | Certificado de calidad                                                  | Sí                                                     |

Un soporte sin fecha de vigencia no vence nunca. El RUT es el caso: una vez expedido, sigue siendo válido.

La **cámara de comercio** y los **parafiscales** son los que más se vencen, porque tienen ventanas cortas. Son también los dos que más rechazos provocan.

## Qué significa "listo para firma"

Un paquete está listo cuando el representante legal puede firmarlo sin que nadie tenga que conseguir nada más.

**Bloquea la firma:**

- Un soporte exigido que no existe en el repositorio
- Un soporte exigido que está vencido a la fecha de hoy

**No bloquea la firma:**

- Un campo del formulario sin dato en el maestro

La diferencia es quién puede resolverlo. Un soporte ausente o vencido hay que ir a tramitarlo afuera — a la cámara de comercio, al banco, al revisor fiscal — y eso toma días. Un campo faltante normalmente lo responde alguien de Periferia en minutos, o el cliente acepta el formulario sin él.

Mandar a firmar un paquete con un soporte vencido es quemar la firma del representante legal: el cliente lo rechaza y hay que repetir todo el ciclo.

## Los tres estados de un campo

| Estado                  | Qué significa                                             |
| ----------------------- | --------------------------------------------------------- |
| `lleno`                 | El valor salió del maestro y se puede usar tal cual       |
| `requiere_confirmacion` | Hay un valor, pero alguien debe validarlo antes de firmar |
| `faltante`              | No existe fuente para ese campo. Queda vacío              |

`requiere_confirmacion` aparece por dos motivos: un identificador tributario extranjero, o un cruce con el glosario poco confiable — una etiqueta que se parece a varias claves del maestro sin coincidir con ninguna.

## Dónde queda lo que se produce

Todo se escribe bajo `out/<caso>/`: el formulario en su formato, el reporte de campos faltantes, y un `paquete/` con el formulario, copias de los soportes que existen, el checklist y un borrador de correo.

**El borrador de correo nunca lleva datos bancarios.** Los datos de cuenta solo se escriben dentro del formulario, y solo si la plantilla los pidió. Un número de cuenta en el cuerpo de un correo es una fuga: los correos se reenvían, se archivan y se filtran.
