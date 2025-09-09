/**
 * Importa funções e tipos necessários
 */
import * as Sentry from "@sentry/cloudflare";
import { createApp } from './controllers';
import { Env } from './config/types/common';

/**
 * Cache singleton para a aplicação Hono
 * Evita recriação da aplicação e handlers a cada requisição
 */
let appInstance: ReturnType<typeof createApp> | null = null;

/**
 * Exporta o objeto principal que será usado como handler das requisições
 * Implementa a interface de Worker do Cloudflare
 */
export default Sentry.withSentry(
  (env: Env) => ({
    dsn: "https://e9aeeb776255639cf9f3520f68949f55@o4508854411591680.ingest.us.sentry.io/4508854413230080",
    tracesSampleRate: 1.0,
  }),
  {
    async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
      try {
        ctx.waitUntil(Promise.all([
          // Aqui se pode adicionar tarefas agendadas se necessário.
        ]));
      } catch (error) {
        Sentry.captureException(error);
        throw error;
      }
    },

    /**
     * Função fetch que processa todas as requisições HTTP recebidas
     * @param request Objeto Request contendo os detalhes da requisição
     * @param env Objeto com variáveis de ambiente e bindings do Worker
     * @param ctx Contexto de execução que permite controlar timeouts e eventos
     * @returns Promise com a resposta HTTP processada
     */
    fetch: async (request: Request, env: Env, ctx: ExecutionContext) => {
      try {
        // Usa singleton pattern para evitar múltiplas inicializações
        if (!appInstance) {
          appInstance = createApp(env);
        }
        return appInstance.fetch(request, env, ctx);
      } catch (error) {
        Sentry.captureException(error);
        return new Response('Erro interno do servidor', { status: 500 });
      }
    }
  } satisfies ExportedHandler<Env>,
);
