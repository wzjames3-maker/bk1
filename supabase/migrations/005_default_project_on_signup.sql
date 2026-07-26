-- 005: 注册时自动创建默认项目
-- 修改 handle_new_user 触发器函数，在创建 profile 后同时创建默认项目

create or replace function public.handle_new_user()
returns trigger as $$
begin
  -- 创建用户 profile
  insert into public.profiles (id, name)
  values (new.id, new.raw_user_meta_data->>'name');

  -- 自动创建默认项目（确保用户始终有至少一个项目）
  insert into public.projects (user_id, name, description)
  values (new.id, '默认项目', '注册时自动创建的播客项目');

  return new;
end;
$$ language plpgsql security definer;

-- 为已有用户补建默认项目（没有项目的用户）
insert into public.projects (user_id, name, description)
select p.id, '默认项目', '注册时自动创建的播客项目'
from public.profiles p
where not exists (
  select 1 from public.projects pr where pr.user_id = p.id
);
