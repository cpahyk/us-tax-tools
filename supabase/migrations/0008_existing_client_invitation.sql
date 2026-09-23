-- Existing Auth users cannot be invited again. Link only the requested client
-- in the caller's own firm; never move an existing profile between firms/roles.
create function public.prepare_client_invitation(p_client_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_client clients; v_user auth.users; v_profile profiles;
begin
  if auth.uid() is null or not private.is_firm_staff() then
    raise exception 'Not authorized';
  end if;
  select * into v_client from clients
  where id=p_client_id and firm_id=private.current_firm_id() for update;
  if v_client.id is null then raise exception 'Client not found'; end if;
  if v_client.status='archived' then raise exception 'Restore this client before inviting them'; end if;
  select * into v_user from auth.users where lower(email)=lower(v_client.email) for update;
  if v_user.id is null then return 'invite'; end if;
  select * into v_profile from profiles where id=v_user.id for update;
  if v_profile.id is not null and
    (v_profile.firm_id <> v_client.firm_id or v_profile.role <> 'client') then
    raise exception 'This email belongs to an account with different access. Use a separate client email or contact your administrator';
  end if;
  if v_client.profile_id is not null and v_client.profile_id <> v_user.id then
    raise exception 'This client is already linked to a different account';
  end if;
  if exists(select 1 from clients where profile_id=v_user.id and id<>v_client.id) then
    raise exception 'This account is already linked to another client';
  end if;
  if v_profile.id is null then
    insert into profiles(id,firm_id,role,full_name,email)
    values(v_user.id,v_client.firm_id,'client',v_client.primary_contact_name,v_user.email);
  end if;
  if v_client.profile_id is null then
    update clients set profile_id=v_user.id,status='active' where id=v_client.id;
    insert into audit_log(firm_id,actor_id,action,target_type,target_id)
    values(v_client.firm_id,auth.uid(),'client.account_linked','client',v_client.id);
  end if;
  return 'signin';
end;
$$;
revoke all on function public.prepare_client_invitation(uuid) from public, anon;
grant execute on function public.prepare_client_invitation(uuid) to authenticated;
