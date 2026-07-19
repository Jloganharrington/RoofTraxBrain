// Fetches the raw bytes of a stored evidence photo so the Brain can re-hash them
// against the manifest (chain of custody). The field app / CRM own object
// storage; the Brain reads from it. A mock fetcher is used for local verification.

export interface PhotoFetcher {
  fetch(url: string): Promise<Uint8Array>;
}

// Resolves object-storage refs (http(s):// or objstore://path) against a base
// URL and downloads the bytes.
export class HttpPhotoFetcher implements PhotoFetcher {
  // `authToken` is REQUIRED in practice: the field app serves evidence bytes
  // from an authenticated proxy (GET /internal/photos/:id, machine-token
  // gated) so one company's token cannot read another's photos. Fetching
  // without it 401s, integrity fails, and the package refuses to render — so
  // an unauthenticated fetcher looks like corrupted evidence rather than a
  // missing credential. Optional only so tests/local stores can omit it.
  constructor(
    private readonly baseUrl: string,
    private readonly authToken?: string | null,
  ) {}

  async fetch(url: string): Promise<Uint8Array> {
    const target = url.startsWith('http')
      ? url
      : `${this.baseUrl.replace(/\/$/, '')}/${url.replace(/^objstore:\/\//, '')}`;
    const res = await fetch(target, {
      headers: this.authToken ? { Authorization: `Bearer ${this.authToken}` } : {},
    });
    if (!res.ok) {
      const hint =
        res.status === 401 || res.status === 403
          ? ' — evidence proxy rejected the machine token (check BRAIN_API_TOKEN matches the field app)'
          : '';
      throw new Error(`photo fetch failed (${res.status}) for ${target}${hint}`);
    }
    return new Uint8Array(await res.arrayBuffer());
  }
}

// In-memory fetcher for tests/verification: maps url -> bytes.
export class MapPhotoFetcher implements PhotoFetcher {
  constructor(private readonly bytesByUrl: Map<string, Uint8Array>) {}
  async fetch(url: string): Promise<Uint8Array> {
    const b = this.bytesByUrl.get(url);
    if (!b) throw new Error(`no bytes for ${url}`);
    return b;
  }
}
