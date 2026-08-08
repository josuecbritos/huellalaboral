import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-user-token',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    // Usar SERVICE_ROLE_KEY que bypasea RLS
    const supabase = createClient(supabaseUrl, supabaseKey)
    // Verificar autenticación
    const userToken = req.headers.get('x-user-token')
    if (!userToken) {
      return new Response(
        JSON.stringify({ error: 'No autorizado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(userToken)
    if (authError || !authUser) {
      return new Response(
        JSON.stringify({ error: 'Token inválido' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }


    const url = new URL(req.url)
    const rut = url.searchParams.get('rut')

    if (!rut) {
      return new Response(
        JSON.stringify({ error: 'RUT no proporcionado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Buscando RUT:', rut)

    // Buscar trabajador por RUT (coincidencia exacta)
    const { data: trabajador, error: trabajadorError } = await supabase
      .from('trabajadores')
      .select('*')
      .eq('rut', rut)
      .maybeSingle()

    console.log('Resultado búsqueda:', trabajador, trabajadorError)

    if (trabajadorError) throw trabajadorError
    
    if (!trabajador) {
      return new Response(
        JSON.stringify({ error: 'Trabajador no encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

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

    // Calcular promedios totales y verificados
    const evaluacionesValidas = evaluaciones?.filter(e => !e.rechazo) || []
    const evaluacionesVerificadas = evaluacionesValidas.filter(e => e.verificada)

    const calcularPromedio = (evals: any[]) => {
      if (!evals.length) return null
      const sum = evals.reduce((acc, e) => ({
        puntualidad: acc.puntualidad + (e.puntualidad || 0),
        desempeno: acc.desempeno + (e.desempeno || 0),
        relaciones: acc.relaciones + (e.relaciones || 0),
        confiabilidad: acc.confiabilidad + (e.confiabilidad || 0),
      }), { puntualidad: 0, desempeno: 0, relaciones: 0, confiabilidad: 0 })

      const count = evals.length
      return {
        puntualidad: sum.puntualidad / count,
        desempeno: sum.desempeno / count,
        relaciones: sum.relaciones / count,
        confiabilidad: sum.confiabilidad / count,
        promedio: (sum.puntualidad + sum.desempeno + sum.relaciones + sum.confiabilidad) / (count * 4)
      }
    }

    const promedioTotal = calcularPromedio(evaluacionesValidas)
    const promedioVerificado = calcularPromedio(evaluacionesVerificadas)

    // Obtener datos del certificado
    const certificado = documentos?.find(d => d.tipo === 'certificado')
    const validacionCert = certificado?.validaciones_documentos?.[0]
    
    const certEmpleos = validacionCert?.valido ? validacionCert.empleos_ultimos_5_anos : null
    const certPermanencia = validacionCert?.valido ? validacionCert.tiempo_maximo_un_empleador_anos : null

    // Obtener datos del finiquito
    const finiquito = documentos?.find(d => d.tipo === 'finiquito')
    const validacionFiniq = finiquito?.validaciones_documentos?.[0]
    const causalValidada = validacionFiniq?.finiquito_valido_y_coincide || null

    return new Response(
      JSON.stringify({
        trabajador: {
          id: trabajador.id,
          nombre: trabajador.nombre,
          rut: trabajador.rut,
          email: trabajador.email,
          whatsapp: trabajador.whatsapp,
          comuna: trabajador.comuna,
          fecha_solicitud: trabajador.fecha_solicitud
        },
        evaluaciones: {
          total: evaluacionesValidas.length,
          verificadas: evaluacionesVerificadas.length,
          rechazos: evaluaciones?.filter(e => e.rechazo).length || 0,
          lista: evaluaciones
        },
        promedios: {
          total: promedioTotal,
          verificado: promedioVerificado
        },
        documentos: {
          cert_empleos: certEmpleos,
          cert_permanencia: certPermanencia,
          causal_validada: causalValidada,
          causal_texto: causalValidada === true ? (finiquito?.causal_salida || null) : null,
          tiene_certificado: !!certificado,
          tiene_finiquito: !!finiquito
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})