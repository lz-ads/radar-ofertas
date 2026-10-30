-- Migração 006: TikTok (Top Ads da Central de Criativos + espionagem na biblioteca europeia).
-- Pode rodar mais de uma vez sem problema.

-- Anúncios em destaque da Central de Criativos do TikTok (só os que o anunciante autorizou mostrar)
create table if not exists tiktok_top_ads (
  id           text primary key,
  country      text not null,
  ad_title     text,
  brand_name   text,
  industry_key text,
  industry     text,
  objective    text,
  likes        int,
  ctr          numeric,          -- percentil de CTR (0,93 = top 7%)
  duration     numeric,
  cover_url    text,             -- link do TikTok (expira)
  video_url    text,             -- link do TikTok (expira)
  thumb_path   text,             -- capa guardada (bucket "criativos")
  media_path   text,             -- vídeo guardado (bucket "midia")
  media_bytes  bigint,
  best_rank    int,              -- melhor posição já vista na lista
  first_seen   timestamptz not null default now(),
  last_seen    timestamptz not null default now()
);
create index if not exists tiktok_top_ads_country_idx on tiktok_top_ads (country, last_seen desc);

-- Espionagem no TikTok: anúncios da biblioteca europeia (Reino Unido, Portugal e outros países da Europa)
create table if not exists tiktok_library_ads (
  id          text primary key,
  watch_id    bigint,
  country     text not null,
  advertiser  text,
  title       text,
  first_shown date,
  last_shown  date,
  audience    text,              -- "0-1K", "1K-10K"...
  cover_url   text,
  video_url   text,
  thumb_path  text,
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now()
);
create index if not exists tiktok_library_ads_watch_idx on tiktok_library_ads (watch_id, last_shown desc);

-- Total de anúncios do concorrente na biblioteca do TikTok, dia a dia
create table if not exists tiktok_watch_counts (
  watch_id bigint not null,
  day      date not null,
  total    int not null,
  primary key (watch_id, day)
);

alter table tiktok_top_ads      enable row level security;
alter table tiktok_library_ads  enable row level security;
alter table tiktok_watch_counts enable row level security;
