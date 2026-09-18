import React, { useEffect } from 'react';

/**
 * Lightweight Shim for @react-three/fiber
 * Provides standard R3F hooks (useFrame) and Canvas placeholder so R3F components
 * can execute smoothly in both native R3F environments and standalone Vite/Three.js bundles.
 */
export function useFrame(callback) {
  useEffect(() => {
    let frameId;
    let lastTime = performance.now();
    const animate = (time) => {
      const delta = (time - lastTime) * 0.001;
      lastTime = time;
      try {
        callback({ clock: { elapsedTime: time * 0.001 } }, delta);
      } catch (_err) {
        // Silently handle frame exceptions
      }
      frameId = requestAnimationFrame(animate);
    };
    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [callback]);
}

export function useThree(selector) {
  const state = {
    camera: typeof window !== 'undefined' ? (window.__oceanCamera || window.camera) : null,
    scene: typeof window !== 'undefined' ? window.scene : null,
    gl: typeof window !== 'undefined' ? window.__oceanRenderer : null,
    size: { width: typeof window !== 'undefined' ? window.innerWidth : 1920, height: typeof window !== 'undefined' ? window.innerHeight : 1080 },
  };
  // Real R3F supports selector form useThree((s) => s.gl) — honor it so
  // shim consumers don't crash on undefined property access.
  if (typeof selector === 'function') {
    try {
      return selector(state);
    } catch (_err) {
      return undefined;
    }
  }
  return state;
}

export const Canvas = ({ children, ...props }) =>
  React.createElement('div', {
    className: 'r3f-canvas-container',
    style: { width: '100%', height: '100%', position: 'relative' },
    ...props,
  }, children);

// No-op catalogue registration (real R3F `extend` maps three classes to JSX
// intrinsic elements). The comparison view only needs the symbol to exist at
// build time; rendering is handled by the vanilla Three.js scenes.
export function extend(_catalogue) {
  return undefined;
}

export function useLoader() {
  return null;
}

export function useGraph() {
  return { nodes: {}, materials: {} };
}

export function createPortal() {
  return null;
}

export default { useFrame, useThree, Canvas, extend, useLoader, useGraph, createPortal };
