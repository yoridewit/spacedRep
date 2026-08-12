-- Kaartjes — ongedaan maken van storage.sql.
--
-- Voor als je storage.sql per ongeluk op het verkeerde Supabase-project hebt
-- gedraaid: draai dít script in de SQL-editor van dát (verkeerde) project. Het
-- verwijdert precies wat storage.sql aanmaakte — de policies, eventuele
-- bestanden die er ondertussen in beland zijn, en de bucket zelf — en laat de
-- rest van het project met rust.
--
-- Op je eigen (juiste) project hoef je dit niet te draaien.

drop policy if exists "eigen afbeeldingen lezen"        on storage.objects;
drop policy if exists "eigen afbeeldingen toevoegen"     on storage.objects;
drop policy if exists "eigen afbeeldingen overschrijven" on storage.objects;
drop policy if exists "eigen afbeeldingen wissen"        on storage.objects;

-- Een bucket met bestanden erin kan niet verwijderd worden — eerst die weg.
delete from storage.objects where bucket_id = 'card-images';

delete from storage.buckets where id = 'card-images';
