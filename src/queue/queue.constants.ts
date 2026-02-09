/**
 * Queue name constants used across the application.
 * 
 * Separated from queue.module.ts to avoid circular dependencies
 * (processors import QUEUES, module imports processors).
 */
export const QUEUES = {
  ECF_PROCESSING: 'ecf-processing',     // XML sign → send to DGII
  ECF_STATUS_POLL: 'ecf-status-poll',   // Poll DGII for TrackId status
  WEBHOOK_DELIVERY: 'webhook-delivery', // Deliver webhook events
  CERTIFICATE_CHECK: 'certificate-check', // Check certificate expiration
} as const;
