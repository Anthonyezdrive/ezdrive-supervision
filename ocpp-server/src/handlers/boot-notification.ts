// ============================================
// OCPP Handler: BootNotification
// Called when a chargepoint first connects or reboots
// ============================================

import { config } from '../config';
import { upsertChargepoint } from '../services/chargepoint-service';
import { logger } from '../index';

interface BootNotificationParams {
  chargePointVendor: string;
  chargePointModel: string;
  chargePointSerialNumber?: string;
  chargeBoxSerialNumber?: string;
  firmwareVersion?: string;
  iccid?: string;
  imsi?: string;
  meterType?: string;
  meterSerialNumber?: string;
}

interface BootNotificationResponse {
  status: 'Accepted' | 'Pending' | 'Rejected';
  currentTime: string;
  interval: number;
}

export async function handleBootNotification(
  identity: string,
  params: BootNotificationParams
): Promise<BootNotificationResponse> {
  try {
    const chargepoint = await upsertChargepoint(identity, {
      vendor: params.chargePointVendor,
      model: params.chargePointModel,
      serialNumber: params.chargePointSerialNumber || params.chargeBoxSerialNumber,
      firmwareVersion: params.firmwareVersion,
      iccid: params.iccid,
      imsi: params.imsi,
    });

    const status = chargepoint.registration_status as 'Accepted' | 'Pending' | 'Rejected';

    logger.info({
      identity,
      vendor: params.chargePointVendor,
      model: params.chargePointModel,
      status,
    }, 'BootNotification processed');

    return {
      status,
      currentTime: new Date().toISOString(),
      interval: config.heartbeatInterval,
    };
  } catch (err) {
    logger.error({ err, identity }, 'BootNotification handler error');
    return {
      status: 'Rejected',
      currentTime: new Date().toISOString(),
      interval: config.heartbeatInterval,
    };
  }
}
