
const canvas = document.createElement('canvas');
canvas.id = 'bg-canvas';
document.body.appendChild(canvas);

canvas.style.position = 'fixed';
canvas.style.top = '0';
canvas.style.left = '0';
canvas.style.width = '100vw';
canvas.style.height = '100vh';
canvas.style.zIndex = '-1';
canvas.style.pointerEvents = 'none';
canvas.style.opacity = '1';
canvas.style.mixBlendMode = 'screen';

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x000000, 0.015);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true
});

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// --- APPLE SIRI STYLE FLUID SHADER ---

// We don't need standard lights for a custom unlit shader
const geometry = new THREE.PlaneGeometry(2, 2, 128, 128);

// Custom Uniforms to pass data to the shaders
const uniforms = {
    u_time: { value: 0.0 },
    u_resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    u_mouse: { value: new THREE.Vector2(0, 0) },
    u_colorSaffron: { value: new THREE.Color("#FF9933") },
    u_colorWhite: { value: new THREE.Color("#FFFFFF") },
    u_colorGreen: { value: new THREE.Color("#138808") },
    u_colorBlue: { value: new THREE.Color("#000080") },
    u_scrollVelocity: { value: 0.0 }
};

// GLSL Vertex Shader
const vertexShader = `
    uniform float u_time;
    uniform float u_scrollVelocity;
    varying vec2 vUv;
    varying vec3 vPosition;
    
    // Simplex Noise Function (Ashima Arts)
    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
    vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
    float snoise(vec3 v) {
      const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
      const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
      vec3 i  = floor(v + dot(v, C.yyy) );
      vec3 x0 = v - i + dot(i, C.xxx) ;
      vec3 g = step(x0.yzx, x0.xyz);
      vec3 l = 1.0 - g;
      vec3 i1 = min( g.xyz, l.zxy );
      vec3 i2 = max( g.xyz, l.zxy );
      vec3 x1 = x0 - i1 + C.xxx;
      vec3 x2 = x0 - i2 + C.yyy;
      vec3 x3 = x0 - D.yyy;
      i = mod289(i);
      vec4 p = permute( permute( permute(
                 i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
               + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
               + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
      float n_ = 0.142857142857;
      vec3  ns = n_ * D.wyz - D.xzx;
      vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
      vec4 x_ = floor(j * ns.z);
      vec4 y_ = floor(j - 7.0 * x_ );
      vec4 x = x_ *ns.x + ns.yyyy;
      vec4 y = y_ *ns.x + ns.yyyy;
      vec4 h = 1.0 - abs(x) - abs(y);
      vec4 b0 = vec4( x.xy, y.xy );
      vec4 b1 = vec4( x.zw, y.zw );
      vec4 s0 = floor(b0)*2.0 + 1.0;
      vec4 s1 = floor(b1)*2.0 + 1.0;
      vec4 sh = -step(h, vec4(0.0));
      vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
      vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
      vec3 p0 = vec3(a0.xy,h.x);
      vec3 p1 = vec3(a0.zw,h.y);
      vec3 p2 = vec3(a1.xy,h.z);
      vec3 p3 = vec3(a1.zw,h.w);
      vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
      p0 *= norm.x;
      p1 *= norm.y;
      p2 *= norm.z;
      p3 *= norm.w;
      vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
      m = m * m;
      return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
    }

    void main() {
        vUv = uv;
        
        // Fluid displacement using noise
        float noiseFreq = 1.5;
        float noiseAmp = 0.4;
        vec3 noisePos = vec3(position.x * noiseFreq + u_time * 0.2, position.y * noiseFreq + u_time * 0.3, u_time * 0.1);
        
        // React to scrolling
        noisePos.z += u_scrollVelocity * 2.0;

        float noise = snoise(noisePos) * noiseAmp;
        vec3 newPosition = position + normal * noise;
        vPosition = newPosition;
        
        gl_Position = vec4(position, 1.0); // Fullscreen plane
    }
`;

// GLSL Fragment Shader
const fragmentShader = `
    uniform float u_time;
    uniform vec2 u_resolution;
    uniform vec2 u_mouse;
    uniform vec3 u_colorSaffron;
    uniform vec3 u_colorWhite;
    uniform vec3 u_colorGreen;
    uniform vec3 u_colorBlue;
    
    varying vec2 vUv;
    varying vec3 vPosition;
    
    // Copy the noise functions here to use in fragment coloring
    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
    vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
    float snoise(vec3 v) {
      const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
      const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
      vec3 i  = floor(v + dot(v, C.yyy) );
      vec3 x0 = v - i + dot(i, C.xxx) ;
      vec3 g = step(x0.yzx, x0.xyz);
      vec3 l = 1.0 - g;
      vec3 i1 = min( g.xyz, l.zxy );
      vec3 i2 = max( g.xyz, l.zxy );
      vec3 x1 = x0 - i1 + C.xxx;
      vec3 x2 = x0 - i2 + C.yyy;
      vec3 x3 = x0 - D.yyy;
      i = mod289(i);
      vec4 p = permute( permute( permute( i.z + vec4(0.0, i1.z, i2.z, 1.0 )) + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
      float n_ = 0.142857142857;
      vec3  ns = n_ * D.wyz - D.xzx;
      vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
      vec4 x_ = floor(j * ns.z);
      vec4 y_ = floor(j - 7.0 * x_ );
      vec4 x = x_ *ns.x + ns.yyyy;
      vec4 y = y_ *ns.x + ns.yyyy;
      vec4 h = 1.0 - abs(x) - abs(y);
      vec4 b0 = vec4( x.xy, y.xy );
      vec4 b1 = vec4( x.zw, y.zw );
      vec4 s0 = floor(b0)*2.0 + 1.0;
      vec4 s1 = floor(b1)*2.0 + 1.0;
      vec4 sh = -step(h, vec4(0.0));
      vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
      vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
      vec3 p0 = vec3(a0.xy,h.x);
      vec3 p1 = vec3(a0.zw,h.y);
      vec3 p2 = vec3(a1.xy,h.z);
      vec3 p3 = vec3(a1.zw,h.w);
      vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
      p0 *= norm.x;  p1 *= norm.y;  p2 *= norm.z;  p3 *= norm.w;
      vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
      m = m * m;
      return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
    }

    void main() {
        // Normalize coordinates and account for aspect ratio to prevent stretching
        vec2 uv = gl_FragCoord.xy / u_resolution.xy;
        uv.x *= u_resolution.x / u_resolution.y;
        
        // Base Noise Fields acting as fluid paths
        float flowTime = u_time * 0.15;
        
        // Generate complex flowing patterns by nesting noise
        float n1 = snoise(vec3(uv * 2.5, flowTime));
        float n2 = snoise(vec3(uv * 1.5 - n1 * 0.5, flowTime * 1.2));
        float n3 = snoise(vec3(uv * 3.0 + n2, flowTime * 0.8));
        
        // Mouse influence
        float distToMouse = distance(uv, vec2(u_mouse.x * (u_resolution.x/u_resolution.y), u_mouse.y));
        float mouseGlow = smoothstep(0.5, 0.0, distToMouse) * 0.5;

        // Mix colors dynamically based on the flowing noise fields
        // Math magic to blend the 4 colors into a cohesive aurora
        
        // Start black to maintain contrast
        vec3 finalColor = vec3(0.02); 
        
        // Smoothly blend the flag colors into the fluid strands
        float saffronBlend = smoothstep(-0.2, 0.8, n1);
        float greenBlend = smoothstep(-0.4, 0.6, n2);
        float whiteBlend = smoothstep(0.4, 1.0, n3) * 0.6; // White acts as a bright edge highlight
        float blueBlend = smoothstep(0.0, 1.0, sin(n1 * n2 * 10.0)) * 0.3; // Deep navy undertones

        // Additive blending for that intense "lit from within" glowing look
        vec3 colorLayer1 = mix(finalColor, u_colorSaffron, saffronBlend * 0.4);
        vec3 colorLayer2 = mix(colorLayer1, u_colorGreen, greenBlend * 0.4);
        vec3 colorLayer3 = mix(colorLayer2, u_colorWhite, whiteBlend);
        vec3 colorLayer4 = colorLayer3 + (u_colorBlue * blueBlend);

        // Enhance with mouse interaction
        finalColor = colorLayer4 + (u_colorWhite * mouseGlow * 0.2);
        
        // Vignette to keep edges darker
        float vignette = smoothstep(1.5, 0.5, length(vUv - 0.5));
        finalColor *= vignette;

        gl_FragColor = vec4(finalColor, 1.0);
    }
`;

// Create the Shader Material
const material = new THREE.ShaderMaterial({
    uniforms: uniforms,
    vertexShader: vertexShader,
    fragmentShader: fragmentShader,
    transparent: true,
    depthWrite: false
});

const plane = new THREE.Mesh(geometry, material);
scene.add(plane);

// We draw a full screen plane, so standard camera positioning doesn't matter
// The vertices are clamped to gl_Position = vec4(position, 1.0)
camera.position.z = 1;

// Interaction State
let scrollY = 0;
let lastScrollY = 0;
let scrollVelocity = 0;

// Update Mouse Uniform
window.addEventListener('mousemove', (e) => {
    // Normalize to 0 -> 1 for shader
    uniforms.u_mouse.value.x = e.clientX / window.innerWidth;
    uniforms.u_mouse.value.y = 1.0 - (e.clientY / window.innerHeight); // Flip Y for WebGL
});

window.addEventListener('scroll', () => {
    scrollY = window.scrollY;
});

const clock = new THREE.Clock();

function animate() {
    const time = clock.getElapsedTime();

    // Update Shader Time
    uniforms.u_time.value = time;

    // Calculate Kinetic Gravity from scrolling
    const deltaY = scrollY - lastScrollY;
    lastScrollY = scrollY;
    scrollVelocity += deltaY * 0.005;
    scrollVelocity *= 0.90; // Dampen

    // Pass scroll velocity to shader to make the fluid surge
    uniforms.u_scrollVelocity.value = scrollVelocity;

    renderer.render(scene, camera);
    requestAnimationFrame(animate);
}

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    // Update resolution uniform
    uniforms.u_resolution.value.set(window.innerWidth, window.innerHeight);
});
