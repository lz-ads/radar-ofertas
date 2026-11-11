-- Migração 008: Pesquisa por nicho (ex.: "bet / cassino online").
-- O painel transforma o nicho em várias palavras de busca, o robô procura todas na Biblioteca da Meta
-- e junta os anúncios por anunciante. A IA escreve um raio-X do nicho com o que foi encontrado.
-- Pode rodar mais de uma vez sem problema.

alter table searches add column if not exists terms          text[];   -- palavras buscadas (só nicho)
alter table searches add column if not exists term_stats     jsonb;    -- [{term, total, ads, error}] por palavra
alter table searches add column if not exists analysis       text;     -- raio-X do nicho (markdown, IA)
alter table searches add column if not exists analysis_model text;
alter table searches add column if not exists analysis_at    timestamptz;

-- em quais palavras do nicho o anúncio apareceu
alter table search_ads add column if not exists terms text[];

create index if not exists searches_kind_idx on searches (kind, requested_at desc);
