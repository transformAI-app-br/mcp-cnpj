# mcp-cnpj

Servidor MCP para consultar os **dados abertos do CNPJ da Receita Federal** a partir de assistentes de IA: Claude, ChatGPT e outros clientes do Model Context Protocol. Cada resposta traz a procedência, com a publicação da Receita usada e os arquivos de origem e seus SHA-256, para que qualquer número possa ser refeito por terceiros.

> **Serviço não oficial.** Mantido pela [Transformaí](https://transformai.app.br/), sem vínculo com a Receita Federal. A fonte é a publicação mensal de dados abertos do CNPJ.
>
> **Rascunho.** O servidor ainda não está no ar. Ele depende do processamento mensal da base do CNPJ, que ainda está sendo montado. Por enquanto, este repositório publica a interface proposta (ferramentas e registro). O [MCP do Comex Stat](https://github.com/transformAI-app-br/mcp-comexstat), da mesma família, já está no ar.

- **Endereço:** `https://transformai.app.br/mcp/cnpj` (Streamable HTTP, sem autenticação)
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

| Ferramenta | Entrada | Retorno |
|---|---|---|
| `buscar_cnae` | `texto` | códigos CNAE e descrições |
| `contar_estabelecimentos` | `uf`, `cnae`, `municipio_ibge?`, `situacao?`, `agrupar_por?`, `versao?` | contagens, com procedência |
| `listar_estabelecimentos` | `uf`, `cnae`, `municipio_ibge?`, `situacao?`, `limite?`, `pagina?`, `versao?` | campos cadastrais públicos, com procedência |
| `consultar_cnpj` | `cnpj`, `versao?` | cadastro público do estabelecimento, com procedência |
| `procedencia` | `versao?` | publicação, arquivos e SHA-256, data do processamento |

Toda resposta inclui o bloco `procedencia`:

```json
{
  "procedencia": {
    "fonte": "Receita Federal, dados abertos do CNPJ",
    "versao": "AAAA-MM",
    "processado_em": "AAAA-MM-DDThh:mm:ssZ",
    "arquivos": [{ "arquivo": "Estabelecimentos", "sha256": "…" }],
    "especificacao": "https://transformai.app.br/blueprints/mapa-cadeia-cnpj"
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

O servidor roda num Cloudflare Worker. A base processada fica em arquivos Parquet no Cloudflare R2, divididos por UF e atividade, e cada consulta lê só o pedaço de que precisa. O catálogo de versões e a procedência ficam no Cloudflare D1. Como o processamento é feito está descrito na especificação publicada em transformai.app.br.

## Registro oficial

1. Provar a posse do domínio `transformai.app.br` por DNS ou HTTP, como pede o [registro oficial](https://modelcontextprotocol.io/registry/about).
2. `mcp-publisher validate`.
3. `mcp-publisher publish`.

## Licença

Código sob [Apache-2.0](LICENSE). Os dados são da Receita Federal; cite a fonte.
