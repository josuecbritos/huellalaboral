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
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const { email, password } = await req.json()

    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: 'Email y contraseña requeridos' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Cliente admin para autenticar y consultar tabla usuarios
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Autenticar con Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password
    })

    if (authError || !authData.user) {
      const esBaneado = authError?.message?.includes('User is banned')
      return new Response(
        JSON.stringify({ error: esBaneado ? 'Usuario inactivo. Contacta al administrador.' : 'Credenciales incorrectas' }),
        { status: esBaneado ? 403 : 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Buscar usuario en tabla usuarios
    const { data: usuarios, error: dbError } = await supabaseAdmin
      .from('usuarios')
      .select('id, nombre, email, empresa, activo, deleted')
      .eq('id', authData.user.id)
      .single()

    if (dbError || !usuarios) {
      // Verificar si es el admin del sistema (existe en Auth pero no en tabla usuarios)
      // El admin no tiene registro en tabla usuarios — se identifica por email
      const adminEmail = Deno.env.get('ADMIN_EMAIL')
      if (email === adminEmail) {
        return new Response(
          JSON.stringify({
            success: true,
            token: authData.session.access_token,
            usuario: {
              nombre: 'Administrador',
              email: email,
              rol: 'admin'
            }
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify({ error: 'Usuario no encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verificar que el usuario esté activo y no eliminado
    if (!usuarios.activo || usuarios.deleted) {
      return new Response(
        JSON.stringify({ error: 'Usuario inactivo. Contacta al administrador.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        token: authData.session.access_token,
        usuario: {
          id: usuarios.id,
          nombre: usuarios.nombre,
          email: usuarios.email,
          empresa: usuarios.empresa,
          rol: 'reclutador'
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: 'Error interno del servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})