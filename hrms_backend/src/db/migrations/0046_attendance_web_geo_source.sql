-- GEO-S12-007: support one-shot browser geo punches as an explicit source.
-- No backfill is required; this only widens existing source check constraints.

ALTER TABLE attendance.punch_events
  DROP CONSTRAINT IF EXISTS punch_events_source_check;

ALTER TABLE attendance.punch_events
  ADD CONSTRAINT punch_events_source_check
  CHECK (source IN ('web', 'web_geo', 'mobile', 'kiosk', 'admin'));

ALTER TABLE attendance.sessions
  DROP CONSTRAINT IF EXISTS sessions_source_check;

ALTER TABLE attendance.sessions
  ADD CONSTRAINT sessions_source_check
  CHECK (source IN ('web', 'web_geo', 'mobile', 'kiosk', 'admin'));

ALTER TABLE attendance.attendance_events
  DROP CONSTRAINT IF EXISTS attendance_events_source_check;

ALTER TABLE attendance.attendance_events
  ADD CONSTRAINT attendance_events_source_check
  CHECK (source IN ('web', 'web_geo', 'mobile', 'kiosk', 'admin', 'system'));
