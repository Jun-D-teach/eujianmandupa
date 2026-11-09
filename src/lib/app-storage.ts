import localforage from "localforage";

const PREFIX = "ujianaman:";

export const penyimpanan = localforage.createInstance({
  name: "UjianAman",
  storeName: "sesi_ujian",
  description: "Penyimpanan data aplikasi dan sesi ujian secara offline",
  driver: localforage.INDEXEDDB,
});

const cache = new Map<string, string>();
const listeners = new Set<(key: string) => void>();
let siap = false;

const channel =
  typeof BroadcastChannel === "undefined"
    ? null
    : new BroadcastChannel("ujianaman:storage");

function beriTahu(key: string) {
  for (const listener of listeners) listener(key);
  channel?.postMessage(key);
}

channel?.addEventListener("message", async (event: MessageEvent<unknown>) => {
  if (typeof event.data !== "string" || !event.data.startsWith(PREFIX)) return;
  try {
    const value = await penyimpanan.getItem<unknown>(event.data);
    if (typeof value === "string") cache.set(event.data, value);
    else cache.delete(event.data);
    for (const listener of listeners) listener(event.data);
  } catch (err) {
    console.error("Gagal menyinkronkan penyimpanan antar-tab:", err);
  }
});

/** Migrasikan semua kunci aplikasi lama dari localStorage sebelum UI dibuka. */
export async function inisialisasiPenyimpanan(): Promise<void> {
  await penyimpanan.ready();

  const lama = window.localStorage;
  const kunciLama: string[] = [];
  for (let i = 0; i < lama.length; i++) {
    const key = lama.key(i);
    if (key?.startsWith(PREFIX)) kunciLama.push(key);
  }

  for (const key of kunciLama) {
    const value = lama.getItem(key);
    if (value === null) continue;
    if ((await penyimpanan.getItem(key)) === null) {
      await penyimpanan.setItem(key, value);
    }
    lama.removeItem(key);
  }

  for (const key of await penyimpanan.keys()) {
    if (!key.startsWith(PREFIX)) continue;
    const value = await penyimpanan.getItem<unknown>(key);
    if (typeof value === "string") cache.set(key, value);
  }
  siap = true;
}

export function bacaPenyimpanan(key: string): string | null {
  if (!siap) throw new Error("Penyimpanan aplikasi belum siap.");
  return cache.get(key) ?? null;
}

export async function simpanPenyimpanan(
  key: string,
  value: string,
): Promise<void> {
  if (!siap) throw new Error("Penyimpanan aplikasi belum siap.");
  await penyimpanan.setItem(key, value);
  cache.set(key, value);
  beriTahu(key);
}

export async function hapusPenyimpanan(key: string): Promise<void> {
  if (!siap) throw new Error("Penyimpanan aplikasi belum siap.");
  await penyimpanan.removeItem(key);
  cache.delete(key);
  beriTahu(key);
}

export function dengarkanPerubahanPenyimpanan(
  listener: (key: string) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
