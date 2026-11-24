// Testes contra as fatias publicadas no Hugging Face (precisa de rede). Uso: npm run test:ao-vivo
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarApp } from '../src/index.js';
import { criarLeitor } from '../src/dados.js';

const app = criarApp({ leitor: criarLeitor() });
async function chamar(name, args) {
  const r = await app.fetch(new Request('https://transformai.app.br/mcp/cnpj', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  }));
  const { result } = await r.json();
  assert.notEqual(result.isError, true, result.content?.[0]?.text);
  return result.structuredContent;
}

let ufTeste = 'MG';
let cnaeTeste = null;
let cnpjTeste = null;

test('procedência da versão publicada', async () => {
  const p = await chamar('procedencia', {});
  console.log('versão', p.versao, '| amostra', p.amostra, '| estabelecimentos', p.estabelecimentos, '| sem par IBGE', p.municipios_sem_correspondencia_ibge?.length);
  assert.ok(p.arquivos.length > 0 && p.arquivos.every((a) => /^[0-9a-f]{64}$/.test(a.sha256)));
});

test('buscar CNAE', async () => {
  const r = await chamar('buscar_cnae', { texto: 'atacadista de produtos siderúrgicos' });
  assert.ok(r.cnaes.some((c) => c.cnae === '4685100'), JSON.stringify(r.cnaes));
});

test('contar por município', async () => {
  // Na amostra só há parte dos estabelecimentos: escolhe a atividade com mais ativas em MG entre algumas comuns.
  for (const cnae of ['4781400', '4712100', '5611201', '4685100', '9602501']) {
    const r = await chamar('contar_estabelecimentos', { uf: ufTeste, cnae: [cnae], agrupar_por: 'municipio' });
    if (r.total > 0) {
      cnaeTeste = cnae;
      console.log(`CNAE ${cnae} em ${ufTeste}: ${r.total} ativas; maiores:`, r.grupos.slice(0, 3).map((g) => `${g.municipio} ${g.quantidade}`).join(', '));
      assert.ok(r.grupos.every((g) => g.municipio_ibge === null || /^\d{7}$/.test(g.municipio_ibge)));
      break;
    }
  }
  assert.ok(cnaeTeste, 'alguma atividade comum com estabelecimentos');
});

test('listar e consultar um CNPJ da lista', async () => {
  const r = await chamar('listar_estabelecimentos', { uf: ufTeste, cnae: [cnaeTeste], limite: 5 });
  assert.ok(r.estabelecimentos.length > 0);
  cnpjTeste = r.estabelecimentos[0].cnpj;
  console.log('lista:', r.total, 'ativas; primeira:', r.estabelecimentos[0].razao_social, r.estabelecimentos[0].municipio);
  const c = await chamar('consultar_cnpj', { cnpj: cnpjTeste });
  assert.equal(c.encontrado, true);
  assert.equal(c.estabelecimento.cnae_principal, cnaeTeste);
  assert.doesNotMatch(c.estabelecimento.razao_social, /\d{11}/, 'CPF mascarado');
});
