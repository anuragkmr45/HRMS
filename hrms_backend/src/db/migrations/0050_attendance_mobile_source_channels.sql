-- GEO-S13-005: widen attendance source-channel checks for mobile/offline
-- provenance and future automatic geofence decisions. Existing defaults and
-- records are intentionally unchanged.
ALTER TABLE attendance.punch_events
  DROP CONSTRAINT IF EXISTS punch_events_source_check;

ALTER TABLE attendance.punch_events
  ADD CONSTRAINT punch_events_source_check
  CHECK (source IN (
    'web',
    'web_geo',
    'mobile',
    'mobile_foreground',
    'mobile_offline',
    'kiosk',
    'admin',
    'auto_geofence'
  ));

ALTER TABLE attendance.sessions
  DROP CONSTRAINT IF EXISTS sessions_source_check;

ALTER TABLE attendance.sessions
  ADD CONSTRAINT sessions_source_check
  CHECK (source IN (
    'web',
    'web_geo',
    'mobile',
    'mobile_foreground',
    'mobile_offline',
    'kiosk',
    'admin',
    'auto_geofence'
  ));

ALTER TABLE attendance.attendance_events
  DROP CONSTRAINT IF EXISTS attendance_events_source_check;

ALTER TABLE attendance.attendance_events
  ADD CONSTRAINT attendance_events_source_check
  CHECK (source IN (
    'web',
    'web_geo',
    'mobile',
    'mobile_foreground',
    'mobile_offline',
    'kiosk',
    'admin',
    'auto_geofence',
    'system'
  ));
