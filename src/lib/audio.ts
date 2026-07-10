import { ImpactEvent } from '../types';

let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let limiter: DynamicsCompressorNode | null = null;

// Reverb buffer for spatial/metallic effects
let reverbBuffer: AudioBuffer | null = null;

export const initAudio = () => {
  if (audioCtx) return;
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    audioCtx = new AudioContextClass();
    
    // Create master chain
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.8;
    
    limiter = audioCtx.createDynamicsCompressor();
    limiter.threshold.value = -3.0;
    limiter.knee.value = 0.0;
    limiter.ratio.value = 20.0;
    limiter.attack.value = 0.005;
    limiter.release.value = 0.050;
    
    masterGain.connect(limiter);
    limiter.connect(audioCtx.destination);
    
    // Generate simple impulse response for metallic reverb
    generateReverbImpulse();
    
    console.log("Procedural Audio Engine initialized.");
  } catch (e) {
    console.warn("Web Audio API not supported", e);
  }
};

const generateReverbImpulse = () => {
  if (!audioCtx) return;
  const sampleRate = audioCtx.sampleRate;
  const length = sampleRate * 0.5; // 0.5 seconds
  reverbBuffer = audioCtx.createBuffer(2, length, sampleRate);
  
  for (let c = 0; c < 2; c++) {
    const channelData = reverbBuffer.getChannelData(c);
    for (let i = 0; i < length; i++) {
      // Exponential decay white noise
      const v = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 4);
      channelData[i] = v;
    }
  }
};

const getMaterialFrequency = (mat: string): number => {
  switch (mat) {
    case 'titanium': return 2500;
    case 'steel': return 1200;
    case 'weaponSteel': return 1800;
    case 'aluminum': return 800;
    case 'armorPlate': return 1000;
    case 'rubber': return 200;
    case 'composite': return 1500;
    case 'arenaWall': return 400;
    default: return 1000;
  }
};

// Rate limiting state
const lastSoundTimes: Record<string, number> = {};

export const playImpactSound = (event: ImpactEvent) => {
  if (!audioCtx || !masterGain || audioCtx.state !== 'running') return;
  
  const now = audioCtx.currentTime;
  
  // Rate limiting to prevent audio spam
  const soundKey = `${event.attackerId || 'sys'}-${event.defenderId || 'sys'}-${event.className}`;
  const lastTime = lastSoundTimes[soundKey] || 0;
  
  if (now - lastTime < 0.1) return; // 100ms throttle per pair/class
  lastSoundTimes[soundKey] = now;

  // Base parameters
  const energy = Math.min(event.impactEnergy / 500, 1.0); // Normalized 0-1
  if (energy < 0.05 && event.className !== 'scrape') return; // Ignore very small hits
  
  const volume = Math.min(Math.max(energy, 0.1), 1.0);
  
  // Create an impact node chain
  const impactGain = audioCtx.createGain();
  impactGain.gain.value = volume;
  
  // Stereo panning based on x-coordinate
  const panner = audioCtx.createStereoPanner();
  // Normalize contact point assuming arena is roughly -10 to 10
  const panValue = Math.max(-1, Math.min(1, event.contactPoint[0] / 5));
  panner.pan.value = panValue;
  
  impactGain.connect(panner);
  panner.connect(masterGain);

  const freqA = getMaterialFrequency(event.materialA);
  const freqB = getMaterialFrequency(event.materialB);
  const mainFreq = (freqA + freqB) / 2;
  
  // Dispatch specific sound generators based on impact class
  if (event.className === 'heavy') {
    playHeavyImpact(now, impactGain, volume);
    playMetallicClang(now, impactGain, mainFreq, volume * 1.2);
  } else if (event.className === 'weapon') {
    playWeaponBite(now, impactGain, event.weaponSpin || 1000, volume);
    playMetallicClang(now, impactGain, mainFreq * 1.5, volume);
  } else if (event.className === 'direct') {
    playThwap(now, impactGain, volume);
    if (energy > 0.4) playMetallicClang(now, impactGain, mainFreq, volume * 0.8);
  } else if (event.className === 'glancing') {
    playThwap(now, impactGain, volume * 0.6);
    playScrape(now, impactGain, event.tangentialVelocity, volume * 0.5, 0.2);
  } else if (event.className === 'scrape') {
    playScrape(now, impactGain, event.tangentialVelocity, volume, 0.1);
  } else if (event.className === 'landing') {
    playThud(now, impactGain, volume);
  }
  
  // Cleanup top-level gain
  setTimeout(() => {
    try { impactGain.disconnect(); } catch (e) {}
  }, 2000);
};

const playHeavyImpact = (time: number, outNode: AudioNode, volume: number) => {
  if (!audioCtx) return;
  // Sub boom
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, time);
  osc.frequency.exponentialRampToValueAtTime(30, time + 0.3);
  
  gain.gain.setValueAtTime(volume, time);
  gain.gain.exponentialRampToValueAtTime(0.01, time + 0.5);
  
  osc.connect(gain);
  gain.connect(outNode);
  
  osc.start(time);
  osc.stop(time + 0.5);
  
  // Noise burst
  playNoiseBurst(time, outNode, volume * 0.5, 0.1, 800, 'lowpass');
};

const playThwap = (time: number, outNode: AudioNode, volume: number) => {
  if (!audioCtx) return;
  // Punchy hit
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(300, time);
  osc.frequency.exponentialRampToValueAtTime(60, time + 0.15);
  
  gain.gain.setValueAtTime(volume * 0.8, time);
  gain.gain.exponentialRampToValueAtTime(0.01, time + 0.15);
  
  osc.connect(gain);
  gain.connect(outNode);
  
  osc.start(time);
  osc.stop(time + 0.15);
  
  playNoiseBurst(time, outNode, volume * 0.6, 0.1, 2000, 'bandpass');
};

const playMetallicClang = (time: number, outNode: AudioNode, freq: number, volume: number) => {
  if (!audioCtx) return;
  // Crunch/clang resonator
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(volume, time);
  gain.gain.exponentialRampToValueAtTime(0.01, time + 0.3); // shorter decay
  gain.connect(outNode);
  
  // Use inharmonic ratios for metal clashing instead of bell-like harmonics
  const ratios = [1.0, 1.34, 1.77, 2.15, 3.8];
  ratios.forEach((ratio, i) => {
    const osc = audioCtx.createOscillator();
    osc.type = i % 2 === 0 ? 'square' : 'sawtooth'; // harsher waveforms
    osc.frequency.value = freq * ratio;
    
    const pGain = audioCtx.createGain();
    pGain.gain.value = (1.0 / ratios.length) * (1 - i * 0.1); // lower frequencies louder
    
    osc.connect(pGain);
    pGain.connect(gain);
    
    osc.start(time);
    osc.stop(time + 0.3);
  });
  
  // Add a noise burst for the crunch
  playNoiseBurst(time, outNode, volume * 1.5, 0.15, 1200, 'bandpass');
};

const playWeaponBite = (time: number, outNode: AudioNode, rpm: number, volume: number) => {
  if (!audioCtx) return;
  
  // High pitch screech based on rpm
  const freq = 400 + (rpm / 1000) * 800;
  
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(freq, time);
  osc.frequency.linearRampToValueAtTime(freq * 0.8, time + 0.2); // pitch drop as it bites
  
  gain.gain.setValueAtTime(volume, time);
  gain.gain.exponentialRampToValueAtTime(0.01, time + 0.25);
  
  // Add some distortion
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 1000;
  
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(outNode);
  
  osc.start(time);
  osc.stop(time + 0.25);
  
  playNoiseBurst(time, outNode, volume * 0.8, 0.2, 5000, 'highpass');
};

const playScrape = (time: number, outNode: AudioNode, velocity: number, volume: number, duration: number) => {
  if (!audioCtx) return;
  
  const bufferSize = audioCtx.sampleRate * duration;
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  
  const noiseSource = audioCtx.createBufferSource();
  noiseSource.buffer = buffer;
  
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'bandpass';
  // Filter frequency based on velocity
  filter.frequency.value = 1000 + Math.min(velocity * 100, 4000);
  filter.Q.value = 2.0;
  
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(volume * 0.5, time);
  gain.gain.linearRampToValueAtTime(0, time + duration);
  
  noiseSource.connect(filter);
  filter.connect(gain);
  gain.connect(outNode);
  
  noiseSource.start(time);
};

const playThud = (time: number, outNode: AudioNode, volume: number) => {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  
  osc.type = 'sine';
  osc.frequency.setValueAtTime(80, time);
  osc.frequency.exponentialRampToValueAtTime(20, time + 0.2);
  
  gain.gain.setValueAtTime(volume, time);
  gain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
  
  osc.connect(gain);
  gain.connect(outNode);
  
  osc.start(time);
  osc.stop(time + 0.2);
};

const playNoiseBurst = (time: number, outNode: AudioNode, volume: number, duration: number, freq: number, filterType: BiquadFilterType) => {
  if (!audioCtx) return;
  const bufferSize = audioCtx.sampleRate * duration;
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  
  const noise = audioCtx.createBufferSource();
  noise.buffer = buffer;
  
  const filter = audioCtx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = freq;
  
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(volume, time);
  gain.gain.exponentialRampToValueAtTime(0.01, time + duration);
  
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(outNode);
  
  noise.start(time);
};

export const updateAudioVolume = (val: number) => {
  if (masterGain) {
    masterGain.gain.setValueAtTime(val * 0.8, audioCtx ? audioCtx.currentTime : 0);
  }
};

export const resumeAudio = () => {
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  } else if (!audioCtx) {
    initAudio();
  }
};
