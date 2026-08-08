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
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { token, certificado, finiquito } = await req.json()

    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Token no proporcionado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Buscar trabajador por token de validación
    // Por ahora usamos el trabajador_id directamente
    // TODO: Implementar tokens de validación separados
    
    const trabajadorId = token // Temporal: el token ES el trabajador_id

    // Obtener documentos del trabajador
    const { data: documentos, error: docError } = await supabase
      .from('documentos')
      .select('*')
      .eq('trabajador_id', trabajadorId)

    if (docError) throw docError

    const certDoc = documentos?.find(d => d.tipo === 'certificado')
    const finiqDoc = documentos?.find(d => d.tipo === 'finiquito')

    // Validar certificado si existe
    if (certificado && certDoc) {
      const { data: validacion, error: valError } = await supabase
        .from('validaciones_documentos')
        .insert({
          documento_id: certDoc.id,
          trabajador_id: trabajadorId,
          tipo_documento: 'certificado',
          valido: certificado.valido,
          empleos_ultimos_5_anos: certificado.empleos_ultimos_5_anos || null,
          tiempo_maximo_un_empleador_anos: certificado.tiempo_maximo_un_empleador_anos || null,
          razon_invalido: certificado.razon_invalido || null
        })
        .select()
        .single()

      if (valError) throw valError

      // Actualizar documento como validado
      await supabase
        .from('documentos')
        .update({ 
          validado: certificado.valido,
          fecha_validacion: new Date().toISOString()
        })
        .eq('id', certDoc.id)

    }

    // Validar finiquito si existe
    if (finiquito && finiqDoc) {
      const { data: validacion, error: valError } = await supabase
        .from('validaciones_documentos')
        .insert({
          documento_id: finiqDoc.id,
          trabajador_id: trabajadorId,
          tipo_documento: 'finiquito',
          valido: true, // Siempre true si llegó aquí
          finiquito_valido_y_coincide: finiquito.valido_y_coincide
        })
        .select()
        .single()

      if (valError) throw valError

      // Actualizar documento
      await supabase
        .from('documentos')
        .update({ 
          validado: true,
          fecha_validacion: new Date().toISOString()
        })
        .eq('id', finiqDoc.id)
    }

    // Actualizar estado del trabajador
    const todosValidados = (!certDoc || (certDoc && certificado)) && 
                           (!finiqDoc || (finiqDoc && finiquito))

    if (todosValidados) {
      await supabase
        .from('trabajadores')
        .update({ estado: 'documentos_validados' })
        .eq('id', trabajadorId)
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        mensaje: 'Documentos validados correctamente'
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