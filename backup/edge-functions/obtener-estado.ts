import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    const validacionCert = certificado?.validaciones_documentos?.[0]
    const certEmpleos = validacionCert?.valido ? validacionCert.empleos_ultimos_5_anos : null
    const certPermanencia = validacionCert?.valido ? validacionCert.tiempo_maximo_un_empleador_anos : null

    // Datos del finiquito
    const finiquito = documentos?.find((d: any) => d.tipo === 'finiquito')
    const validacionFiniq = finiquito?.validaciones_documentos?.[0]
    const causalValidada = validacionFiniq?.finiquito_valido_y_coincide || null

    return new Response(
      JSON.stringify({
        trabajador: {
          nombre: trabajador.nombre,
          rut: trabajador.rut
        },
        documentos: {
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