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
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })
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


    const url = new URL(req.url)
    const procesoId = url.searchParams.get('proceso_id')

    if (!procesoId) {
      return new Response(
        JSON.stringify({ error: 'proceso_id requerido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // H-04: comprobar propiedad antes de devolver nada. Sin esto, cualquier
    // reclutador leía la cartera de candidatos de cualquier otro, con nombre,
    // RUT, correo, WhatsApp y comuna. 404 y no 403: un 403 confirmaría que el
    // proceso existe.
    if (!(await esProcesoPropio(supabase, procesoId, authUser.id))) {
      return new Response(
        JSON.stringify({ error: 'Proceso no encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Obtener candidatos del proceso con datos del trabajador
    const { data: candidatosRaw, error: candidatosError } = await supabase
      .from('candidatos_proceso')
      .select('*, trabajadores(*)')
      .eq('proceso_id', procesoId)

    if (candidatosError) throw candidatosError

    return new Response(
      JSON.stringify(candidatosRaw),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Error al obtener proceso' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})