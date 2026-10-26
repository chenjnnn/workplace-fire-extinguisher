/**
 * 程序化音效 —— 用 Web Audio 实时合成，不加载任何音频文件
 *
 * 为什么：音频文件动辄几百 KB，而消消乐需要的音效其实很简单
 * （短促的电子音），合成出来体积为 0，且可随机化避免听腻。
 */

type SfxName =
  | 'pick'
  | 'swap'
  | 'clear'
  | 'combo'
  | 'sweep'
  | 'win'
  | 'lose'
  | 'invalid'
  | 'slap';

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private enabled = true;

  /** 浏览器要求音频必须在用户手势后初始化 */
  init(): void {
    if (this.ctx) return;
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.32;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
  }

  resume(): void {
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? 0.32 : 0;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  private beep(params: {
    freq: number;
    duration: number;
    type?: OscillatorType;
    gain?: number;
    /** 频率滑到的目标值，用于「唰」这种滑音 */
    slideTo?: number;
    delay?: number;
  }): void {
    if (!this.enabled) return;
    this.init();
    this.resume();
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;

    const start = ctx.currentTime + (params.delay ?? 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = params.type ?? 'sine';
    osc.frequency.setValueAtTime(params.freq, start);
    if (params.slideTo) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, params.slideTo), start + params.duration);
    }

    const peak = params.gain ?? 0.3;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(peak, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + params.duration);

    osc.connect(gain);
    gain.connect(master);
    osc.start(start);
    osc.stop(start + params.duration + 0.02);
  }

  /** 噪声（用于打击感） */
  private noise(duration: number, gain = 0.12): void {
    if (!this.enabled) return;
    this.init();
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;

    const frames = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) {
      // 指数衰减的白噪声
      data[i] = (Math.random() * 2 - 1) * (1 - i / frames) ** 3;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    g.connect(master);
    src.start();
  }

  play(name: SfxName, chain = 1): void {
    if (!this.enabled) return;
    switch (name) {
      case 'pick':
        this.beep({ freq: 520, duration: 0.06, type: 'triangle', gain: 0.16 });
        break;
      case 'swap':
        this.beep({ freq: 380, slideTo: 520, duration: 0.1, type: 'triangle', gain: 0.2 });
        break;
      case 'invalid':
        this.beep({ freq: 190, slideTo: 120, duration: 0.14, type: 'sawtooth', gain: 0.16 });
        break;
      case 'slap':
        // 「啪」= 一记短促的高频噪声 + 一个低沉的撞击
        this.noise(0.055, 0.34);
        this.beep({ freq: 220, slideTo: 55, duration: 0.09, type: 'square', gain: 0.22 });
        break;
      case 'clear': {
        // 连锁越深音调越高，形成「上扬」的爽感
        const base = 420 + Math.min(chain, 6) * 70;
        this.beep({ freq: base, duration: 0.11, type: 'square', gain: 0.12 });
        this.beep({ freq: base * 1.5, duration: 0.09, type: 'sine', gain: 0.08, delay: 0.02 });
        this.noise(0.08, 0.05);
        break;
      }
      case 'combo':
        this.beep({ freq: 660, duration: 0.09, type: 'square', gain: 0.14 });
        this.beep({ freq: 880, duration: 0.1, type: 'square', gain: 0.12, delay: 0.07 });
        this.beep({ freq: 1100, duration: 0.12, type: 'sine', gain: 0.1, delay: 0.14 });
        break;
      case 'sweep':
        // 扫频 + 噪声，模拟「收网」的压迫感
        this.beep({ freq: 900, slideTo: 120, duration: 0.5, type: 'sawtooth', gain: 0.22 });
        this.noise(0.45, 0.16);
        break;
      case 'win':
        [523, 659, 784, 1047].forEach((freq, i) => {
          this.beep({ freq, duration: 0.22, type: 'triangle', gain: 0.18, delay: i * 0.11 });
        });
        break;
      case 'lose':
        [392, 330, 262].forEach((freq, i) => {
          this.beep({ freq, duration: 0.25, type: 'sawtooth', gain: 0.14, delay: i * 0.13 });
        });
        break;
    }
  }
}

export const sound = new SoundEngine();
