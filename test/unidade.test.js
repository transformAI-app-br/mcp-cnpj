// Testes sem rede: o leitor das fatias é falso, no mesmo formato que o processamento grava. Uso: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarApp } from '../src/index.js';

const V = '2026-11';
const ativa = (n) => [0, n, 0, 0, 0];
const pag = (i) => [i * 1000, 10]; // faixa falsa: o índice da página vira o "início"

function leitorFalso() {
  const chamadas = [];
  // Lista: CNAE 4685100 em MG tem 150 ativas em BH (2 páginas: 100 + 50) e 3 em Contagem (1 página).
  const paginas = {
    0: Array.from({ length: 100 }, (_, i) => [`0000000${String(i).padStart(3, '0')}0001`.slice(0, 12) + '00', `Empresa BH ${i}`, null, 'matriz', '2010-01-01', '3106200', 'micro']),
    1: Array.from({ length: 50 }, (_, i) => [`1000000${String(i).padStart(3, '0')}0001`.slice(0, 12) + '00', `Empresa BH ${100 + i}`, null, 'filial', '2015-01-01', '3106200', 'demais']),
    2: Array.from({ length: 3 }, (_, i) => [`2000000${i}00010001`.slice(0, 14), `Empresa Contagem ${i}`, 'Fantasia', 'matriz', '2020-01-01', '3118601', 'pequeno_porte']),
  };
  return {
    chamadas,
    async versaoAtual() { return V; },
    async procedencia(v) { return v === V ? { fonte: 'Receita Federal, dados abertos do CNPJ', versao: V, processado_em: '2026-11-20T10:00:00Z', amostra: false, arquivos: [{ arquivo: 'Estabelecimentos0.zip', bytes: 1, sha256: 'abc' }] } : null; },
    async cnaes() { return [{ codigo: '4685100', descricao: 'Comércio atacadista de produtos siderúrgicos e metalúrgicos, exceto para construção' }, { codigo: '4672900', descricao: 'Comércio atacadista de ferragens e ferramentas' }, { codigo: '0111301', descricao: 'Cultivo de arroz' }]; },
    async municipios() { return { 3106200: ['Belo Horizonte', 'MG'], 3118601: ['Contagem', 'MG'] }; },
    async indiceContagem(v, uf) { return uf === 'MG' ? { ordem_situacoes: ['nula', 'ativa', 'suspensa', 'inapta', 'baixada'], cnae: { 4685100: [0, 10], 4672900: [10, 10] } } : null; },
    async blocoContagem(v, uf, faixa) {
      chamadas.push(['contagem', faixa]);
      if (faixa[0] === 0) return { municipio: { 3106200: [0, 150, 1, 2, 30], 3118601: ativa(3) }, municipio_secundario: { 3106200: ativa(170), 3118601: ativa(5) }, porte: { micro: ativa(100), demais: ativa(53) }, ano_inicio: { 2010: ativa(100), 2015: ativa(50), 2020: ativa(3) } };
      return { municipio: { 3106200: ativa(40) }, municipio_secundario: { 3106200: ativa(45) }, porte: { micro: ativa(40) }, ano_inicio: { 2018: ativa(40) } };
    },
    async indiceLista(v, uf) { return uf === 'MG' ? { cnae: { 4685100: [0, 10] } } : null; },
    async indiceListaCnae() { return { paginas: [pag(0), pag(1), pag(2)], municipio: { 3106200: [0, 2, 150], 3118601: [2, 1, 3] }, total: 153 }; },
    async paginaLista(v, uf, faixa) { chamadas.push(['pagina', faixa[0] / 1000]); return paginas[faixa[0] / 1000]; },
    async indiceCnpj(v, p3) { return { 123: { 123456: [0, 10] }, '12A': { '12ABC3': [0, 10] } }[p3] ?? {}; },
    async blocoCnpj() { return { 12345678000195: { razao_social: 'ACME LTDA', situacao: 'ativa', cnae_principal: '4685100', municipio_ibge: '3106200', uf: 'MG' }, '12ABC345000184': { razao_social: 'NOVA ALFA', situacao: 'ativa', municipio_ibge: '3118601', uf: 'MG' } }; },
  };
}

async function chamar(app, name, args) {
  const r = await app.fetch(new Request('https://transformai.app.br/mcp/cnpj', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  }));
  return (await r.json()).result;
}

test('MCP: initialize e as cinco ferramentas', async () => {
  const app = criarApp({ leitor: leitorFalso() });
  const r = await app.fetch(new Request('https://transformai.app.br/mcp/cnpj', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }) }));
  const ini = (await r.json()).result;
  assert.equal(ini.serverInfo.name, 'transformai-cnpj');
  const lista = await app.fetch(new Request('https://transformai.app.br/mcp/cnpj', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) }));
  assert.deepEqual((await lista.json()).result.tools.map((t) => t.name), ['buscar_cnae', 'contar_estabelecimentos', 'listar_estabelecimentos', 'consultar_cnpj', 'procedencia']);
});

test('buscar_cnae: por palavras sem acento e por código', async () => {
  const app = criarApp({ leitor: leitorFalso() });
  assert.deepEqual((await chamar(app, 'buscar_cnae', { texto: 'atacado siderurgicos' })).structuredContent.cnaes.map((c) => c.cnae), []);
  assert.deepEqual((await chamar(app, 'buscar_cnae', { texto: 'atacadista siderúrgicos' })).structuredContent.cnaes.map((c) => c.cnae), ['4685100']);
  assert.deepEqual((await chamar(app, 'buscar_cnae', { texto: '4672' })).structuredContent.cnaes.map((c) => c.cnae), ['4672900']);
});

test('contar: total, por município (com nome), por atividade, secundária e situação', async () => {
  const app = criarApp({ leitor: leitorFalso() });
  const total = (await chamar(app, 'contar_estabelecimentos', { uf: 'MG', cnae: ['4685100'] })).structuredContent;
  assert.equal(total.total, 153);
  assert.equal(total.procedencia.versao, V);
  const mun = (await chamar(app, 'contar_estabelecimentos', { uf: 'mg', cnae: ['4685100', '4672900'], agrupar_por: 'municipio' })).structuredContent;
  assert.deepEqual(mun.grupos, [{ municipio_ibge: '3106200', municipio: 'Belo Horizonte', quantidade: 190 }, { municipio_ibge: '3118601', municipio: 'Contagem', quantidade: 3 }]);
  const porCnae = (await chamar(app, 'contar_estabelecimentos', { uf: 'MG', cnae: ['4685100', '4672900'], agrupar_por: 'cnae', municipio_ibge: '3106200' })).structuredContent;
  assert.deepEqual(porCnae.grupos, [{ cnae: '4685100', quantidade: 150 }, { cnae: '4672900', quantidade: 40 }]);
  const sec = (await chamar(app, 'contar_estabelecimentos', { uf: 'MG', cnae: ['4685100', '4672900'], cnae_secundario: true })).structuredContent;
  assert.equal(sec.total, 220);
  assert.match(sec.observacoes[0], /mais de uma/);
  const baixadas = (await chamar(app, 'contar_estabelecimentos', { uf: 'MG', cnae: ['4685100'], situacao: 'baixada' })).structuredContent;
  assert.equal(baixadas.total, 30);
  const porte = (await chamar(app, 'contar_estabelecimentos', { uf: 'MG', cnae: ['4685100'], agrupar_por: 'porte' })).structuredContent;
  assert.deepEqual(porte.grupos, [{ porte: 'micro', quantidade: 100 }, { porte: 'demais', quantidade: 53 }]);
  const ruim = await chamar(app, 'contar_estabelecimentos', { uf: 'MG', cnae: ['4685100'], agrupar_por: 'porte', municipio_ibge: '3106200' });
  assert.equal(ruim.isError, true);
});

test('listar: paginação atravessa páginas físicas e filtra município, lendo só o necessário', async () => {
  const leitor = leitorFalso();
  const app = criarApp({ leitor });
  const p1 = (await chamar(app, 'listar_estabelecimentos', { uf: 'MG', cnae: ['4685100'], limite: 30, pagina: 4 })).structuredContent;
  assert.equal(p1.total, 153);
  assert.equal(p1.paginas, 6);
  assert.deepEqual(p1.estabelecimentos.map((e) => e.razao_social).slice(0, 2), ['Empresa BH 90', 'Empresa BH 91']);
  assert.equal(p1.estabelecimentos.at(-1).razao_social, 'Empresa BH 119');
  assert.deepEqual(leitor.chamadas.filter((c) => c[0] === 'pagina').map((c) => c[1]), [0, 1], 'só as duas páginas físicas tocadas');
  const cont = (await chamar(app, 'listar_estabelecimentos', { uf: 'MG', cnae: ['4685100'], municipio_ibge: '3118601' })).structuredContent;
  assert.equal(cont.total, 3);
  assert.equal(cont.estabelecimentos[0].municipio, 'Contagem');
  assert.equal(cont.estabelecimentos[0].nome_fantasia, 'Fantasia');
  const fim = (await chamar(app, 'listar_estabelecimentos', { uf: 'MG', cnae: ['4685100'], limite: 100, pagina: 2 })).structuredContent;
  assert.equal(fim.estabelecimentos.length, 53);
});

test('consultar_cnpj: com pontuação, alfanumérico, inexistente e inválido', async () => {
  const app = criarApp({ leitor: leitorFalso() });
  const a = (await chamar(app, 'consultar_cnpj', { cnpj: '12.345.678/0001-95' })).structuredContent;
  assert.equal(a.encontrado, true);
  assert.equal(a.estabelecimento.razao_social, 'ACME LTDA');
  assert.equal(a.estabelecimento.municipio, 'Belo Horizonte');
  const alfa = (await chamar(app, 'consultar_cnpj', { cnpj: '12.ABC.345/0001-84' })).structuredContent;
  assert.equal(alfa.estabelecimento.razao_social, 'NOVA ALFA');
  assert.equal((await chamar(app, 'consultar_cnpj', { cnpj: '99999999000199' })).structuredContent.encontrado, false);
  assert.equal((await chamar(app, 'consultar_cnpj', { cnpj: '12345' })).isError, true);
});

test('descoberta progressiva: resumo por padrão, completo quando pedido', async () => {
  const app = criarApp({ leitor: leitorFalso() });
  const resumo = (await chamar(app, 'contar_estabelecimentos', { uf: 'MG', cnae: ['4685100', '4672900'], agrupar_por: 'municipio', limite: 1 })).structuredContent;
  assert.equal(resumo.total, 193, 'o total não muda com o resumo');
  assert.equal(resumo.total_grupos, 2);
  assert.deepEqual(resumo.grupos, [{ municipio_ibge: '3106200', municipio: 'Belo Horizonte', quantidade: 190 }]);
  assert.deepEqual(resumo.outros, { grupos: 1, quantidade: 3 });
  assert.match(resumo.aviso, /completo/);
  assert.equal(resumo.procedencia.arquivos, undefined, 'procedência em uma linha');
  assert.match(resumo.procedencia.registro_completo, /servir\/2026-11\/procedencia\.json$/);
  const tudo = (await chamar(app, 'contar_estabelecimentos', { uf: 'MG', cnae: ['4685100', '4672900'], agrupar_por: 'municipio', limite: 1, detalhe: 'completo' })).structuredContent;
  assert.equal(tudo.grupos.length, 2);
  assert.equal(tudo.outros, undefined);
  assert.equal(tudo.procedencia.arquivos[0].sha256, 'abc');
  const p = (await chamar(app, 'procedencia', {})).structuredContent;
  assert.deepEqual(p.arquivos, { quantidade: 1, bytes: 1 });
  assert.equal((await chamar(app, 'procedencia', { detalhe: 'completo' })).structuredContent.arquivos[0].arquivo, 'Estabelecimentos0.zip');
  const um = (await chamar(app, 'consultar_cnpj', { cnpj: '12345678000195' })).structuredContent;
  assert.equal(um.procedencia.arquivos, undefined);
  const lista = (await chamar(app, 'listar_estabelecimentos', { uf: 'MG', cnae: ['4685100'] })).structuredContent;
  assert.equal(lista.estabelecimentos.length, 10, 'página padrão de 10');
  const rest = await app.fetch(new Request('https://transformai.app.br/api/v1/cnpj/procedencia?detalhe=completo'));
  assert.equal((await rest.json()).arquivos[0].sha256, 'abc');
});

test('REST: rotas, CNPJ no caminho e OpenAPI', async () => {
  const app = criarApp({ leitor: leitorFalso() });
  const c = await app.fetch(new Request('https://transformai.app.br/api/v1/cnpj/contagem', { method: 'POST', body: JSON.stringify({ uf: 'MG', cnae: ['4685100'] }) }));
  assert.equal((await c.json()).total, 153);
  const um = await app.fetch(new Request('https://transformai.app.br/api/v1/cnpj/12345678000195'));
  assert.equal((await um.json()).estabelecimento.razao_social, 'ACME LTDA');
  const busca = await app.fetch(new Request('https://transformai.app.br/api/v1/cnpj/cnaes?texto=ferragens'));
  assert.equal((await busca.json()).cnaes[0].cnae, '4672900');
  const spec = await app.fetch(new Request('https://transformai.app.br/api/v1/cnpj/openapi.json'));
  assert.equal((await spec.json()).openapi, '3.1.0');
  const getEst = await app.fetch(new Request('https://transformai.app.br/api/v1/cnpj/estabelecimentos'));
  assert.equal(getEst.status, 404, 'GET /estabelecimentos não vira consulta de CNPJ');
  const ruim = await app.fetch(new Request('https://transformai.app.br/api/v1/cnpj/contagem', { method: 'POST', body: JSON.stringify({ uf: 'MG' }) }));
  assert.equal(ruim.status, 400);
});
