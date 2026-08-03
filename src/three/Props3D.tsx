/**
 * Прочие 3D-элементы сцены:
 *  - StationSign — временный маркер для ещё не переведённых в 3D зон
 *    (площадка + столб + цветной «самоцвет»); кликается, как станция.
 * Персонаж живёт отдельно — см. Character3D.tsx.
 */

/** Временный знак-станция для зон без 3D-модели. */
export function StationSign({ color = '#8b5cf6' }: { color?: string }) {
  return (
    <group>
      <mesh receiveShadow position={[0, 0.12, 0]}>
        <cylinderGeometry args={[0.85, 0.9, 0.24, 24]} />
        <meshStandardMaterial color="#c2b79f" roughness={1} />
      </mesh>
      <mesh castShadow position={[0, 0.6, 0]}>
        <cylinderGeometry args={[0.07, 0.09, 0.9, 8]} />
        <meshStandardMaterial color="#8a5a33" roughness={0.9} />
      </mesh>
      <mesh castShadow position={[0, 1.15, 0]} rotation={[0, 0.5, 0]}>
        <octahedronGeometry args={[0.24, 0]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} roughness={0.3} metalness={0.2} flatShading />
      </mesh>
    </group>
  );
}

