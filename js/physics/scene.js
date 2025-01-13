import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { RoundedBoxGeometry } from 'roundedBoxGeometry';
import { Midi } from '@tonejs/midi';

// Three.js scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ 
    alpha: true,
    antialias: true
});
renderer.setClearColor(0x000000, 0); // Make background transparent
renderer.setSize(window.innerWidth, window.innerHeight);
document.getElementById('physics-scene').appendChild(renderer.domElement);

// Cannon.js physics world setup
const world = new CANNON.World();
world.gravity.set(0, -9.82, 0); // Gravity pointing down

// Camera position for 2.5D view
camera.position.set(0, 0, 10);
camera.lookAt(0, 0, 0);

const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(0, 10, 0);
scene.add(light);

const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
scene.add(ambientLight);

const rimLight = new THREE.SpotLight(0xffffff, 1, 0.5);
rimLight.position.set(0, 10, 0);
scene.add(rimLight);

// Invisible back wall (rotated floor)
const wallBody = new CANNON.Body({
    mass: 0,
    shape: new CANNON.Plane()
});
wallBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
wallBody.position.set(0, -7.3, 0);
world.addBody(wallBody);

// Load environment map
const cubeTextureLoader = new THREE.CubeTextureLoader();
const environmentMap = cubeTextureLoader
    .setPath('../../assets/textures/envmap/')
    .load([
        'px.jpg', 'nx.jpg',
        'py.jpg', 'ny.jpg',
        'pz.jpg', 'nz.jpg'
    ]);
scene.environment = environmentMap;

// Update renderer settings
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputEncoding = THREE.sRGBEncoding;

// MIDI handling
let midiData = null;
let startTime = null;
let scheduledNotes = [];
let useMultipleShapes = false; // Default to cubes only

async function loadMidiFile(fileName) {
    const midiFileName = fileName.replace('.png', '.mid');
    
    try {
        const response = await fetch(`./assets/midi/${midiFileName}`);
        if (!response.ok) {
            console.warn(`No MIDI file found for ${midiFileName}`);
            return;
        }
        const arrayBuffer = await response.arrayBuffer();
        midiData = new Midi(arrayBuffer);
        
        scheduledNotes = [];
        midiData.tracks.forEach(track => {
            track.notes.forEach(note => {
                scheduledNotes.push({
                    time: note.time,
                    velocity: note.velocity,
                    noteNumber: note.midi,
                    duration: note.duration,
                    triggered: false
                });
            });
        });
        
        scheduledNotes.sort((a, b) => a.time - b.time);
        console.log(`Loaded MIDI file: ${midiFileName} with ${scheduledNotes.length} notes`);
    } catch (error) {
        console.warn('Error loading MIDI file:', error);
        midiData = null;
        scheduledNotes = [];
    }
}

function createShape(noteData) {
    const size = 1.5;
    const hue = (noteData.noteNumber % 12) / 12;
    const color = new THREE.Color().setHSL(hue, 0.8, 0.5);
    
    // Only randomize shape if multiple shapes are enabled
    const shapeType = useMultipleShapes ? Math.floor(Math.random() * 4) : 0; // 0: cube, 1: sphere, 2: cone, 3: cylinder
    
    let geometry, shape;
    switch(shapeType) {
        case 0: // Cube
            geometry = new RoundedBoxGeometry(size, size, size, 8, 0.3);
            shape = new CANNON.Box(new CANNON.Vec3(size/2, size/2, size/2));
            break;
        case 1: // Sphere
            geometry = new THREE.SphereGeometry(size/2, 32, 32);
            shape = new CANNON.Sphere(size/2);
            break;
        case 2: // Cone
            geometry = new THREE.ConeGeometry(size/2, size, 32);
            shape = new CANNON.Cylinder(size/2, 0, size, 8);
            break;
        case 3: // Cylinder
            geometry = new THREE.CylinderGeometry(size/2, size/2, size, 32);
            shape = new CANNON.Cylinder(size/2, size/2, size, 8);
            break;
    }
    
    const material = new THREE.MeshPhysicalMaterial({ 
        color: color,
        metalness: 0.0,
        roughness: 0.02,
        envMapIntensity: 2.0,
        clearcoat: 1.0,
        clearcoatRoughness: 0.05,
        reflectivity: 1.0,
        ior: 3.0,
        specularIntensity: 1.0,
        specularColor: 0xffffff
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    mesh.scale.set(0.001, 0.001, 0.001);
    scene.add(mesh);

    const body = new CANNON.Body({
        mass: 1,
        shape: shape
    });
    
    const xPos = ((noteData.noteNumber - 60) / 24) * 8;
    body.position.set(
        xPos,
        -1 + (noteData.velocity * 2),
        0
    );
    
    // More energetic initial velocities
    const upwardVelocity = 5 + noteData.velocity * 5;
    const spinVelocity = (Math.random() - 0.5) * 20;
    body.velocity.set(
        (Math.random() - 0.5) * 2,
        upwardVelocity,
        (Math.random() - 0.5) * 2
    );
    body.angularVelocity.set(
        Math.random() - 0.5,
        spinVelocity,
        Math.random() - 0.5
    );

    // For non-cube shapes, we need to adjust the orientation
    if (shapeType === 2 || shapeType === 3) {
        // Rotate cylinders and cones to stand upright
        body.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    }

    world.addBody(body);
    return { 
        mesh: mesh, 
        body: body,
        spawnTime: performance.now(),
        initialScale: 1 + (noteData.velocity * 0.8),
        fadeOut: false,
        fadeStartTime: null,
        shapeType: shapeType // Store shape type for any shape-specific handling
    };
}

const cubes = [];
const maxCubes = 20; // Increased max since we'll handle cleanup gracefully

function animate(timestamp) {
    requestAnimationFrame(animate);
    
    if (startTime !== null && midiData !== null) {
        const currentTime = (timestamp - startTime) / 1000;
        
        // Remove cubes that have fallen below a certain point or finished fading
        for (let i = cubes.length - 1; i >= 0; i--) {
            const cube = cubes[i];
            
            if (cube.body.position.y < -10) {
                scene.remove(cube.mesh);
                world.removeBody(cube.body);
                cubes.splice(i, 1);
                continue;
            }
            
            // Start fade out for oldest cubes when approaching max
            if (cubes.length > maxCubes * 0.8 && !cube.fadeOut) { // Start cleanup at 80% capacity
                const oldestCubes = cubes
                    .filter(c => !c.fadeOut)
                    .sort((a, b) => a.spawnTime - b.spawnTime)
                    .slice(0, Math.floor(maxCubes * 0.2)); // Remove oldest 20%
                
                oldestCubes.forEach(c => {
                    c.fadeOut = true;
                    c.fadeStartTime = performance.now();
                });
            }
            
            // Handle fade out animation
            if (cube.fadeOut) {
                const fadeAge = performance.now() - cube.fadeStartTime;
                const fadeDuration = 500; // 500ms fade out
                const fadeProgress = Math.min(fadeAge / fadeDuration, 1);
                
                if (fadeProgress >= 1) {
                    scene.remove(cube.mesh);
                    world.removeBody(cube.body);
                    cubes.splice(i, 1);
                } else {
                    // Scale down and fade out
                    const scale = cube.initialScale * (1 - fadeProgress);
                    cube.mesh.scale.set(scale, scale, scale);
                    cube.mesh.material.opacity = 1 - fadeProgress;
                    cube.mesh.material.transparent = true;
                    
                    // Add some upward force as they fade
                    cube.body.velocity.y += 0.1;
                    cube.body.angularVelocity.set(
                        cube.body.angularVelocity.x * 1.05,
                        cube.body.angularVelocity.y * 1.05,
                        cube.body.angularVelocity.z * 1.05
                    );
                }
            }
        }
        
        // Spawn new shapes from MIDI notes
        scheduledNotes.forEach(note => {
            if (!note.triggered && note.time <= currentTime) {
                if (cubes.length >= maxCubes) {
                    const oldestShape = cubes.reduce((oldest, current) => 
                        !current.fadeOut && (!oldest || current.spawnTime < oldest.spawnTime) ? current : oldest
                    , null);
                    if (oldestShape) {
                        oldestShape.fadeOut = true;
                        oldestShape.fadeStartTime = performance.now();
                    }
                }
                cubes.push(createShape(note));
                note.triggered = true;
            }
        });
    }
    
    world.step(1/60);
    
    // Update cubes with scale animation
    cubes.forEach(cube => {
        if (!cube.fadeOut) {
            // Normal pop-in animation
            const age = performance.now() - cube.spawnTime;
            const scaleProgress = Math.min(age / 150, 1);
            const currentScale = cube.initialScale * (1 - Math.pow(1 - scaleProgress, 4));
            cube.mesh.scale.set(currentScale, currentScale, currentScale);
        }
        
        cube.mesh.position.copy(cube.body.position);
        cube.mesh.quaternion.copy(cube.body.quaternion);
    });
    
    renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();

// Export functions for use in other modules
export const physicsScene = {
    loadMidi: loadMidiFile,
    startMidiPlayback: () => {
        startTime = performance.now();
    },
    stopMidiPlayback: () => {
        startTime = null;
        scheduledNotes.forEach(note => note.triggered = false);
    },
    toggleShapes: () => {
        useMultipleShapes = !useMultipleShapes;
        return useMultipleShapes; // Return new state
    },
    // Add getter for current state
    isUsingMultipleShapes: () => useMultipleShapes
}; 