import { proceduralArt } from './procedural';

export type ArtSource = HTMLCanvasElement | HTMLImageElement;

const BASE = import.meta.env.BASE_URL;

export async function loadArt(): Promise<Map<string, ArtSource>> {
  const art = new Map<string, ArtSource>(proceduralArt());
  try {
    const res = await fetch(`${BASE}sprites/manifest.json`);
    if (!res.ok) return art;
    const manifest = (await res.json()) as Record<string, string>;
    await Promise.all(Object.entries(manifest).map(([key, file]) => new Promise<void>((done) => {
      const img = new Image();
      img.onload = () => { art.set(key, img); done(); };
      img.onerror = () => { console.warn(`Sprite override not found: ${file}`); done(); };
      img.src = `${BASE}sprites/${file}`;
    })));
  } catch (err) {
    console.warn('Sprite manifest failed to load; using procedural art.', err);
  }
  return art;
}
