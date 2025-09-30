// Category mapping interface (Single Responsibility Principle)
export interface ICategoryMapper {
  mapFromPortuguese(categoryName: string): string;
  getCategoryId(categoryName: string): Promise<string | null>;
}

export const CATEGORY_MAP: Record<string, string> = {
  'MUNDO': 'internacional',
  'BRASIL': 'brasil',
  'TECNOLOGIA': 'tecnologia',
  'ECONOMIA': 'economia',
  'VARIEDADES': 'entretenimento',
  'NEGÓCIOS': 'negocios',
  'ESPORTES': 'esportes',
  'SAÚDE': 'saude',
  'CULTURA': 'cultura',
  'APRESENTADO POR': 'patrocinado',
  'APRESENTADO_POR': 'patrocinado',
  'GERAL': 'geral'
};