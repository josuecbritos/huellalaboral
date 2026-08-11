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


    // Obtener datos del request
    const { cargo, descripcion } = await req.json()
    const user_id = authUser.id

    if (!cargo) {
      return new Response(
        JSON.stringify({ error: 'cargo es requerido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Crear proceso
    const { data: proceso, error: procesoError } = await supabase
      .from('procesos')
      .insert({
        usuario_id: user_id,
        cargo: cargo,
        descripcion: descripcion || null,
        estado: 'Activo'
      })
      .select()
      .single()

    if (procesoError) throw procesoError

    return new Response(
      JSON.stringify({ 
        success: true,
        proceso: {
          id: proceso.id,
          cargo: proceso.cargo,
          descripcion: proceso.descripcion,
          estado: proceso.estado,
          fecha: proceso.created_at,
          candidatos: 0
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