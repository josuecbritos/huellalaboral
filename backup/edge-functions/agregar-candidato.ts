import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-user-token',
}

// ─── Comprobación de propiedad · H-04, H-05, H-10 ────────────────────────────
// Bloque IDÉNTICO en obtener-proceso, gestionar-proceso, agregar-candidato y
// obtener-stats. Cada edge function se despliega por separado, así que se
// duplica físicamente: si se cambia, se cambia en las cuatro.
//
// Devuelve solo los ids que existen Y pertenecen a userId. Un id ajeno y un id
// inexistente son indistinguibles en la respuesta, a propósito: distinguirlos
// confirmaría la existencia de procesos de terceros.
//
// Si la consulta falla, lanza. El llamante devuelve 500 y no opera. Fallar
// cerrado es deliberado: un catch que devolviera los ids pedidos convertiría un
// error transitorio de red en el mismo IDOR que esto viene a cerrar.
async function filtrarProcesosPropios(
  supabase: any,
  procesoIds: string[],
  userId: string
): Promise<string[]> {
  if (!procesoIds.length) return []
  const { data, error } = await supabase
    .from('procesos')
    .select('id')
    .in('id', procesoIds)
    .eq('usuario_id', userId)
  if (error) throw error
  return (data ?? []).map((p: any) => p.id)
}

// El caso de un solo proceso, que es el de tres de las cuatro funciones.
async function esProcesoPropio(
  supabase: any,
  procesoId: string,
  userId: string
): Promise<boolean> {
  const propios = await filtrarProcesosPropios(supabase, [procesoId], userId)
  return propios.length === 1
}

// ─── Validación vigente · cadena de validación de documentos ─────────────────
// Bloque IDÉNTICO en obtener-estado, obtener-candidato y agregar-candidato.
// Cada edge function se despliega por separado, así que se duplica físicamente:
// si se cambia, se cambia en las tres.
//
// Antes se leía `validaciones_documentos[0]`: sin ordenar, sin filtrar y sin
// mirar si el documento se resubió después. Como la fila de `documentos` se
// ACTUALIZA al resubir conservando su `id`, las validaciones viejas siguen
// colgando de ella y no se distinguen de las nuevas por la relación. El panel
// mostraba como verificado lo que el validador ya había rechazado.
//
// `envio_id` es la llave que faltaba: una validación cuenta solo si se hizo
// sobre el envío que hoy está en la tabla.
function validacionVigente(documento: any) {
  if (!documento?.envio_id) return null
  const validaciones = documento.validaciones_documentos ?? []
  return validaciones.find((v: any) => v.envio_id === documento.envio_id) ?? null
}

// Cuatro situaciones que hoy se ven iguales, todas como un '—' indistinguible.
// Devolver el estado explícito es lo que permite al frontend separarlas sin
// tener que adivinar a partir de nulls.
function estadoDocumento(documento: any, validacion: any): string {
  if (!documento) return 'sin_documento'
  if (!validacion) return 'pendiente_validacion'
  return validacion.valido === true ? 'validado' : 'no_valido'
}

// ─── Contexto de M-4 y M-5 · empresa y cargo ─────────────────────────────────
// Los dos correos nombraban al reclutador y nada más. Un trabajador con tres
// postulaciones abiertas recibía un nombre de persona suelto y no podía saber
// cuál era. `procesos.cargo` y `usuarios.empresa` ya existían y no se leían.

// Un campo obligatorio en su formulario puede llegar igual como cadena vacía.
// Se trata como ausente lo mismo `null` que '   ': la alternativa es un correo
// que dice «para el cargo de  .»
function textoOpcional(valor: any): string | null {
  if (typeof valor !== 'string') return null
  const limpio = valor.trim()
  return limpio.length ? limpio : null
}

// Mismo criterio que H-07. `empresa` y `cargo` los teclea un humano en un
// formulario libre, y aquí acaban dentro de un HTML.
//
// Se usa SOLO para el cuerpo. El asunto de Resend es texto plano: escaparlo
// mostraría «Fábrica &amp; Cía» literal en la bandeja de entrada.
function escapeHtml(valor: any): string {
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// La frase de apertura de M-4 y M-5. Solo cambia el verbo entre las dos, y se
// mantiene distinto a propósito: «invitó» y «agregó» son situaciones distintas.
//
// Los respaldos son por campo, no todo o nada. Si falta la empresa se omite el
// inciso; si falta el cargo se omite su cola. Una frase corta es aceptable;
// una frase rota, no.
function aperturaCorreo(
  reclutadorHtml: string,
  empresaHtml: string | null,
  cargoHtml: string | null,
  fraseVerbo: string
): string {
  const inciso = empresaHtml ? `, de <strong>${empresaHtml}</strong>,` : ''
  const cola = cargoHtml ? ` para el cargo de <strong>${cargoHtml}</strong>` : ''
  return `<strong>${reclutadorHtml}</strong>${inciso} ${fraseVerbo}${cola}.`
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


    // H-10: `reclutador_nombre` ya no se lee del body. Llegaba del cliente y
    // salía en el asunto y el cuerpo de M-4 y M-5, así que cualquiera podía
    // enviar invitaciones firmadas con el nombre de otro reclutador. Si el
    // cliente lo sigue mandando, se ignora.
    const { proceso_id, email, rut } = await req.json()
    console.log('📥 REQUEST:', { proceso_id, email, rut })

    if (!proceso_id || !email || !rut) {
      console.log('❌ Faltan datos requeridos')
      return new Response(
        JSON.stringify({ error: 'proceso_id, email y rut son requeridos' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // H-10: comprobar propiedad antes de insertar. Sin esto se podían inyectar
    // candidatos en procesos ajenos. 404 y no 403, por lo mismo que las otras.
    if (!(await esProcesoPropio(supabase, proceso_id, authUser.id))) {
      return new Response(
        JSON.stringify({ error: 'Proceso no encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // El nombre que firma los correos sale de la base, no del cliente. Se lee
    // después de la comprobación de propiedad: si el proceso es del llamante,
    // su fila en `usuarios` existe. El respaldo a `authUser.email` reproduce el
    // `usuario.nombre || usuario.email` que hacía el frontend.
    const { data: reclutador, error: reclutadorError } = await supabase
      .from('usuarios')
      .select('nombre, empresa')
      .eq('id', authUser.id)
      .maybeSingle()
    if (reclutadorError) throw reclutadorError
    const reclutador_nombre = reclutador?.nombre || authUser.email
    const empresa = textoOpcional(reclutador?.empresa)

    // El cargo del proceso, para nombrarlo en el cuerpo de M-4 y M-5.
    //
    // Es una consulta más, y conviene decir por qué no se evitó. La única forma
    // de ahorrarla era pedir `cargo` dentro de `filtrarProcesosPropios`, y ese
    // bloque es IDÉNTICO en cuatro funciones a propósito: tocarlo aquí obligaría
    // a tocar las otras tres, que están fuera del alcance de este pedido, y
    // rompería la uniformidad de la comprobación de propiedad para ahorrar una
    // búsqueda por clave primaria. Mal negocio sobre un invariante de seguridad.
    //
    // Va DESPUÉS de la comprobación de propiedad, no antes: si el proceso no es
    // del llamante ya se devolvió 404 y esta consulta no llega a ejecutarse.
    const { data: proceso, error: procesoError } = await supabase
      .from('procesos')
      .select('cargo')
      .eq('id', proceso_id)
      .maybeSingle()
    if (procesoError) throw procesoError
    const cargo = textoOpcional(proceso?.cargo)

    // Escapado solo para el HTML. Los asuntos usan los valores en crudo.
    const reclutadorHtml = escapeHtml(reclutador_nombre)
    const empresaHtml = empresa ? escapeHtml(empresa) : null
    const cargoHtml = cargo ? escapeHtml(cargo) : null

    // Buscar trabajador
    console.log('🔍 Buscando trabajador con RUT:', rut)
    const { data: trabajador } = await supabase
      .from('trabajadores')
      .select('id, nombre, rut, email')
      .eq('rut', rut)
      .maybeSingle()

    console.log('👤 Trabajador encontrado:', trabajador)

    if (trabajador) {
      // CASO A: Ya existe - agregar Y enviar email de recordatorio
      console.log('✅ CASO A: Trabajador existe, agregando al proceso')
      
      const { data: existente } = await supabase
        .from('candidatos_proceso')
        .select('id')
        .eq('proceso_id', proceso_id)
        .eq('trabajador_id', trabajador.id)
        .maybeSingle()

      if (existente) {
        console.log('⚠️ Ya está en el proceso')
        return new Response(
          JSON.stringify({ error: 'Este candidato ya está agregado al proceso' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      console.log('💾 Insertando en candidatos_proceso...')
      await supabase
        .from('candidatos_proceso')
        .insert({
          proceso_id: proceso_id,
          trabajador_id: trabajador.id,
          email_invitado: null,
          rut_invitado: null
        })

      // Si el proceso estaba Finalizado, reactivarlo
      await supabase
        .from('procesos')
        .update({ estado: 'Activo' })
        .eq('id', proceso_id)
        .eq('estado', 'Finalizado')
      console.log('🔄 Proceso reactivado si estaba Finalizado')

      // Enviar email de recordatorio
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'Huella Laboral <noreply@contacto.huellalaboral.cl>',
            to: trabajador.email,
            // M-4. Sin empresa el asunto es exactamente el de antes: quien
            // firma vuelve a ser el reclutador. El cargo no sube al asunto a
            // propósito —se cortaría en el móvil justo donde está el dato útil—.
            subject: empresa
              ? `${empresa} te agregó a un proceso de selección`
              : `${reclutador_nombre} te agregó a un proceso de selección`,
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h1 style="color: #0E2A47;">Te agregaron a un proceso de selección</h1>
                <p>${aperturaCorreo(reclutadorHtml, empresaHtml, cargoHtml, 'te ha agregado a un proceso de selección')}</p>
                <p>Ya tienes referencias en nuestro sistema, pero es un buen momento para verificar que estén actualizadas.</p>
                <div style="margin: 30px 0;">
                  <a href="https://huellalaboral.cl/trabajador.html" 
                     style="display: inline-block; background: #0E2A47; color: white; padding: 14px 28px; 
                            text-decoration: none; border-radius: 4px; font-weight: 600;">
                    Actualizar mis Referencias
                  </a>
                </div>
                <p style="color: #6B7280; font-size: 14px;">
                  Si tus referencias están al día, no necesitas hacer nada. El reclutador ya tiene acceso a tu perfil.
                </p>
                <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 30px 0;">
                <p style="color: #6B7280; font-size: 12px;">
                  Huella Laboral - Sistema de referencias laborales verificadas
                </p>
              </div>
            `
          })
        })
        
        console.log('✅ Email de recordatorio enviado a:', trabajador.email)
        
      } catch (emailError) {
        console.error('❌ Error email:', emailError)
      }

      const candidatoCompleto = await obtenerDatosCandidato(supabase, trabajador.id)

      return new Response(
        JSON.stringify({ 
          success: true,
          tipo: 'existente',
          mensaje: 'Candidato agregado al proceso. Se le envió un recordatorio por email.',
          candidato: candidatoCompleto
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )

    } else {
      // CASO B: No existe - crear invitación
      console.log('📧 CASO B: Trabajador NO existe, creando invitación')
      
      const { data: invitacionExistente } = await supabase
        .from('candidatos_proceso')
        .select('id')
        .eq('proceso_id', proceso_id)
        .eq('rut_invitado', rut)
        .maybeSingle()

      if (invitacionExistente) {
        console.log('⚠️ Ya hay invitación pendiente')
        return new Response(
          JSON.stringify({ error: 'Ya existe una invitación pendiente para este RUT en este proceso' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      console.log('💾 Insertando invitación...')
      const { data: invitacion } = await supabase
        .from('candidatos_proceso')
        .insert({
          proceso_id: proceso_id,
          trabajador_id: null,
          email_invitado: email,
          rut_invitado: rut
        })
        .select()
        .single()

      // Enviar email de invitación
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'Huella Laboral <noreply@contacto.huellalaboral.cl>',
            to: email,
            // M-5. Mismo criterio que M-4: sin empresa, el asunto es el de antes.
            subject: empresa
              ? `${empresa} te invita a un proceso de selección`
              : `${reclutador_nombre} te invita a solicitar tus referencias laborales`,
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h1 style="color: #0E2A47;">Te invitaron a un proceso de selección</h1>
                <p>Hola,</p>
                <p>${aperturaCorreo(reclutadorHtml, empresaHtml, cargoHtml, 'te ha invitado a participar en un proceso de selección')}</p>
                <p>Solicita acá tus referencias laborales:</p>
                <div style="margin: 30px 0;">
                  <a href="https://huellalaboral.cl/trabajador.html"
                     style="display: inline-block; background: #0E2A47; color: white; padding: 14px 28px;
                            text-decoration: none; border-radius: 4px; font-weight: 600;">
                    Solicitar mis Referencias
                  </a>
                </div>
                <p style="color: #6B7280; font-size: 14px;">
                  El proceso es simple: completa tus datos, sube tus documentos (certificado de cotizaciones y finiquito), 
                  y nosotros contactaremos a tus antiguos jefes para que completen tu evaluación.
                </p>
                <p style="color: #6B7280; font-size: 14px;">
                  Generaremos un perfil que puede ayudarte a destacar en los procesos de selección.
                </p>
                <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 30px 0;">
                <p style="color: #6B7280; font-size: 12px;">Huella Laboral — Referencias y trayectorias laborales verificadas</p>
              </div>
            `
          })
        })
        
        console.log('✅ Email de invitación enviado a:', email)
        
      } catch (emailError) {
        console.error('❌ Error email:', emailError)
      }

      return new Response(
        JSON.stringify({ 
          success: true,
          tipo: 'invitacion',
          mensaje: 'Invitación enviada. El candidato aparecerá cuando complete su solicitud.',
          candidato: {
            id: invitacion.id,
            email: email,
            rut: rut,
            estado: 'Invitado',
            pendiente: true
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

  } catch (error) {
    console.error('❌ ERROR GENERAL:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

async function obtenerDatosCandidato(supabase: any, trabajadorId: string) {
  const { data: trabajador } = await supabase
    .from('trabajadores')
    .select('*')
    .eq('id', trabajadorId)
    .single()

  const { data: evaluaciones } = await supabase
    .from('evaluaciones')
    .select('*')
    .eq('trabajador_id', trabajadorId)

  const evaluacionesValidas = evaluaciones?.filter(e => !e.rechazo) || []
  const empleadoresCount = new Set(evaluacionesValidas.map(e => e.email_evaluador)).size

  const { data: documentos } = await supabase
    .from('documentos')
    .select('*, validaciones_documentos(*)')
    .eq('trabajador_id', trabajadorId)

  const certificado = documentos?.find(d => d.tipo === 'certificado')
  const finiquito = documentos?.find(d => d.tipo === 'finiquito')
  
  // Solo cuenta la validación hecha sobre el envío que hoy está en la tabla.
  const validacionCert = validacionVigente(certificado)
  const validacionFiniq = validacionVigente(finiquito)
  const certEstado = estadoDocumento(certificado, validacionCert)
  const finiqEstado = estadoDocumento(finiquito, validacionFiniq)
  // H-22: el motivo del rechazo se escribía y no se leía en ninguna parte.
  const certRazonInvalido = validacionCert && validacionCert.valido !== true
    ? (validacionCert.razon_invalido || null)
    : null

  let estado = 'Invitado'
  if (evaluacionesValidas.length > 0) {
    estado = evaluacionesValidas.length === empleadoresCount ? 'Completado' : 'En proceso'
  }

  return {
    id: trabajador.id,
    nombre: trabajador.nombre,
    rut: trabajador.rut,
    email: trabajador.email,
    empleadores: empleadoresCount,
    evaluaciones: evaluacionesValidas.length,
    estado: estado,
    cert_empleos: validacionCert?.valido ? validacionCert.empleos_ultimos_5_anos : null,
    cert_permanencia: validacionCert?.valido ? validacionCert.tiempo_maximo_un_empleador_anos : null,
    cert_estado: certEstado,
    cert_razon_invalido: certRazonInvalido,
    finiq_estado: finiqEstado,
    // `??` y no `||`: un `false` explícito del validador se perdía.
    causal_validada: validacionFiniq?.finiquito_valido_y_coincide ?? null,
    causal_texto: finiquito?.causal_salida || null,
    pendiente: false
  }
}