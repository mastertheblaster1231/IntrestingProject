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
      } catch (err) {
        // Silently handle frame exceptions
      }
      frameId = requestAnimationFrame(animate);
    };
    frameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameId);
  }, [callback]);
}

export function useThree() {
  return {
    camera: typeof window !== 'undefined' ? window.camera : null,
    scene: typeof window !== 'undefined' ? window.scene : null,
    gl: typeof window !== 'undefined' ? window.__oceanRenderer : null,
    size: { width: typeof window !== 'undefined' ? window.innerWidth : 1920, height: typeof window !== 'undefined' ? window.innerHeight : 1080 },
  };
}

export const Canvas = ({ children, ...props }) => (
  <div className="r3f-canvas-container" style={{ width: '100%', height: '100%', position: 'relative' }} {...props}>
    {children}
  </div>
);

export default { useFrame, useThree, Canvas };
