function buildBlobProxyUrl(mode: "view" | "download", blobUrl: string): string {
  const params = new URLSearchParams({ url: blobUrl });
  return `/api/blob/${mode}?${params.toString()}`;
}

export function getBlobViewUrl(blobUrl: string): string {
  return buildBlobProxyUrl("view", blobUrl);
}

export function getBlobDownloadUrl(blobUrl: string): string {
  return buildBlobProxyUrl("download", blobUrl);
}
