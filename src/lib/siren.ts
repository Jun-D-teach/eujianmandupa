/**
 * Sirene peringatan memakai Web Audio API — tanpa file audio eksternal.
 * Dihasilkan dari osilator yang frekuensinya bolak-balik (nada siren),
 * lalu dimatikan dengan envelope gain.
 */
let audioCtx: AudioContext | null = null;
/** Sirene yang sedang berbunyi — dihentikan sebelum yang baru mulai. */
let sireneAktif: { osc: OscillatorNode; gain: GainNode } | null = null;

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

/**
 * Bunyikan sirine selama `durasiMs` (default 30 detik — peringatan pelanggaran
 * ujian). Sirene lama (bila masih berbunyi) dihentikan dulu supaya tidak
 * menumpuk saat siswa melakukan beberapa pelanggaran berturut-turut.
 */
export function bunyikanSirene(durasiMs = 30000): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  // Hentikan sirene sebelumnya.
  if (sireneAktif) {
    try {
      const now = ctx.currentTime;
      sireneAktif.gain.gain.cancelScheduledValues(now);
      sireneAktif.gain.gain.setValueAtTime(0.0001, now);
      sireneAktif.osc.stop(now + 0.02);
    } catch {
      /* noop */
    }
    sireneAktif = null;
  }

  try {
    const start = ctx.currentTime;
    const durasi = durasiMs / 1000;
    const osc = ctx.createOscillator();
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

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.22, start + 0.04);
    gain.gain.setValueAtTime(0.22, Math.max(start + 0.05, start + durasi - 0.18));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + durasi);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(start);
    osc.stop(start + durasi + 0.05);
    sireneAktif = { osc, gain };
    osc.onended = () => {
      try {
        osc.disconnect();
        gain.disconnect();
      } catch {
        /* noop */
      }
      if (sireneAktif?.osc === osc) sireneAktif = null;
    };
  } catch {
    /* browser menolak audio — abaikan */
  }
}
