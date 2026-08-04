import type { UUID } from "#shared";

export const platformDeviceEvents = {
  DeviceRegistered: "platform.device.registered",
} as const;

type PlatformDeviceEventName =
  (typeof platformDeviceEvents)[keyof typeof platformDeviceEvents];

type PlatformDeviceEventBase = {
  schema_version: 1;
  company_id: UUID;
};

export type PlatformDeviceRegisteredPayload = PlatformDeviceEventBase & {
  user_id: UUID;
  registered_device_id: UUID;
  platform: "ios" | "android";
  status: "registered";
  registered_at: string;
};

export type PlatformDeviceOutboxEventContract = {
  aggregateType: "device";
  aggregateId: UUID;
  eventType: PlatformDeviceEventName;
  payload: PlatformDeviceRegisteredPayload;
  idempotencyKey: string;
};

export function buildDeviceRegisteredEvent(input: {
  companyId: UUID;
  userId: UUID;
  registeredDeviceId: UUID;
  platform: PlatformDeviceRegisteredPayload["platform"];
  status?: PlatformDeviceRegisteredPayload["status"];
  registeredAt: string;
}): PlatformDeviceOutboxEventContract {
  const payload: PlatformDeviceRegisteredPayload = {
    schema_version: 1,
    company_id: input.companyId,
    user_id: input.userId,
    registered_device_id: input.registeredDeviceId,
    platform: input.platform,
    status: input.status ?? "registered",
    registered_at: input.registeredAt,
  };
  return {
    aggregateType: "device",
    aggregateId: input.registeredDeviceId,
    eventType: platformDeviceEvents.DeviceRegistered,
    payload,
    idempotencyKey: `platform.device.registered:${input.registeredDeviceId}`,
  };
}
