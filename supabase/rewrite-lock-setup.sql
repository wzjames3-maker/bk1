-- Apply this once to existing Supabase projects after schema.sql has been run.
-- The functions make rewrite claim, completion, and confirmation state changes atomic.

create or replace function public.claim_episode_rewrite(
  p_episode_id uuid,
  p_lock_token text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed jsonb;
begin
  update public.episodes
  set params = jsonb_set(
    coalesce(params, '{}'::jsonb),
    '{rewrite_in_progress}',
    to_jsonb(p_lock_token),
    true
  )
  where id = p_episode_id
    and user_id = auth.uid()
    and status = 'script_ready'
    and coalesce(params ->> 'rewrite_in_progress', '') in ('', 'false')
    and case
      when coalesce(params ->> 'rewrite_count', '') ~ '^\d+$'
        then (params ->> 'rewrite_count')::integer < 3
      else true
    end
  returning jsonb_build_object(
    'id', id,
    'topic', topic,
    'script', script,
    'params', params
  ) into claimed;

  return claimed;
end;
$$;

create or replace function public.complete_episode_rewrite(
  p_episode_id uuid,
  p_lock_token text,
  p_script jsonb,
  p_token_quantity numeric,
  p_cost numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  completed jsonb;
begin
  update public.episodes
  set params = jsonb_set(
    jsonb_set(
      coalesce(params, '{}'::jsonb),
      '{rewrite_count}',
      to_jsonb(
        case
          when coalesce(params ->> 'rewrite_count', '') ~ '^\d+$'
            then (params ->> 'rewrite_count')::integer + 1
          else 1
        end
      ),
      true
    ),
    '{rewrite_in_progress}',
    'false'::jsonb,
    true
  ),
  script = p_script
  where id = p_episode_id
    and user_id = auth.uid()
    and status = 'script_ready'
    and params ->> 'rewrite_in_progress' = p_lock_token
  returning jsonb_build_object(
    'script', script,
    'rewrite_count', (params ->> 'rewrite_count')::integer
  ) into completed;

  if completed is null then
    return null;
  end if;

  insert into public.usage_logs (user_id, episode_id, type, quantity, cost)
  values (auth.uid(), p_episode_id, 'llm_token', p_token_quantity, p_cost);

  return completed;
end;
$$;

create or replace function public.release_episode_rewrite_lock(
  p_episode_id uuid,
  p_lock_token text
)
returns boolean
language sql
security definer
set search_path = public
as $$
  update public.episodes
  set params = jsonb_set(coalesce(params, '{}'::jsonb), '{rewrite_in_progress}', 'false'::jsonb, true)
  where id = p_episode_id
    and user_id = auth.uid()
    and params ->> 'rewrite_in_progress' = p_lock_token
  returning true;
$$;

create or replace function public.confirm_episode_for_tts(p_episode_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  update public.episodes
  set status = 'confirming'
  where id = p_episode_id
    and user_id = auth.uid()
    and status = 'script_ready'
    and coalesce(params ->> 'rewrite_in_progress', '') in ('', 'false')
  returning true;
$$;

revoke execute on function public.claim_episode_rewrite(uuid, text) from public;
revoke execute on function public.complete_episode_rewrite(uuid, text, jsonb, numeric, numeric) from public;
revoke execute on function public.release_episode_rewrite_lock(uuid, text) from public;
revoke execute on function public.confirm_episode_for_tts(uuid) from public;
grant execute on function public.claim_episode_rewrite(uuid, text) to authenticated;
grant execute on function public.complete_episode_rewrite(uuid, text, jsonb, numeric, numeric) to authenticated;
grant execute on function public.release_episode_rewrite_lock(uuid, text) to authenticated;
grant execute on function public.confirm_episode_for_tts(uuid) to authenticated;
