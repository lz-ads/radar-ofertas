-- Migração 004: duplicadas, tipo de destino, raio-X das páginas, IA, criativos, funil, alertas e mais palavras-chave.
-- Pode rodar mais de uma vez sem problema.

-- Anúncios: botão, destino e imagem guardada
alter table ads             add column if not exists cta         text;
alter table ads             add column if not exists dest_type   text;  -- site | whatsapp | instagram | formulario | mensagem | app | ligacao
alter table ads             add column if not exists thumb_path  text;  -- caminho no Storage (bucket "criativos")
alter table offer_snapshots add column if not exists dest_type   text;
create index if not exists ads_thumb_pending_idx on ads (offer_key) where thumb_path is null;

-- Item 1: chave antiga (anunciante sem site) que passou a apontar para a oferta com site
create table if not exists offer_aliases (
  alias      text primary key,
  target     text not null,
  created_at timestamptz not null default now()
);

-- Item 4: raio-X da página de vendas
create table if not exists landing_pages (
  url           text primary key,
  final_url     text,
  status        int,
  title         text,
  description   text,
  platform      text,
  checkout      text,
  prices        numeric[] not null default '{}',
  price_min     numeric,
  price_max     numeric,
  installments  text,
  cod           boolean not null default false,  -- pagamento na entrega
  has_vsl       boolean not null default false,
  has_countdown boolean not null default false,
  has_whatsapp  boolean not null default false,
  pixels        text[] not null default '{}',
  excerpt       text,
  error         text,
  checked_at    timestamptz not null default now()
);

-- Item 5: classificação da IA
create table if not exists offer_insights (
  offer_key   text primary key,
  niche       text,
  kind        text,
  audience    text,
  promise     text,
  mechanism   text,
  offer       text,
  risk        text,
  risk_reason text,
  model       text,
  input_hash  text,
  updated_at  timestamptz not null default now()
);

-- Item 8: funil de modelagem
create table if not exists offer_notes (
  offer_key  text primary key,
  status     text check (status in ('favorita', 'analisando', 'modelando', 'testando', 'descartada')),
  note       text,
  updated_at timestamptz not null default now()
);

-- Item 7: alertas já enviados (para não repetir)
create table if not exists alerts_sent (
  offer_key text not null,
  kind      text not null,
  sent_at   timestamptz not null default now(),
  primary key (offer_key, kind)
);

alter table offer_aliases  enable row level security;
alter table landing_pages  enable row level security;
alter table offer_insights enable row level security;
alter table offer_notes    enable row level security;
alter table alerts_sent    enable row level security;

-- Item 6: bucket público de criativos (só imagens pequenas em webp)
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('criativos', 'criativos', true, 1048576, array['image/webp'])
    on conflict (id) do nothing;
  end if;
end $$;

-- Item 2: mais palavras-chave de resposta direta (dá para pausar qualquer uma no painel)
insert into keywords (term) values
  ('compre 3 leve 5'), ('leve 3 pague 2'), ('kit com'), ('garantia de 7 dias'), ('oferta relâmpago'),
  ('estoque limitado'), ('frete grátis para todo o brasil'), ('aprenda a'), ('curso completo'),
  ('método'), ('suplemento'), ('cápsulas'), ('dor nas costas'), ('diabetes'), ('ansiedade'),
  ('cachorro'), ('rugas'), ('manchas')
on conflict (term) do nothing;

-- Ranking com tudo junto: sinais + raio-X + IA + funil
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
  (select a.thumb_path from ads a where a.offer_key = l.offer_key and a.thumb_path is not null order by a.copies desc limit 1) as thumb_path,
  lp.platform, lp.checkout, lp.price_min, lp.price_max, lp.installments, lp.cod, lp.has_vsl, lp.pixels,
  i.niche, i.kind, i.audience, i.promise, i.mechanism, i.offer, i.risk, i.risk_reason,
  n.status, n.note,
  coalesce(n.status = 'descartada', false) as discarded
from latest l
left join week_ago w using (offer_key)
left join g on g.domain = l.domain
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
