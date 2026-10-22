import { useEffect, useRef, useState } from 'react';
import type { Corners, MediaKind, VisualMode } from '../model';
import { homographyFromQuad, inverse3x3, toGlMatrix } from '../math/homography';

type Props = {
  corners: Corners;
  mode: VisualMode;
  opacity: number;
  mediaUrl: string | null;
  mediaKind: MediaKind;
  muted: boolean;
  className?: string;
};

const VERTEX = `
attribute vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const FRAGMENT = `
precision highp float;
uniform vec2 uResolution;
uniform mat3 uInverse;
uniform float uTime;
uniform float uOpacity;
uniform int uMode;
uniform sampler2D uMedia;

float line(float x, float n, float thickness) {
  return 1.0 - smoothstep(0.0, thickness, abs(fract(x * n) - 0.5));
}
vec3 demo(vec2 uv) {
  vec2 p = (uv - 0.5) * vec2(1.7777778, 1.0);
  float a = atan(p.y, p.x);
  float r = length(p);
  float spin = a * 12.0 + sin(r * 17.0 - uTime * 0.9);
  float rings = pow(0.5 + 0.5 * sin(r * 64.0 - uTime * 3.2), 9.0);
  float teeth = pow(0.5 + 0.5 * cos(spin + uTime * 0.7), 15.0);
  float bubbles = pow(0.5 + 0.5 * sin(r * 39.0 + cos(a * 9.0 + uTime) * 2.0), 12.0);
  vec3 base = vec3(0.01, 0.035, 0.085);
  vec3 cyan = vec3(0.08, 0.83, 1.0);
  vec3 violet = vec3(0.55, 0.27, 1.0);
  vec3 gold = vec3(1.0, 0.65, 0.21);
  float halo = 0.12 / (r + 0.06);
  vec3 color = base + cyan * rings * 0.75 + violet * teeth * rings +
    gold * bubbles * 0.22 + cyan * halo * 0.14;
  color += cyan * 0.12 * pow(0.5 + 0.5 * cos(a * 6.0 + uTime), 24.0);
  return color;
}
vec3 calibration(vec2 uv) {
  float edge = float(uv.x < 0.006 || uv.x > 0.994 || uv.y < 0.006 || uv.y > 0.994);
  float gx = line(uv.x, 10.0, 0.016);
  float gy = line(uv.y, 10.0, 0.016);
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
void main() {
  // WebGL gl_FragCoord is bottom-up; stage coordinates are top-down.
  vec2 dest = vec2(gl_FragCoord.x / uResolution.x, 1.0 - gl_FragCoord.y / uResolution.y);
  vec3 mapped = uInverse * vec3(dest, 1.0);
  if (abs(mapped.z) < 0.000001) { gl_FragColor = vec4(0.0,0.0,0.0,1.0); return; }
  vec2 uv = mapped.xy / mapped.z;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
    gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return;
  }
  vec3 color;
  if (uMode == 3) {
    // Image upload is unflipped: source top row is sampled at v=0.
    color = texture2D(uMedia, uv).rgb;
  } else if (uMode == 1) {
    color = calibration(uv);
  } else if (uMode == 2) {
    color = checker(uv);
  } else {
    color = demo(uv);
  }
  gl_FragColor = vec4(clamp(color * uOpacity, 0.0, 1.0), 1.0);
}
`;

function shader(gl: WebGLRenderingContext, kind: number, source: string): WebGLShader {
  const s = gl.createShader(kind);
  if (!s) throw new Error('Unable to allocate shader.');
  gl.shaderSource(s, source);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(s) || 'Shader compilation failed.');
  }
  return s;
}

export default function WarpCanvas({
  corners, mode, opacity, mediaUrl, mediaKind, muted, className,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef({ corners, mode, opacity, muted });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { inputRef.current = { corners, mode, opacity, muted }; },
    [corners, mode, opacity, muted]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { alpha: false, antialias: true });
    if (!gl) {
      setError('WebGL is unavailable. Enable hardware acceleration or use a supported browser.');
      return;
    }
    let frame = 0;
    let disposed = false;
    let video: HTMLVideoElement | null = null;
    let img: HTMLImageElement | null = null;
    let ready = false;
    let uploadedImage = false;
    let lastValidInverse = toGlMatrix([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    let program: WebGLProgram | null = null;
    let buffer: WebGLBuffer | null = null;
    let texture: WebGLTexture | null = null;
    let vs: WebGLShader | null = null;
    let fs: WebGLShader | null = null;

    try {
      vs = shader(gl, gl.VERTEX_SHADER, VERTEX);
      fs = shader(gl, gl.FRAGMENT_SHADER, FRAGMENT);
      program = gl.createProgram();
      if (!program) throw new Error('Unable to create WebGL program.');
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) || 'Shader linking failed.');
      }
      gl.useProgram(program);
      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1,
      ]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, 'aPosition');
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      texture = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0,
        gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
      gl.uniform1i(gl.getUniformLocation(program, 'uMedia'), 0);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);

      if (mediaUrl && mediaKind === 'image') {
        img = new Image();
        img.onload = () => { if (!disposed) ready = true; };
        img.onerror = () => { if (!disposed) setError('Could not decode the image.'); };
        img.src = mediaUrl;
      } else if (mediaUrl && mediaKind === 'video') {
        video = document.createElement('video');
        video.src = mediaUrl;
        video.loop = true;
        video.playsInline = true;
        video.muted = inputRef.current.muted;
        video.preload = 'auto';
        video.onloadeddata = () => { if (!disposed) ready = true; };
        video.onerror = () => { if (!disposed) setError('Could not decode the video.'); };
        video.play().catch(() => { /* User may need to interact to start playback. */ });
      }

      const uniforms = {
        res: gl.getUniformLocation(program, 'uResolution'),
        inv: gl.getUniformLocation(program, 'uInverse'),
        time: gl.getUniformLocation(program, 'uTime'),
        opacity: gl.getUniformLocation(program, 'uOpacity'),
        mode: gl.getUniformLocation(program, 'uMode'),
      };
      const started = performance.now();
      const draw = () => {
        if (disposed) return;
        const { corners: current, mode: visual, opacity: op, muted: isMuted } = inputRef.current;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
        const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w; canvas.height = h;
        }
        gl.viewport(0, 0, w, h);
        try {
          lastValidInverse = toGlMatrix(inverse3x3(homographyFromQuad(current)));
        } catch {
          // Preserve previous valid alignment during an invalid drag.
        }
        if (video) {
          video.muted = isMuted;
          if (ready && video.readyState >= 2) {
            gl.bindTexture(gl.TEXTURE_2D, texture);
            try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video); }
            catch { ready = false; }
          }
        } else if (img && ready && !uploadedImage) {
          gl.bindTexture(gl.TEXTURE_2D, texture);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
          uploadedImage = true;
        }
        gl.uniform2f(uniforms.res, w, h);
        gl.uniformMatrix3fv(uniforms.inv, false, lastValidInverse);
        gl.uniform1f(uniforms.time, (performance.now() - started) / 1000);
        gl.uniform1f(uniforms.opacity, op);
        gl.uniform1i(uniforms.mode, visual === 'media' && ready ? 3 :
          visual === 'grid' ? 1 : visual === 'checker' ? 2 : 0);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        frame = requestAnimationFrame(draw);
      };
      setError(null);
      frame = requestAnimationFrame(draw);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unknown WebGL error.');
    }
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
      if (img) img.onload = img.onerror = null;
      gl.deleteTexture(texture);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, [mediaUrl, mediaKind]);

  return (
    <>
      <canvas ref={canvasRef} className={className || 'warp-canvas'} aria-label="Projection mapped output" />
      {error && <div className="canvas-error" role="alert">{error}</div>}
    </>
  );
}
