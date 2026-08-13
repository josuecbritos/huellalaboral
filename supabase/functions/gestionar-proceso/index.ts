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

    // H-05: comprobar propiedad antes de operar. Va antes del despacho por
    // acción, así que cubre 'finalizar' y 'eliminar' por construcción y también
    // cualquier acción que se añada después. 'eliminar' borra las filas de
    // candidatos_proceso y luego el proceso: sin esta comprobación, era borrado
    // irreversible de datos ajenos.
    if (!(await esProcesoPropio(supabase, proceso_id, authUser.id))) {
      return new Response(
        JSON.stringify({ error: 'Proceso no encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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