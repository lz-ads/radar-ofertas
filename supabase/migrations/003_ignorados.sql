-- Migração 003: ignora grandes marcas (nome, parceria "X com Marca" ou domínio) direto no ranking

-- Grandes marcas e varejistas vistos nas primeiras coletas (nomes de página ou domínios)
insert into ignored_advertisers (name) values
  ('Buscofem'), ('Neosaldina'), ('Doril'), ('Advil Brasil'), ('Calminex'), ('Spidufen Brasil'),
  ('La Roche-Posay'), ('Nestlé Nutre'), ('Receitas Nestlé'), ('Quaker Brasil'), ('Doritos'),
  ('Britânia Eletrodomésticos'), ('Jeep | Brasil'), ('Polishop'), ('Lojas Torra'), ('Netshoes'),
  ('Airbnb'), ('Decolar'), ('Hotels.com'), ('CNA'), ('UNIP'), ('Alpecin Brasil'), ('HOPE Underwear'),
  ('SEPHORA'), ('AREZZO'), ('Ray-Ban'), ('Hering'), ('Lenovo Brasil'), ('JBL'), ('Beleza na Web'),
  ('Life by Vivara'), ('Integralmedica Sports Nutrition'), ('Gran Cursos Online - Concursos Públicos'),
  ('Profuse'), ('Bigfral'), ('TENA Brasil'), ('SAZÓN Brasil'), ('Qualy'), ('Uber'), ('99Food'),
  ('hypera.com.br'), ('drogaraia.com.br'), ('drogasil.com.br'), ('mercadolivre.com.br'),
  ('shopee.com.br'), ('amazon.com.br'), ('magazineluiza.com.br'), ('paodeacucar.com'), ('loreal-paris.com.br')
on conflict (name) do nothing;

-- Ranking: última foto de cada oferta + crescimento contra ~7 dias atrás + Google
-- security_invoker: a view respeita o RLS das tabelas (não fica exposta pela chave pública)
create or replace view offer_ranking with (security_invoker = true) as
with latest as (
  select distinct on (offer_key) *
  from offer_snapshots
  where day >= current_date - 3
  order by offer_key, day desc
),
week_ago as (
  select distinct on (offer_key) offer_key, cards as cards_7d, copies as copies_7d
  from offer_snapshots
  where day <= current_date - 6
  order by offer_key, day desc
),
g as (
  select distinct on (domain) domain, ads as google_ads
  from google_counts
  order by domain, day desc
)
select
  l.offer_key, l.advertiser, l.advertisers, l.domain, l.day as last_day,
  l.cards, l.copies, l.pages, l.oldest_start, l.keywords, l.sample_text,
  w.cards_7d, w.copies_7d,
  (l.copies - coalesce(w.copies_7d, l.copies)) as copies_growth,
  g.google_ads,
  (select min(day) from offer_snapshots s where s.offer_key = l.offer_key) as first_seen,
  ( l.copies
    + 2 * l.cards
    + 5 * greatest(l.pages - 1, 0)
    + case when coalesce(g.google_ads,0) >= 100 then 10 when coalesce(g.google_ads,0) >= 10 then 5 else 0 end
    + 2 * greatest(l.copies - coalesce(w.copies_7d, l.copies), 0)
  ) as score,
  l.landing_url, l.page_url, l.thumb_url
from latest l
left join week_ago w using (offer_key)
left join g on g.domain = l.domain
-- ignorados valem na hora (sem esperar a próxima coleta): nome, parceria "X com Marca" ou domínio
where not exists (
  select 1 from ignored_advertisers i
  where lower(i.name) = lower(l.advertiser)
     or lower(l.advertiser) like '% com ' || lower(i.name)
     or lower(l.advertiser) like lower(i.name) || ' com %'
     or (position('.' in i.name) > 0 and position(' ' in i.name) = 0
         and (lower(l.domain) = lower(i.name) or lower(l.domain) like '%.' || lower(i.name)))
);
