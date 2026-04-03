export const PRIMARY_PLACEMENT_ASSET_MAX_BYTES = 1024 * 1024;

const IMAGE_FILE_EXTENSION_PATTERN =
  /\.(avif|gif|heic|heif|jpeg|jpg|png|svg|webp)$/i;

export function formatPrimaryPlacementAssetLimit(): string {
  return `${Math.round(PRIMARY_PLACEMENT_ASSET_MAX_BYTES / (1024 * 1024))} MB`;
}

export function isImageAssetFile(file: Pick<File, "name" | "type">): boolean {
  if (file.type.startsWith("image/")) {
    return true;
  }

  return IMAGE_FILE_EXTENSION_PATTERN.test(file.name);
}

export function getPrimaryPlacementAssetUploadError(
  file: Pick<File, "name" | "size" | "type">
): string | null {
  if (!isImageAssetFile(file)) {
    return "Primary placement assets must be image files.";
  }

  if (file.size > PRIMARY_PLACEMENT_ASSET_MAX_BYTES) {
    return `Primary placement assets must be ${formatPrimaryPlacementAssetLimit()} or smaller.`;
  }

  return null;
}
