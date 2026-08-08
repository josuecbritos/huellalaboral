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

    const url = new URL(req.url)
    const token = url.searchParams.get('token') // Por ahora es el trabajador_id

    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Token no proporcionado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Buscar trabajador por ID (token)
    const { data: trabajador, error: trabajadorError } = await supabase
      .from('trabajadores')
      .select('*')
      .eq('id', token)
      .single()

    if (trabajadorError || !trabajador) {
      return new Response(
        JSON.stringify({ error: 'Token inválido o trabajador no encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Obtener documentos del trabajador
    const { data: documentos, error: docError } = await supabase
      .from('documentos')
      .select('*')
      .eq('trabajador_id', trabajador.id)

    if (docError) throw docError

    const certificado = documentos?.find(d => d.tipo === 'certificado')
    const finiquito = documentos?.find(d => d.tipo === 'finiquito')

    // Generar URLs firmadas para los documentos (válidas por 1 hora)
    let certificadoUrl = null
    let finiquitoUrl = null

    if (certificado) {
      const { data: signedUrl } = await supabase.storage
        .from('certificados')
        .createSignedUrl(certificado.storage_path, 3600)
      certificadoUrl = signedUrl?.signedUrl
    }

    if (finiquito) {
      const { data: signedUrl } = await supabase.storage
        .from('finiquitos')
        .createSignedUrl(finiquito.storage_path, 3600)
      finiquitoUrl = signedUrl?.signedUrl
    }

    return new Response(
      JSON.stringify({
        trabajador_nombre: trabajador.nombre,
        trabajador_rut: trabajador.rut,
        trabajador_email: trabajador.email,
        fecha_solicitud: trabajador.created_at,
        certificado_url: certificadoUrl,
        finiquito_url: finiquitoUrl,
        causal_salida: finiquito?.causal_salida || null,
        tiene_certificado: !!certificado,
        tiene_finiquito: !!finiquito
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