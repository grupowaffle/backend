import { Hono } from 'hono';
import { z } from 'zod';

// Schema para validação da requisição
const generateSEOSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório'),
  content: z.string().min(1, 'Conteúdo é obrigatório'),
  excerpt: z.string().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  targetAudience: z.string().optional(),
  language: z.string().default('pt-BR')
});

type GenerateSEORequest = z.infer<typeof generateSEOSchema>;

interface GeminiResponse {
  candidates: Array<{
    content: {
      parts: Array<{
        text: string;
      }>;
    };
  }>;
}

interface SEOResult {
  seoTitle: string;
  seoDescription: string;
  seoKeywords: string[];
  suggestions: string[];
}

export class SEOController {
  private app: Hono;
  private env: any;

  constructor(env: any) {
    this.app = new Hono();
    this.env = env;
    this.setupRoutes();
  }

  private setupRoutes() {
    // POST /seo/generate - Gerar SEO usando IA
    this.app.post('/generate', async (c) => {
      try {
        console.log('🤖 [SEO AI] Iniciando geração de SEO...');
        
        const body = await c.req.json();
        console.log('📝 [SEO AI] Dados recebidos:', body);

        // Validar dados de entrada
        const validatedData = generateSEOSchema.parse(body);
        console.log('✅ [SEO AI] Dados validados:', validatedData);

        // Gerar SEO usando Gemini AI
        const seoResult = await this.generateSEOWithAI(validatedData);
        console.log('🎯 [SEO AI] SEO gerado:', seoResult);

        return c.json({
          success: true,
          data: seoResult
        });

      } catch (error) {
        console.error('❌ [SEO AI] Erro ao gerar SEO:', error);
        
        if (error instanceof z.ZodError) {
          return c.json({
            success: false,
            message: 'Dados inválidos',
            errors: error.errors
          }, 400);
        }

        return c.json({
          success: false,
          message: error instanceof Error ? error.message : 'Erro interno do servidor'
        }, 500);
      }
    });
  }

  private async generateSEOWithAI(data: GenerateSEORequest): Promise<SEOResult> {
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
    console.log('📝 [SEO AI] Prompt construído:', prompt);

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

    console.log('🚀 [SEO AI] Enviando requisição para Gemini...');

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
      console.error('❌ [SEO AI] Erro na API do Gemini:', response.status, errorText);
      throw new Error(`Erro na API do Gemini: ${response.status} - ${errorText}`);
    }

    const geminiResponse: GeminiResponse = await response.json();
    console.log('✅ [SEO AI] Resposta do Gemini recebida:', geminiResponse);

    // Extrair e processar resposta
    if (!geminiResponse.candidates || geminiResponse.candidates.length === 0) {
      throw new Error('Nenhuma resposta válida da IA');
    }

    const aiText = geminiResponse.candidates[0].content.parts[0].text;
    console.log('📄 [SEO AI] Texto da IA:', aiText);

    // Parsear resposta estruturada da IA
    const seoResult = this.parseAIResponse(aiText);
    console.log('🎯 [SEO AI] SEO parseado:', seoResult);

    return seoResult;
  }

  private buildPrompt(data: GenerateSEORequest): string {
    const { title, content, excerpt, category, tags, targetAudience, language } = data;

    // Extrair primeiras palavras do conteúdo para contexto
    const contentPreview = content.substring(0, 500);

    return `
Você é um especialista em SEO e marketing digital. Analise o seguinte artigo e gere otimizações SEO profissionais.

**ARTIGO:**
- Título: ${title}
- Categoria: ${category || 'Não informada'}
- Tags: ${tags?.join(', ') || 'Não informadas'}
- Público-alvo: ${targetAudience || 'Geral'}
- Resumo: ${excerpt || 'Não informado'}
- Conteúdo (preview): ${contentPreview}...

**IDIOMA:** ${language}

**INSTRUÇÕES:**
Gere SEO otimizado seguindo estas diretrizes:

1. **TÍTULO SEO (50-60 caracteres):**
   - Inclua palavras-chave principais
   - Seja atrativo e clicável
   - Inclua números se apropriado
   - Evite palavras vazias

2. **DESCRIÇÃO SEO (150-160 caracteres):**
   - Resumo envolvente do artigo
   - Inclua call-to-action
   - Use palavras-chave naturalmente
   - Desperte curiosidade

3. **PALAVRAS-CHAVE (5-8 palavras/frases):**
   - Palavras-chave primárias e secundárias
   - Long-tail keywords
   - Sinônimos relevantes
   - Termos de busca populares

4. **SUGESTÕES DE MELHORIA (3-5 dicas):**
   - Melhorias no conteúdo
   - Oportunidades de linkagem
   - Otimizações técnicas
   - Estratégias de engajamento

**FORMATO DE RESPOSTA (JSON):**
{
  "seoTitle": "Título SEO otimizado aqui",
  "seoDescription": "Descrição SEO atrativa aqui",
  "seoKeywords": ["palavra1", "palavra2", "frase longa", "etc"],
  "suggestions": [
    "Sugestão 1 de melhoria",
    "Sugestão 2 de melhoria", 
    "Sugestão 3 de melhoria"
  ]
}

Responda APENAS com o JSON válido, sem explicações adicionais.`;
  }

  private parseAIResponse(aiText: string): SEOResult {
    try {
      // Tentar extrair JSON da resposta
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('Formato JSON não encontrado na resposta da IA');
      }

      const jsonString = jsonMatch[0];
      const parsed = JSON.parse(jsonString);

      // Validar estrutura esperada
      if (!parsed.seoTitle || !parsed.seoDescription) {
        throw new Error('Resposta da IA não contém campos obrigatórios');
      }

      return {
        seoTitle: parsed.seoTitle.substring(0, 60), // Garantir limite
        seoDescription: parsed.seoDescription.substring(0, 160), // Garantir limite
        seoKeywords: Array.isArray(parsed.seoKeywords) ? parsed.seoKeywords : [],
        suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : []
      };

    } catch (error) {
      console.error('❌ [SEO AI] Erro ao parsear resposta:', error);
      console.log('📄 [SEO AI] Resposta original:', aiText);
      
      // Fallback: tentar extrair informações básicas
      return this.createFallbackSEO(aiText);
    }
  }

  private createFallbackSEO(aiText: string): SEOResult {
    console.log('🔄 [SEO AI] Usando fallback para extrair SEO...');
    
    // Tentar extrair título das primeiras linhas
    const lines = aiText.split('\n').filter(line => line.trim());
    const titleLine = lines.find(line => 
      line.toLowerCase().includes('título') || 
      line.toLowerCase().includes('title') ||
      line.includes('SEO')
    );
    
    const descLine = lines.find(line => 
      line.toLowerCase().includes('descrição') || 
      line.toLowerCase().includes('description')
    );

    return {
      seoTitle: titleLine ? titleLine.substring(0, 60) : 'Título SEO gerado por IA',
      seoDescription: descLine ? descLine.substring(0, 160) : 'Descrição SEO gerada por IA',
      seoKeywords: ['seo', 'artigo', 'conteúdo'],
      suggestions: [
        'Revisar título gerado pela IA',
        'Ajustar descrição conforme necessário',
        'Adicionar palavras-chave relevantes'
      ]
    };
  }

  getApp() {
    return this.app;
  }
}

export function createSEOController(env: any) {
  return new SEOController(env);
}
