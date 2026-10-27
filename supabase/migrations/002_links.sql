-- Migração 002: links da página de vendas, página do Facebook e imagem do criativo
-- Rode uma vez no SQL Editor do Supabase (instalações feitas antes de 27/10/2026).

-- Atualização de instalações antigas (sem efeito em instalação nova)
alter table ads             add column if not exists page_url    text;
alter table ads             add column if not exists landing_url text;
alter table ads             add column if not exists thumb_url   text;
alter table ads             add column if not exists media_type  text;
alter table offer_snapshots add column if not exists landing_url text;
alter table offer_snapshots add column if not exists page_url    text;
alter table offer_snapshots add column if not exists thumb_url   text;

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
left join g on g.domain = l.domain;
