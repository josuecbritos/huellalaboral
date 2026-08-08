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


    const { proceso_id, accion } = await req.json()

    if (!proceso_id || !accion) {
      return new Response(
        JSON.stringify({ error: 'proceso_id y accion son requeridos' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (accion === 'finalizar') {
      const { error } = await supabase
        .from('procesos')
        .update({ estado: 'Finalizado', fecha_finalizacion: new Date().toISOString() })
        .eq('id', proceso_id)

      if (error) throw error

    } else if (accion === 'eliminar') {
      // Eliminar candidatos primero (FK constraint)
      const { error: candidatosError } = await supabase
        .from('candidatos_proceso')
        .delete()
        .eq('proceso_id', proceso_id)

      if (candidatosError) throw candidatosError

      const { error: procesoError } = await supabase
        .from('procesos')
        .delete()
        .eq('id', proceso_id)

      if (procesoError) throw procesoError

    } else {
      return new Response(
        JSON.stringify({ error: `Acción no reconocida: ${accion}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true }),
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