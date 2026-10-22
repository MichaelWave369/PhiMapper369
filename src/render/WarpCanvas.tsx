import { useEffect, useRef, useState } from 'react';
import type { MediaKind, Surface } from '../model';
import { homographyFromQuad, inverse3x3, toGlMatrix } from '../math/homography';

type Props = {
  surfaces: Surface[];
  mediaUrl: string | null;
  mediaKind: MediaKind;
  muted: boolean;
  audioLevel: number;
  blackout: boolean;
  className?: string;
  playbackKey?: number;
};

const VERTEX = `
attribute vec2 aPosition;
void main() { gl_Position = vec4(aPosition, 0.0, 1.0); }
`;
const MAX_SURFACES = 6;
const shaderUniforms = Array.from({ length: MAX_SURFACES }, (_, i) => `
uniform mat3 uInverse${i};
uniform int uMode${i};
uniform float uOpacity${i};
uniform int uMask${i};
uniform float uFeather${i};
uniform int uScene${i};
uniform float uSpeed${i};
uniform float uReactivity${i};`).join('\n');
const renderLayers = Array.from({ length: MAX_SURFACES }, (_, i) => `
if (uCount > ${i}) {
  vec4 next${i} = sampleLayer(dest, uInverse${i}, uMode${i},
    uOpacity${i}, uMask${i}, uFeather${i},
    uScene${i}, uSpeed${i}, uReactivity${i});
  color = mix(color, next${i}.rgb, next${i}.a);
}`).join('\n');
const FRAGMENT = `
precision highp float;
uniform vec2 uResolution;
uniform float uTime;
uniform int uCount;
uniform float uPulse;
uniform float uBlackout;
uniform sampler2D uMedia;
${shaderUniforms}
float gridline(float x, float n, float thickness) {
  return 1.0 - smoothstep(0.0, thickness, abs(fract(x * n) - 0.5));
}
vec3 demo(vec2 uv, float t, float pulse) {
  vec2 p = (uv - 0.5) * vec2(1.7777778, 1.0);
  float a = atan(p.y, p.x);
  float r = length(p);
  float spin = a * 12.0 + sin(r * 17.0 - t * 0.9);
  float rings = pow(0.5 + 0.5 * sin(r * 64.0 - t * 3.2), 9.0);
  float teeth = pow(0.5 + 0.5 * cos(spin + t * 0.7), 15.0);
  float bubbles = pow(0.5 + 0.5 * sin(r * 39.0 + cos(a * 9.0 + t) * 2.0), 12.0);
  vec3 cyan = vec3(0.08, 0.83, 1.0);
  return (vec3(0.01, 0.035, 0.085) + cyan * rings * 0.75
    + vec3(0.55, 0.27, 1.0) * teeth * rings
    + vec3(1.0, 0.65, 0.21) * bubbles * 0.22
    + cyan * (0.12 / (r + 0.06)) * 0.14
    + cyan * 0.12 * pow(0.5 + 0.5 * cos(a * 6.0 + t), 24.0)) * (1.0 + pulse * 0.5);
}

vec3 tunnelScene(vec2 uv, float t, float pulse) {
  vec2 p = (uv - 0.5) * vec2(1.7778, 1.0);
  float r = max(length(p), 0.012);
  float a = atan(p.y, p.x);
  float z = 1.0 / (r + 0.09) + t * (0.65 + pulse * 1.7);
  float ring = pow(0.5 + 0.5 * sin(z * 13.0), 11.0);
  float spokes = pow(0.5 + 0.5 * sin(a * 15.0 + z * 0.9), 10.0);
  vec3 c = vec3(0.005, 0.008, 0.028) +
    vec3(0.05, 0.9, 1.0) * ring * 0.9 +
    vec3(0.75, 0.27, 1.0) * spokes * 0.38 +
    vec3(1.0, 0.34, 0.12) * ring * spokes * 0.55;
  return c * (1.0 + pulse * 0.55);
}
vec3 bubbleScene(vec2 uv, float t, float pulse) {
  vec3 color = vec3(0.008, 0.018, 0.07);
  for (int k = 0; k < 9; k++) {
    float n = float(k);
    float x = fract(n * 0.618034 + 0.22 * sin(t * 0.13 + n * 2.7));
    float y = fract(n * 0.414214 - t * (0.024 + 0.006 * n));
    vec2 p = (uv - vec2(x,y)) * vec2(1.55, 1.0);
    float r = length(p);
    float size = 0.12 + 0.032 * sin(n * 4.3 + t * 0.17);
    float rim = exp(-abs(r - size) * 92.0);
    float glow = exp(-r * 13.0);
    vec3 pigment = 0.5 + 0.5 * cos(vec3(0.0, 2.2, 4.2) + n * 1.5 + t * 0.16);
    color += pigment * (rim * 0.62 + glow * 0.035) * (1.0 + pulse * 0.45);
  }
  return color;
}
vec3 latticeScene(vec2 uv, float t, float pulse) {
  vec2 p = (uv - 0.5) * vec2(1.8, 1.0);
  float a = t * 0.22;
  vec2 rot = vec2(p.x * cos(a) - p.y * sin(a), p.x * sin(a) + p.y * cos(a));
  float swell = 1.0 + pulse * 0.45;
  vec2 v = rot * (12.0 * swell);
  float gx = exp(-abs(sin(v.x + sin(v.y * 0.33 + t) * 0.35)) * 24.0);
  float gy = exp(-abs(sin(v.y + cos(v.x * 0.35 - t) * 0.35)) * 24.0);
  float nodes = pow(max(gx * gy, 0.0), 0.65);
  float wave = 0.4 + 0.6 * sin(length(p) * 12.0 - t * 2.2);
  return vec3(0.008, 0.027, 0.06)
    + vec3(0.08, 0.82, 1.0) * gx * wave * 0.45
    + vec3(0.75, 0.19, 1.0) * gy * (1.0 - 0.45 * wave)
    + vec3(1.0, 0.78, 0.26) * nodes * (0.25 + pulse * 0.45);
}
vec3 procedural(vec2 uv, int scene, float t, float pulse) {
  if (scene == 1) return tunnelScene(uv, t, pulse);
  if (scene == 2) return bubbleScene(uv, t, pulse);
  if (scene == 3) return latticeScene(uv, t, pulse);
  return demo(uv, t, pulse);
}
vec3 calibration(vec2 uv) {
  float edge = float(uv.x < 0.006 || uv.x > 0.994 || uv.y < 0.006 || uv.y > 0.994);
  float gx = gridline(uv.x, 10.0, 0.016);
  float gy = gridline(uv.y, 10.0, 0.016);
  float mid = float(abs(uv.x - 0.5) < 0.002 || abs(uv.y - 0.5) < 0.002);
  float cross = float(length(uv - vec2(0.5)) < 0.012);
  return mix(vec3(0.014, 0.035, 0.07), vec3(0.05, 0.52, 0.73), max(gx, gy) * 0.7)
    + vec3(0.98, 0.68, 0.22) * (edge + cross)
    + vec3(0.6, 0.85, 0.9) * mid;
}
vec3 checker(vec2 uv) {
  vec2 cell = floor(uv * vec2(12.0, 8.0));
  float c = mod(cell.x + cell.y, 2.0);
  vec2 center = abs(fract(uv * vec2(12.0, 8.0)) - 0.5);
  float mark = float(center.x < 0.02 || center.y < 0.02);
  return mix(vec3(0.045, 0.08, 0.17), vec3(0.59, 0.85, 0.94), c)
    + vec3(0.23, 0.7, 1.0) * mark * 0.25;
}
vec4 sampleLayer(vec2 dest, mat3 inverseH, int mode, float opacity, int mask, float feather,
  int scene, float speed, float reactivity) {
  if (opacity <= 0.001) return vec4(0.0);
  vec3 mapped = inverseH * vec3(dest, 1.0);
  if (abs(mapped.z) < 0.000001) return vec4(0.0);
  vec2 uv = mapped.xy / mapped.z;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0);
  float alpha = opacity;
  if (mask == 1) {
    float radius = length((uv - 0.5) * 2.0);
    if (radius > 1.0) return vec4(0.0);
    if (feather > 0.0001)
      alpha *= 1.0 - smoothstep(1.0 - feather * 2.0, 1.0, radius);
  } else if (feather > 0.0001) {
    float d = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
    alpha *= smoothstep(0.0, feather, d);
  }
  vec3 c;
  if (mode == 3) c = texture2D(uMedia, uv).rgb;
  else if (mode == 1) c = calibration(uv);
  else if (mode == 2) c = checker(uv);
  else c = procedural(uv, scene, uTime * speed, clamp(uPulse * reactivity, 0.0, 1.0));
  return vec4(clamp(c, 0.0, 1.0), alpha);
}
void main() {
  vec2 dest = vec2(gl_FragCoord.x / uResolution.x, 1.0 - gl_FragCoord.y / uResolution.y);
  if (uBlackout > 0.5) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  vec3 color = vec3(0.0);
  ${renderLayers}
  gl_FragColor = vec4(color, 1.0);
}
`;

function compile(gl: WebGLRenderingContext, kind: number, source: string): WebGLShader {
  const shader = gl.createShader(kind);
  if (!shader) throw new Error('Could not allocate WebGL shader.');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) || 'Compilation failed';
    gl.deleteShader(shader);
    throw new Error(log);
  }
  return shader;
}

type SurfaceUniforms = {
  inverse: WebGLUniformLocation | null;
  mode: WebGLUniformLocation | null;
  opacity: WebGLUniformLocation | null;
  mask: WebGLUniformLocation | null;
  feather: WebGLUniformLocation | null;
  scene: WebGLUniformLocation | null;
  speed: WebGLUniformLocation | null;
  reactivity: WebGLUniformLocation | null;
};

export default function WarpCanvas({
  surfaces, mediaUrl, mediaKind, muted, audioLevel, blackout, className,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef({ surfaces, muted, audioLevel, blackout });
  const lastInverseRef = useRef<Map<string, Float32Array>>(new Map());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { propsRef.current = { surfaces, muted, audioLevel, blackout }; },
    [surfaces, muted, audioLevel, blackout]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { alpha: false, antialias: false });
    if (!gl) {
      setError('WebGL unavailable. Try a modern browser with GPU acceleration.');
      return;
    }
    let disposed = false;
    let frame = 0;
    let ready = false;
    let imageUploaded = false;
    let image: HTMLImageElement | null = null;
    let video: HTMLVideoElement | null = null;
    let vs: WebGLShader | null = null;
    let fs: WebGLShader | null = null;
    let program: WebGLProgram | null = null;
    let buffer: WebGLBuffer | null = null;
    let texture: WebGLTexture | null = null;
    try {
      vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
      fs = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT);
      program = gl.createProgram();
      if (!program) throw new Error('Could not create WebGL program.');
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) || 'WebGL linking failed.');
      }
      gl.useProgram(program);
      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER,
        new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
      const aPosition = gl.getAttribLocation(program, 'aPosition');
      gl.enableVertexAttribArray(aPosition);
      gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0);
      texture = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA,
        gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
      gl.uniform1i(gl.getUniformLocation(program, 'uMedia'), 0);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);

      if (mediaUrl && mediaKind === 'image') {
        image = new Image();
        image.onload = () => { if (!disposed) ready = true; };
        image.onerror = () => { if (!disposed) setError('Image could not be decoded.'); };
        image.src = mediaUrl;
      } else if (mediaUrl && mediaKind === 'video') {
        video = document.createElement('video');
        video.src = mediaUrl;
        video.loop = true;
        video.playsInline = true;
        video.muted = true;
        video.preload = 'auto';
        video.onloadeddata = () => { if (!disposed) ready = true; };
        video.onerror = () => { if (!disposed) setError('Video could not be decoded.'); };
        video.play().catch(() => {
          if (!disposed) setError('Autoplay blocked. Click within the page to allow video playback.');
        });
      }

      const uniform = (name: string) => gl.getUniformLocation(program!, name);
      const res = uniform('uResolution'), time = uniform('uTime'), count = uniform('uCount');
      const pulseUniform = uniform('uPulse'), blackoutUniform = uniform('uBlackout');
      const layerUniforms: SurfaceUniforms[] = Array.from({ length: MAX_SURFACES }, (_, i) => ({
        inverse: uniform('uInverse' + i), mode: uniform('uMode' + i),
        opacity: uniform('uOpacity' + i), mask: uniform('uMask' + i),
        feather: uniform('uFeather' + i),
        scene: uniform('uScene' + i), speed: uniform('uSpeed' + i),
        reactivity: uniform('uReactivity' + i),
      }));
      const started = performance.now();
      const identity = toGlMatrix([1,0,0, 0,1,0, 0,0,1]);

      const draw = () => {
        if (disposed) return;
        const { surfaces: current, muted: isMuted, audioLevel: pulse, blackout: black } = propsRef.current;
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
        const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w; canvas.height = h;
        }
        gl.viewport(0, 0, w, h);
        if (video) {
          video.muted = isMuted;
          if (ready && video.readyState >= 2) {
            gl.bindTexture(gl.TEXTURE_2D, texture);
            try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video); }
            catch { ready = false; }
          }
        } else if (image && ready && !imageUploaded) {
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
          imageUploaded = true;
        }
        const layers = current.filter(s => s.visible).slice(0, MAX_SURFACES);
        gl.uniform1i(count, layers.length);
        gl.uniform2f(res, w, h);
        gl.uniform1f(time, (performance.now() - started) / 1000);
        gl.uniform1f(pulseUniform, Math.min(Math.max(pulse, 0), 1));
        gl.uniform1f(blackoutUniform, black ? 1 : 0);
        layers.forEach((layer, i) => {
          const u = layerUniforms[i];
          let inverse = lastInverseRef.current.get(layer.id) || identity;
          try {
            inverse = toGlMatrix(inverse3x3(homographyFromQuad(layer.corners)));
            lastInverseRef.current.set(layer.id, inverse);
          } catch {
            // Keep the last valid transform for an in-progress invalid drag.
          }
          gl.uniformMatrix3fv(u.inverse, false, inverse);
          gl.uniform1i(u.mode, layer.mode === 'grid' ? 1 : layer.mode === 'checker' ? 2 :
            layer.mode === 'media' && ready ? 3 : 0);
          gl.uniform1f(u.opacity, layer.opacity);
          gl.uniform1i(u.mask, layer.mask === 'ellipse' ? 1 : 0);
          gl.uniform1f(u.feather, layer.feather);
          gl.uniform1i(u.scene, layer.scene === 'tunnel' ? 1 : layer.scene === 'bubbles' ? 2 :
            layer.scene === 'lattice' ? 3 : 0);
          gl.uniform1f(u.speed, layer.speed);
          gl.uniform1f(u.reactivity, layer.reactivity);
        });
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        frame = requestAnimationFrame(draw);
      };
      setError(null);
      frame = requestAnimationFrame(draw);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unexpected WebGL error.');
    }
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
      if (image) image.onload = image.onerror = null;
      gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, [mediaUrl, mediaKind]);

  return <>
    <canvas ref={canvasRef} className={className || 'warp-canvas'}
      aria-label="Composite projection mapped output" />
    {error && <div className="canvas-error" role="alert">{error}</div>}
  </>;
}
