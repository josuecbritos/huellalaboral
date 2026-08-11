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


    const { proceso_ids } = await req.json()

    if (!proceso_ids || !proceso_ids.length) {
      return new Response(
        JSON.stringify({ candidatos: 0, evaluaciones: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // H-10: el array llega del cliente y se contaba sobre él sin filtrar, así
    // que se filtraban recuentos agregados de procesos ajenos.
    //
    // Se filtra en silencio a los propios en vez de rechazar la petición entera.
    // Dos razones: la pantalla de estadísticas se rompería completa por un solo
    // id inválido, y rechazar con un error distinto según el id exista o no
    // filtraría por diferencia lo que la comprobación viene a esconder. Los ids
    // salen de `listar-procesos`, que ya filtra por `usuario_id`: un id ajeno
    // aquí es un fallo o un ataque, y en ambos casos lo correcto es devolver los
    // números propios del llamante.
    const procesosPropios = await filtrarProcesosPropios(supabase, proceso_ids, authUser.id)

    if (!procesosPropios.length) {
      return new Response(
        JSON.stringify({ candidatos: 0, evaluaciones: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Candidatos únicos (excluyendo invitaciones pendientes)
    const { data: candidatosRaw, error: candidatosError } = await supabase
      .from('candidatos_proceso')
      .select('trabajador_id')
      .in('proceso_id', procesosPropios)
      .not('trabajador_id', 'is', null)

    if (candidatosError) throw candidatosError

    const trabajadorIdsUnicos = [...new Set(candidatosRaw.map(c => c.trabajador_id))]

    if (!trabajadorIdsUnicos.length) {
      return new Response(
        JSON.stringify({ candidatos: 0, evaluaciones: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Total de evaluaciones realizadas
    const { data: evalsRaw, error: evalsError } = await supabase
      .from('evaluaciones')
      .select('id')
      .in('trabajador_id', trabajadorIdsUnicos)

    if (evalsError) throw evalsError

    return new Response(
      JSON.stringify({
        candidatos: trabajadorIdsUnicos.length,
        evaluaciones: evalsRaw.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Error al obtener stats' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})