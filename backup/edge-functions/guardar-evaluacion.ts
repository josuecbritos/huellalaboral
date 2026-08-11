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
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { 
      token, 
      rechazo,
      evaluador,
      evaluacion 
    } = await req.json()

    // Buscar empleador por token
    const { data: empleador, error: empleadorError } = await supabase
      .from('empleadores_solicitados')
      .select('*')
      .eq('token', token)
      .single()

    if (empleadorError || !empleador) {
      return new Response(
        JSON.stringify({ error: 'Token inválido' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (empleador.completado) {
      return new Response(
        JSON.stringify({ error: 'Esta evaluación ya fue completada' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Usar datos del empleador_solicitado + datos del formulario
    const emailEvaluador = empleador.email_evaluador
    const nombreEvaluador = evaluador?.nombre || empleador.nombre_evaluador
    const rutEvaluador = evaluador?.rut || empleador.rut_evaluador
    const empresaEvaluador = evaluador?.empresa || empleador.empresa
    const rutEmpresa = evaluador?.rut_empresa || empleador.rut_empresa
    const cargo = evaluador?.cargo || empleador.cargo
    const tiempoTrabajo = evaluador?.tiempo_trabajo || empleador.tiempo_trabajo

    // Determinar si es verificada (email corporativo)
    const verificada = rechazo ? false : emailEvaluador?.includes('@') &&
                      !emailEvaluador.match(/@(gmail|hotmail|yahoo|outlook|live|icloud)\./i)

    // Insertar evaluación
    const { data: evaluacionData, error: evaluacionError } = await supabase
      .from('evaluaciones')
      .insert({
        trabajador_id: empleador.trabajador_id,
        empleador_id: empleador.id,
        token: token,
        rechazo: rechazo || null,
        nombre_evaluador: nombreEvaluador,
        rut_evaluador: rutEvaluador,
        email_evaluador: emailEvaluador,
        empresa_evaluador: empresaEvaluador,
        rut_empresa: rutEmpresa,
        cargo: cargo,
        tiempo_trabajo: tiempoTrabajo,
        puntualidad: evaluacion?.puntualidad || null,
        desempeno: evaluacion?.desempeno || null,
        relaciones: evaluacion?.relaciones || null,
        confiabilidad: evaluacion?.confiabilidad || null,
        comentarios: evaluacion?.comentarios || null,
        verificada: verificada
      })
      .select()
      .single()

    if (evaluacionError) throw evaluacionError

    // Marcar empleador como completado
    await supabase
      .from('empleadores_solicitados')
      .update({ 
        completado: true,
        fecha_completado: new Date().toISOString()
      })
      .eq('id', empleador.id)

    // ─────────────────────────────────────────────
    // Verificar si corresponde cerrar algún proceso
    // ─────────────────────────────────────────────
    try {
      const trabajadorId = empleador.trabajador_id

      // Obtener procesos donde está este trabajador
      const { data: candidaturas } = await supabase
        .from('candidatos_proceso')
        .select('proceso_id')
        .eq('trabajador_id', trabajadorId)

      for (const candidatura of (candidaturas || [])) {
        const procesoId = candidatura.proceso_id

        // Obtener todos los candidatos del proceso (solo los vinculados, no invitaciones)
        const { data: candidatosProceso } = await supabase
          .from('candidatos_proceso')
          .select('trabajador_id')
          .eq('proceso_id', procesoId)
          .not('trabajador_id', 'is', null)

        if (!candidatosProceso?.length) continue

        // Para cada candidato, verificar si todos sus empleadores completaron
        let todosCompletos = true
        for (const c of candidatosProceso) {
          const { data: empleadores } = await supabase
            .from('empleadores_solicitados')
            .select('completado')
            .eq('trabajador_id', c.trabajador_id)

          if (!empleadores?.length || empleadores.some(e => !e.completado)) {
            todosCompletos = false
            break
          }
        }

        if (todosCompletos) {
          await supabase
            .from('procesos')
            .update({ estado: 'Finalizado' })
            .eq('id', procesoId)
          console.log('✅ Proceso finalizado:', procesoId)
        }
      }
    } catch (procesoError) {
      console.error('Error verificando estado del proceso:', procesoError)
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        evaluacion_id: evaluacionData.id,
        verificada: verificada
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