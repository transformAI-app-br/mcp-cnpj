// Leitura das fatias publicadas em huggingface.co/datasets/transformai/cnpj (pasta servir/).
// Cada fatia é um bloco gzip dentro de um arquivo maior; lê-se só o pedaço necessário (HTTP Range).
import { ErroFonte } from './erros.js';

export const BASE = 'https://huggingface.co/datasets/transformai/cnpj/resolve/main/servir';
export const CONJUNTO = 'https://huggingface.co/datasets/transformai/cnpj';
const AGENTE = 'transformai-mcp-cnpj/0.1 (+https://transformai.app.br/)';

async function gunzip(buffer) {
  const fluxo = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(fluxo).text();
}

/**
 * @param {{fetch?: typeof fetch, cache?: Cache | null}} deps
 */
export function criarLeitor({ fetch: fetchFn = (...a) => fetch(...a), cache = null } = {}) {
  const memoria = new Map(); // JSONs pequenos já lidos neste isolate

  async function buscar(caminho, { faixa = null, ttl = 7 * 24 * 3600 } = {}) {
    const url = `${BASE}/${caminho}`;
    const chave = cache ? new Request(`https://cache.transformai.app.br/cnpj/${caminho}${faixa ? `?r=${faixa[0]}-${faixa[1]}` : ''}`) : null;
    if (chave) {
      const guardada = await cache.match(chave);
      if (guardada) return guardada.arrayBuffer();
    }
    const headers = { 'User-Agent': AGENTE };
    if (faixa) headers.Range = `bytes=${faixa[0]}-${faixa[0] + faixa[1] - 1}`;
    let r;
    try {
      r = await fetchFn(url, { headers });
    } catch (erro) {
      throw new ErroFonte(`Não foi possível ler os dados publicados: ${erro?.message ?? erro}`);
    }
    if (r.status === 404) return null;
    if (!r.ok) throw new ErroFonte(`O repositório de dados respondeu ${r.status} para ${caminho}.`);
    const corpo = await r.arrayBuffer();
    if (faixa && r.status !== 206 && corpo.byteLength !== faixa[1]) {
      throw new ErroFonte(`Leitura parcial não suportada para ${caminho}.`);
    }
    if (chave) await cache.put(chave, new Response(corpo, { headers: { 'Cache-Control': `public, max-age=${ttl}` } }));
    return corpo;
  }

  async function json(caminho, opcoes = {}) {
    const chave = `${caminho}`;
    if (memoria.has(chave)) return memoria.get(chave);
    const corpo = await buscar(caminho, opcoes);
    if (corpo === null) return null;
    const valor = JSON.parse(new TextDecoder().decode(corpo));
    if (!opcoes.semMemoria) memoria.set(chave, valor);
    return valor;
  }

  async function bloco(caminhoBin, faixa) {
    const corpo = await buscar(caminhoBin, { faixa });
    if (corpo === null) throw new ErroFonte(`Fatia ausente: ${caminhoBin}.`);
    return JSON.parse(await gunzip(corpo));
  }

  return {
    async versaoAtual() {
      const atual = await json('atual.json', { ttl: 600, semMemoria: true });
      if (!atual?.versao) throw new ErroFonte('Ainda não há versão processada publicada.');
      return atual.versao;
    },
    procedencia: (v) => json(`${v}/procedencia.json`),
    cnaes: (v) => json(`${v}/cnaes.json`),
    municipios: (v) => json(`${v}/municipios.json`),
    indiceContagem: (v, uf) => json(`${v}/contagem/${uf}.json`),
    blocoContagem: (v, uf, faixa) => bloco(`${v}/contagem/${uf}.bin`, faixa),
    indiceLista: (v, uf) => json(`${v}/lista/${uf}.json`),
    indiceListaCnae: (v, uf, faixa) => bloco(`${v}/lista/${uf}.idx.bin`, faixa),
    paginaLista: (v, uf, faixa) => bloco(`${v}/lista/${uf}.bin`, faixa),
    indiceCnpj: (v, p3) => json(`${v}/cnpj/${p3}.json`),
    blocoCnpj: (v, p3, faixa) => bloco(`${v}/cnpj/${p3}.bin`, faixa),
  };
}
