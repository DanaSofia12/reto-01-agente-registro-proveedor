/** Cliente de la API. El front nunca conoce la clave del proveedor. */

export interface RegistroLlamada {
  id: string
  nombre: string
  argumentos: unknown
  ok: boolean
  resumen: string
  resultado: unknown
}

export interface RespuestaChat {
  reply: string
  toolCalls: RegistroLlamada[]
  needsConfirmation: boolean
  sessionId: string
  uso?: {
    tokensEntrada: number
    tokensSalida: number
    tokensCacheLectura: number
    tokensSesion: number
  }
  iteraciones?: number
}

export interface Salud {
  ok: boolean
  provider: string
  model: string
  claveConfigurada: boolean
  fechaReferencia: string
  herramientas: string[]
  maxIteracionesTurno: number
}

export interface ResumenCaso {
  caso: string
  cliente: string
  pais: string
  formato: string
  asunto: string
}

async function pedir<T>(ruta: string, init?: RequestInit): Promise<T> {
  const respuesta = await fetch(ruta, init)
  const cuerpo = (await respuesta.json()) as T & { error?: string }
  if (!respuesta.ok && typeof cuerpo.error === "string" && !("reply" in (cuerpo as object))) {
    throw new Error(cuerpo.error)
  }
  return cuerpo
}

export function obtenerSalud(): Promise<Salud> {
  return pedir<Salud>("/api/health")
}

export function obtenerCasos(): Promise<{ casos: ResumenCaso[] }> {
  return pedir<{ casos: ResumenCaso[] }>("/api/casos")
}

export function enviarMensaje(sessionId: string | null, message: string): Promise<RespuestaChat> {
  return pedir<RespuestaChat>("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId, message }),
  })
}

export function obtenerArtefactos(caso: string): Promise<{ caso: string; artefactos: string[] }> {
  return pedir<{ caso: string; artefactos: string[] }>(`/api/artefactos/${caso}`)
}

export function urlArchivo(caso: string, relativo: string): string {
  return `/api/archivos/${caso}/${relativo.split("/").map(encodeURIComponent).join("/")}`
}
