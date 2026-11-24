// As cinco ferramentas do MCP de CNPJ, sobre as fatias publicadas no Hugging Face.
import definicoes from '../ferramentas.json' with { type: 'json' };
import { CONJUNTO } from './dados.js';
import { ErroEntrada, ErroFonte } from './erros.js';
import { validar } from './validacao.js';

export { definicoes };

const SITUACOES = ['nula', 'ativa', 'suspensa', 'inapta', 'baixada'];
const ESPECIFICACAO = 'https://transformai.app.br/blueprints/mapa-cadeia-cnpj';
const semAcento = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

async function versaoDe(args, leitor) {
  return args.versao ?? (await leitor.versaoAtual());
}

async function procedenciaResumo(leitor, versao) {
  const p = await leitor.procedencia(versao);
  if (!p) throw new ErroEntrada(`Versão não encontrada: ${versao}.`);
  return {
    fonte: p.fonte,
    versao: p.versao,
    processado_em: p.processado_em,
    amostra: p.amostra,
    arquivos: p.arquivos,
    conjunto_de_dados: CONJUNTO,
    especificacao: ESPECIFICACAO,
  };
}

const executores = {
  async buscar_cnae({ texto }, { leitor }) {
    const versao = await leitor.versaoAtual();
    const cnaes = (await leitor.cnaes(versao)) ?? [];
    const alvo = semAcento(texto).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
    const soDigitos = texto.replace(/\D/g, '');
    const achados = cnaes.filter((c) => {
      if (soDigitos.length >= 2 && c.codigo.startsWith(soDigitos)) return true;
      const d = semAcento(c.descricao);
      return alvo.every((p) => d.includes(p));
    });
    return { cnaes: achados.slice(0, 30).map((c) => ({ cnae: c.codigo, descricao: c.descricao })), total: achados.length, fonte: 'Receita Federal, tabela de CNAEs da publicação do CNPJ' };
  },

  async contar_estabelecimentos(args, { leitor }) {
    const versao = await versaoDe(args, leitor);
    const uf = args.uf.toUpperCase();
    const situacao = args.situacao ?? 'ativa';
    const s = SITUACOES.indexOf(situacao);
    const agrupar = args.agrupar_por ?? null;
    if ((agrupar === 'porte' || agrupar === 'ano_inicio') && (args.municipio_ibge || args.cnae_secundario)) {
      throw new ErroEntrada('Agrupar por porte ou ano de início vale para a UF inteira e para a atividade principal; tire municipio_ibge e cnae_secundario.');
    }
    const indice = await leitor.indiceContagem(versao, uf);
    if (!indice) throw new ErroEntrada(`UF sem dados nesta versão: ${uf}.`);
    const chaveMun = args.cnae_secundario ? 'municipio_secundario' : 'municipio';

    const grupos = new Map();
    const soma = (k, n) => grupos.set(k, (grupos.get(k) ?? 0) + n);
    for (const cnae of args.cnae) {
      const faixa = indice.cnae[cnae];
      if (!faixa) continue; // atividade sem estabelecimentos nesta UF
      const b = await leitor.blocoContagem(versao, uf, faixa);
      if (agrupar === 'porte' || agrupar === 'ano_inicio') {
        for (const [k, v] of Object.entries(b[agrupar] ?? {})) soma(k, v[s]);
        continue;
      }
      for (const [mun, v] of Object.entries(b[chaveMun] ?? {})) {
        if (args.municipio_ibge && mun !== args.municipio_ibge) continue;
        soma(agrupar === 'municipio' ? mun : agrupar === 'cnae' ? cnae : 'total', v[s]);
      }
    }

    let lista = [...grupos].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).map(([chave, quantidade]) => ({ chave, quantidade }));
    if (agrupar === 'municipio') {
      const nomes = (await leitor.municipios(versao)) ?? {};
      lista = lista.map((g) => ({ municipio_ibge: g.chave === 'sem_municipio' ? null : g.chave, municipio: nomes[g.chave]?.[0] ?? null, quantidade: g.quantidade }));
    } else if (agrupar === 'cnae') {
      lista = lista.map((g) => ({ cnae: g.chave, quantidade: g.quantidade }));
    } else if (agrupar) {
      lista = lista.map((g) => ({ [agrupar]: g.chave, quantidade: g.quantidade }));
    }
    const total = [...grupos.values()].reduce((a, b) => a + b, 0);
    const observacoes = [];
    if (args.cnae_secundario && args.cnae.length > 1) observacoes.push('Com atividade secundária e várias atividades, um estabelecimento pode ser contado em mais de uma delas.');
    return {
      versao, uf, situacao, total,
      ...(agrupar ? { agrupado_por: agrupar, grupos: lista } : {}),
      observacoes,
      procedencia: await procedenciaResumo(leitor, versao),
    };
  },

  async listar_estabelecimentos(args, { leitor }) {
    const versao = await versaoDe(args, leitor);
    const uf = args.uf.toUpperCase();
    const limite = args.limite ?? 20;
    const pagina = args.pagina ?? 1;
    const indice = await leitor.indiceLista(versao, uf);
    if (!indice) throw new ErroEntrada(`UF sem dados nesta versão: ${uf}.`);

    // Sequência virtual de páginas físicas (≤100 linhas), na ordem atividade → município.
    const sequencia = [];
    for (const cnae of args.cnae) {
      const faixa = indice.cnae[cnae];
      if (!faixa) continue;
      const ic = await leitor.indiceListaCnae(versao, uf, faixa);
      const municipios = args.municipio_ibge ? [[args.municipio_ibge, ic.municipio[args.municipio_ibge]]] : Object.entries(ic.municipio);
      for (const [, ref] of municipios) {
        if (!ref) continue;
        const [inicio, qtd, linhas] = ref;
        for (let k = 0; k < qtd; k += 1) sequencia.push({ faixa: ic.paginas[inicio + k], linhas: k < qtd - 1 ? 100 : linhas - 100 * (qtd - 1) });
      }
    }
    const total = sequencia.reduce((a, p) => a + p.linhas, 0);
    const de = (pagina - 1) * limite;
    const ate = Math.min(de + limite, total);
    const linhas = [];
    let pos = 0;
    for (const p of sequencia) {
      if (pos + p.linhas > de && pos < ate) {
        const rows = await leitor.paginaLista(versao, uf, p.faixa);
        for (let i = Math.max(0, de - pos); i < Math.min(p.linhas, ate - pos); i += 1) linhas.push(rows[i]);
      }
      pos += p.linhas;
      if (pos >= ate) break;
    }
    const nomes = linhas.length ? ((await leitor.municipios(versao)) ?? {}) : {};
    return {
      versao, uf, total, pagina, limite, paginas: Math.ceil(total / limite),
      estabelecimentos: linhas.map(([cnpj, razao_social, nome_fantasia, matriz_filial, inicio_atividade, municipio_ibge, porte]) => ({
        cnpj, razao_social, nome_fantasia, matriz_filial, inicio_atividade, municipio_ibge, municipio: nomes[municipio_ibge]?.[0] ?? null, porte,
      })),
      observacoes: ['Só estabelecimentos ativos, pela atividade principal. Sem dados de sócios, endereços ou contatos.'],
      procedencia: await procedenciaResumo(leitor, versao),
    };
  },

  async consultar_cnpj(args, { leitor }) {
    const cnpj = args.cnpj.toUpperCase().replace(/[^0-9A-Z]/g, '');
    if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(cnpj)) throw new ErroEntrada(`CNPJ inválido: ${args.cnpj}. São 12 caracteres (números ou letras) e 2 dígitos verificadores.`);
    const versao = await versaoDe(args, leitor);
    const indice = await leitor.indiceCnpj(versao, cnpj.slice(0, 3));
    const faixa = indice?.[cnpj.slice(0, 6)];
    const registro = faixa ? (await leitor.blocoCnpj(versao, cnpj.slice(0, 3), faixa))[cnpj] : undefined;
    const procedencia = await procedenciaResumo(leitor, versao);
    if (!registro) return { versao, cnpj, encontrado: false, procedencia };
    const nomes = (await leitor.municipios(versao)) ?? {};
    return { versao, cnpj, encontrado: true, estabelecimento: { cnpj, ...registro, municipio: nomes[registro.municipio_ibge]?.[0] ?? null }, procedencia };
  },

  async procedencia(args, { leitor }) {
    const versao = await versaoDe(args, leitor);
    const p = await leitor.procedencia(versao);
    if (!p) throw new ErroEntrada(`Versão não encontrada: ${versao}.`);
    return { ...p, conjunto_de_dados: CONJUNTO };
  },
};

export async function executar(nome, args, contexto) {
  const definicao = definicoes.find((d) => d.name === nome);
  if (!definicao) return { erro: `Ferramenta desconhecida: ${nome}.`, tipo: 'entrada' };
  try {
    const validos = validar(definicao.inputSchema, args ?? {});
    return { resultado: await executores[nome](validos, contexto) };
  } catch (erro) {
    if (erro instanceof ErroEntrada) return { erro: erro.message, tipo: 'entrada' };
    if (erro instanceof ErroFonte) return { erro: erro.message, tipo: 'fonte' };
    throw erro;
  }
}
