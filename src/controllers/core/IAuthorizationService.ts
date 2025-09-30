// Authorization service interface (Single Responsibility Principle)
export interface IAuthorizationService {
  canPublish(userRole: string): boolean;
  canUnpublish(userRole: string): boolean;
  canEdit(userRole: string): boolean;
  canDelete(userRole: string): boolean;
}

export class ArticleAuthorizationService implements IAuthorizationService {
  private readonly publishRoles = ['admin', 'editor-chefe', 'editor', 'developer', 'super_admin'];
  private readonly editRoles = ['admin', 'editor-chefe', 'editor', 'developer', 'super_admin', 'author'];

  canPublish(userRole: string): boolean {
    return this.publishRoles.includes(userRole);
  }

  canUnpublish(userRole: string): boolean {
    return this.publishRoles.includes(userRole);
  }

  canEdit(userRole: string): boolean {
    return this.editRoles.includes(userRole);
  }

  canDelete(userRole: string): boolean {
    return this.publishRoles.includes(userRole);
  }
}