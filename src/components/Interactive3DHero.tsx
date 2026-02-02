import { Canvas, useFrame } from "@react-three/fiber";
import { Physics, RigidBody, CuboidCollider } from "@react-three/rapier";
import { useRef, useMemo, useState } from "react";
import { Environment, Center, Text3D, Float, Stats } from "@react-three/drei";
import * as THREE from "three";
import { Vector3 } from "three";

// Generate random shapes/crackers
function Crackers({ count = 20 }) {
  const crackers = useMemo(() => {
    return new Array(count).fill(0).map(() => ({
      position: [
        (Math.random() - 0.5) * 15,
        Math.random() * 20 + 5,
        (Math.random() - 0.5) * 5,
      ] as [number, number, number],
      rotation: [Math.random() * Math.PI, Math.random() * Math.PI, 0] as [
        number,
        number,
        number
      ],
      color: ["#FF5722", "#FFC107", "#FF0000", "#FFD700", "#FF4500"][
        Math.floor(Math.random() * 5)
      ],
      scale: Math.random() * 0.5 + 0.5,
    }));
  }, [count]);

  return (
    <>
      {crackers.map((c, i) => (
        <RigidBody
          key={i}
          position={c.position}
          rotation={c.rotation}
          colliders="hull"
          restitution={0.5}
          friction={0.2}
        >
          <mesh castShadow receiveShadow>
            {i % 2 === 0 ? <cylinderGeometry args={[0.2 * c.scale, 0.2 * c.scale, 1.5 * c.scale]} /> : <boxGeometry args={[0.5 * c.scale, 0.5 * c.scale, 0.5 * c.scale]} />}
            <meshStandardMaterial color={c.color} />
          </mesh>
        </RigidBody>
      ))}
    </>
  );
}

function MouseCollider() {
  const api = useRef<any>(null);
  const position = new Vector3();
  
  useFrame(({ mouse, viewport }) => {
    if (api.current) {
        // Map normalized mouse coordinates to 3D world coordinates
        // Assuming camera z=10, approx width matches viewport
        position.set(
            (mouse.x * viewport.width) / 2,
            (mouse.y * viewport.height) / 2,
            0
        );
        api.current.setTranslation(position, true);
    }
  });

  return (
    <RigidBody
      ref={api}
      type="kinematicPosition"
      colliders={false}
      position={[0, 0, 0]}
    >
      <CuboidCollider args={[0.5, 0.5, 0.5]} />
    </RigidBody>
  );
}

export function Interactive3DHero() {
  // Use a font URL that exists or dynamic loading. For Text3D, we need a typeface JSON.
  // Using a standard free one from THREE examples or a CDN if possible.
  // Ideally, generating one locally or using default if missing.
  // Since we can't easily rely on a local typeface.json, let's use a simpler approach or a public URL.
  // NOTE: Text3D requires a fontUrl. I'll use a standard one.
  const fontUrl = "https://threejs.org/examples/fonts/helvetiker_bold.typeface.json";

  return (
    <div className="w-full h-[300px] sm:h-[400px] md:h-[500px] lg:h-[600px] bg-gradient-to-br from-gray-900 to-black relative overflow-hidden">
      <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center">
            {/* Overlay if needed */}
      </div>
      
      <Canvas shadows camera={{ position: [0, 0, 15], fov: 35 }}>
        <ambientLight intensity={0.5} />
        <spotLight
          position={[10, 10, 10]}
          angle={0.15}
          penumbra={1}
          intensity={1}
          castShadow
        />
        <Physics gravity={[0, -5, 0]}>
          <MouseCollider />
          {/* Floor */}
          <RigidBody type="fixed" position={[0, -5, 0]} restitution={0.2} friction={1}>
            <CuboidCollider args={[50, 1, 10]} />
            <mesh receiveShadow>
                <boxGeometry args={[100, 2, 20]} />
                <meshStandardMaterial color="#1a1a1a" transparent opacity={0} />
            </mesh>
          </RigidBody>
            
          {/* Walls to keep objects in view */}
           <RigidBody type="fixed" position={[-10, 0, 0]}>
            <CuboidCollider args={[1, 20, 10]} />
           </RigidBody>
           <RigidBody type="fixed" position={[10, 0, 0]}>
            <CuboidCollider args={[1, 20, 10]} />
           </RigidBody>


          <Center position={[0, 2, 0]}>
            <Float floatIntensity={1} speed={2}>
                 {/* Fallback text if Text3D fails to load or just standard mesh text */}
                  {/* Implementing 3D Text is complex due to font loading. 
                      Let's use just objects for now or try loading. */}
                 {/* <Text3D font={fontUrl} size={1.5} height={0.2} curveSegments={12} bevelEnabled bevelThickness={0.02} bevelSize={0.02} bevelOffset={0} bevelSegments={5}>
                    SoundWave
                    <meshStandardMaterial color="white" />
                 </Text3D> */}
                 {/* Removing Text3D to avoid crash on missing font. Overlay HTML is safer for text. */}
            </Float>
          </Center>

          <Crackers count={40} />
        </Physics>
        
        <Environment preset="city" />
      </Canvas>
      
      {/* HTML Overlay for SEO and guaranteed visibility */}
      <div className="absolute inset-0 z-20 flex flex-col items-center justify-center pointer-events-none">
         <motion.div 
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.5 }}
            className="text-center"
         >
            <h1 className="text-5xl md:text-7xl font-bold text-white mb-4 drop-shadow-[0_0_15px_rgba(255,87,34,0.8)]">
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary-red via-primary-orange to-primary-yellow">
                    SoundWave
                </span>
            </h1>
            <h2 className="text-3xl md:text-5xl font-bold text-white drop-shadow-lg">
                Crackers
            </h2>
            <p className="text-gray-300 mt-4 text-lg">Swipe to interact!</p>
         </motion.div>
      </div>
    </div>
  );
}

import { motion } from "framer-motion";
