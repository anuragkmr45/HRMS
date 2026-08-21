ALTER TABLE platform.registered_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform.registered_devices FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_registered_devices_company_isolation
  ON platform.registered_devices;

CREATE POLICY platform_registered_devices_company_isolation
  ON platform.registered_devices
  AS PERMISSIVE
  FOR ALL
  USING (
    company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  )
  WITH CHECK (
    company_id = NULLIF(current_setting('app.current_company_id', true), '')::uuid
  );

COMMENT ON POLICY platform_registered_devices_company_isolation
  ON platform.registered_devices IS
  'Defense-in-depth tenant isolation using transaction-local app.current_company_id. Missing or reset context fails closed.';
