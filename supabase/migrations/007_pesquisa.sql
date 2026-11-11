-- Migração 007: Pesquisar (busca sob demanda por palavra ou site na Biblioteca da Meta).
-- Pode rodar mais de uma vez sem problema.

-- Cada pesquisa pedida pelo painel
create table if not exists searches (
  id            bigint generated always as identity primary key,
  term          text not null,
  kind          text not null default 'palavra',  -- palavra | site | nicho
  match         text not null default 'exata',    -- exata | qualquer (só para palavra)
  country       text not null default 'BR',
  status        text not null default 'pendente', -- pendente | rodando | pronta | erro
  total_results text,                             -- o que a Meta mostra ("~6.900 resultados")
  ads_found     int,
  offers_found  int,
  google_ads    int,                              -- só para site: anúncios no Google (Centro de Transparência)
  message       text,
  requested_at  timestamptz not null default now(),
  started_at    timestamptz,
  finished_at   timestamptz
);
create index if not exists searches_requested_idx on searches (requested_at desc);
create index if not exists searches_status_idx on searches (status);

-- Anúncios ativos encontrados em cada pesquisa (separados do ranking: não mexem no score)
create table if not exists search_ads (
  search_id   bigint not null references searches (id) on delete cascade,
  library_id  text not null,
  position    int not null default 0,     -- ordem da Meta (mais vistos primeiro)
  offer_key   text not null,
  advertiser  text not null,
  domain      text,
  body        text,
  start_date  date,
  copies      int not null default 1,
  cta         text,
  dest_type   text,
  page_url    text,
  landing_url text,
  thumb_url   text,                       -- link do Facebook (expira em alguns dias)
  thumb_path  text,                       -- imagem guardada (bucket "criativos", pasta busca/)
  media_type  text,
  site_match  boolean,                    -- busca por site: o anúncio leva para o site pesquisado
  primary key (search_id, library_id)
);

alter table searches   enable row level security;
alter table search_ads enable row level security;
