// Gera openapi.json a partir de ferramentas.json: a API REST e o MCP usam as mesmas definições.
import { readFileSync, writeFileSync } from 'node:fs';

const f = Object.fromEntries(JSON.parse(readFileSync(new URL('../ferramentas.json', import.meta.url), 'utf8')).map((t) => [t.name, t]));
const ref = (n) => ({ $ref: `#/components/schemas/${n}` });
const ok = (schema, d) => ({ description: d, content: { 'application/json': { schema } } });
const erros = { 400: { $ref: '#/components/responses/EntradaInvalida' }, 502: { $ref: '#/components/responses/FonteIndisponivel' } };
const versao = { name: 'versao', in: 'query', required: false, schema: f.procedencia.inputSchema.properties.versao };

const spec = {
  openapi: '3.1.0',
  info: {
    title: 'CNPJ (não oficial), por Transformaí',
    version: '0.1.0',
    summary: 'Dados abertos do CNPJ da Receita Federal, com a procedência de cada resposta.',
    description: 'Serviço não oficial, sem vínculo com a Receita Federal. Lê a base mensal tratada pela Transformaí e publicada em https://huggingface.co/datasets/transformai/cnpj (especificação TAI-BP-001). Sem dados de sócios, endereços ou contatos; CPF em razão social de titular único mascarado. As mesmas operações existem como ferramentas MCP em https://transformai.app.br/mcp/cnpj.',
    contact: { name: 'Transformaí', url: 'https://transformai.app.br/dados/' },
    license: { name: 'Apache-2.0 (código); dados CC BY 4.0, de origem da Receita Federal', identifier: 'Apache-2.0' },
  },
  externalDocs: { description: 'Especificação TAI-BP-001', url: 'https://transformai.app.br/blueprints/mapa-cadeia-cnpj' },
  servers: [{ url: 'https://transformai.app.br/api/v1/cnpj' }],
  tags: [{ name: 'Tabelas' }, { name: 'Consultas' }],
  paths: {
    '/cnaes': { get: { tags: ['Tabelas'], operationId: 'buscarCnae', summary: f.buscar_cnae.title, description: f.buscar_cnae.description,
      parameters: [{ name: 'texto', in: 'query', required: true, schema: f.buscar_cnae.inputSchema.properties.texto }], responses: { 200: ok({ type: 'object' }, 'Atividades encontradas'), ...erros } } },
    '/contagem': { post: { tags: ['Consultas'], operationId: 'contarEstabelecimentos', summary: f.contar_estabelecimentos.title, description: f.contar_estabelecimentos.description,
      requestBody: { required: true, content: { 'application/json': { schema: f.contar_estabelecimentos.inputSchema, examples: { aco_mg: { summary: 'Atacado de produtos siderúrgicos em MG, por município', value: { uf: 'MG', cnae: ['4685100'], agrupar_por: 'municipio' } } } } } },
      responses: { 200: ok({ type: 'object', properties: { versao: { type: 'string' }, total: { type: 'integer' }, grupos: { type: 'array', items: { type: 'object' } }, procedencia: ref('Procedencia') } }, 'Contagem e procedência'), ...erros } } },
    '/estabelecimentos': { post: { tags: ['Consultas'], operationId: 'listarEstabelecimentos', summary: f.listar_estabelecimentos.title, description: f.listar_estabelecimentos.description,
      requestBody: { required: true, content: { 'application/json': { schema: f.listar_estabelecimentos.inputSchema, examples: { bh: { summary: 'Atacado de produtos siderúrgicos em Belo Horizonte', value: { uf: 'MG', cnae: ['4685100'], municipio_ibge: '3106200', limite: 20 } } } } } },
      responses: { 200: ok({ type: 'object', properties: { total: { type: 'integer' }, pagina: { type: 'integer' }, paginas: { type: 'integer' }, estabelecimentos: { type: 'array', items: ref('Estabelecimento') }, procedencia: ref('Procedencia') } }, 'Estabelecimentos e procedência'), ...erros } } },
    '/{cnpj}': { get: { tags: ['Consultas'], operationId: 'consultarCnpj', summary: f.consultar_cnpj.title, description: f.consultar_cnpj.description,
      parameters: [{ name: 'cnpj', in: 'path', required: true, schema: { type: 'string' }, description: '14 caracteres, com ou sem pontuação (use %2F no lugar da barra)' }, versao],
      responses: { 200: ok({ type: 'object', properties: { encontrado: { type: 'boolean' }, estabelecimento: ref('Estabelecimento'), procedencia: ref('Procedencia') } }, 'Cadastro público'), ...erros } } },
    '/procedencia': { get: { tags: ['Tabelas'], operationId: 'procedencia', summary: f.procedencia.title, description: f.procedencia.description, parameters: [versao], responses: { 200: ok({ type: 'object' }, 'Procedência da versão'), ...erros } } },
    '/openapi.json': { get: { tags: ['Tabelas'], operationId: 'openapi', summary: 'Esta descrição', responses: { 200: ok({ type: 'object' }, 'OpenAPI 3.1') } } },
  },
  components: {
    responses: { EntradaInvalida: ok(ref('Erro'), 'Parâmetro inválido'), FonteIndisponivel: ok(ref('Erro'), 'Dados publicados indisponíveis') },
    schemas: {
      Erro: { type: 'object', required: ['erro'], properties: { erro: { type: 'string' } } },
      Estabelecimento: { type: 'object', properties: Object.fromEntries(['cnpj', 'razao_social', 'nome_fantasia', 'matriz_filial', 'situacao', 'data_situacao', 'inicio_atividade', 'cnae_principal', 'municipio_ibge', 'municipio', 'uf', 'porte', 'natureza_juridica'].map((k) => [k, { type: ['string', 'null'] }]).concat([['cnae_secundarios', { type: 'array', items: { type: 'string' } }], ['capital_social', { type: ['number', 'null'] }]])) },
      Procedencia: { type: 'object', properties: { fonte: { type: 'string' }, versao: { type: 'string' }, processado_em: { type: 'string', format: 'date-time' }, amostra: { type: 'boolean' },
        arquivos: { type: 'array', items: { type: 'object', properties: { arquivo: { type: 'string' }, bytes: { type: 'integer' }, sha256: { type: 'string' } } } },
        conjunto_de_dados: { type: 'string', format: 'uri' }, especificacao: { type: 'string', format: 'uri' } } },
    },
  },
};
writeFileSync(new URL('../openapi.json', import.meta.url), `${JSON.stringify(spec, null, 2)}\n`);
console.log('openapi.json gerado:', Object.keys(spec.paths).length, 'caminhos');
