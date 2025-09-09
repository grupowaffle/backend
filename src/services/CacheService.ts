/**
 * Interface para os itens armazenados no cache
 */
interface CacheItem<T> {
  value: T;
  expiresAt: number;
  accessCount: number;
  lastAccessed: number;
}

/**
 * Classe ULTRA-OTIMIZADA responsável por gerenciar o cache em memória
 * 
 * OTIMIZAÇÕES IMPLEMENTADAS:
 * - Cache LRU com limite de 10.000 itens
 * - TTL mais agressivo de 30 minutos
 * - Pré-aquecimento automático para usuários frequentes
 * - Limpeza automática de cache expirado
 * - Métricas de performance em tempo real
 */
export class CacheService {
  private static instance: CacheService;
  private cache: Map<string, CacheItem<any>>;
  private readonly MAX_CACHE_SIZE = 10000; // Limite de itens no cache
  private readonly DEFAULT_TTL = 30 * 60 * 1000; // 30 minutos (mais agressivo)
  private readonly CLEANUP_INTERVAL = 5 * 60 * 1000; // Limpeza a cada 5 minutos
  private readonly FREQUENT_USER_THRESHOLD = 5; // Usuários com 5+ acessos são considerados frequentes
  
  // Métricas de performance
  private hits = 0;
  private misses = 0;
  private evictions = 0;

  public constructor() {
    this.cache = new Map();
    this.setupPeriodicCleanup();
    this.setupCacheReset();
  }

  /**
   * Obtém a instância única do CacheService (Singleton)
   */
  public static getInstance(): CacheService {
    if (!CacheService.instance) {
      CacheService.instance = new CacheService();
    }
    return CacheService.instance;
  }

  /**
   * Configura limpeza periódica do cache para manter performance
   */
  private setupPeriodicCleanup(): void {
    setInterval(() => {
      this.cleanupExpiredItems();
      this.enforceMaxSize();
    }, this.CLEANUP_INTERVAL);
  }

  /**
   * Remove itens expirados do cache
   */
  private cleanupExpiredItems(): void {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiresAt) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }
  }

  /**
   * Mantém o cache dentro do limite máximo usando estratégia LRU
   */
  private enforceMaxSize(): void {
    if (this.cache.size <= this.MAX_CACHE_SIZE) return;
    
    // Ordena por último acesso (LRU)
    const sortedEntries = Array.from(this.cache.entries())
      .sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
    
    // Remove os mais antigos
    const toRemove = this.cache.size - this.MAX_CACHE_SIZE;
    for (let i = 0; i < toRemove; i++) {
      this.cache.delete(sortedEntries[i][0]);
      this.evictions++;
    }
  }

  /**
   * Configura o reset diário do cache às 5h da manhã
   */
  private setupCacheReset(): void {
    const now = new Date();
    const nextReset = new Date();
    nextReset.setHours(5, 0, 0, 0);
    
    if (now.getHours() >= 5) {
      nextReset.setDate(nextReset.getDate() + 1);
    }

    const timeUntilReset = nextReset.getTime() - now.getTime();
    
    setTimeout(() => {
      this.clearAll();
      this.setupCacheReset(); // Agenda o próximo reset
    }, timeUntilReset);
  }

  /**
   * Armazena um valor no cache com TTL otimizado
   */
  public set<T>(key: string, value: T, ttlMs: number = this.DEFAULT_TTL): void {
    const now = Date.now();
    
    // Se já existe, atualiza contadores
    const existing = this.cache.get(key);
    const accessCount = existing ? existing.accessCount : 0;
    
    this.cache.set(key, {
      value,
      expiresAt: now + ttlMs,
      accessCount: accessCount + 1,
      lastAccessed: now
    });

    // Verifica se precisa fazer limpeza
    if (this.cache.size > this.MAX_CACHE_SIZE) {
      this.enforceMaxSize();
    }
  }

  /**
   * Obtém um valor do cache com métricas de performance
   */
  public get<T>(key: string): T | null {
    const item = this.cache.get(key);
    const now = Date.now();
    
    if (!item) {
      this.misses++;
      return null;
    }
    
    if (now > item.expiresAt) {
      this.cache.delete(key);
      this.misses++;
      return null;
    }
    
    // Atualiza estatísticas de acesso
    item.accessCount++;
    item.lastAccessed = now;
    this.hits++;
    
    return item.value as T;
  }

  /**
   * Verifica se um usuário é frequente (para pré-aquecimento)
   */
  public isFrequentUser(key: string): boolean {
    const item = this.cache.get(key);
    return item ? item.accessCount >= this.FREQUENT_USER_THRESHOLD : false;
  }

  /**
   * Obtém usuários frequentes para pré-aquecimento
   */
  public getFrequentUsers(): string[] {
    const frequentUsers: string[] = [];
    
    for (const [key, item] of this.cache.entries()) {
      if (item.accessCount >= this.FREQUENT_USER_THRESHOLD && 
          key.includes('ultra_streak:')) {
        const email = key.replace('ultra_streak:', '');
        frequentUsers.push(email);
      }
    }
    
    return frequentUsers.slice(0, 100); // Limita a 100 usuários mais frequentes
  }

  /**
   * Limpa todo o cache
   */
  public clearAll(): void {
    const size = this.cache.size;
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
    console.log(`[CacheService] Cache limpo: ${size} itens removidos`);
  }

  /**
   * Remove um item específico do cache
   */
  public delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Obtém métricas de performance do cache
   */
  public getMetrics(): {
    size: number;
    hits: number;
    misses: number;
    evictions: number;
    hitRate: number;
    maxSize: number;
  } {
    const total = this.hits + this.misses;
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      hitRate: total > 0 ? (this.hits / total) * 100 : 0,
      maxSize: this.MAX_CACHE_SIZE
    };
  }

  /**
   * Gera uma chave de cache baseada nos parâmetros
   */
  public static generateKey(prefix: string, ...params: any[]): string {
    return `${prefix}:${params.join(':')}`;
  }

  /**
   * Pré-aquece o cache para usuários frequentes
   */
  public async preWarmCache(preWarmFunction: (email: string) => Promise<void>): Promise<void> {
    const frequentUsers = this.getFrequentUsers();
    
    if (frequentUsers.length === 0) return;
    
    // Processa em lotes de 10 para não sobrecarregar
    const batchSize = 10;
    for (let i = 0; i < frequentUsers.length; i += batchSize) {
      const batch = frequentUsers.slice(i, i + batchSize);
      
      await Promise.allSettled(
        batch.map(email => preWarmFunction(email))
      );
      
      // Pequena pausa entre lotes
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * Força expiração de itens antigos (para limpeza manual)
   */
  public forceCleanup(): void {
    this.cleanupExpiredItems();
    this.enforceMaxSize();
  }

  /**
   * Obtém estatísticas detalhadas do cache
   */
  public getDetailedStats(): {
    totalItems: number;
    expiredItems: number;
    averageAccessCount: number;
    topKeys: Array<{ key: string; accessCount: number; lastAccessed: Date }>;
  } {
    const now = Date.now();
    let expiredCount = 0;
    let totalAccessCount = 0;
    const keyStats: Array<{ key: string; accessCount: number; lastAccessed: Date }> = [];
    
    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiresAt) {
        expiredCount++;
      }
      
      totalAccessCount += item.accessCount;
      keyStats.push({
        key,
        accessCount: item.accessCount,
        lastAccessed: new Date(item.lastAccessed)
      });
    }
    
    // Ordena por contagem de acesso
    keyStats.sort((a, b) => b.accessCount - a.accessCount);
    
    return {
      totalItems: this.cache.size,
      expiredItems: expiredCount,
      averageAccessCount: this.cache.size > 0 ? totalAccessCount / this.cache.size : 0,
      topKeys: keyStats.slice(0, 10) // Top 10 mais acessados
    };
  }
} 