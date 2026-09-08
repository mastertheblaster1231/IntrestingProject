import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import worldMapUrl from '../Images/Worldmap_pic.jpg';

// 1. Scene setup with black background
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

// 2. Camera setup
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(3, 2, 5);

// 3. Renderer setup
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

// 4. Orbit Controls (mouse interaction: left-drag to rotate, right-drag to pan, scroll to zoom)
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;

// 5. Axes Helper (X = Red, Y = Green, Z = Blue)
const axesHelper = new THREE.AxesHelper(3);
scene.add(axesHelper);

// 6. Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.9);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5);
directionalLight.position.set(5, 3, 5);
scene.add(directionalLight);

// 7. Texture Loader & World Sphere
const textureLoader = new THREE.TextureLoader();
const worldTexture = textureLoader.load(worldMapUrl);
worldTexture.colorSpace = THREE.SRGBColorSpace;

const geometry = new THREE.SphereGeometry(1.5, 64, 32);
const material = new THREE.MeshStandardMaterial({
  map: worldTexture,
  roughness: 0.5,
  metalness: 0.1
});
const sphere = new THREE.Mesh(geometry, material);
scene.add(sphere);

// 8. Responsive resize handling
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

// 9. Animation loop
function animate() {
  requestAnimationFrame(animate);

  // Update controls for smooth damping
  controls.update();

  renderer.render(scene, camera);
}

animate();

