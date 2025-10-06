import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

// Schema para validação da requisição
const generateTagsSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório'),
  content: z.string().min(1, 'Conteúdo é obrigatório'),
  excerpt: z.string().optional(),
  category: z.string().optional(),
  existingTags: z.array(z.string()).optional(),
  language: z.string().default('pt-BR'),
  maxTags: z.number().min(1).max(20).default(8)
});

type GenerateTagsRequest = z.infer<typeof generateTagsSchema>;

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text: string;
      }>;
    };
    finishReason: string;
  }>;
}

interface TagSuggestion {
  name: string;
  confidence: number;
  reason: string;
}

interface GenerateTagsResponse {
  success: boolean;
  data?: {
    suggestedTags: TagSuggestion[];
    message: string;
  };
  message?: string;
}

export class TagAIController {
  private app: Hono;
  private env: any;

  constructor(env: any) {
    this.app = new Hono();
    this.env = env;
    this.setupRoutes();
  }

  private setupRoutes() {
    // Gerar tags usando IA
    this.app.post('/generate', zValidator('json', generateTagsSchema), async (c) => {
      try {
        const data = c.req.valid('json');
        console.log('🤖 [Tag AI] Gerando tags para:', data.title);

        const result = await this.generateTagsWithAI(data);

        return c.json({
          success: true,
          data: result,
        });

      } catch (error) {
        console.error('❌ [Tag AI] Erro ao gerar tags:', error);
        return c.json({
          success: false,
          error: error instanceof Error ? error.message : 'Erro interno do servidor',
        }, 500);
      }
    });
  }

  private async generateTagsWithAI(data: GenerateTagsRequest): Promise<{
    suggestedTags: TagSuggestion[];
    message: string;
  }> {
    const GEMINI_API_KEY = this.env.GEMINI_API_KEY;
    const GEMINI_ENDPOINT = this.env.GEMINI_ENDPOINT;

    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY não configurada');
    }

    if (!GEMINI_ENDPOINT) {
      throw new Error('GEMINI_ENDPOINT não configurado');
    }

    // Construir prompt para a IA
    const prompt = this.buildPrompt(data);
    console.log('📝 [Tag AI] Prompt construído:', prompt);

    // Preparar payload para Gemini
    const requestBody = {
      contents: [{
        parts: [{
          text: prompt
        }]
      }],
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 1024,
      },
      safetySettings: [
        {
          category: "HARM_CATEGORY_HARASSMENT",
          threshold: "BLOCK_MEDIUM_AND_ABOVE"
        },
        {
          category: "HARM_CATEGORY_HATE_SPEECH", 
          threshold: "BLOCK_MEDIUM_AND_ABOVE"
        },
        {
          category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
          threshold: "BLOCK_MEDIUM_AND_ABOVE"
        },
        {
          category: "HARM_CATEGORY_DANGEROUS_CONTENT",
          threshold: "BLOCK_MEDIUM_AND_ABOVE"
        }
      ]
    };

    console.log('🚀 [Tag AI] Enviando requisição para Gemini...');

    // Fazer chamada para API do Gemini
    const response = await fetch(`${GEMINI_ENDPOINT}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ [Tag AI] Erro na API do Gemini:', response.status, errorText);
      throw new Error(`Erro na API do Gemini: ${response.status} - ${errorText}`);
    }

    const geminiResponse: GeminiResponse = await response.json();
    console.log('✅ [Tag AI] Resposta recebida do Gemini:', geminiResponse);

    // Processar resposta
    if (!geminiResponse.candidates || geminiResponse.candidates.length === 0) {
      throw new Error('Nenhuma resposta válida da IA');
    }

    const aiResponse = geminiResponse.candidates[0].content.parts[0].text;
    console.log('🤖 [Tag AI] Resposta da IA:', aiResponse);

    // Parsear resposta JSON da IA
    const suggestedTags = this.parseAIResponse(aiResponse);

    return {
      suggestedTags,
      message: `Foram geradas ${suggestedTags.length} sugestões de tags baseadas no conteúdo do artigo.`
    };
  }

  private buildPrompt(data: GenerateTagsRequest): string {
    const { title, content, excerpt, category, existingTags, language, maxTags } = data;

    return `Você é um especialista em SEO e categorização de conteúdo. Sua tarefa é gerar tags relevantes para um artigo de notícias.

INFORMAÇÕES DO ARTIGO:
- Título: "${title}"
- Categoria: ${category || 'Não especificada'}
- Resumo: ${excerpt || 'Não fornecido'}
- Tags existentes: ${existingTags?.join(', ') || 'Nenhuma'}
- Idioma: ${language}
- Máximo de tags: ${maxTags}

CONTEÚDO DO ARTIGO:
${content}

INSTRUÇÕES:
1. Analise o título, conteúdo e contexto do artigo
2. Gere entre 5 e ${maxTags} tags relevantes e específicas
3. Evite tags muito genéricas (como "notícias", "atualidade")
4. Priorize tags que descrevam o assunto específico, localização, pessoas envolvidas, etc.
5. Considere palavras-chave que as pessoas usariam para buscar este conteúdo
6. Evite duplicar tags já existentes
7. Use apenas palavras em português brasileiro
8. Tags devem ser concisas (1-3 palavras)

FORMATO DE RESPOSTA (JSON):
{
  "tags": [
    {
      "name": "nome da tag",
      "confidence": 0.95,
      "reason": "explicação breve do porquê esta tag é relevante"
    }
  ]
}

Responda APENAS com o JSON, sem texto adicional.`;
  }

  private parseAIResponse(response: string): TagSuggestion[] {
    try {
      // Tentar extrair JSON da resposta
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Resposta da IA não contém JSON válido');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      
      if (!parsed.tags || !Array.isArray(parsed.tags)) {
        throw new Error('Formato de resposta inválido');
      }

      return parsed.tags.map((tag: any) => ({
        name: tag.name?.trim() || '',
        confidence: typeof tag.confidence === 'number' ? tag.confidence : 0.8,
        reason: tag.reason?.trim() || 'Tag relevante para o conteúdo'
      })).filter((tag: TagSuggestion) => tag.name.length > 0);

    } catch (error) {
      console.error('❌ [Tag AI] Erro ao processar resposta da IA:', error);
      
      // Fallback: tentar extrair tags simples da resposta
      const lines = response.split('\n').filter(line => line.trim());
      const fallbackTags: TagSuggestion[] = [];
      
      for (const line of lines) {
        const cleanLine = line.replace(/^[-•*]\s*/, '').trim();
        if (cleanLine.length > 0 && cleanLine.length < 50) {
          fallbackTags.push({
            name: cleanLine,
            confidence: 0.7,
            reason: 'Tag extraída da resposta da IA'
          });
        }
      }
      
      return fallbackTags.slice(0, 8);
    }
  }

  getApp(): Hono {
    return this.app;
  }
}
