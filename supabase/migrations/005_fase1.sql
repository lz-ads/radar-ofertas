-- Migração 005 (Fase 1): outros países, mídia original para baixar, kit de modelagem,
-- lista de espionagem e longevidade dos anúncios. Pode rodar mais de uma vez sem problema.

-- Países: cada palavra-chave é buscada num país (BR, US, GB, PT, JP...)
alter table keywords        add column if not exists country text not null default 'BR';
alter table keywords        drop constraint if exists keywords_term_key;
create unique index if not exists keywords_term_country_key on keywords (term, country);
alter table ads             add column if not exists country text not null default 'BR';
alter table offer_snapshots add column if not exists country text not null default 'BR';

-- Download em 1 clique: vídeo/imagem original guardados no bucket "midia"
alter table ads add column if not exists video_url   text;    -- link do vídeo no Facebook (expira)
alter table ads add column if not exists media_path  text;    -- arquivo original no Storage
alter table ads add column if not exists media_bytes bigint;
create index if not exists ads_last_seen_idx on ads (offer_key, last_seen desc);

-- Kit de modelagem
alter table landing_pages add column if not exists full_text text;   -- texto completo da página
alter table landing_pages add column if not exists shot_path text;   -- print da página inteira (bucket "paginas")
alter table landing_pages add column if not exists currency  text;   -- BRL, USD, GBP, EUR, JPY

create table if not exists ad_transcripts (
  library_id text primary key,
  transcript text,
  hook       text,
  structure  text,
  cta        text,
  model      text,
  created_at timestamptz not null default now()
);

create table if not exists offer_kits (
  offer_key     text primary key,
  structure     jsonb,          -- mapa da página e do funil (IA)
  model         text,
  source_hash   text,
  updated_at    timestamptz not null default now(),
  my_input      jsonb,          -- dados do produto que você preencheu
  my_version    text,           -- sua versão escrita pela IA (markdown)
  my_model      text,
  my_updated_at timestamptz
);

-- Lista de espionagem: o robô busca esses termos a cada coleta e avisa criativo novo
create table if not exists watchlist (
  id         bigserial primary key,
  offer_key  text,
  label      text not null,
  term       text not null,
  country    text not null default 'BR',
  created_at timestamptz not null default now(),
  unique (term, country)
);

alter table ad_transcripts enable row level security;
alter table offer_kits     enable row level security;
alter table watchlist      enable row level security;

-- Buckets públicos: mídia original (até 50 MB por arquivo) e prints das páginas
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('midia', 'midia', true, 52428800, array['video/mp4', 'image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do nothing;
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('paginas', 'paginas', true, 10485760, array['image/webp', 'image/jpeg'])
    on conflict (id) do nothing;
  end if;
end $$;

-- Palavras-chave de outros países (dá para pausar qualquer uma no painel)
insert into keywords (term, country) values
  ('free shipping', 'US'), ('limited time offer', 'US'), ('buy 2 get 1 free', 'US'), ('money back guarantee', 'US'),
  ('weight loss', 'US'), ('joint pain', 'US'), ('anti aging', 'US'), ('shop now', 'US'),
  ('free uk delivery', 'GB'), ('buy one get one free', 'GB'), ('money back guarantee', 'GB'), ('limited stock', 'GB'),
  ('pagamento na entrega', 'PT'), ('portes grátis', 'PT'), ('envio grátis', 'PT'), ('compre 2 leve 3', 'PT'), ('garantia de 30 dias', 'PT'),
  ('送料無料', 'JP'), ('初回限定', 'JP'), ('定期購入', 'JP'), ('今だけ', 'JP'), ('返金保証', 'JP'), ('公式サイト限定', 'JP')
on conflict (term, country) do nothing;

-- Ranking: tudo da 004 + país, longevidade, espionagem, mídia e kit
drop view if exists offer_ranking;
create view offer_ranking with (security_invoker = true) as
with latest as (
  select distinct on (offer_key) *
  from offer_snapshots
  where day >= current_date - 3
    and offer_key not in (select alias from offer_aliases)
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
),
a as (
  select
    offer_key,
    count(*) filter (where last_seen >= now() - interval '3 days') as ads_active,
    count(*) filter (where last_seen >= now() - interval '3 days' and start_date <= current_date - 30) as long_runners,
    count(*) filter (where first_seen >= now() - interval '7 days') as new_ads_7d,
    count(*) filter (where media_path is not null) as media_count,
    (array_agg(thumb_path order by copies desc) filter (where thumb_path is not null))[1] as thumb_path
  from ads
  group by offer_key
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
  l.landing_url, l.page_url, l.thumb_url,
  l.dest_type,
  a.thumb_path,
  lp.platform, lp.checkout, lp.price_min, lp.price_max, lp.installments, lp.cod, lp.has_vsl, lp.pixels,
  i.niche, i.kind, i.audience, i.promise, i.mechanism, i.offer, i.risk, i.risk_reason,
  n.status, n.note,
  coalesce(n.status = 'descartada', false) as discarded,
  -- novidades da Fase 1
  l.country,
  (current_date - l.oldest_start) as days_running,
  coalesce(a.ads_active, 0)   as ads_active,
  coalesce(a.long_runners, 0) as long_runners,
  coalesce(a.new_ads_7d, 0)   as new_ads_7d,
  coalesce(a.media_count, 0)  as media_count,
  (w.copies_7d is not null and l.copies - w.copies_7d <= -greatest(3, w.copies_7d * 0.3)) as cooling,
  exists (select 1 from watchlist wl where wl.offer_key = l.offer_key) as watched,
  exists (select 1 from offer_kits k where k.offer_key = l.offer_key and k.structure is not null) as has_kit,
  coalesce(lp.currency, 'BRL') as currency
from latest l
left join week_ago w using (offer_key)
left join g on g.domain = l.domain
left join a on a.offer_key = l.offer_key
left join landing_pages lp on lp.url = l.landing_url
left join offer_insights i on i.offer_key = l.offer_key
left join offer_notes n on n.offer_key = l.offer_key
-- ignorados valem na hora (sem esperar a próxima coleta): nome, parceria "X com Marca" ou domínio
where not exists (
  select 1 from ignored_advertisers ig
  where lower(ig.name) = lower(l.advertiser)
     or lower(l.advertiser) like '% com ' || lower(ig.name)
     or lower(l.advertiser) like lower(ig.name) || ' com %'
     or (position('.' in ig.name) > 0 and position(' ' in ig.name) = 0
         and (lower(l.domain) = lower(ig.name) or lower(l.domain) like '%.' || lower(ig.name)))
);
