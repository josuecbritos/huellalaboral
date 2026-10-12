-- H-18 — fijar la ruta de búsqueda de `update_updated_at_column`
--
-- `public.update_updated_at_column` pone al día la fecha de modificación de un
-- registro al actualizarlo. No tiene fijada la ruta de búsqueda: el orden de
-- lugares de la base donde busca lo que usa. Alguien con permiso para crear
-- objetos en la base podría hacerle usar una versión falsa de lo que invoca;
-- hoy nadie de fuera tiene ese permiso, así que el riesgo es bajo. El panel de
-- seguridad de Supabase lo marcó como `function_search_path_mutable`.
--
-- Se fija `pg_catalog, public` y no una ruta vacía: el cuerpo de la función no
-- se puede leer desde el conector, y esta ruta resuelve lo mismo que hoy. Una
-- ruta vacía obligaría a calificar cada nombre dentro del cuerpo, y sin poder
-- leerlo no hay forma de comprobar que siga funcionando.
--
-- No cambia el cuerpo de la función ni ninguna tabla: solo dónde busca.
--
-- La aplica el dueño desde el editor SQL. `apply_migration` está prohibido en
-- este proyecto.

alter function public.update_updated_at_column() set search_path = pg_catalog, public;

-- Reversión:
-- alter function public.update_updated_at_column() reset search_path;
