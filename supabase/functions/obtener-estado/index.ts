import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// ─── Validación vigente · cadena de validación de documentos ─────────────────
// Bloque IDÉNTICO en obtener-estado, obtener-candidato y agregar-candidato.
// Cada edge function se despliega por separado, así que se duplica físicamente:
// si se cambia, se cambia en las tres.
//
// Antes se leía `validaciones_documentos[0]`: sin ordenar, sin filtrar y sin
// mirar si el documento se resubió después. Como la fila de `documentos` se
// ACTUALIZA al resubir conservando su `id`, las validaciones viejas siguen
// colgando de ella y no se distinguen de las nuevas por la relación. El panel
// mostraba como verificado lo que el validador ya había rechazado.
//
// `envio_id` es la llave que faltaba: una validación cuenta solo si se hizo
// sobre el envío que hoy está en la tabla.
function validacionVigente(documento: any) {
  if (!documento?.envio_id) return null
  const validaciones = documento.validaciones_documentos ?? []
  return validaciones.find((v: any) => v.envio_id === documento.envio_id) ?? null
}

// Cuatro situaciones que hoy se ven iguales, todas como un '—' indistinguible.
// Devolver el estado explícito es lo que permite al frontend separarlas sin
// tener que adivinar a partir de nulls.
function estadoDocumento(documento: any, validacion: any): string {
  if (!documento) return 'sin_documento'
  if (!validacion) return 'pendiente_validacion'
  return validacion.valido === true ? 'validado' : 'no_valido'
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const url = new URL(req.url)
    const token = url.searchParams.get('token')

    if (!token) {
      return new Response(
        JSON.stringify({ error: 'token requerido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Buscar trabajador por token_consulta
    const { data: trabajadores, error: trabajadorError } = await supabase
      .from('trabajadores')
      .select('id, nombre, rut')
      .eq('token_consulta', token)
      .limit(1)

    if (trabajadorError) throw trabajadorError

    if (!trabajadores || trabajadores.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Token inválido' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const trabajador = trabajadores[0]

    // Obtener evaluaciones del trabajador
    const { data: evaluaciones, error: evalError } = await supabase
      .from('evaluaciones')
      .select('*')
      .eq('trabajador_id', trabajador.id)
      .order('fecha_completado', { ascending: false })

    if (evalError) throw evalError

    // Obtener documentos validados
    const { data: documentos, error: docError } = await supabase
      .from('documentos')
      .select('*, validaciones_documentos(*)')
      .eq('trabajador_id', trabajador.id)

    if (docError) throw docError

    // Datos del certificado
    const certificado = documentos?.find((d: any) => d.tipo === 'certificado')
    // Solo cuenta la validación hecha sobre el envío que hoy está en la tabla.
    const validacionCert = validacionVigente(certificado)
    const certEstado = estadoDocumento(certificado, validacionCert)
    // H-22: el motivo del rechazo se escribía y no se leía en ninguna parte.
    const certRazonInvalido = validacionCert && validacionCert.valido !== true
      ? (validacionCert.razon_invalido || null)
      : null
    const certEmpleos = validacionCert?.valido ? validacionCert.empleos_ultimos_5_anos : null
    const certPermanencia = validacionCert?.valido ? validacionCert.tiempo_maximo_un_empleador_anos : null

    // Datos del finiquito
    const finiquito = documentos?.find((d: any) => d.tipo === 'finiquito')
    const validacionFiniq = validacionVigente(finiquito)
    const finiqEstado = estadoDocumento(finiquito, validacionFiniq)
    // `??` y no `||`: con `||`, un `false` explícito —el validador dijo que la
    // causal NO coincide— se convertía en `null`, y la insignia roja que ambas
    // pantallas ya tenían escrita no podía aparecer nunca.
    const causalValidada = validacionFiniq?.finiquito_valido_y_coincide ?? null

    return new Response(
      JSON.stringify({
        trabajador: {
          nombre: trabajador.nombre,
          rut: trabajador.rut
        },
        documentos: {
          cert_estado: certEstado,
          cert_razon_invalido: certRazonInvalido,
          finiq_estado: finiqEstado,
          cert_empleos: certEmpleos,
          cert_permanencia: certPermanencia,
          causal_validada: causalValidada,
          causal_texto: causalValidada === true ? (finiquito?.causal_salida || null) : null,
        },
        evaluaciones: {
          lista: evaluaciones || []
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Error al obtener estado' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})