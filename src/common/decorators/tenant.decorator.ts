import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Extract the current tenant from the request.
 * Set by the ApiKeyGuard after validating the API key.
 */
export const CurrentTenant = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const tenant = request.tenant;

    if (data) {
      return tenant?.[data];
    }

    return tenant;
  },
);

/**
 * Tenant type attached to requests
 */
export interface RequestTenant {
  id: string;
  plan: string;
  isLive: boolean;
  scopes: string[];
  apiKeyId: string;
}
