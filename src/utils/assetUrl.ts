/**
 * Normalizes root-relative `/src/assets/...` paths to `./src/assets/...` so images
 * load both at `/` (Express/Vite) and under subpaths like `https://user.github.io/repo/`.
 */
export function resolveAssetUrl(url: string): string {
  if (!url) return '';
  if (url.startsWith('/src/assets/')) {
    return `.${url}`;
  }
  return url;
}
