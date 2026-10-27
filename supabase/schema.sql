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
  page_url     text,          -- página do anunciante no Facebook
  landing_url  text,          -- página de destino, sem parâmetros de rastreio
  thumb_url    text,          -- imagem do criativo (o link do Facebook expira em alguns dias)
  media_type   text,          -- image | video
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
  landing_url   text,
  page_url      text,
  thumb_url     text,
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

-- Atualização de instalações antigas (sem efeito em instalação nova)
alter table ads             add column if not exists page_url    text;
alter table ads             add column if not exists landing_url text;
alter table ads             add column if not exists thumb_url   text;
alter table ads             add column if not exists media_type  text;
alter table offer_snapshots add column if not exists landing_url text;
alter table offer_snapshots add column if not exists page_url    text;
alter table offer_snapshots add column if not exists thumb_url   text;

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

-- Segurança: só o service role (robô e painel no servidor) acessa as tabelas
alter table keywords            enable row level security;
alter table ignored_advertisers enable row level security;
alter table ads                 enable row level security;
alter table offer_snapshots     enable row level security;
alter table google_counts       enable row level security;
alter table ra_new_companies    enable row level security;
alter table runs                enable row level security;
