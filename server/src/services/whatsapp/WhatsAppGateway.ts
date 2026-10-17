/** Contract for a future server-only Meta Cloud API adapter. No delivery is implemented in Phase 1. */
export interface WhatsAppTemplateMessage {
  recipientE164: string;
  templateName: string;
  languageCode: string;
  parameters: string[];
  idempotencyKey: string;
  initiatedByUserId: string;
}

export interface WhatsAppSubmission {
  providerMessageId: string;
  acceptedAt: Date;
}

export interface WhatsAppGateway {
  submitApprovedTemplate(message: WhatsAppTemplateMessage): Promise<WhatsAppSubmission>;
}
