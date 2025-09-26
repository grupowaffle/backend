/**
 * Parser otimizado para newsletter The News
 * Adaptado do exemplo TypeScript fornecido para funcionar no Cloudflare Workers (sem DOMParser)
 */

export interface NewsletterData {
    id?: string;
    title?: string;
    subject_line?: string;
    preview_text?: string;
    thumbnail_url?: string;
    web_url?: string;
    created?: number;
    publish_date?: number;
    content?: {
        free?: {
            rss?: string;
        };
        rss?: string;
    };
}

export interface NewsletterMetadata {
    titulo: string;
    subject_line: string;
    preview_text: string;
    thumbnail_url: string;
    web_url: string;
    created: string;
    publish_date: string;
    total_noticias: number;
    categorias_encontradas: string[];
}

export interface Noticia {
    numero: number;
    titulo: string;
    titulo_id: string;
    categoria: string;
    categoria_id: string;
    conteudo_html: string;
    resumo: string;
    imagem_principal: string;
    fonte_imagem: string;
    links_externos: Array<{
        url: string;
        texto: string;
    }>;
    total_links: number;
    id_inicio: string;
    id_fim: string;
}

export interface ParserResult {
    noticias: Noticia[];
    metadata: NewsletterMetadata;
}

// Função para limpar URLs das imagens e todos os atributos com escapes
function limparURLsImagens(html: string): string {
    // Primeiro, limpar escapes duplos em todos os atributos
    const patterns = [
        /class="([^"]*\\[^"]*)"/g,
        /alt="([^"]*\\[^"]*)"/g,
        /style="([^"]*\\[^"]*)"/g,
        /src="([^"]*\\[^"]*)"/g
    ];

    patterns.forEach(pattern => {
        html = html.replace(pattern, (match, value) => {
            // Remover escapes específicos do Beehiiv
            value = value.replace(/\\&quot;/g, '');
            value = value.replace(/&quot;/g, '');
            value = value.replace(/\\\//g, '/');
            value = value.replace(/\\"/g, '"');
            value = value.replace(/\\\\/g, '\\');

            // Remover barras invertidas desnecessárias
            value = value.replace(/\\/g, '');

            // Decodificar entidades HTML básicas
            value = value.replace(/&amp;/g, '&');
            value = value.replace(/&lt;/g, '<');
            value = value.replace(/&gt;/g, '>');
            value = value.replace(/&quot;/g, '"');
            value = value.replace(/&#39;/g, "'");

            return match[0] + value + '"';
        });
    });

    // Segundo, limpar escapes simples que podem ter sobrado
    html = html.replace(/\\&quot;/g, '');
    html = html.replace(/&quot;/g, '');
    html = html.replace(/\\\//g, '/');
    html = html.replace(/\\"/g, '"');

    return html;
}

// Função para criar resumo do texto
function criarResumo(texto: string, maxLength: number = 200): string {
    const textoLimpo = texto.replace(/<[^>]*>/g, ''); // Remove tags HTML
    return textoLimpo.length > maxLength
        ? textoLimpo.substring(0, maxLength) + '...'
        : textoLimpo;
}

// Função para extrair links externos usando regex
function extrairLinksExternos(html: string): Array<{url: string; texto: string}> {
    const links: Array<{url: string; texto: string}> = [];
    const linkPattern = /<a[^>]+href="([^"]+)"[^>]*>([^<]*)</gi;
    let match;

    while ((match = linkPattern.exec(html)) !== null) {
        const href = match[1];
        const texto = match[2].trim();

        // Filtrar apenas links externos (não internos da newsletter)
        if (href.startsWith('http') &&
            !href.includes('thenewscc.com.br') &&
            !href.includes('api.whatsapp.com')) {
            links.push({ url: href, texto });
        }
    }

    return links;
}

// Função para extrair imagem principal usando regex
function extrairImagemPrincipal(html: string, thumbnail_fallback?: string): {src: string; fonte: string} {
    let primeira_imagem = '';
    let fonte_imagem = '';

    // Strategy 1: Procurar imagem na nova estrutura: div.image > img
    const imageContainerPattern = /<div[^>]*class="[^"]*image[^"]*"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"[^>]*>/i;
    const imgMatch1 = imageContainerPattern.exec(html);

    if (imgMatch1) {
        primeira_imagem = imgMatch1[1];

        // Tentar extrair fonte da imagem na nova estrutura
        const fontePattern = /<div[^>]*class="[^"]*image__source[^"]*"[^>]*>[\s\S]*?<p[^>]*>([^<]+)</i;
        const fonteMatch = fontePattern.exec(html);
        if (fonteMatch) {
            fonte_imagem = fonteMatch[1].trim();
        }
    } else {
        // Fallback: procurar qualquer img
        const imgPattern = /<img[^>]+src="([^"]+)"[^>]*>/i;
        const imgMatch2 = imgPattern.exec(html);
        if (imgMatch2) {
            primeira_imagem = imgMatch2[1];
        }
    }

    // Limpar escapes específicos do Beehiiv
    if (primeira_imagem) {
        primeira_imagem = primeira_imagem
            .replace(/\\&quot;/g, '')
            .replace(/&quot;/g, '')
            .replace(/\\\//g, '/')
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, '\\');
    }

    // Se não encontrou imagem no conteúdo, usar thumbnail da newsletter
    if (!primeira_imagem && thumbnail_fallback) {
        primeira_imagem = thumbnail_fallback;
    }

    return { src: primeira_imagem, fonte: fonte_imagem };
}

// Função principal para extrair notícias da newsletter
export function extrairNoticiasNewsletter(rssData: NewsletterData): ParserResult {
    console.log('🚀 Iniciando extração de notícias da newsletter...');

    // Extrair informações básicas
    const title = rssData.title || 'Newsletter';
    const subject_line = rssData.subject_line || '';
    const preview_text = rssData.preview_text || '';
    const thumbnail_url = rssData.thumbnail_url || '';
    const web_url = rssData.web_url || '';
    const created = rssData.created || Math.floor(Date.now() / 1000);
    const publish_date = rssData.publish_date || Math.floor(Date.now() / 1000);

    // Extrair conteúdo RSS
    let rss_content = '';
    if (rssData.content?.free?.rss) {
        rss_content = rssData.content.free.rss;
    } else if (rssData.content?.rss) {
        rss_content = rssData.content.rss;
    }

    console.log(`📄 RSS Content length: ${rss_content.length} chars`);

    if (!rss_content) {
        console.log('❌ No RSS content found');
        return { noticias: [], metadata: criarMetadataVazia() };
    }

    // Processar o HTML do RSS
    let rss_html = rss_content
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'");

    rss_html = limparURLsImagens(rss_html);

    console.log(`🧹 Cleaned HTML length: ${rss_html.length} chars`);

    const noticias: Noticia[] = [];
    let numero_noticia = 1;

    // Seções que NÃO são notícias (para filtrar)
    const secoes_ignorar = [
        'rodapé', 'quem somos', 'dicas do final de semana',
        'opinião do leitor', 'giveaway'
        // Removemos 'apresentado por' e 'programa de indicação' para ver se são filtrados incorretamente
    ];

    // 1. PROCURAR POR CATEGORIAS (h6 com id) seguidas de h1
    console.log('🔍 Procurando por categorias h6 com IDs...');

    // Dividir o HTML por hr content_break para processar seções individuais
    const secoes = rss_html.split(/<hr[^>]*class="[^"]*content_break[^"]*"[^>]*>/gi);
    console.log(`📦 Encontradas ${secoes.length} seções separadas por HR`);

    // DEBUG: Log das primeiras seções para verificar se a divisão está funcionando
    secoes.slice(0, 5).forEach((secao, index) => {
        console.log(`\n📋 DEBUG - Seção ${index + 1} (primeiros 300 chars):`);
        console.log(secao.substring(0, 300) + '...');
    });

    secoes.forEach((secao, index) => {
        console.log(`\n📂 Processando seção ${index + 1}...`);

        // Procurar h6 com id na seção
        const h6Pattern = /<h6[^>]*id="([^"]*)"[^>]*>([^<]+)<\/h6>/i;
        const h6Match = h6Pattern.exec(secao);

        // DEBUG: Verificar se há h6 sem id também
        const h6AnyPattern = /<h6[^>]*>([^<]+)<\/h6>/i;
        const h6AnyMatch = h6AnyPattern.exec(secao);

        console.log(`🔍 DEBUG - Seção ${index + 1}:`);
        console.log(`  - H6 com ID encontrado: ${!!h6Match}`);
        console.log(`  - H6 qualquer encontrado: ${!!h6AnyMatch}`);
        if (h6AnyMatch) {
            console.log(`  - H6 texto: "${h6AnyMatch[1]}"`);
        }

        if (!h6Match) {
            console.log(`⏭️ Seção ${index + 1}: Sem categoria h6 com ID, pulando...`);
            return;
        }

        const categoria_id = h6Match[1].trim();
        const categoria_nome = h6Match[2].trim().toUpperCase();

        console.log(`🏷️ Categoria encontrada: "${categoria_nome}" (id: ${categoria_id})`);

        // Verificar se deve ignorar esta seção
        const deve_ignorar = secoes_ignorar.some(ignorar =>
            categoria_nome.toLowerCase().includes(ignorar.toLowerCase())
        );

        console.log(`🏷️ Categoria: "${categoria_nome}" - Deve ignorar: ${deve_ignorar}`);

        if (deve_ignorar) {
            console.log(`⏭️ Ignorando seção: ${categoria_nome}`);
            return;
        }

        // Procurar h1 na seção
        const h1Pattern = /<h1[^>]*(?:id="([^"]*)")?[^>]*>([^<]+)<\/h1>/i;
        const h1Match = h1Pattern.exec(secao);

        console.log(`📝 DEBUG - H1 encontrado: ${!!h1Match}`);
        if (h1Match) {
            console.log(`  - H1 texto: "${h1Match[2]}"`);
        }

        if (!h1Match) {
            console.log(`⏭️ Seção ${index + 1}: Sem título h1, pulando...`);
            return;
        }

        const titulo_id = h1Match[1] || '';
        const titulo_noticia = h1Match[2].trim();

        console.log(`📰 Notícia encontrada: "${titulo_noticia}" (id: ${titulo_id})`);

        // Extrair conteúdo após o h1
        const h1Index = secao.indexOf(h1Match[0]);
        const conteudo_html = secao.substring(h1Index + h1Match[0].length).trim();

        // Extrair imagem principal
        const { src: primeira_imagem, fonte: fonte_imagem } = extrairImagemPrincipal(conteudo_html, thumbnail_url);

        // Extrair links externos
        const links_externos = extrairLinksExternos(conteudo_html);

        // Criar resumo automático
        const resumo = criarResumo(conteudo_html);

        const noticia: Noticia = {
            numero: numero_noticia,
            titulo: titulo_noticia,
            titulo_id: titulo_id,
            categoria: categoria_nome,
            categoria_id: categoria_id,
            conteudo_html: limparURLsImagens(conteudo_html.trim()),
            resumo: resumo,
            imagem_principal: primeira_imagem,
            fonte_imagem: fonte_imagem,
            links_externos: links_externos,
            total_links: links_externos.length,
            id_inicio: 'newsletter-' + numero_noticia,
            id_fim: 'newsletter-fim-' + numero_noticia
        };

        console.log(`✅ Notícia ${numero_noticia} criada:`, {
            titulo: noticia.titulo.substring(0, 50) + '...',
            categoria: noticia.categoria,
            contentLength: noticia.conteudo_html.length,
            hasImage: !!noticia.imagem_principal,
            linksCount: noticia.total_links
        });

        noticias.push(noticia);
        numero_noticia++;
    });

    // 2. FALLBACK: Se não encontrou notícias por categoria, tentar extrair por h1 diretamente
    if (noticias.length === 0) {
        console.log('🔄 Fallback: Tentando extrair por h1 diretamente...');

        const h1Pattern = /<h1[^>]*(?:id="([^"]*)")?[^>]*>([^<]+)<\/h1>/gi;
        let h1Match;
        numero_noticia = 1;

        while ((h1Match = h1Pattern.exec(rss_html)) !== null) {
            const titulo_id = h1Match[1] || '';
            const titulo_noticia = h1Match[2].trim();

            console.log(`📰 H1 direto encontrado: "${titulo_noticia}"`);

            // Pular se título é genérico
            if (!titulo_noticia ||
                titulo_noticia === 'Título' ||
                titulo_noticia === 'Title' ||
                titulo_noticia.toLowerCase().includes('edição de hoje') ||
                titulo_noticia.toLowerCase().includes('giro por')) {
                console.log(`⏭️ Pulando título genérico: ${titulo_noticia}`);
                continue;
            }

            // Capturar conteúdo até próximo h1 ou hr
            const h1Index = h1Match.index! + h1Match[0].length;
            const remainingHTML = rss_html.substring(h1Index);

            const nextH1 = remainingHTML.search(/<h1[^>]*>/i);
            const nextHR = remainingHTML.search(/<hr[^>]*class="[^"]*content_break/i);

            let endIndex = remainingHTML.length;
            if (nextH1 !== -1 && (nextHR === -1 || nextH1 < nextHR)) {
                endIndex = nextH1;
            } else if (nextHR !== -1) {
                endIndex = nextHR;
            }

            const conteudo_html = remainingHTML.substring(0, endIndex).trim();

            if (conteudo_html.length < 50) {
                console.log(`⏭️ Conteúdo muito pequeno (${conteudo_html.length} chars), pulando...`);
                continue;
            }

            // Extrair imagem principal
            const { src: primeira_imagem, fonte: fonte_imagem } = extrairImagemPrincipal(conteudo_html, thumbnail_url);

            // Extrair links externos
            const links_externos = extrairLinksExternos(conteudo_html);

            // Criar resumo automático
            const resumo = criarResumo(conteudo_html);

            const noticia: Noticia = {
                numero: numero_noticia,
                titulo: titulo_noticia,
                titulo_id: titulo_id,
                categoria: 'GERAL',
                categoria_id: 'geral',
                conteudo_html: limparURLsImagens(conteudo_html.trim()),
                resumo: resumo,
                imagem_principal: primeira_imagem,
                fonte_imagem: fonte_imagem,
                links_externos: links_externos,
                total_links: links_externos.length,
                id_inicio: 'newsletter-' + numero_noticia,
                id_fim: 'newsletter-fim-' + numero_noticia
            };

            console.log(`✅ Notícia fallback ${numero_noticia} criada:`, {
                titulo: noticia.titulo.substring(0, 50) + '...',
                categoria: noticia.categoria,
                contentLength: noticia.conteudo_html.length,
                hasImage: !!noticia.imagem_principal,
                linksCount: noticia.total_links
            });

            noticias.push(noticia);
            numero_noticia++;
        }
    }

    // Metadados da newsletter
    const metadata: NewsletterMetadata = {
        titulo: title,
        subject_line: subject_line,
        preview_text: preview_text,
        thumbnail_url: thumbnail_url,
        web_url: web_url,
        created: new Date(created * 1000).toISOString(),
        publish_date: new Date(publish_date * 1000).toISOString(),
        total_noticias: noticias.length,
        categorias_encontradas: [...new Set(noticias.map(n => n.categoria))]
    };

    console.log(`🎯 Extração concluída: ${noticias.length} notícias encontradas`);
    console.log(`📊 Categorias: ${metadata.categorias_encontradas.join(', ')}`);

    return {
        noticias: noticias,
        metadata: metadata
    };
}

// Função auxiliar para criar metadata vazia
function criarMetadataVazia(): NewsletterMetadata {
    return {
        titulo: 'Newsletter',
        subject_line: '',
        preview_text: '',
        thumbnail_url: '',
        web_url: '',
        created: new Date().toISOString(),
        publish_date: new Date().toISOString(),
        total_noticias: 0,
        categorias_encontradas: []
    };
}