// Fetches the raw bytes of a stored evidence photo so the Brain can re-hash them
// against the manifest (chain of custody). The field app / CRM own object
// storage; the Brain reads from it. A mock fetcher is used for local verification.

export interface PhotoFetcher {
  fetch(url: string): Promise<Uint8Array>;
}

// Resolves object-storage refs (http(s):// or objstore://path) against a base
// URL and downloads the bytes.
export class HttpPhotoFetcher implements PhotoFetcher {
  constructor(private readonly baseUrl: string) {}

  async fetch(url: string): Promise<Uint8Array> {
    const target = url.startsWith('http')
      ? url
      : `${this.baseUrl.replace(/\/$/, '')}/${url.replace(/^objstore:\/\//, '')}`;
    const res = await fetch(target);
    if (!res.ok) throw new Error(`photo fetch failed (${res.status}) for ${target}`);
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
