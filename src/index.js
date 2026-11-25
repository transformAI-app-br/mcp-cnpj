// Worker do MCP e da API do CNPJ: cnpj @ transformAI.app.br.
//   /mcp/cnpj          servidor MCP (Streamable HTTP, sem estado)
//   /api/v1/cnpj/...   API REST com as mesmas ferramentas (OpenAPI em /api/v1/cnpj/openapi.json)
// Dados: huggingface.co/datasets/transformai/cnpj (pasta servir/), lidos por partes e guardados em cache.
import { criarLeitor } from './dados.js';
import { tratarMcp } from './mcp.js';
import { tratarRest } from './rest.js';

export function criarApp(deps = {}) {
  return {
    async fetch(req) {
      const url = new URL(req.url);
      const leitor = deps.leitor ?? criarLeitor({ cache: typeof caches !== 'undefined' ? caches.default : null });
      const contexto = { leitor };
      if (url.pathname === '/mcp/cnpj' || url.pathname === '/mcp/cnpj/') return tratarMcp(req, contexto);
      if (url.pathname.startsWith('/api/v1/cnpj')) return tratarRest(req, contexto);
      return new Response('Não encontrado', { status: 404 });
    },
  };
}

export default criarApp();
