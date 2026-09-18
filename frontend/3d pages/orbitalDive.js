import * as THREE from "three";
import { gsap } from "gsap";

/**
 * ============================================================================
 * 🚀 ORBITAL DIVE CAMERA TRANSITION CONTROLLER (GSAP & Three.js)
 * ============================================================================
 * Executes a two-phase cinematic camera trajectory from planetary orbit
 * down to the ocean waterline around a selected Argo float:
 * 
 * Phase 1 (Sweep & Center):
 * - Animates OrbitControls.target from current focus to the float's (x, y, z) coordinates.
 * - Simultaneously swings the camera along an elevated orbital arc until it is
 *   positioned directly above the target float, looking straight down along the surface normal.
 * 
 * Phase 2 (The Plunge):
 * - Pushes the camera in extremely close to the target coordinates using a strong
 *   power3.inOut easing curve (starts gradual, accelerates dramatically through
 *   the atmosphere, and decelerates smoothly as it arrives in front of the float).
 * 
 * State Hook / Event:
 * - Fires onThresholdCrossed callback and dispatches 'orbital-dive-threshold'
 *   when camera passes below a configurable distance threshold.
 */
export function createOrbitalDiveController({
  camera,
  controls,
  globeRadius = 1.5,
  scene = null,
}) {
  let activeTimeline = null;
  let isDiving = false;
  let divePhase = 'idle'; // 'idle' | 'sweep' | 'plunge' | 'complete'

  /**
   * Triggers the cinematic orbital dive towards target object or coordinates
   * @param {THREE.Object3D|THREE.Vector3|Object} target - The float marker object or point with { position, id }
   * @param {Object} options - Configuration overrides & callbacks
   */
  function triggerDive(target, options = {}) {
    if (isDiving && activeTimeline) {
      activeTimeline.kill();
    }

    const {
      durationPhase1 = 1.35, // Sweep & Center duration (seconds)
      durationPhase2 = 1.85, // The Plunge duration (seconds)
      orbitalElevation = 1.15, // Height above float during Phase 1 zenith (world units)
      plungeDistance = 0.05, // Final stopping distance in front of float (world units)
      distanceThreshold = 0.42, // Distance threshold where high-res water column grid / fade begins
      onPhase1Complete = null,
      onThresholdCrossed = null,
      onProgress = null,
      onComplete = null,
    } = options;

    // Resolve target position in 3D world space
    const targetPos = new THREE.Vector3();
    let floatId = 'A1';

    if (target && target.isObject3D) {
      target.getWorldPosition(targetPos);
      floatId = target.userData?.id || target.name || 'A1';
    } else if (target && target.position && Array.isArray(target.position)) {
      targetPos.set(target.position[0], target.position[1], target.position[2]);
      floatId = target.id || 'A1';
    } else if (target && target.position && target.position.isVector3) {
      targetPos.copy(target.position);
      floatId = target.id || target.userData?.id || 'A1';
    } else if (target && target.isVector3) {
      targetPos.copy(target);
    } else {
      console.warn('[OrbitalDive] Invalid target provided, defaulting to Indian Ocean baseline');
      targetPos.set(0.68, 0.32, -1.35);
    }

    // Surface normal vector pointing radially outward from Earth center (0,0,0)
    const normal = targetPos.clone().normalize();

    // Destination of Phase 1: elevated directly above float, looking down along normal
    const phase1EndPos = targetPos.clone().add(normal.clone().multiplyScalar(orbitalElevation));

    // Final destination of Phase 2: extremely close in front of float
    const finalPlungePos = targetPos.clone().add(normal.clone().multiplyScalar(plungeDistance));

    // Disable OrbitControls user input during cinematic sequence
    if (controls) {
      controls.enabled = false;
    }

    isDiving = true;
    divePhase = 'sweep';
    let thresholdFired = false;

    // Store initial camera and target coordinates
    const startCamPos = camera.position.clone();
    const startTarget = controls ? controls.target.clone() : new THREE.Vector3(0, 0, 0);

    // Initial and peak orbital radius for spherical arc interpolation (prevents globe clipping)
    const startRadius = startCamPos.length();
    const phase1Radius = phase1EndPos.length();
    const peakOrbitalRadius = Math.max(startRadius, phase1Radius, globeRadius + 1.3);

    // Quaternion slerp setup for smooth planetary arc sweep
    const startDir = startCamPos.clone().normalize();
    const endDir = normal.clone();
    const qStart = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), startDir);
    const qEnd = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), endDir);

    // Dispatch Start Event
    window.dispatchEvent(
      new CustomEvent('orbital-dive-start', {
        detail: { floatId, targetPos, cameraPos: startCamPos },
      })
    );

    // Create GSAP Timeline
    activeTimeline = gsap.timeline({
      onUpdate: () => {
        const currentDist = camera.position.distanceTo(targetPos);

        if (onProgress) {
          onProgress({
            phase: divePhase,
            distance: currentDist,
            progress: activeTimeline ? activeTimeline.progress() : 0,
          });
        }

        // Check if distance passed below threshold
        if (divePhase === 'plunge' && !thresholdFired && currentDist <= distanceThreshold) {
          thresholdFired = true;

          const detail = {
            floatId,
            distance: currentDist,
            threshold: distanceThreshold,
            targetPos,
            isDiving: true,
          };

          if (onThresholdCrossed) {
            onThresholdCrossed(detail);
          }

          window.dispatchEvent(new CustomEvent('orbital-dive-threshold', { detail }));
        }

        if (controls) {
          controls.update();
        }
      },
      onComplete: () => {
        isDiving = false;
        divePhase = 'complete';

        const detail = { floatId, targetPos, cameraPos: camera.position };

        if (onComplete) {
          onComplete(detail);
        }

        window.dispatchEvent(new CustomEvent('orbital-dive-complete', { detail }));
      },
    });

    // ========================================================================
    // PHASE 1: SWEEP & CENTER
    // ========================================================================
    // 1. Animate controls.target from (0,0,0) to target float coordinates
    const targetProxy = { x: startTarget.x, y: startTarget.y, z: startTarget.z };
    activeTimeline.to(
      targetProxy,
      {
        x: targetPos.x,
        y: targetPos.y,
        z: targetPos.z,
        duration: durationPhase1,
        ease: 'power2.inOut',
        onUpdate: () => {
          if (controls) {
            controls.target.set(targetProxy.x, targetProxy.y, targetProxy.z);
          }
        },
      },
      0
    );

    // 2. Swing camera along spherical orbital arc to align directly above target
    const sweepProxy = { t: 0 };
    activeTimeline.to(
      sweepProxy,
      {
        t: 1.0,
        duration: durationPhase1,
        ease: 'power2.inOut',
        onUpdate: () => {
          const t = sweepProxy.t;
          // Interpolate orientation on unit sphere using spherical quaternion slerp
          const currentQ = new THREE.Quaternion().copy(qStart).slerp(qEnd, t);
          const currentDir = new THREE.Vector3(0, 0, 1).applyQuaternion(currentQ);

          // Arc radius profile: bows slightly outward mid-flight to ensure cinematic majesty
          const arcElevation = Math.sin(t * Math.PI) * 0.25;
          const currentRadius = THREE.MathUtils.lerp(startRadius, phase1Radius, t) + arcElevation;

          camera.position.copy(currentDir.multiplyScalar(currentRadius));
          camera.lookAt(controls ? controls.target : targetPos);
        },
        onComplete: () => {
          divePhase = 'plunge';
          // Ensure exact alignment at end of Phase 1
          camera.position.copy(phase1EndPos);
          if (controls) controls.target.copy(targetPos);

          if (onPhase1Complete) {
            onPhase1Complete({ floatId, targetPos, phase1EndPos });
          }
        },
      },
      0
    );

    // ========================================================================
    // PHASE 2: THE PLUNGE (Strong power3.inOut Easing)
    // ========================================================================
    // Animate camera position plunging in extremely close to the target coordinates
    const plungeProxy = {
      x: phase1EndPos.x,
      y: phase1EndPos.y,
      z: phase1EndPos.z,
    };

    activeTimeline.to(
      plungeProxy,
      {
        x: finalPlungePos.x,
        y: finalPlungePos.y,
        z: finalPlungePos.z,
        duration: durationPhase2,
        ease: 'power3.inOut', // Strong cinematic acceleration & deceleration
        onUpdate: () => {
          camera.position.set(plungeProxy.x, plungeProxy.y, plungeProxy.z);
          if (controls) {
            controls.target.copy(targetPos);
          }
          camera.lookAt(targetPos);
        },
      },
      durationPhase1 // Starts immediately when Phase 1 completes
    );

    return activeTimeline;
  }

  function cancelDive() {
    if (activeTimeline) {
      activeTimeline.kill();
      activeTimeline = null;
    }
    isDiving = false;
    divePhase = 'idle';
    if (controls) {
      controls.enabled = true;
    }
  }

  return {
    triggerDive,
    cancelDive,
    isDiving: () => isDiving,
    getDivePhase: () => divePhase,
  };
}

/**
 * ============================================================================
 * REACT HOOK: useOrbitalDive
 * ============================================================================
 * Hook for React Three Fiber or React HUD components to control and subscribe
 * to the cinematic Orbital Dive state.
 */
export function useOrbitalDive(controllerRef, options = {}) {
  const [state, setState] = React.useState({
    isDiving: false,
    phase: 'idle',
    distance: 0,
    thresholdCrossed: false,
    floatId: null,
  });

  React.useEffect(() => {
    const handleStart = (e) => {
      setState((prev) => ({
        ...prev,
        isDiving: true,
        phase: 'sweep',
        floatId: e.detail?.floatId,
        thresholdCrossed: false,
      }));
    };

    const handleThreshold = (e) => {
      setState((prev) => ({
        ...prev,
        thresholdCrossed: true,
        distance: e.detail?.distance,
      }));
      if (options.onThresholdCrossed) {
        options.onThresholdCrossed(e.detail);
      }
    };

    const handleComplete = (e) => {
      setState((prev) => ({
        ...prev,
        isDiving: false,
        phase: 'complete',
      }));
      if (options.onComplete) {
        options.onComplete(e.detail);
      }
    };

    window.addEventListener('orbital-dive-start', handleStart);
    window.addEventListener('orbital-dive-threshold', handleThreshold);
    window.addEventListener('orbital-dive-complete', handleComplete);

    return () => {
      window.removeEventListener('orbital-dive-start', handleStart);
      window.removeEventListener('orbital-dive-threshold', handleThreshold);
      window.removeEventListener('orbital-dive-complete', handleComplete);
    };
  }, [options]);

  const triggerDive = React.useCallback(
    (target, customOpts) => {
      if (controllerRef && controllerRef.current) {
        controllerRef.current.triggerDive(target, { ...options, ...customOpts });
      }
    },
    [controllerRef, options]
  );

  return {
    ...state,
    triggerDive,
  };
}

export default createOrbitalDiveController;
