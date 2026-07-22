-- 素材文件 bucket
insert into storage.buckets (id, name, public) values ('materials', 'materials', false);

-- 音频产出 bucket
insert into storage.buckets (id, name, public) values ('audio', 'audio', true);

-- RLS: 用户只能访问自己的素材
create policy "Users can upload own materials" on storage.objects
  for insert with check (
    bucket_id = 'materials' and
    (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can read own materials" on storage.objects
  for select using (
    bucket_id = 'materials' and
    (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete own materials" on storage.objects
  for delete using (
    bucket_id = 'materials' and
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- 音频 bucket: 所有人可读（公开播放），仅系统可写
create policy "Audio is publicly readable" on storage.objects
  for select using (bucket_id = 'audio');

create policy "Service can write audio" on storage.objects
  for insert with check (bucket_id = 'audio');
