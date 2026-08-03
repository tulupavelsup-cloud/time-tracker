/**
 * Ратуша — главный объект карты, стоит в центре площади. Созвон №6: «посередине
 * что-то основное, и вокруг него всё пляшет». Это не станция-категория: ратуша
 * растёт от СУММЫ часов по всем станциям (getTownLevel), то есть показывает
 * город целиком.
 *
 * Уровни (0..6): 0 стройплощадка → 1 сруб → 2 каменная ратуша с крыльцом →
 * 3 часовая башня → 4 городская управа: крылья, флаги, фонари → 5 дворец:
 * колоннада и купол → 6 столица: золотой шпиль, флюгер, свет во всех окнах.
 *
 * На башне настоящие часы: стрелки показывают текущее время. Это центр
 * тайм-трекера — пусть он и будет часами.
 */

import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';

const STONE = '#ece5d3';
const STONE_D = '#d8d0ba';
const PLINTH = '#c3b9a1';
const ROOF = '#b04a3f';
const ROOF_D = '#8e3a31';
const WOOD = '#a9743f';
const WOOD_D = '#7a5230';
const GOLD = '#f3cf5f';
const GOLD_D = '#c8a13e';
const GLASS = '#5b8ea8';

/** Окно: рама, стекло и переплёт. Светится, когда в городе идёт работа. */
function Window({
  position,
  w = 0.26,
  h = 0.4,
  lit = false,
}: {
  position: [number, number, number];
  w?: number;
  h?: number;
  lit?: boolean;
}) {
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[w + 0.07, h + 0.07, 0.04]} />
        <meshStandardMaterial color={STONE_D} roughness={0.9} />
      </mesh>
      <mesh position={[0, 0, 0.03]}>
        <boxGeometry args={[w, h, 0.02]} />
        <meshStandardMaterial
          color={lit ? '#ffe6a8' : GLASS}
          emissive={lit ? '#ffbe52' : '#20384a'}
          emissiveIntensity={lit ? 0.9 : 0.15}
          roughness={0.35}
          metalness={0.1}
        />
      </mesh>
      <mesh position={[0, 0, 0.045]}>
        <boxGeometry args={[0.02, h, 0.01]} />
        <meshStandardMaterial color={WOOD_D} roughness={0.9} />
      </mesh>
    </group>
  );
}

/** Двускатная крыша: призма из коробки, повёрнутой на 45°, — как в референсах. */
function Gable({
  position,
  w,
  d,
  h,
  color = ROOF,
}: {
  position: [number, number, number];
  w: number;
  d: number;
  h: number;
  color?: string;
}) {
  return (
    <group position={position}>
      <mesh castShadow receiveShadow rotation={[0, 0, Math.PI / 4]} scale={[1, 1, 1]}>
        <boxGeometry args={[h * 1.42, h * 1.42, d]} />
        <meshStandardMaterial color={color} roughness={0.85} flatShading />
      </mesh>
      {/* карниз — свес крыши, без него коробка читается коробкой */}
      <mesh castShadow position={[0, -h * 0.7, 0]}>
        <boxGeometry args={[w + 0.24, 0.09, d + 0.2]} />
        <meshStandardMaterial color={ROOF_D} roughness={0.85} />
      </mesh>
    </group>
  );
}

/** Флаг на флагштоке. */
function Flag({ position, color = '#e8564a', s = 1 }: { position: [number, number, number]; color?: string; s?: number }) {
  return (
    <group position={position} scale={s}>
      <mesh castShadow position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.022, 0.026, 0.6, 6]} />
        <meshStandardMaterial color="#6f5a44" roughness={0.9} />
      </mesh>
      <mesh castShadow position={[0.16, 0.48, 0]} rotation={[0, 0.16, 0]}>
        <boxGeometry args={[0.3, 0.19, 0.015]} />
        <meshStandardMaterial color={color} roughness={0.8} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0.63, 0]}>
        <sphereGeometry args={[0.035, 10, 8]} />
        <meshStandardMaterial color={GOLD} metalness={0.5} roughness={0.3} />
      </mesh>
    </group>
  );
}

/**
 * Циферблат с настоящими стрелками. Часы — сердце тайм-трекера, поэтому время
 * на башне идёт по-настоящему, а не нарисовано.
 *
 * Стрелки переставляются раз в полминуты, а не каждый кадр: минутная за кадр
 * проходит четыре тысячных градуса — разницы не видно, а покадровый пересчёт
 * стоит ровно столько же, сколько любая другая анимация.
 */
function ClockFace({ position, r = 0.3, gold = false }: { position: [number, number, number]; r?: number; gold?: boolean }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  const minutes = now.getMinutes() + now.getSeconds() / 60;
  const hours = (now.getHours() % 12) + minutes / 60;
  const ticks = useMemo(() => Array.from({ length: 12 }, (_, i) => (i / 12) * Math.PI * 2), []);
  return (
    <group position={position}>
      <mesh castShadow rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[r + 0.05, r + 0.05, 0.07, 24]} />
        <meshStandardMaterial color={gold ? GOLD : STONE_D} metalness={gold ? 0.55 : 0} roughness={gold ? 0.3 : 0.9} />
      </mesh>
      <mesh position={[0, 0, 0.05]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[r, r, 0.03, 24]} />
        <meshStandardMaterial color="#fbf7ea" roughness={0.6} />
      </mesh>
      {ticks.map((a, i) => (
        <mesh key={i} position={[Math.sin(a) * r * 0.82, Math.cos(a) * r * 0.82, 0.07]}>
          <boxGeometry args={[0.025, i % 3 === 0 ? 0.075 : 0.045, 0.012]} />
          <meshStandardMaterial color="#3b3229" />
        </mesh>
      ))}
      <group position={[0, 0, 0.08]} rotation={[0, 0, -(hours / 12) * Math.PI * 2]}>
        <mesh position={[0, r * 0.26, 0]}>
          <boxGeometry args={[0.032, r * 0.52, 0.014]} />
          <meshStandardMaterial color="#2f2721" />
        </mesh>
      </group>
      <group position={[0, 0, 0.09]} rotation={[0, 0, -(minutes / 60) * Math.PI * 2]}>
        <mesh position={[0, r * 0.38, 0]}>
          <boxGeometry args={[0.022, r * 0.76, 0.014]} />
          <meshStandardMaterial color="#2f2721" />
        </mesh>
      </group>
      <mesh position={[0, 0, 0.1]}>
        <sphereGeometry args={[0.032, 10, 8]} />
        <meshStandardMaterial color={GOLD} metalness={0.6} roughness={0.25} />
      </mesh>
    </group>
  );
}

/** Колонна с базой и капителью. */
function Column({ position, h = 1.1 }: { position: [number, number, number]; h?: number }) {
  return (
    <group position={position}>
      <mesh castShadow receiveShadow position={[0, h / 2, 0]}>
        <cylinderGeometry args={[0.1, 0.115, h, 12]} />
        <meshStandardMaterial color={STONE} roughness={0.9} />
      </mesh>
      <mesh castShadow position={[0, 0.05, 0]}>
        <boxGeometry args={[0.28, 0.1, 0.28]} />
        <meshStandardMaterial color={PLINTH} roughness={0.95} />
      </mesh>
      <mesh castShadow position={[0, h - 0.04, 0]}>
        <boxGeometry args={[0.28, 0.1, 0.28]} />
        <meshStandardMaterial color={STONE_D} roughness={0.9} />
      </mesh>
    </group>
  );
}

/** Строительные леса нулевого уровня. */
function Scaffold() {
  const bars = useMemo(() => {
    const out: { p: [number, number, number]; s: [number, number, number] }[] = [];
    for (const x of [-0.85, 0.85]) {
      for (const z of [-0.7, 0.7]) out.push({ p: [x, 0.6, z], s: [0.07, 1.2, 0.07] });
    }
    for (const y of [0.45, 0.95]) {
      out.push({ p: [0, y, -0.7], s: [1.78, 0.06, 0.06] });
      out.push({ p: [0, y, 0.7], s: [1.78, 0.06, 0.06] });
      out.push({ p: [-0.85, y, 0], s: [0.06, 0.06, 1.48] });
      out.push({ p: [0.85, y, 0], s: [0.06, 0.06, 1.48] });
    }
    return out;
  }, []);
  return (
    <group>
      {bars.map((b, i) => (
        <mesh key={i} castShadow position={b.p}>
          <boxGeometry args={b.s} />
          <meshStandardMaterial color={i % 3 ? WOOD : WOOD_D} roughness={0.95} />
        </mesh>
      ))}
      {/* настил и ведро с раствором */}
      <mesh castShadow receiveShadow position={[0, 1, 0.4]}>
        <boxGeometry args={[1.6, 0.06, 0.5]} />
        <meshStandardMaterial color="#c9a26a" roughness={0.95} />
      </mesh>
      <mesh castShadow position={[0.5, 1.12, 0.4]}>
        <cylinderGeometry args={[0.11, 0.09, 0.18, 12]} />
        <meshStandardMaterial color="#7f858e" metalness={0.4} roughness={0.6} />
      </mesh>
    </group>
  );
}

/**
 * Ратуша. level — 0..6, active — идёт ли в городе работа (окна горят ярче,
 * над крыльцом зажигается фонарь).
 */
export function TownHall({ level, active = false }: { level: number; active?: boolean }) {
  const s = Math.min(6, Math.max(0, Math.round(level)));
  const lit = active || s >= 5;
  const top = s >= 6;
  // высота башни растёт с уровнем — силуэт города меняется вместе с часами
  const towerH = s >= 3 ? 1.5 + (s - 3) * 0.42 : 0;

  return (
    <group>
      {/* стилобат: ступени на площади — ратуша приподнята над мостовой */}
      <mesh receiveShadow position={[0, 0.09, 0]}>
        <cylinderGeometry args={[1.95, 2.1, 0.18, 32]} />
        <meshStandardMaterial color={PLINTH} roughness={1} />
      </mesh>
      <mesh receiveShadow position={[0, 0.23, 0]}>
        <cylinderGeometry args={[1.72, 1.85, 0.12, 32]} />
        <meshStandardMaterial color="#d6ccb4" roughness={1} />
      </mesh>

      {/* 0 — стройплощадка */}
      {s === 0 && (
        <group position={[0, 0.29, 0]}>
          <mesh receiveShadow position={[0, 0.12, 0]}>
            <boxGeometry args={[1.7, 0.24, 1.4]} />
            <meshStandardMaterial color="#b4ab94" roughness={1} />
          </mesh>
          <Scaffold />
        </group>
      )}

      {/* 1 — сруб: деревянный дом с двускатной крышей */}
      {s === 1 && (
        <group position={[0, 0.29, 0]}>
          <mesh castShadow receiveShadow position={[0, 0.52, 0]}>
            <boxGeometry args={[1.7, 1.04, 1.35]} />
            <meshStandardMaterial color={WOOD} roughness={0.95} />
          </mesh>
          {/* венцы сруба */}
          {[0.2, 0.5, 0.8].map((y) => (
            <mesh key={y} position={[0, y, 0]}>
              <boxGeometry args={[1.74, 0.05, 1.39]} />
              <meshStandardMaterial color={WOOD_D} roughness={0.95} />
            </mesh>
          ))}
          <Gable position={[0, 1.3, 0]} w={1.7} d={1.45} h={0.62} color="#7d6a4e" />
          <Window position={[0, 0.6, 0.69]} lit={lit} />
          <mesh position={[0, 0.24, 0.69]}>
            <boxGeometry args={[0.42, 0.62, 0.05]} />
            <meshStandardMaterial color={WOOD_D} roughness={0.9} />
          </mesh>
        </group>
      )}

      {/* 2+ — каменное здание ратуши */}
      {s >= 2 && (
        <group position={[0, 0.29, 0]}>
          {/* корпус: камень внизу, штукатурка выше */}
          <mesh castShadow receiveShadow position={[0, 0.36, 0]}>
            <boxGeometry args={[2.05, 0.72, 1.55]} />
            <meshStandardMaterial color={PLINTH} roughness={0.95} />
          </mesh>
          <mesh castShadow receiveShadow position={[0, 1.06, 0]}>
            <boxGeometry args={[1.92, 0.7, 1.45]} />
            <meshStandardMaterial color={STONE} roughness={0.9} />
          </mesh>
          {s >= 4 && (
            <mesh castShadow receiveShadow position={[0, 1.68, 0]}>
              <boxGeometry args={[1.8, 0.56, 1.36]} />
              <meshStandardMaterial color={STONE_D} roughness={0.9} />
            </mesh>
          )}
          {/* карниз */}
          <mesh castShadow position={[0, s >= 4 ? 1.99 : 1.43, 0]}>
            <boxGeometry args={[2.14, 0.11, 1.66]} />
            <meshStandardMaterial color={STONE_D} roughness={0.9} />
          </mesh>

          {/* окна первого и второго этажа */}
          {[-0.62, 0, 0.62].map((x) => (
            <Window key={`a${x}`} position={[x, 0.42, 0.79]} lit={lit} />
          ))}
          {[-0.62, 0.62].map((x) => (
            <Window key={`b${x}`} position={[x, 1.08, 0.74]} lit={lit} />
          ))}
          {s >= 4 &&
            [-0.55, 0, 0.55].map((x) => <Window key={`c${x}`} position={[x, 1.7, 0.7]} w={0.22} h={0.32} lit={lit} />)}
          {/* боковые окна — здание живое и с торцов */}
          {[-1.04, 1.04].map((x) => (
            <group key={`s${x}`} rotation={[0, x < 0 ? -Math.PI / 2 : Math.PI / 2, 0]}>
              <Window position={[0, 0.42, 1.04]} w={0.22} h={0.34} lit={lit} />
            </group>
          ))}

          {/* крыльцо с козырьком */}
          <mesh castShadow receiveShadow position={[0, 0.08, 0.92]}>
            <boxGeometry args={[0.9, 0.16, 0.42]} />
            <meshStandardMaterial color="#d6ccb4" roughness={1} />
          </mesh>
          <mesh position={[0, 0.42, 0.79]}>
            <boxGeometry args={[0.5, 0.68, 0.06]} />
            <meshStandardMaterial color={WOOD_D} roughness={0.9} />
          </mesh>
          <mesh castShadow position={[0, 0.86, 0.95]} rotation={[-0.35, 0, 0]}>
            <boxGeometry args={[1.0, 0.06, 0.42]} />
            <meshStandardMaterial color={ROOF} roughness={0.85} />
          </mesh>
          {lit && <pointLight position={[0, 0.82, 1.05]} color="#ffc46a" intensity={0.55} distance={2.6} decay={2} />}

          {/* 3+ — часовая башня */}
          {s >= 3 && (
            <group position={[0, s >= 4 ? 2.05 : 1.49, -0.05]}>
              <mesh castShadow receiveShadow position={[0, towerH / 2, 0]}>
                <boxGeometry args={[0.86, towerH, 0.86]} />
                <meshStandardMaterial color={STONE} roughness={0.9} />
              </mesh>
              {/* пояски башни */}
              <mesh position={[0, towerH * 0.45, 0]}>
                <boxGeometry args={[0.92, 0.07, 0.92]} />
                <meshStandardMaterial color={STONE_D} roughness={0.9} />
              </mesh>
              <mesh castShadow position={[0, towerH + 0.05, 0]}>
                <boxGeometry args={[1.02, 0.1, 1.02]} />
                <meshStandardMaterial color={STONE_D} roughness={0.9} />
              </mesh>
              {/* циферблаты: на фасад и вбок */}
              <ClockFace position={[0, towerH * 0.72, 0.45]} r={0.28} gold={top} />
              <group rotation={[0, Math.PI / 2, 0]}>
                <ClockFace position={[0, towerH * 0.72, 0.45]} r={0.28} gold={top} />
              </group>
              {/* шатёр башни */}
              <mesh castShadow position={[0, towerH + 0.42, 0]}>
                <coneGeometry args={[0.72, 0.72, 4]} />
                <meshStandardMaterial color={top ? GOLD_D : ROOF} roughness={top ? 0.35 : 0.85} metalness={top ? 0.5 : 0} flatShading />
              </mesh>
              {/* шпиль */}
              <mesh castShadow position={[0, towerH + 0.95, 0]}>
                <coneGeometry args={[0.06, 0.5, 6]} />
                <meshStandardMaterial color={GOLD} metalness={0.6} roughness={0.25} />
              </mesh>
              {top && (
                <>
                  <mesh position={[0, towerH + 1.26, 0]}>
                    <sphereGeometry args={[0.09, 12, 10]} />
                    <meshStandardMaterial color={GOLD} emissive={GOLD_D} emissiveIntensity={0.6} metalness={0.7} roughness={0.2} />
                  </mesh>
                  <pointLight position={[0, towerH + 1.26, 0]} color="#ffdc8a" intensity={0.9} distance={5} decay={2} />
                </>
              )}
            </group>
          )}

          {/* 2..3 — простая двускатная крыша, пока нет надстройки */}
          {s >= 2 && s <= 3 && <Gable position={[0, 1.78, 0]} w={2.05} d={1.56} h={0.6} />}

          {/* 4+ — флаги на карнизе */}
          {s >= 4 && (
            <>
              <Flag position={[-0.86, 2.02, 0.62]} color="#e8564a" s={0.9} />
              <Flag position={[0.86, 2.02, 0.62]} color="#4a9be8" s={0.9} />
            </>
          )}

          {/* 5+ — колоннада и купола по бокам */}
          {s >= 5 && (
            <group>
              {[-0.72, -0.24, 0.24, 0.72].map((x) => (
                <Column key={x} position={[x, 0, 1.0]} h={1.0} />
              ))}
              <mesh castShadow position={[0, 1.1, 1.0]}>
                <boxGeometry args={[1.9, 0.16, 0.5]} />
                <meshStandardMaterial color={STONE_D} roughness={0.9} />
              </mesh>
              {/* фронтон над портиком */}
              <mesh castShadow position={[0, 1.32, 1.0]} rotation={[0, 0, Math.PI / 4]}>
                <boxGeometry args={[0.4, 0.4, 0.46]} />
                <meshStandardMaterial color={STONE} roughness={0.9} flatShading />
              </mesh>
              {[-1.16, 1.16].map((x) => (
                <group key={x} position={[x, 2.05, 0]}>
                  <mesh castShadow>
                    <sphereGeometry args={[0.34, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
                    <meshStandardMaterial
                      color={top ? GOLD : '#9fb6c4'}
                      metalness={top ? 0.65 : 0.3}
                      roughness={top ? 0.25 : 0.5}
                    />
                  </mesh>
                  <mesh castShadow position={[0, 0.4, 0]}>
                    <coneGeometry args={[0.05, 0.28, 6]} />
                    <meshStandardMaterial color={GOLD} metalness={0.6} roughness={0.3} />
                  </mesh>
                </group>
              ))}
            </group>
          )}

          {/* 6 — золотая отделка цоколя и фонари у крыльца */}
          {top && (
            <group>
              <mesh position={[0, 0.73, 0]}>
                <boxGeometry args={[2.1, 0.06, 1.6]} />
                <meshStandardMaterial color={GOLD} metalness={0.7} roughness={0.25} emissive={GOLD_D} emissiveIntensity={0.25} />
              </mesh>
              {[-0.62, 0.62].map((x) => (
                <group key={x} position={[x, 0.16, 1.12]}>
                  <mesh castShadow position={[0, 0.3, 0]}>
                    <cylinderGeometry args={[0.035, 0.05, 0.6, 8]} />
                    <meshStandardMaterial color="#3c3a36" roughness={0.7} metalness={0.3} />
                  </mesh>
                  <mesh position={[0, 0.68, 0]}>
                    <boxGeometry args={[0.16, 0.2, 0.16]} />
                    <meshStandardMaterial color="#ffd98a" emissive="#ffb648" emissiveIntensity={1.6} roughness={0.4} />
                  </mesh>
                </group>
              ))}
            </group>
          )}
        </group>
      )}
    </group>
  );
}
