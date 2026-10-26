# Radar de Ofertas

Robô que minera, várias vezes por dia, as ofertas que estão escalando no Brasil. Ele guarda o histórico e mostra tudo num painel.

## Como funciona

| Parte | Onde roda | O que faz |
| --- | --- | --- |
| Robô coletor (`collector/`) | GitHub Actions, 3x ao dia (6h, 12h e 18h) | Busca cada palavra-chave na Biblioteca de Anúncios da Meta (Brasil, só anúncios ativos, mais vistos primeiro). Conta quantos anúncios cada site tem no Google e lê o ranking de empresas novas do Reclame Aqui. |
| Banco (`supabase/`) | Supabase | Guarda cada anúncio e uma "foto" diária de cada oferta, que é de onde sai o crescimento. |
| Painel (`web/`) | Vercel | Ranking com filtros, página de cada oferta com gráfico de evolução e lista de anúncios, gestão de palavras-chave. |

**Score de escala** = cópias do criativo + 2 × anúncios entre os mais vistos + 5 × páginas extras com a mesma oferta + bônus do Google (10 se tiver 100 ou mais anúncios, 5 se tiver 10 ou mais) + 2 × cópias novas na semana.

O crescimento semanal é o sinal mais forte. Uma oferta que passou de 5 para 40 cópias em 7 dias está vendendo.

---

## Passo 1: Supabase (banco)

1. Crie um projeto em supabase.com (região São Paulo).
2. Abra **SQL Editor**, cole todo o conteúdo de `supabase/schema.sql` e clique em **Run**.
3. Em **Project Settings → API**, copie:
   - **Project URL**, que será o `SUPABASE_URL`;
   - **service_role key**, que será o `SUPABASE_SERVICE_ROLE_KEY`. É a chave secreta; nunca coloque ela no navegador nem em código público.

## Passo 2: GitHub (robô)

1. Crie um repositório **privado** e suba esta pasta inteira.
2. Em **Settings → Secrets and variables → Actions → New repository secret**, crie `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`.
3. Rode a primeira coleta à mão: **Actions → Coletar ofertas → Run workflow**.
4. Depois disso, ela roda sozinha 3x por dia.

O plano grátis do GitHub cobre com folga: cada coleta leva de 10 a 15 minutos.

## Passo 3: Vercel (painel)

1. Em vercel.com, clique em **Add New → Project** e importe o repositório.
2. Em **Root Directory**, coloque `web`.
3. Em **Environment Variables**, adicione:
   - `SUPABASE_URL`;
   - `SUPABASE_SERVICE_ROLE_KEY`;
   - `DASHBOARD_PASSWORD`, a senha para entrar no painel. Qualquer usuário serve, só a senha é conferida.
4. Clique em **Deploy**.

---

## Testar no seu computador

```bash
cd collector
npm install
npx playwright install chromium
npm test                       # testes do leitor
HEADFUL=1 npm run collect:meta # abre o navegador; sem as variáveis do Supabase salva em ./out
```

## Ajustes

- **Palavras-chave e anunciantes ignorados:** pela página *Palavras-chave* do painel.
- **Profundidade:** a variável `META_SCROLLS` (padrão 6) controla quantos anúncios são lidos por busca. Cada rolagem lê de 10 a 15.
- **Horários:** mude o `cron` em `.github/workflows/coletar.yml`.

## Trocar pelo provedor pago depois

O robô usa a interface `MetaAdSource` (`collector/src/types.ts`). Para usar Apify, SearchAPI ou similar:

1. crie uma classe que implemente `searchKeyword(term)` devolvendo os mesmos campos;
2. troque `makeMetaSource()` em `collector/src/run.ts`.

O resto (banco, score, painel) não muda.

## Limitações conhecidas

- **Bloqueio da Meta.** A Meta pode pedir login para IPs de servidor como o GitHub Actions. Quando isso acontece, a coleta falha com uma mensagem clara e **não** sobrescreve os dados do dia. Se acontecer com frequência:
  - rode o coletor no seu computador com um agendador;
  - ou passe para o provedor pago.
- **Uso dos dados.** O robô lê páginas públicas, mas a raspagem automática vai contra os termos de uso da Meta. Use para pesquisa e para modelar estrutura de oferta, não para copiar criativos, textos ou marcas de terceiros.
- **Ofertas de saúde.** Muitas trazem promessas que derrubam conta de anúncios. Confira as alegações antes de modelar.
