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
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const { access_token, password } = await req.json()
    console.log('📥 Establecer password con access_token')

    if (!access_token || !password) {
      return new Response(
        JSON.stringify({ error: 'access_token y password son requeridos' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validar que el password cumple requisitos
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      return new Response(
        JSON.stringify({ error: 'La contraseña no cumple con los requisitos' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verificar el token — si es válido, Supabase devuelve el usuario
    const { data: { user }, error: getUserError } = await supabase.auth.getUser(access_token)

    if (getUserError || !user) {
      console.log('❌ Token inválido o expirado:', getUserError)
      return new Response(
        JSON.stringify({ error: 'El enlace no es válido o ha expirado. Solicita un nuevo enlace al administrador.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('👤 Usuario verificado:', user.id, user.email)

    // Verificar que el usuario existe en la tabla usuarios, no está eliminado y no está activo
    const { data: usuarioDb, error: dbError } = await supabase
      .from('usuarios')
      .select('activo, deleted')
      .eq('id', user.id)
      .single()

    if (dbError || !usuarioDb) {
      console.log('❌ Usuario no encontrado en tabla usuarios')
      return new Response(
        JSON.stringify({ error: 'Usuario no encontrado en el sistema' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (usuarioDb.deleted) {
      console.log('❌ Usuario eliminado')
      return new Response(
        JSON.stringify({ error: 'Este usuario ha sido eliminado del sistema' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (usuarioDb.activo) {
      console.log('❌ Usuario ya activo')
      return new Response(
        JSON.stringify({ error: 'Este usuario ya tiene una contraseña establecida' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Establecer contraseña y confirmar email
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      user.id,
      { password: password, email_confirm: true }
    )

    if (updateError) {
      console.log('❌ Error actualizando contraseña:', updateError)
      throw updateError
    }

    // Activar usuario en tabla usuarios
    const { error: activarError } = await supabase
      .from('usuarios')
      .update({ activo: true })
      .eq('id', user.id)

    if (activarError) console.error('Error activando usuario en BD:', activarError)

    console.log('✅ Contraseña establecida y usuario activado')

    return new Response(
      JSON.stringify({ success: true, message: 'Contraseña establecida correctamente' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('❌ Error general:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Error al establecer contraseña' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})