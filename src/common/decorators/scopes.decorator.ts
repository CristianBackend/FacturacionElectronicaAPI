import { SetMetadata } from '@nestjs/common';
import { ApiKeyScope } from '@prisma/client';

export const SCOPES_KEY = 'scopes';

/**
 * Decorator to specify required scopes for a route.
 * Usage: @RequireScopes(ApiKeyScope.INVOICES_WRITE)
 */
export const RequireScopes = (...scopes: ApiKeyScope[]) =>
  SetMetadata(SCOPES_KEY, scopes);
