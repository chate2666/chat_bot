'use client';

import React, { useEffect, useRef } from 'react';
import { Renderer, Program, Mesh, Triangle } from 'ogl';

export type GradientWavesDetail = 'low' | 'medium' | 'high';

export interface GradientWavesProps {
  horizonColor?: string;
  waveColor?: string;
  crestColor?: string;
  speed?: number;
  amplitude?: number;
  waveScale?: number;
  waveRatio?: number;
  swell?: number;
  turbulence?: number;
  tilt?: number;
  zoom?: number;
  height?: number;
  fogDepth?: number;
  detail?: GradientWavesDetail;
  brightness?: number;
  opacity?: number;
  mouseInteraction?: boolean;
  parallaxStrength?: number;
  grain?: boolean;
  grainIntensity?: number;
  className?: string;
}

const hexToRgb = (hex: string): [number, number, number] => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return [1, 1, 1];
  return [
    parseInt(result[1], 16) / 255,
    parseInt(result[2], 16) / 255,
    parseInt(result[3], 16) / 255
  ];
};

const detailToSteps = (detail: GradientWavesDetail): number => {
  if (detail === 'low') return 40.0;
  if (detail === 'high') return 110.0;
  return 70.0;
};

const vertex = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const fragment = `#version 300 es
precision highp float;

uniform vec2  iResolution;
uniform float iTime;
uniform float uSpeed;
uniform float uAmplitude;
uniform float uWaveScale;
uniform float uWaveRatio;
uniform float uSwell;
uniform float uTurbulence;
uniform float uTilt;
uniform float uZoom;
uniform float uHeight;
uniform float uFogDepth;
uniform float uSteps;
uniform float uBrightness;
uniform float uOpacity;
uniform vec3  uHorizonColor;
uniform vec3  uWaveColor;
uniform vec3  uCrestColor;
uniform vec2  uMouse;
uniform float uParallaxStrength;
uniform float uGrainIntensity;

out vec4 fragColor;

/* ── Hash / noise ── */
float hash2(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

/* ── Wave height field (sine-plasma) ── */
float waveField(vec2 p, float t) {
  float spd = t * uSpeed;
  float s   = uWaveScale;
  float h   = 0.0;

  /* Primary sine-plasma */
  h += sin(p.x * s                          + spd          ) * uAmplitude;
  h += sin(p.y * s * uWaveRatio             + spd * 0.90   ) * uAmplitude;
  h += sin((p.x + p.y)  * s * 0.60         + spd * 1.10   ) * uAmplitude * 0.55;
  h += sin((p.x - p.y)  * s * 0.50         + spd * 0.70   ) * uAmplitude * 0.45;

  /* Swell — large-scale horizontal */
  h += sin(p.x * s * 0.12 + spd * 0.28) * uSwell     * 0.09;
  h += sin(p.y * s * 0.09 + spd * 0.22) * uSwell     * 0.07;

  /* Turbulence — cross-flow */
  h += sin((p.x * 0.8 + p.y)  * s * 0.07 + spd * 0.35) * uTurbulence * 0.065;
  h += cos((p.x - p.y * 1.20) * s * 0.06 + spd * 0.30) * uTurbulence * 0.055;

  return h;
}

/* ── Surface normal via finite differences ── */
vec3 waveNormal(vec2 p, float t) {
  const float e = 0.12;
  float h0 = waveField(p, t);
  float hx = waveField(p + vec2(e, 0.0), t);
  float hz = waveField(p + vec2(0.0, e), t);
  return normalize(vec3(h0 - hx, e, h0 - hz));
}

void main() {
  /* Screen-space UV, aspect-corrected */
  vec2 uv = (gl_FragCoord.xy / iResolution.xy) * 2.0 - 1.0;
  uv.x   *= iResolution.x / iResolution.y;

  /* Mouse parallax */
  uv += uMouse * uParallaxStrength * 0.04;

  float t  = iTime;

  /* Camera */
  float ct = cos(uTilt), st = sin(uTilt);
  vec3 camFwd   = vec3(0.0, -ct,  st);
  vec3 camRight = vec3(1.0,  0.0, 0.0);
  vec3 camUp    = vec3(0.0,  st,  ct);

  /* Ray origin */
  vec3 ro = vec3(uMouse.x * uParallaxStrength * 0.3, uHeight, 0.0);

  /* Ray direction */
  vec3 rd = normalize(camFwd
                    + (uv.x / uZoom) * camRight
                    + (uv.y / uZoom) * camUp);

  /* Horizon check */
  if (rd.y >= -0.001) {
    float skyT = clamp(dot(rd, camFwd) * 2.5, 0.0, 1.0);
    fragColor  = vec4(mix(uHorizonColor * 0.25, uHorizonColor, skyT), 0.0);
    return;
  }

  /* Raymarch */
  float hitDist = -ro.y / rd.y;
  int steps = int(uSteps);
  for (int i = 0; i < 110; i++) {
    if (i >= steps) break;
    vec3  p  = ro + rd * hitDist;
    float wh = waveField(p.xz, t);
    float d  = p.y - wh;
    if (abs(d) < 0.03) break;
    hitDist += d * 0.55;
    if (hitDist > 220.0 || hitDist < 0.0) {
      fragColor = vec4(uHorizonColor, 0.0);
      return;
    }
  }

  vec3  hitPos = ro + rd * hitDist;
  float h0     = waveField(hitPos.xz, t);

  /* Crest calculation */
  float maxH  = uAmplitude * 2.0;
  float crest = clamp((h0 / maxH) * 0.5 + 0.5, 0.0, 1.0);
  float sharp = pow(crest, 3.5);

  /* Normal */
  vec3  nrm  = waveNormal(hitPos.xz, t);

  /* Color mix */
  vec3 col = mix(uHorizonColor, uWaveColor, crest);
  col      = mix(col, uCrestColor, sharp);

  /* Specular highlight */
  vec3  lDir = normalize(vec3(0.4, 1.0, 0.6));
  vec3  hDir = normalize(lDir - rd);
  float spec = pow(max(dot(nrm, hDir), 0.0), 28.0);
  col       += uCrestColor * spec * 0.22;

  /* Fog */
  float fog = exp(-hitDist / uFogDepth);
  col       = mix(uHorizonColor, col, fog);
  float alpha = uOpacity * (0.20 + 0.80 * fog);

  /* Film grain */
  if (uGrainIntensity > 0.0) {
    float g = hash2(gl_FragCoord.xy + fract(t * 0.07)) * 2.0 - 1.0;
    col    += g * uGrainIntensity;
  }

  col *= uBrightness;
  col  = clamp(col, 0.0, 1.0);

  fragColor = vec4(col, alpha);
}
`;

export const GradientWaves: React.FC<GradientWavesProps> = ({
  horizonColor = '#5227FF',
  waveColor = '#FF9FFC',
  crestColor = '#FFFFFF',
  speed = 0.4,
  amplitude = 2.5,
  waveScale = 0.6,
  waveRatio = 0.9,
  swell = 35,
  turbulence = 20,
  tilt = 1.11,
  zoom = 1.0,
  height = 5.5,
  fogDepth = 15,
  detail = 'medium',
  brightness = 1.0,
  opacity = 1.0,
  mouseInteraction = true,
  parallaxStrength = 0.5,
  grain = true,
  grainIntensity = 0.05,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderer = new Renderer({
      alpha: true,
      antialias: false,
      powerPreference: 'high-performance'
    });
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);

    const canvas = gl.canvas;
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    container.appendChild(canvas);

    const geometry = new Triangle(gl);
    const program = new Program(gl, {
      vertex,
      fragment,
      uniforms: {
        iResolution: { value: [gl.canvas.width, gl.canvas.height] },
        iTime: { value: 0 },
        uSpeed: { value: speed },
        uAmplitude: { value: amplitude },
        uWaveScale: { value: waveScale },
        uWaveRatio: { value: waveRatio },
        uSwell: { value: swell },
        uTurbulence: { value: turbulence },
        uTilt: { value: tilt },
        uZoom: { value: zoom },
        uHeight: { value: height },
        uFogDepth: { value: fogDepth },
        uSteps: { value: detailToSteps(detail) },
        uBrightness: { value: brightness },
        uOpacity: { value: opacity },
        uHorizonColor: { value: hexToRgb(horizonColor) },
        uWaveColor: { value: hexToRgb(waveColor) },
        uCrestColor: { value: hexToRgb(crestColor) },
        uMouse: { value: [0, 0] },
        uParallaxStrength: { value: parallaxStrength },
        uGrainIntensity: { value: grain ? grainIntensity : 0.0 },
      },
    });

    const mesh = new Mesh(gl, { geometry, program });

    const handleResize = () => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      renderer.setSize(width, height);
      program.uniforms.iResolution.value = [gl.canvas.width, gl.canvas.height];
    };
    handleResize();
    window.addEventListener('resize', handleResize);

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((e.clientY - rect.top) / rect.height) * 2 - 1);
      program.uniforms.uMouse.value = [x, y];
    };

    if (mouseInteraction) {
      window.addEventListener('mousemove', handleMouseMove);
    }

    let animationFrameId: number;
    const t0 = performance.now();

    const render = () => {
      animationFrameId = requestAnimationFrame(render);
      program.uniforms.iTime.value = (performance.now() - t0) * 0.001;
      renderer.render({ scene: mesh });
    };
    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      if (mouseInteraction) {
        window.removeEventListener('mousemove', handleMouseMove);
      }
      if (canvas.parentNode) {
        canvas.parentNode.removeChild(canvas);
      }
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, [
    horizonColor,
    waveColor,
    crestColor,
    speed,
    amplitude,
    waveScale,
    waveRatio,
    swell,
    turbulence,
    tilt,
    zoom,
    height,
    fogDepth,
    detail,
    brightness,
    opacity,
    mouseInteraction,
    parallaxStrength,
    grain,
    grainIntensity,
  ]);

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden ${className}`}
      style={{ minHeight: '100%' }}
    />
  );
};

export default GradientWaves;
