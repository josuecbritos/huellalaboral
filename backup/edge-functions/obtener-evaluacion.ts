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

    // Obtener token de la URL
    const url = new URL(req.url)
    const token = url.searchParams.get('token')

    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Token no proporcionado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Buscar el empleador por token
    const { data: empleador, error: empleadorError } = await supabase
      .from('empleadores_solicitados')
      .select('*, trabajadores(*)')
      .eq('token', token)
      .single()

    if (empleadorError || !empleador) {
      return new Response(
        JSON.stringify({ error: 'Token inválido o expirado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verificar si ya fue completado
    if (empleador.completado) {
      return new Response(
        JSON.stringify({ error: 'Esta evaluación ya fue completada' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verificar expiración
    const expiracion = new Date(empleador.fecha_expiracion)
    if (expiracion < new Date()) {
      return new Response(
        JSON.stringify({ error: 'El token ha expirado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Retornar datos del trabajador
    return new Response(
      JSON.stringify({
        trabajador_nombre: empleador.trabajadores.nombre,
        trabajador_rut: empleador.trabajadores.rut,
        empleador_nombre: empleador.nombre_evaluador,
        empleador_email: empleador.email_evaluador,
        empleador_empresa: empleador.empresa,
        token: token
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