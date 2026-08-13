import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function base64ToUint8Array(base64String: string): Uint8Array {
  const base64 = base64String.includes(',') ? base64String.split(',')[1] : base64String
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes
}

function getContentType(base64String: string): string {
  if (base64String.startsWith('data:')) {
    const match = base64String.match(/data:([^;]+);/)
    if (match) return match[1]
  }
  return 'application/octet-stream'
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const resendApiKey = Deno.env.get('RESEND_API_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { trabajador, empleadores, certificado_base64, finiquito_base64, causal_salida } = await req.json()

    // ─────────────────────────────────────────────
    // 1. INSERT o UPDATE del trabajador
    // ─────────────────────────────────────────────
    const { data: trabajadorExistente } = await supabase
      .from('trabajadores')
      .select('id, token_consulta')
      .eq('rut', trabajador.rut)
      .maybeSingle()

    let trabajadorId: string
    let tokenConsulta: string
    // H-02/H-03: el enlace de validación deja de llevar el `id` del trabajador y
    // pasa a llevar esta credencial. Solo se rellena cuando va a hacer falta,
    // que es exactamente cuando se envía M-8 (paso 7): si no vienen documentos,
    // queda en null y el paso 7 tampoco se ejecuta.
    let tokenValidacion: string | null = null
    const hayDocumentos = !!(certificado_base64 || finiquito_base64)

    if (trabajadorExistente) {
      console.log('🔁 Trabajador existe, actualizando datos...')
      trabajadorId = trabajadorExistente.id
      tokenConsulta = trabajadorExistente.token_consulta

      const camposActualizados: Record<string, unknown> = {
        nombre: trabajador.nombre,
        email: trabajador.email,
        whatsapp: trabajador.whatsapp,
        comuna: trabajador.comuna,
      }

      if (hayDocumentos) {
        // Documentos nuevos ⇒ token nuevo. Invalida el anterior aunque nunca se
        // hubiera usado: si el validador recibe dos correos, el primero deja de
        // servir y no puede aprobar documentos que ya fueron sustituidos.
        tokenValidacion = crypto.randomUUID()
        camposActualizados.token_validacion = tokenValidacion
        camposActualizados.token_validacion_usado = false
        // H-35: el estado vuelve atrás. Antes se quedaba en
        // 'documentos_validados' con documentos sin revisar debajo, así que el
        // trabajador figuraba como validado por unos papeles que ya no estaban.
        camposActualizados.estado = 'pendiente'
      }

      const { error: updateError } = await supabase
        .from('trabajadores')
        .update(camposActualizados)
        .eq('id', trabajadorId)

      if (updateError) throw updateError

    } else {
      console.log('➕ Creando nuevo trabajador...')
      const { data: trabajadorData, error: trabajadorError } = await supabase
        .from('trabajadores')
        .insert({
          nombre: trabajador.nombre,
          rut: trabajador.rut,
          email: trabajador.email,
          whatsapp: trabajador.whatsapp,
          comuna: trabajador.comuna,
          estado: 'pendiente',
        })
        .select()
        .single()

      if (trabajadorError) throw trabajadorError
      trabajadorId = trabajadorData.id
      tokenConsulta = trabajadorData.token_consulta
      // Trabajador nuevo: el token lo pone el default de la columna, así que se
      // lee del insert en vez de generarlo aquí.
      tokenValidacion = trabajadorData.token_validacion
    }

    // ─────────────────────────────────────────────
    // 2. Vincular invitaciones pendientes
    // ─────────────────────────────────────────────
    try {
      await supabase
        .from('candidatos_proceso')
        .update({ trabajador_id: trabajadorId, email_invitado: null, rut_invitado: null })
        .eq('rut_invitado', trabajador.rut)
        .is('trabajador_id', null)
      console.log('🔗 Invitaciones pendientes vinculadas para RUT:', trabajador.rut)
    } catch (linkError) {
      console.log('No hay invitaciones pendientes o error al vincular:', linkError)
    }

    // ─────────────────────────────────────────────
    // 3. Insertar empleadores en empleadores_solicitados
    //    Se agregan los nuevos sin eliminar los anteriores
    // ─────────────────────────────────────────────
    const fechaExpiracion = new Date()
    fechaExpiracion.setDate(fechaExpiracion.getDate() + 30)

    const empleadoresInsertados = []

    for (const emp of empleadores) {
      const { data: empData, error: empError } = await supabase
        .from('empleadores_solicitados')
        .insert({
          trabajador_id: trabajadorId,
          nombre_evaluador: emp.nombre,
          rut_evaluador: emp.rut || '',
          email_evaluador: emp.email,
          empresa: emp.empresa,
          rut_empresa: emp.rut_empresa || '',
          cargo: emp.cargo || '',
          tiempo_trabajo: emp.tiempo_trabajo || '',
          token: crypto.randomUUID(),
          enviado: true,
          completado: false,
          fecha_envio: new Date().toISOString(),
          fecha_expiracion: fechaExpiracion.toISOString(),
        })
        .select()
        .single()

      if (empError) {
        console.error('Error insertando empleador:', empError)
        throw empError
      }

      empleadoresInsertados.push(empData)
    }

    // ─────────────────────────────────────────────
    // 4. Subir documentos a Storage y upsert en tabla documentos
    //
    // Cada fila se sella con `envio_id = tokenValidacion`, el mismo código que
    // viaja en el enlace de validación. Es lo que después permite saber si una
    // validación se hizo sobre ESTOS documentos o sobre los que había antes.
    // Aquí siempre hay token: este bloque solo se ejecuta si vinieron
    // documentos, que es la misma condición que lo genera o lo regenera.
    // ─────────────────────────────────────────────
    if (certificado_base64) {
      const certBytes = base64ToUint8Array(certificado_base64)
      const certContentType = getContentType(certificado_base64)
      const certPath = `${trabajadorId}_${Date.now()}_certificado.pdf`

      const { error: certUploadError } = await supabase.storage
        .from('certificados')
        .upload(certPath, certBytes, {
          contentType: certContentType,
          upsert: true,
        })

      if (certUploadError) {
        console.error('Error subiendo certificado:', certUploadError)
        throw certUploadError
      }

      const { data: docExistente } = await supabase
        .from('documentos')
        .select('id')
        .eq('trabajador_id', trabajadorId)
        .eq('tipo', 'certificado')
        .maybeSingle()

      if (docExistente) {
        await supabase
          .from('documentos')
          .update({ storage_path: certPath, validado: false, fecha_validacion: null, envio_id: tokenValidacion })
          .eq('id', docExistente.id)
      } else {
        await supabase
          .from('documentos')
          .insert({
            trabajador_id: trabajadorId,
            tipo: 'certificado',
            storage_path: certPath,
            validado: false,
            envio_id: tokenValidacion,
          })
      }
    }

    if (finiquito_base64) {
      const finiqBytes = base64ToUint8Array(finiquito_base64)
      const finiqContentType = getContentType(finiquito_base64)
      const finiqPath = `${trabajadorId}_${Date.now()}_finiquito.pdf`

      const { error: finiqUploadError } = await supabase.storage
        .from('finiquitos')
        .upload(finiqPath, finiqBytes, {
          contentType: finiqContentType,
          upsert: true,
        })

      if (finiqUploadError) {
        console.error('Error subiendo finiquito:', finiqUploadError)
        throw finiqUploadError
      }

      const { data: docExistente } = await supabase
        .from('documentos')
        .select('id')
        .eq('trabajador_id', trabajadorId)
        .eq('tipo', 'finiquito')
        .maybeSingle()

      if (docExistente) {
        await supabase
          .from('documentos')
          .update({
            storage_path: finiqPath,
            causal_salida: causal_salida || null,
            validado: false,
            fecha_validacion: null,
            envio_id: tokenValidacion,
          })
          .eq('id', docExistente.id)
      } else {
        await supabase
          .from('documentos')
          .insert({
            trabajador_id: trabajadorId,
            tipo: 'finiquito',
            storage_path: finiqPath,
            causal_salida: causal_salida || null,
            validado: false,
            envio_id: tokenValidacion,
          })
      }
    }

    // ─────────────────────────────────────────────
    // 5. Enviar emails a evaluadores
    // ─────────────────────────────────────────────
    for (const emp of empleadoresInsertados) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Huella Laboral <noreply@contacto.huellalaboral.cl>',
            to: emp.email_evaluador,
            subject: `${trabajador.nombre} te solicita una referencia laboral`,
            html: `
  <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <h1 style="color: #0E2A47;">Solicitud de Referencia Laboral</h1>
    <p>Hola,</p>
    <p>Somos <strong>Huella Laboral</strong>, una plataforma que gestiona referencias laborales para generar perfiles confiables.</p>
    <p><strong>${trabajador.nombre}</strong> te ha solicitado una referencia laboral para usar en su proceso de postulación, y <strong>nos entregó tu correo como una de sus jefaturas anteriores</strong>.</p>
    <p>Tu respuesta estará visible para reclutadores en nuestra plataforma, pero <strong>no será visible para el postulante</strong>.</p>
    <p>El proceso es muy simple y le será de gran ayuda.</p>
    <div style="margin: 30px 0;">
      <a href="https://huellalaboral.cl/evaluar.html?token=${emp.token}"
        style="display: inline-block; background: #0E2A47; color: white; padding: 14px 28px;
        text-decoration: none; border-radius: 4px; font-weight: 600;">
        Completar Evaluación
      </a>
    </div>
    <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 30px 0;">
    <p style="color: #6B7280; font-size: 12px;">Huella Laboral — Sistema de referencias laborales verificadas</p>
  </div>
`,
          }),
        })
        console.log('✅ Email enviado a evaluador:', emp.email_evaluador)
      } catch (emailError) {
        console.error('Error enviando email a evaluador:', emailError)
      }
      await delay(600)
    }

    // ─────────────────────────────────────────────
    // 6. Email confirmación al trabajador
    // ─────────────────────────────────────────────
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Huella Laboral <noreply@contacto.huellalaboral.cl>',
          to: trabajador.email,
          subject: 'Solicitud de referencias recibida',
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h1 style="color: #0E2A47;">¡Solicitud Recibida!</h1>
              <p>Hola <strong>${trabajador.nombre}</strong>,</p>
              <p>Gracias por usar Huella Laboral. Tus evaluadores ya recibieron la solicitud de referencia. Una vez que la completen, los reclutadores podrán ver tu perfil en nuestra plataforma.</p>
              <p style="margin-top: 20px;">Puedes hacer seguimiento a tu solicitud en el siguiente link:</p>
              <div style="margin: 20px 0;">
                <a href="https://huellalaboral.cl/estado.html?token=${tokenConsulta}"
                   style="display: inline-block; background: #0E2A47; color: white; padding: 12px 24px;
                          text-decoration: none; border-radius: 4px; font-weight: 600; font-size: 14px;">
                  Ver el estado de mi solicitud
                </a>
              </div>
              <p style="color: #6B7280; font-size: 12px;">Guarda este link — es personal y te permite ver tu estado en cualquier momento.</p>
              <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 30px 0;">
              <p style="color: #6B7280; font-size: 12px;">Huella Laboral - Sistema de referencias laborales verificadas</p>
              <p style="color: #9CA3AF; font-size: 11px; margin-top: 8px;">Si quieres que tu información sea eliminada de Huella Laboral escríbenos a <a href="mailto:contacto@huellalaboral.cl" style="color:#9CA3AF;">contacto@huellalaboral.cl</a></p>
            </div>
          `,
        }),
      })
    } catch (emailError) {
      console.error('Error enviando confirmación al trabajador:', emailError)
    }
    await delay(600)

    // ─────────────────────────────────────────────
    // 7. Email al validador si hay documentos
    // ─────────────────────────────────────────────
    console.log('📨 Paso 7 - tiene_cert:', !!certificado_base64, 'tiene_finiq:', !!finiquito_base64)
    if (certificado_base64 || finiquito_base64) {
      console.log('📨 Enviando email al validador...')
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Huella Laboral <noreply@contacto.huellalaboral.cl>',
            to: 'contacto@huellalaboral.cl',
            subject: 'Nuevos documentos para validar',
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h1 style="color: #0E2A47;">Documentos para Validar</h1>
                <p>Trabajador: <strong>${trabajador.nombre}</strong> (${trabajador.rut})</p>
                <div style="margin: 30px 0;">
                  <a href="https://huellalaboral.cl/validar.html?token=${tokenValidacion}"
                    style="display: inline-block; background: #0E2A47; color: white; padding: 14px 28px;
                    text-decoration: none; border-radius: 4px; font-weight: 600;">
                    Validar Documentos
                  </a>
                </div>
                <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 30px 0;">
                <p style="color: #6B7280; font-size: 12px;">Huella Laboral - Sistema de referencias laborales verificadas</p>
              </div>
            `,
          }),
        })
        console.log('✅ Email enviado al validador: contacto@huellalaboral.cl')
      } catch (emailError) {
        console.error('❌ Error enviando email al validador:', emailError)
      }
    }

    return new Response(
      JSON.stringify({ success: true, trabajadorId }),
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