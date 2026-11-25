# mcp-cnpj

Servidor MCP para consultar os **dados abertos do CNPJ da Receita Federal** a partir de assistentes de IA: Claude, ChatGPT e outros clientes do Model Context Protocol. Cada resposta traz a procedência (publicação da Receita e data do processamento) e aponta para o registro completo, com os arquivos de origem e seus SHA-256, para que qualquer número possa ser refeito por terceiros.

> **Serviço não oficial.** Mantido pela [Transformaí](https://transformai.app.br/), sem vínculo com a Receita Federal. A fonte é a publicação mensal de dados abertos do CNPJ.
>
> **No ar, versão 0.1.0.** Os dados vêm do conjunto [transformai/cnpj](https://huggingface.co/datasets/transformai/cnpj) no Hugging Face, atualizado todo mês.

- **Endereço:** `https://transformai.app.br/mcp/cnpj` (Streamable HTTP, sem autenticação)
- **API REST:** `https://transformai.app.br/api/v1/cnpj`, descrita em [`openapi.json`](openapi.json)
- **Base aberta:** [huggingface.co/datasets/transformai/cnpj](https://huggingface.co/datasets/transformai/cnpj), em Parquet por UF
- **Registro oficial MCP:** `br.app.transformai/cnpj` (ver [`server.json`](server.json))
- **Ferramentas:** [`ferramentas.json`](ferramentas.json)

## Conectar

**Claude Code**

```bash
claude mcp add --transport http cnpj https://transformai.app.br/mcp/cnpj
```

**Claude (app e web):** Configurações → Conectores → Adicionar conector personalizado → `https://transformai.app.br/mcp/cnpj`.

**Outros clientes:** qualquer cliente MCP com Streamable HTTP, no mesmo endereço.

## Ferramentas

Todas são só de leitura.

| MCP | REST | O que faz |
|---|---|---|
| `buscar_cnae` | `GET /cnaes?texto=` | códigos de atividade pela descrição |
| `contar_estabelecimentos` | `POST /contagem` | contagem por UF, atividade, município e situação; agrupa por município, atividade, porte ou ano de início |
| `listar_estabelecimentos` | `POST /estabelecimentos` | ativos pela atividade principal, em páginas de até 100 |
| `consultar_cnpj` | `GET /{cnpj}` | cadastro público de um estabelecimento, CNPJ numérico ou alfanumérico |
| `procedencia` | `GET /procedencia` | publicação da Receita, arquivos com SHA-256 e municípios que não casaram com o IBGE |

### Respostas resumidas por padrão

As respostas seguem descoberta progressiva, para não encher o contexto do assistente:

- **Por padrão** (`detalhe: "resumo"`): o total, os 10 maiores grupos (ou quantos pedir em `limite`), o restante somado em `outros` e a procedência em uma linha.
- **Quando o usuário pede tudo** (`detalhe: "completo"`): todos os grupos e a procedência com os arquivos de origem e seus SHA-256.

O total é sempre o mesmo nos dois modos. Exemplo real: torrefadoras de café ativas em MG (CNAE 1081302), por município, publicação 2026-11. O resumo tem 1,3 KB; a resposta completa, com os 314 municípios, tem 25 KB.

```json
{
  "total": 1069,
  "total_grupos": 314,
  "grupos": [
    { "municipio_ibge": "3170701", "municipio": "Varginha", "quantidade": 29 },
    { "municipio_ibge": "3148103", "municipio": "Patrocínio", "quantidade": 28 },
    "… 8 grupos"
  ],
  "outros": { "grupos": 304, "quantidade": 874 },
  "procedencia": {
    "fonte": "Receita Federal, dados abertos do CNPJ",
    "versao": "2026-11",
    "processado_em": "2026-11-25T00:21:20Z",
    "registro_completo": "https://huggingface.co/datasets/transformai/cnpj/resolve/main/servir/2026-11/procedencia.json"
  }
}
```

## Dados e privacidade

- **Campos:** só os cadastrais públicos de estabelecimento e empresa, como CNPJ, razão social, atividade, situação, datas, município (código IBGE), porte e capital social.
- **Sócios:** os dados de sócios ficam fora.
- **CPF:** em razões sociais de empresas de titular único, o CPF vem mascarado.
- **CNPJ:** sempre tratado como texto, porque desde julho de 2026 ele pode ser alfanumérico.
- **Município:** convertido do código da Receita para o código IBGE.
- **Atualização:** a cada publicação mensal da Receita. Versões anteriores continuam consultáveis pelo parâmetro `versao`.

## Como funciona

1. **Processamento mensal** (privado, GitHub Actions): baixa a publicação da Receita, confere o SHA-256 de cada arquivo, trata os dados com DuckDB e publica tudo no Hugging Face. A Receita recusa conexões vindas do GitHub, então o download passa por uma ponte no Cloudflare, na América do Sul. O processamento publica duas coisas:
   - a base aberta em Parquet, uma pasta por UF;
   - fatias pequenas e compactadas: contagens por UF e atividade, listas paginadas e blocos de consulta por CNPJ.
2. **Servidor** (este repositório, Cloudflare Worker): a cada pergunta, lê só a fatia necessária no Hugging Face, por leitura parcial (HTTP Range), e guarda em cache. Cabe no plano gratuito do Cloudflare (10 ms de CPU por chamada).

```
src/index.js        rotas /mcp/cnpj e /api/v1/cnpj
src/mcp.js          MCP sem estado sobre Streamable HTTP
src/rest.js         API REST com as mesmas ferramentas
src/ferramentas.js  as cinco ferramentas
src/dados.js        leitura das fatias no Hugging Face, com cache
ferramentas.json    definições das ferramentas (MCP e base do openapi.json)
```

```bash
npm test             # testes sem rede
npm run test:ao-vivo # testes contra os dados publicados
npm run deploy
```

## Registro oficial

1. Provar a posse do domínio `transformai.app.br` por DNS ou HTTP, como pede o [registro oficial](https://modelcontextprotocol.io/registry/about).
2. `mcp-publisher validate`.
3. `mcp-publisher publish`.

## Licença

Código sob [Apache-2.0](LICENSE). Os dados são da Receita Federal; cite a fonte.
