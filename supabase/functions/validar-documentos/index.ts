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

    // H-03: antes el token ERA el trabajador_id, y la función ni siquiera
    // comprobaba que el trabajador existiera. Con un id que `crear-solicitud`
    // entrega a cualquier anónimo se podían insertar filas en
    // `validaciones_documentos` y dejar al trabajador en 'documentos_validados':
    // falsificar el sello que el producto vende.
    //
    // Misma respuesta para token inexistente, mal formado y ya usado.
    const tokenInvalido = () => new Response(
      JSON.stringify({ error: 'Token inválido o ya utilizado' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

    const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!ES_UUID.test(token)) {
      return tokenInvalido()
    }

    const { data: trabajador } = await supabase
      .from('trabajadores')
      .select('id, token_validacion_usado')
      .eq('token_validacion', token)
      .maybeSingle()

    if (!trabajador || trabajador.token_validacion_usado) {
      return tokenInvalido()
    }

    // El id sale de la fila encontrada, nunca del body: si viniera del cliente,
    // el token serviría para escribir sobre el trabajador que el atacante
    // quisiera.
    const trabajadorId = trabajador.id

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

    // Consumir el token. Va al final a propósito: si algo hubiera fallado antes,
    // se lanza y el token sigue sirviendo, de modo que el validador puede
    // reintentar. Quemarlo al principio dejaría los documentos sin validar y sin
    // forma de volver a intentarlo salvo reenviando el correo.
    const { error: consumoError } = await supabase
      .from('trabajadores')
      .update({ token_validacion_usado: true })
      .eq('id', trabajadorId)

    if (consumoError) throw consumoError

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