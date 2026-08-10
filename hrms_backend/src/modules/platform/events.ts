import type { UUID } from "#shared";

export const platformDeviceEvents = {
  DeviceRegistered: "platform.device.registered",
  DeviceRevoked: "platform.device.revoked",
  DeviceSuspended: "platform.device.suspended",
  DeviceRestored: "platform.device.restored",
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

export type PlatformDeviceLifecycleStatus =
  | "registered"
  | "suspended"
  | "revoked";

export type PlatformDeviceLifecycleReason =
  | "lost"
  | "replaced"
  | "user_requested"
  | "security"
  | "administrative";

export type PlatformDeviceLifecyclePayload = PlatformDeviceEventBase & {
  user_id: UUID;
  actor_user_id: UUID;
  registered_device_id: UUID;
  previous_status: PlatformDeviceLifecycleStatus;
  new_status: PlatformDeviceLifecycleStatus;
  reason: PlatformDeviceLifecycleReason | null;
  changed_at: string;
};

export type PlatformDeviceOutboxEventContract = {
  aggregateType: "device";
  aggregateId: UUID;
  eventType: PlatformDeviceEventName;
  payload: PlatformDeviceRegisteredPayload | PlatformDeviceLifecyclePayload;
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

export function buildDeviceLifecycleEvent(input: {
  companyId: UUID;
  userId: UUID;
  actorUserId: UUID;
  registeredDeviceId: UUID;
  previousStatus: PlatformDeviceLifecycleStatus;
  newStatus: PlatformDeviceLifecycleStatus;
  reason?: PlatformDeviceLifecycleReason | null;
  changedAt: string;
}): PlatformDeviceOutboxEventContract {
  const eventType =
    input.newStatus === "revoked"
      ? platformDeviceEvents.DeviceRevoked
      : input.newStatus === "suspended"
        ? platformDeviceEvents.DeviceSuspended
        : platformDeviceEvents.DeviceRestored;
  const payload: PlatformDeviceLifecyclePayload = {
    schema_version: 1,
    company_id: input.companyId,
    user_id: input.userId,
    actor_user_id: input.actorUserId,
    registered_device_id: input.registeredDeviceId,
    previous_status: input.previousStatus,
    new_status: input.newStatus,
    reason: input.reason ?? null,
    changed_at: input.changedAt,
  };
  return {
    aggregateType: "device",
    aggregateId: input.registeredDeviceId,
    eventType,
    payload,
    idempotencyKey: `${eventType}:${input.registeredDeviceId}:${input.changedAt}`,
  };
}
