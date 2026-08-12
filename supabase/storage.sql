-- Kaartjes — afbeeldingen bij kaarten.
-- Draai dit één keer in de SQL-editor van je Supabase-project, naast schema.sql,
-- als je wilt dat foto's die je op één toestel toevoegt ook op je andere
-- toestellen verschijnen. Zonder deze stap werkt de app gewoon door en blijven
-- foto's op het apparaat waar je ze maakte.
--
-- Elke foto komt in de map <jouw-user-id>/... terecht; de policies zorgen dat
-- je uitsluitend bij je eigen map kunt.

insert into storage.buckets (id, name, public)
values ('card-images', 'card-images', false)
on conflict (id) do nothing;

drop policy if exists "eigen afbeeldingen lezen"        on storage.objects;
drop policy if exists "eigen afbeeldingen toevoegen"     on storage.objects;
drop policy if exists "eigen afbeeldingen overschrijven" on storage.objects;
drop policy if exists "eigen afbeeldingen wissen"        on storage.objects;

create policy "eigen afbeeldingen lezen"
  on storage.objects for select
  using (bucket_id = 'card-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "eigen afbeeldingen toevoegen"
  on storage.objects for insert
  with check (bucket_id = 'card-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "eigen afbeeldingen overschrijven"
  on storage.objects for update
  using (bucket_id = 'card-images' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "eigen afbeeldingen wissen"
  on storage.objects for delete
  using (bucket_id = 'card-images' and (storage.foldername(name))[1] = auth.uid()::text);
