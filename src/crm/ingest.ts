// Outbound CRM report ingest (delivery to RoofTraxAdmin). Behind a per-tenant
// config gate: inert until a real CRM field key + ingest URL are provisioned.
// Fabricates nothing — a pending thread reads/writes nothing.

export interface CrmConfig {
  enabled: boolean;
  fieldKey: string | null;
  ingestUrl: string | null;
}

export interface CrmDeliveryResult {
  delivered: boolean;
  status: 'active' | 'pending';
  reason?: string;
}

export interface PackageReportPayload {
  inspectionId: string;
  companyId: string;
  claimNumber: string | null;
  packageRef: string;
  packageSha256: string;
  exhibitLetters: string[];
  generatedAtUtc: string;
}

// Deliver a finished report to the CRM. When the CRM thread is pending (no key),
// this is a no-op that reports `pending` — it does NOT invent a delivery.
export async function deliverReportToCrm(
  config: CrmConfig,
  payload: PackageReportPayload,
): Promise<CrmDeliveryResult> {
  if (!config.enabled || !config.fieldKey || !config.ingestUrl) {
    return { delivered: false, status: 'pending', reason: 'crm_not_configured' };
  }
  const res = await fetch(config.ingestUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-field-key': config.fieldKey },
    body: JSON.stringify(payload),
  });
  return {
    delivered: res.ok,
    status: 'active',
    reason: res.ok ? undefined : `crm_http_${res.status}`,
  };
}

// Config source is deferred (no Brain-side company_crm_config table yet). Until
// then every tenant's CRM thread is pending.
export function pendingCrmConfig(): CrmConfig {
  return { enabled: false, fieldKey: null, ingestUrl: null };
}
