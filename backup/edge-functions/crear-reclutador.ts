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
    const resendApiKey = Deno.env.get('RESEND_API_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { nombre, empresa, email, confirm_reactivate } = await req.json()

    if (!nombre || !empresa || !email) {
      return new Response(
        JSON.stringify({ error: 'Todos los campos son requeridos' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Crear usuario en Auth
    let { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: email,
      email_confirm: false
    })

    if (authError) {
      if (authError.message.includes('already') || authError.message.includes('unique') || authError.status === 422) {
        // Verificar si existe en tabla usuarios
        const { data: usuarioExistente } = await supabase
          .from('usuarios')
          .select('id, deleted')
          .eq('email', email)
          .maybeSingle()

        if (usuarioExistente && usuarioExistente.deleted === true) {
          if (!confirm_reactivate) {
            // Primera llamada — devolver error para que el frontend pida confirmación
            return new Response(
              JSON.stringify({ error: 'deleted_user', message: 'Este email pertenece a un usuario eliminado' }),
              { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }

          // Segunda llamada con confirmación — reactivar
          const { error: unbanError } = await supabase.auth.admin.updateUserById(usuarioExistente.id, {
            ban_duration: 'none'
          })
          if (unbanError) console.error('Error quitando ban en Auth:', unbanError)

          const { error: dbError } = await supabase
            .from('usuarios')
            .update({ deleted: false, activo: false, nombre, empresa })
            .eq('id', usuarioExistente.id)
          if (dbError) throw dbError

          // Generar link de invitación y enviar email
          try {
            const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
              type: 'recovery',
              email: email,
              options: { redirectTo: 'https://huellalaboral.cl/crear-password.html' }
            })
            if (linkError) throw linkError

            await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                from: 'Huella Laboral <noreply@contacto.huellalaboral.cl>',
                to: email,
                subject: 'Crea tu contraseña - Huella Laboral',
                html: `
                  <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h1 style="color: #0E2A47;">Bienvenido a Huella Laboral</h1>
                    <p>Hola <strong>${nombre}</strong>,</p>
                    <p>Tu cuenta ha sido reactivada. Crea tu contraseña para acceder al sistema:</p>
                    <div style="margin: 30px 0;">
                      <a href="${linkData.properties.action_link}"
                         style="display: inline-block; background: #0E2A47; color: white; padding: 14px 28px;
                                text-decoration: none; border-radius: 4px; font-weight: 600;">
                        Crear mi Contraseña
                      </a>
                    </div>
                    <p style="color: #6B7280; font-size: 14px;">Este enlace es personal, de un solo uso y expira en 24 horas.</p>
                    <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 30px 0;">
                    <p style="color: #6B7280; font-size: 12px;">Huella Laboral - Sistema de referencias laborales verificadas</p>
                  </div>
                `
              })
            })
          } catch (emailError) {
            console.error('Error enviando email:', emailError)
          }

          return new Response(
            JSON.stringify({ success: true, reactivated: true }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )

        } else if (usuarioExistente && usuarioExistente.deleted === false) {
          // Usuario activo o inactivo — no se puede crear otro con el mismo email
          return new Response(
            JSON.stringify({ error: 'already_exists', message: 'Ya existe un usuario con este email' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        } else {
          // Huérfano en Auth (existe en Auth pero no en usuarios): eliminarlo y recrearlo
          console.log('Usuario huérfano en Auth, eliminando y recreando...')
          const { data: authUsers } = await supabase.auth.admin.listUsers()
          const huerfano = authUsers?.users?.find(u => u.email === email)
          if (huerfano) {
            await supabase.auth.admin.deleteUser(huerfano.id)
          }
          const { data: authRetry, error: authRetryError } = await supabase.auth.admin.createUser({
            email: email,
            email_confirm: false
          })
          if (authRetryError) throw authRetryError
          authData = authRetry
        }
      } else {
        throw authError
      }
    }

    // Crear registro en tabla usuarios
    const { error: dbError } = await supabase
      .from('usuarios')
      .insert({
        id: authData.user.id,
        nombre: nombre,
        empresa: empresa,
        email: email,
        activo: false
      })

    if (dbError) {
      // Rollback: eliminar usuario de Auth para evitar huérfanos
      console.error('Error insertando en usuarios, haciendo rollback en Auth:', dbError)
      await supabase.auth.admin.deleteUser(authData.user.id)
      throw dbError
    }

    // Generar link de invitación y enviar email
    try {
      const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
        type: 'invite',
        email: email,
        options: { redirectTo: 'https://huellalaboral.cl/crear-password.html' }
      })
      if (linkError) throw linkError

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'Huella Laboral <noreply@contacto.huellalaboral.cl>',
          to: email,
          subject: 'Crea tu contraseña - Huella Laboral',
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h1 style="color: #0E2A47;">Bienvenido a Huella Laboral</h1>
              <p>Hola <strong>${nombre}</strong>,</p>
              <p>Tu cuenta de reclutador ha sido creada. Crea tu contraseña para acceder al sistema:</p>
              <div style="margin: 30px 0;">
                <a href="${linkData.properties.action_link}" 
                   style="display: inline-block; background: #0E2A47; color: white; padding: 14px 28px; 
                          text-decoration: none; border-radius: 4px; font-weight: 600;">
                  Crear mi Contraseña
                </a>
              </div>
              <p style="color: #6B7280; font-size: 14px;">
                Este enlace es personal, de un solo uso y expira en 24 horas.
              </p>
              <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 30px 0;">
              <p style="color: #6B7280; font-size: 12px;">
                Huella Laboral - Sistema de referencias laborales verificadas
              </p>
            </div>
          `
        })
      })
    } catch (emailError) {
      console.error('Error enviando email:', emailError)
    }

    return new Response(
      JSON.stringify({ success: true, user: authData.user }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error general:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})