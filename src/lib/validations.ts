import { z } from 'zod';
import { isValidCuid } from './cuid';

/**
 * Schemas de validação usando Zod
 * Type-safe validation para APIs
 */

// Schema base para IDs
export const cuidSchema = z.string().refine(isValidCuid, {
  message: "ID deve ser um CUID válido"
});

// Schema para email
export const emailSchema = z.string().email({
  message: "Email deve ter formato válido"
});

// Schema para usuários
export const createUserSchema = z.object({
  email: emailSchema,
  name: z.string().min(1, "Nome é obrigatório").max(100, "Nome muito longo"),
  role: z.enum(['user', 'admin', 'editor']).default('user'),
  brandId: z.string().optional(),
  brandName: z.string().optional(),
});

export const updateUserSchema = z.object({
  id: cuidSchema,
  email: emailSchema.optional(),
  name: z.string().min(1, "Nome é obrigatório").max(100, "Nome muito longo").optional(),
  role: z.enum(['user', 'admin', 'editor']).optional(),
  brandId: z.string().optional(),
  brandName: z.string().optional(),
});

// Schema para subscribers
export const createSubscriberSchema = z.object({
  email: emailSchema,
  name: z.string().optional(),
  status: z.enum(['active', 'inactive', 'unsubscribed']).default('active'),
  source: z.string().optional(),
  tags: z.string().optional(),
});

export const updateSubscriberSchema = z.object({
  id: cuidSchema,
  email: emailSchema.optional(),
  name: z.string().optional(),
  status: z.enum(['active', 'inactive', 'unsubscribed']).optional(),
  source: z.string().optional(),
  tags: z.string().optional(),
});

// Schema para tickets
export const createTicketSchema = z.object({
  title: z.string().min(1, "Título é obrigatório").max(200, "Título muito longo"),
  description: z.string().optional(),
  status: z.enum(['open', 'in_progress', 'closed', 'cancelled']).default('open'),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  assignedTo: z.string().optional(),
  createdBy: z.string().min(1, "Criador é obrigatório"),
});

export const updateTicketSchema = z.object({
  id: cuidSchema,
  title: z.string().min(1, "Título é obrigatório").max(200, "Título muito longo").optional(),
  description: z.string().optional(),
  status: z.enum(['open', 'in_progress', 'closed', 'cancelled']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  assignedTo: z.string().optional(),
});

// Schema para URL tracking
export const createUrlTrackingSchema = z.object({
  originalUrl: z.string().url("URL deve ser válida"),
  shortCode: z.string().min(3, "Código deve ter pelo menos 3 caracteres").max(20, "Código muito longo"),
});

export const updateUrlTrackingSchema = z.object({
  id: cuidSchema,
  originalUrl: z.string().url("URL deve ser válida").optional(),
  shortCode: z.string().min(3, "Código deve ter pelo menos 3 caracteres").max(20, "Código muito longo").optional(),
});

// Schema para acquisitions
export const createAcquisitionSchema = z.object({
  subscriberId: z.string().min(1, "Subscriber ID é obrigatório"),
  automationId: z.string().optional(),
  journeyId: z.string().optional(),
  source: z.string().optional(),
  campaign: z.string().optional(),
  isTest: z.boolean().default(false),
});

// Schema para paginação
export const paginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(10),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// Schema para filtros
export const userFiltersSchema = z.object({
  role: z.enum(['user', 'admin', 'editor']).optional(),
  brandId: z.string().optional(),
  search: z.string().optional(),
});

export const subscriberFiltersSchema = z.object({
  status: z.enum(['active', 'inactive', 'unsubscribed']).optional(),
  source: z.string().optional(),
  search: z.string().optional(),
});

export const ticketFiltersSchema = z.object({
  status: z.enum(['open', 'in_progress', 'closed', 'cancelled']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  assignedTo: z.string().optional(),
  createdBy: z.string().optional(),
});

// Types inferidos dos schemas
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type CreateSubscriberInput = z.infer<typeof createSubscriberSchema>;
export type UpdateSubscriberInput = z.infer<typeof updateSubscriberSchema>;
export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;
export type CreateUrlTrackingInput = z.infer<typeof createUrlTrackingSchema>;
export type UpdateUrlTrackingInput = z.infer<typeof updateUrlTrackingSchema>;
export type CreateAcquisitionInput = z.infer<typeof createAcquisitionSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
export type UserFiltersInput = z.infer<typeof userFiltersSchema>;
export type SubscriberFiltersInput = z.infer<typeof subscriberFiltersSchema>;
export type TicketFiltersInput = z.infer<typeof ticketFiltersSchema>;
