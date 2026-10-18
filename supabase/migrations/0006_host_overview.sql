-- Party Camera: the Host's overview (Admin).
--
-- list_guests_with_photo_counts returns every Gast with the number of photos
-- on record (and how many of those are hidden) in ONE query, so the Admin's
-- statistics never query per Gast. Deleted photos are simply gone from
-- public.photos; their Shot stays counted in guests.shots_taken and their
-- shot_reservations row stays 'stored' (see 0004), so deleting or hiding a
-- photo never gives a shot back and a late retry cannot recreate it.
-- Safe to re-run: create or replace.

create or replace function public.list_guests_with_photo_counts()
returns table (
  id           uuid,
  name         text,
  shots_taken  integer,
  created_at   timestamptz,
  photo_count  integer,
  hidden_count integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    g.id,
    g.name,
    g.shots_taken,
    g.created_at,
    count(p.id)::integer                            as photo_count,
    (count(p.id) filter (where p.hidden))::integer  as hidden_count
  from public.guests g
  left join public.photos p on p.guest_id = g.id
  group by g.id
  order by g.created_at, g.id;
$$;

-- Only the server (service role) may call it; never the public API roles.
revoke execute on function public.list_guests_with_photo_counts() from public, anon, authenticated;
grant execute on function public.list_guests_with_photo_counts() to service_role;

-- Chronological listing pages through photos by (taken_at, id).
create index if not exists photos_taken_at_id_idx on public.photos (taken_at, id);
