/**
 * Sirene peringatan memakai Web Audio API — tanpa file audio eksternal.
 * Dihasilkan dari osilator yang frekuensinya bolak-balik (nada siren),
 * lalu dimatikan dengan envelope gain.
 *
 * ANTI TURUN VOLUME — halaman web TIDAK bisa memblokir tombol volume
 * hardware (batasan platform Android/iOS). Karena itu sirene dibuat
 * sekeras mungkin dan ditemani dua saluran yang TIDAK terpengaruh tombol
 * volume:
 *   1. Rantai audio: osc → drive (penguat keras) → DynamicsCompressor
 *      sebagai limiter → envelope → speaker, supaya loudness rata-rata
 *      mendekati batas keras perangkat (bukan 0.22 seperti dulu).
 *   2. Getar berulang (navigator.vibrate) sepanjang sirene berbunyi —
 *      tombol volume tidak mematikan getaran sama sekali.
 *   3. Penjaga AudioContext: bila konteks tersuspend (mis. Android
 *      mematikan audio sejenak), langsung di-resume supaya sirene
 *      tidak senyap terus-menerus.
 */
let audioCtx: AudioContext | null = null;
/** Sirene yang sedang berbunyi — dihentikan sebelum yang baru mulai. */
let sireneAktif: {
  osc: OscillatorNode;
  gain: GainNode;
  drive: GainNode;
  comp: DynamicsCompressorNode;
} | null = null;
/** Interval getar berulang (null bila tidak bergetar). */
let getarInterval: number | null = null;
/** Interval penjaga AudioContext (null bila tidak aktif). */
let jagaInterval: number | null = null;

/** Pola getar (~2,75 dtk) yang diulang terus selama sirene berbunyi. */
const POLA_GETAR = [600, 200, 600, 200, 900, 200];

function getAudioContext(): AudioContext | null {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    if (!audioCtx) audioCtx = new Ctor();
    if (audioCtx.state === "suspended") {
      void audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  } catch {
    return null;
  }
}

/** Mulai getar berulang — saluran peringatan yang bebas tombol volume. */
function mulaiGetar(): void {
  if (getarInterval !== null) return;
  if (typeof navigator.vibrate !== "function") return;
  const ketuk = () => {
    try {
      navigator.vibrate(POLA_GETAR);
    } catch {
      /* perangkat menolak getaran — abaikan */
    }
  };
  ketuk();
  // Pola ±2,75 dtk — diulang tepat setelahnya agar getaran tidak berhenti.
  getarInterval = window.setInterval(ketuk, 2800);
}

function hentikanGetar(): void {
  if (getarInterval !== null) {
    window.clearInterval(getarInterval);
    getarInterval = null;
  }
  try {
    navigator.vibrate(0);
  } catch {
    /* noop */
  }
}

/** Penjaga: AudioContext yang tersuspend langsung di-resume. */
function mulaiJagaAudio(): void {
  if (jagaInterval !== null) return;
  jagaInterval = window.setInterval(() => {
    if (!sireneAktif) {
      if (jagaInterval !== null) {
        window.clearInterval(jagaInterval);
        jagaInterval = null;
      }
      return;
    }
    if (audioCtx && audioCtx.state === "suspended") {
      void audioCtx.resume().catch(() => {});
    }
  }, 2000);
}

function hentikanJagaAudio(): void {
  if (jagaInterval !== null) {
    window.clearInterval(jagaInterval);
    jagaInterval = null;
  }
}

/**
 * Bunyikan sirene peringatan pelanggaran ujian.
 * Default 10 menit — sirene BERLANJUT sampai dimatikan lewat
 * `hentikanSirene()` (tombol "Matikan Sirene" di halaman ujian, yang hanya
 * aktif saat HP offline) atau halaman ujian ditinggalkan.
 * Sirene lama (bila masih berbunyi) dihentikan dulu supaya tidak menumpuk.
 * Bersamaan dengan suara, HP ikut BERGETAR terus-menerus.
 */
export function bunyikanSirene(durasiMs = 600000): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  // Hentikan sirene sebelumnya.
  if (sireneAktif) {
    try {
      const now = ctx.currentTime;
      const { osc, gain, drive, comp } = sireneAktif;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(0.0001, now);
      osc.stop(now + 0.02);
      osc.disconnect();
      drive.disconnect();
      comp.disconnect();
      gain.disconnect();
    } catch {
      /* noop */
    }
    sireneAktif = null;
  }

  try {
    const start = ctx.currentTime;
    const durasi = durasiMs / 1000;
    const osc = ctx.createOscillator();
    const drive = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    const gain = ctx.createGain();

    osc.type = "sawtooth";

    // Bolak-balik antara dua nada tinggi → kesan sirine.
    const TINGGI = 1046.5; // C6
    const RENDAH = 622.25; // D#5
    const langkah = 0.26;
    osc.frequency.setValueAtTime(TINGGI, start);
    let t = start;
    let tinggi = true;
    while (t - start < durasi) {
      t += langkah;
      osc.frequency.linearRampToValueAtTime(tinggi ? RENDAH : TINGGI, t);
      tinggi = !tinggi;
    }

    // Rantai keras-maksimal: drive mendorong sinyal jauh di atas ambang
    // limiter, sehingga loudness rata-rata mendekati batas perangkat tanpa
    // clipping kasar.
    drive.gain.value = 5;
    comp.threshold.value = -6;
    comp.knee.value = 0;
    comp.ratio.value = 20;
    comp.attack.value = 0.003;
    comp.release.value = 0.12;

    // Envelope gain (fade masuk/keluar) di akhir rantai — bukan 0.22 lagi.
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.95, start + 0.04);
    gain.gain.setValueAtTime(0.95, Math.max(start + 0.05, start + durasi - 0.18));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + durasi);

    osc.connect(drive);
    drive.connect(comp);
    comp.connect(gain);
    gain.connect(ctx.destination);

    osc.start(start);
    osc.stop(start + durasi + 0.05);
    sireneAktif = { osc, gain, drive, comp };
    osc.onended = () => {
      try {
        osc.disconnect();
        drive.disconnect();
        comp.disconnect();
        gain.disconnect();
      } catch {
        /* noop */
      }
      if (sireneAktif?.osc === osc) sireneAktif = null;
    };
  } catch {
    /* browser menolak audio — abaikan */
  }

  // Peringatan tambahan yang tidak bisa dibungkam tombol volume.
  mulaiGetar();
  mulaiJagaAudio();
}

/** Apakah sirene sedang berbunyi? */
export function sireneBerbunyi(): boolean {
  return sireneAktif !== null;
}

/**
 * Matikan sirene yang sedang berbunyi (fade pendek supaya tidak mendadak).
 * Dipanggil dari tombol "Matikan Sirene" — hanya bisa diklik saat HP offline.
 * Getaran juga dihentikan bersamaan.
 */
export function hentikanSirene(): void {
  hentikanGetar();
  hentikanJagaAudio();
  const ctx = audioCtx;
  if (!sireneAktif) return;
  const { osc, gain, drive, comp } = sireneAktif;
  sireneAktif = null;
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
    osc.stop(now + 0.2);
    const bersihkan = () => {
      try {
        osc.disconnect();
        drive.disconnect();
        comp.disconnect();
        gain.disconnect();
      } catch {
        /* noop */
      }
    };
    osc.onended = bersihkan;
  } catch {
    /* noop */
  }
}
