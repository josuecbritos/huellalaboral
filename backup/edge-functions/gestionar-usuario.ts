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
    if (authUser.email !== Deno.env.get('ADMIN_EMAIL')) {
      return new Response(
        JSON.stringify({ error: 'Acceso restringido' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }


    const { id, accion } = await req.json()

    // accion: 'activar' | 'desactivar' | 'eliminar'
    if (!id || !accion) {
      return new Response(
        JSON.stringify({ error: 'id y accion son requeridos' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (accion === 'activar') {
      // Actualizar tabla usuarios
      const { error: dbError } = await supabase
        .from('usuarios')
        .update({ activo: true })
        .eq('id', id)
      if (dbError) throw dbError

      // Habilitar en Auth
      const { error: authError } = await supabase.auth.admin.updateUserById(id, {
        ban_duration: 'none'
      })
      if (authError) console.error('Error habilitando en Auth:', authError)

    } else if (accion === 'desactivar') {
      // Actualizar tabla usuarios
      const { error: dbError } = await supabase
        .from('usuarios')
        .update({ activo: false })
        .eq('id', id)
      if (dbError) throw dbError

      // Deshabilitar en Auth (ban permanente)
      const { error: authError } = await supabase.auth.admin.updateUserById(id, {
        ban_duration: '876600h' // 100 años
      })
      if (authError) console.error('Error deshabilitando en Auth:', authError)

    } else if (accion === 'eliminar') {
      // Soft delete en tabla usuarios
      const { error: dbError } = await supabase
        .from('usuarios')
        .update({ deleted: true, activo: false })
        .eq('id', id)
      if (dbError) throw dbError

      // Banear en Auth en vez de eliminar — así el registro de public.usuarios no se borra
      const { error: authError } = await supabase.auth.admin.updateUserById(id, {
        ban_duration: '876600h'
      })
      if (authError) console.error('Error baneando en Auth:', authError)

    } else {
      return new Response(
        JSON.stringify({ error: 'Acción inválida. Use: activar, desactivar o eliminar' }),
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