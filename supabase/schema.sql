-- Radar de Ofertas — schema do Supabase
-- Rode este arquivo inteiro no SQL Editor do Supabase (uma vez).

-- Palavras-chave que o robô pesquisa na Biblioteca de Anúncios da Meta
create table if not exists keywords (
  id          bigserial primary key,
  term        text not null unique,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

insert into keywords (term) values
  ('frete grátis'), ('pagamento na entrega'), ('acesso imediato'), ('compre 2 leve 3'),
  ('renda extra'), ('emagrecer'), ('pague depois'), ('últimas unidades'),
  ('garantia de 30 dias'), ('comente eu quero'), ('colágeno'), ('receitas'),
  ('menopausa'), ('dores'), ('queda de cabelo')
on conflict (term) do nothing;

-- Anunciantes que não são ofertas modeláveis (marketplaces, grandes marcas)
create table if not exists ignored_advertisers (
  name text primary key
);

insert into ignored_advertisers (name) values
  ('Shopee'), ('Mercado Livre'), ('AliExpress'), ('InfinitePay'), ('O Boticário'),
  ('Natura'), ('Eudora'), ('Amazon.com.br'), ('Magazine Luiza'), ('SHEIN Brasil'),
  ('TikTok - LATAM'), ('TikTok Global'), ('Uber'), ('iFood para Entregadores'),
  ('Lalamove'), ('Vou de 99'), ('Sou Motorista 99'), ('Amazon Flex'), ('Inter'),
  ('Mercado Pago'), ('PicPay'), ('Ton'), ('Petlove'), ('L''Oréal Paris')
on conflict (name) do nothing;

-- Cada anúncio visto (um registro por ID da biblioteca)
create table if not exists ads (
  library_id   text primary key,
  offer_key    text not null,
  advertiser   text not null,
  domain       text,
  body         text,
  start_date   date,
  copies       int  not null default 1,
  keywords     text[] not null default '{}',
  first_seen   timestamptz not null default now(),
  last_seen    timestamptz not null default now()
);
create index if not exists ads_offer_key_idx on ads (offer_key);

-- Foto diária de cada oferta (é daqui que sai o crescimento)
create table if not exists offer_snapshots (
  day           date not null,
  offer_key     text not null,
  advertiser    text not null,
  advertisers   text[] not null default '{}',
  domain        text,
  cards         int  not null,          -- anúncios entre os mais vistos
  copies        int  not null,          -- soma de "X anúncios usam esse criativo"
  pages         int  not null default 1,-- páginas diferentes rodando a oferta
  oldest_start  date,
  keywords      text[] not null default '{}',
  sample_text   text,
  primary key (day, offer_key)
);
create index if not exists offer_snapshots_key_idx on offer_snapshots (offer_key, day desc);

-- Quantidade de anúncios no Centro de Transparência do Google (por domínio)
create table if not exists google_counts (
  domain   text not null,
  day      date not null,
  ads      int  not null,
  primary key (domain, day)
);

-- Ranking "recém-cadastradas com mais reclamações" do Reclame Aqui
create table if not exists ra_new_companies (
  day         date not null,
  position    int  not null,
  name        text not null,
  slug        text,
  reputation  text,
  complaints  int  not null,
  primary key (day, name)
);

-- Registro de cada execução do robô
create table if not exists runs (
  id          bigserial primary key,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  source      text not null,
  ok          boolean,
  items       int,
  message     text
);

-- Ranking: última foto de cada oferta + crescimento contra ~7 dias atrás + Google
create or replace view offer_ranking as
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
  ) as score
from latest l
left join week_ago w using (offer_key)
left join g on g.domain = l.domain;

-- Segurança: só o service role (robô e painel no servidor) acessa as tabelas
alter table keywords            enable row level security;
alter table ignored_advertisers enable row level security;
alter table ads                 enable row level security;
alter table offer_snapshots     enable row level security;
alter table google_counts       enable row level security;
alter table ra_new_companies    enable row level security;
alter table runs                enable row level security;
