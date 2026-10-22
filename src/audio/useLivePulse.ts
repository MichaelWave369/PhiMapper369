import { useEffect, useRef, useState } from 'react';
import { constrain } from '../model';

export type AudioInputMode = 'off' | 'microphone' | 'tap';

export function useLivePulse() {
  const [level, setLevel] = useState(0);
  const [mode, setMode] = useState<AudioInputMode>('off');
  const [error, setError] = useState('');
  const modeRef = useRef<AudioInputMode>('off');
  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);
  const generationRef = useRef(0);
  const levelRef = useRef(0);

  function setActiveMode(value: AudioInputMode) {
    modeRef.current = value;
    setMode(value);
  }

  function stop() {
    generationRef.current++;
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (ctxRef.current) void ctxRef.current.close().catch(() => {});
    ctxRef.current = null;
    levelRef.current = 0;
    setLevel(0);
    setActiveMode('off');
  }

  async function enableMicrophone() {
    stop();
    setError('');
    const generation = generationRef.current;
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext) {
      setError('Microphone input requires a secure browser context and Web Audio support.');
      return;
    }
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        video: false,
      });
      if (generation !== generationRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      ctx = new AudioContext();
      await ctx.resume();
      if (generation !== generationRef.current) {
        stream.getTracks().forEach(track => track.stop());
        void ctx.close();
        return;
      }
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.7;
      source.connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      streamRef.current = stream;
      ctxRef.current = ctx;
      setActiveMode('microphone');
      let lastUpdate = 0;
      const draw = (time: number) => {
        if (generation !== generationRef.current) return;
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (let i = 0; i < samples.length; i++) {
          const sample = (samples[i] - 128) / 128;
          sum += sample * sample;
        }
        const rms = Math.sqrt(sum / samples.length);
        const amplitude = constrain((rms - 0.015) * 5.0, 0, 1);
        const smoothed = levelRef.current * 0.76 + amplitude * 0.24;
        levelRef.current = smoothed;
        if (time - lastUpdate > 55) {
          lastUpdate = time;
          setLevel(smoothed);
        }
        animationRef.current = requestAnimationFrame(draw);
      };
      animationRef.current = requestAnimationFrame(draw);
    } catch (cause) {
      stream?.getTracks().forEach(track => track.stop());
      if (ctx) void ctx.close().catch(() => {});
      if (generation !== generationRef.current) return;
      setError(cause instanceof Error ? cause.message : 'Microphone permission or device unavailable.');
      setActiveMode('off');
    }
  }

  function tapPulse() {
    stop();
    setError('');
    setActiveMode('tap');
    const generation = generationRef.current;
    const started = performance.now();
    setLevel(1);
    levelRef.current = 1;
    const draw = (now: number) => {
      if (generation !== generationRef.current) return;
      const fraction = constrain(1 - (now - started) / 900, 0, 1);
      const amount = Math.pow(fraction, 2);
      levelRef.current = amount;
      setLevel(amount);
      if (fraction > 0) animationRef.current = requestAnimationFrame(draw);
      else {
        animationRef.current = null;
        setActiveMode('off');
      }
    };
    animationRef.current = requestAnimationFrame(draw);
  }

  // Release microphone tracks on unmount or hot reload.
  useEffect(() => () => {
    generationRef.current++;
    if (animationRef.current !== null) cancelAnimationFrame(animationRef.current);
    streamRef.current?.getTracks().forEach(track => track.stop());
    if (ctxRef.current) void ctxRef.current.close().catch(() => {});
  }, []);

  return { level, mode, error, enableMicrophone, stop, tapPulse };
}
