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
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
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


    const { proceso_ids } = await req.json()

    if (!proceso_ids || !proceso_ids.length) {
      return new Response(
        JSON.stringify({ candidatos: 0, evaluaciones: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Candidatos únicos (excluyendo invitaciones pendientes)
    const { data: candidatosRaw, error: candidatosError } = await supabase
      .from('candidatos_proceso')
      .select('trabajador_id')
      .in('proceso_id', proceso_ids)
      .not('trabajador_id', 'is', null)

    if (candidatosError) throw candidatosError

    const trabajadorIdsUnicos = [...new Set(candidatosRaw.map(c => c.trabajador_id))]

    if (!trabajadorIdsUnicos.length) {
      return new Response(
        JSON.stringify({ candidatos: 0, evaluaciones: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Total de evaluaciones realizadas
    const { data: evalsRaw, error: evalsError } = await supabase
      .from('evaluaciones')
      .select('id')
      .in('trabajador_id', trabajadorIdsUnicos)

    if (evalsError) throw evalsError

    return new Response(
      JSON.stringify({
        candidatos: trabajadorIdsUnicos.length,
        evaluaciones: evalsRaw.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Error al obtener stats' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})