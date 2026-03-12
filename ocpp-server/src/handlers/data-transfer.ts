// ============================================
// OCPP Handler: DataTransfer
// Vendor-specific data exchange
// ============================================

import { logger } from '../index';

interface DataTransferParams {
  vendorId: string;
  messageId?: string;
  data?: string;
}

interface DataTransferResponse {
  status: 'Accepted' | 'Rejected' | 'UnknownMessageId' | 'UnknownVendorId';
  data?: string;
}

export async function handleDataTransfer(
  identity: string,
  params: DataTransferParams
): Promise<DataTransferResponse> {
  logger.info({
    identity,
    vendorId: params.vendorId,
    messageId: params.messageId,
  }, 'DataTransfer received');

  // For now, accept all data transfers and log them
  // Vendor-specific handling can be added later
  return {
    status: 'Accepted',
  };
}
