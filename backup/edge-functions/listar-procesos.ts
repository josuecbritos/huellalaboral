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

    // Usar el user_id del token verificado
    const userId = authUser.id

    // Obtener procesos del usuario con conteo de candidatos
    const { data: procesos, error: procesosError } = await supabase
      .from('procesos')
      .select(`
        *,
        candidatos:candidatos_proceso(count)
      `)
      .eq('usuario_id', userId)
      .order('created_at', { ascending: false })

    if (procesosError) throw procesosError

    // Formatear respuesta
    const procesosFormateados = procesos.map(p => ({
      id: p.id,
      cargo: p.cargo,
      descripcion: p.descripcion,
      estado: p.estado,
      fecha: p.created_at,
      candidatos: p.candidatos[0]?.count || 0
    }))

    return new Response(
      JSON.stringify({ procesos: procesosFormateados }),
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