/**
 * Чувачок — общий герой зон. Мягкий объёмный стиль: гогглы на лбу, комбинезон
 * с карманами/швами и поясом, шнурованные ботинки, румянец, мягкая тень.
 * Оригинальный персонаж, не копия чужого маскота. working=true — покачивается
 * и машет инструментом; sitting=true — сидит/отдыхает. Пропсы и рамка (40×54)
 * сохранены, чтобы карта и интерьеры не ломались.
 */

import { motion } from 'framer-motion';
import { SoftDefs, VolCircle, VolRect, GroundShadow, Gloss, useSoftId } from './soft';

export type HeroTool = 'none' | 'pickaxe' | 'wrench' | 'hammer' | 'pen';

interface HeroProps {
  size?: number;
  working?: boolean;
  tool?: HeroTool;
  /** Сидит (за столом / отдыхает) */
  sitting?: boolean;
}

function Tool({ tool }: { tool: HeroTool }) {
  switch (tool) {
    case 'pickaxe':
      return (
        <g>
          <line x1="0" y1="0" x2="10" y2="-12" stroke="#9c6a3c" strokeWidth="2.4" strokeLinecap="round" />
          <line x1="0.6" y1="-0.8" x2="8" y2="-9.6" stroke="#c08a52" strokeWidth="1" strokeLinecap="round" />
          <path d="M4 -15.5 Q 11 -19 16 -13" stroke="#aeb6c2" strokeWidth="3" fill="none" strokeLinecap="round" />
          <path d="M5 -15 Q 11 -18 15 -13.4" stroke="#e6ebf2" strokeWidth="1" fill="none" strokeLinecap="round" />
        </g>
      );
    case 'wrench':
      return (
        <g>
          <line x1="0" y1="0" x2="9" y2="-10" stroke="#aeb6c2" strokeWidth="2.8" strokeLinecap="round" />
          <circle cx="10.5" cy="-11.5" r="3.2" fill="none" stroke="#aeb6c2" strokeWidth="2.2" />
          <circle cx="10.5" cy="-11.5" r="3.2" fill="none" stroke="#e6ebf2" strokeWidth="0.8" />
        </g>
      );
    case 'hammer':
      return (
        <g>
          <line x1="0" y1="0" x2="9" y2="-11" stroke="#9c6a3c" strokeWidth="2.4" strokeLinecap="round" />
          <rect x="4.5" y="-16" width="9" height="5.5" rx="1.6" fill="#6b7280" />
          <rect x="4.5" y="-16" width="9" height="2" rx="1" fill="#8a919b" />
        </g>
      );
    case 'pen':
      return (
        <g>
          <line x1="0" y1="0" x2="7" y2="-7" stroke="#e8c25a" strokeWidth="2.6" strokeLinecap="round" />
          <circle cx="7.4" cy="-7.4" r="1.1" fill="#3a3320" />
        </g>
      );
    default:
      return null;
  }
}

export function Hero({ size = 34, working = false, tool = 'none', sitting = false }: HeroProps) {
  const id = useSoftId();
  const skin = '#f3c096';
  const suit = '#3f7d54';
  const suitDark = '#2f5f40';
  const denim = '#33507a';
  const belt = '#7a5330';

  return (
    <svg
      width={size}
      height={size * 1.35}
      viewBox="0 0 40 54"
      style={{ overflow: 'visible' }}
      aria-hidden="true"
    >
      <SoftDefs id={id} />
      <GroundShadow id={id} cx={20} cy={51} rx={9.5} ry={2.6} opacity={0.3} />

      <motion.g
        animate={working ? { y: [0, -1.6, 0] } : { y: 0 }}
        transition={working ? { repeat: Infinity, duration: 0.75, ease: 'easeInOut' } : undefined}
      >
        {/* Ноги + ботинки */}
        {sitting ? (
          <g>
            <VolRect id={id} x={16} y={37} w={5} h={9} rx={2.4} fill={denim} />
            <VolRect id={id} x={19} y={43} w={11} h={5} rx={2.5} fill={denim} />
            <g>
              <VolRect id={id} x={27} y={43.5} w={7.5} h={4.6} rx={2.1} fill="#eef1f4" />
              <rect x={27} y={46.6} width={7.5} height={1.6} rx={0.8} fill="#c7ccd3" />
            </g>
          </g>
        ) : (
          <g>
            <VolRect id={id} x={14.2} y={36} w={5.2} h={13} rx={2.4} fill={denim} />
            <VolRect id={id} x={20.6} y={36} w={5.2} h={13} rx={2.4} fill={denim} />
            {/* боковые карманы штанов */}
            <path d="M15 39 q -1.4 2 0 4" stroke={suitDark} strokeWidth="0.7" fill="none" opacity="0.5" />
            <path d="M25.6 39 q 1.4 2 0 4" stroke={suitDark} strokeWidth="0.7" fill="none" opacity="0.5" />
            {/* ботинки с подошвой и мыском */}
            <g>
              <VolRect id={id} x={12.6} y={46.5} w={7.6} h={4.6} rx={2.1} fill="#eef1f4" />
              <rect x={12.6} y={49.6} width={7.6} height={1.7} rx={0.8} fill="#c7ccd3" />
              <path d="M14.4 47.4 h4" stroke="#c7ccd3" strokeWidth="0.7" strokeLinecap="round" />
            </g>
            <g>
              <VolRect id={id} x={19.8} y={46.5} w={7.6} h={4.6} rx={2.1} fill="#eef1f4" />
              <rect x={19.8} y={49.6} width={7.6} height={1.7} rx={0.8} fill="#c7ccd3" />
              <path d="M21.6 47.4 h4" stroke="#c7ccd3" strokeWidth="0.7" strokeLinecap="round" />
            </g>
          </g>
        )}

        {/* Левая рука (за телом) */}
        <VolRect id={id} x={7.3} y={22} w={4.8} h={12.5} rx={2.4} fill={suit} />
        <VolCircle id={id} cx={9.7} cy={34.6} r={2.5} fill={skin} gloss={false} />

        {/* Тело — комбинезон */}
        <VolRect id={id} x={11} y={20.5} w={18} h={19.5} rx={7} fill={suit} />
        {/* пояс */}
        <rect x={11.5} y={32.5} width={17} height={3} rx={1.2} fill={belt} />
        <rect x={18.5} y={32.5} width={3} height={3} rx={0.6} fill="#caa25a" />
        {/* нагрудник + карман + строчка */}
        <path d="M15.5 24 h9 v6.5 a4.5 4.5 0 0 1 -9 0 Z" fill={suitDark} />
        <path d="M15.5 24 h9 v6.5 a4.5 4.5 0 0 1 -9 0 Z" fill="none" stroke="#274f36" strokeWidth="0.5" strokeDasharray="1 1" opacity="0.7" />
        <rect x={17.4} y={26.2} width={5.2} height={3} rx={0.8} fill="none" stroke="#274f36" strokeWidth="0.6" opacity="0.7" />
        {/* лямки с пуговицами */}
        <path d="M15.8 21 l0.6 4.2 M24.2 21 l-0.6 4.2" stroke={suitDark} strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="16.4" cy="25" r="0.9" fill="#e8c25a" />
        <circle cx="23.6" cy="25" r="0.9" fill="#e8c25a" />

        {/* Шея */}
        <VolRect id={id} x={18} y={16.5} w={4} h={4} rx={1.6} fill={skin} />

        {/* Голова + уши */}
        <VolCircle id={id} cx={12.8} cy={12} r={1.7} fill={skin} gloss={false} />
        <VolCircle id={id} cx={27.2} cy={12} r={1.7} fill={skin} gloss={false} />
        <VolCircle id={id} cx={20} cy={11.5} r={8} fill={skin} />
        {/* волосы + пряди */}
        <path d="M12.4 10 a7.6 7.6 0 0 1 15.2 0 q -3.8 -3.2 -7.6 -3.2 q -3.8 0 -7.6 3.2 Z" fill="#4a3626" />
        <path d="M13.6 8.6 q 2.4 -1.4 4 -0.6 M17.6 7.4 q 2.4 -1 4.6 0 M22.6 7.8 q 1.8 -0.6 3.4 0.4" stroke="#5b4632" strokeWidth="0.7" fill="none" strokeLinecap="round" opacity="0.7" />
        {/* румянец */}
        <ellipse cx="15.4" cy="14" rx="1.8" ry="1.1" fill="#f39b8a" opacity="0.55" />
        <ellipse cx="24.6" cy="14" rx="1.8" ry="1.1" fill="#f39b8a" opacity="0.55" />
        {/* глаза + бровки */}
        {working ? (
          <g>
            <circle cx="17.2" cy="12.2" r="1.15" fill="#2a2320" />
            <circle cx="22.8" cy="12.2" r="1.15" fill="#2a2320" />
            <circle cx="16.8" cy="11.8" r="0.4" fill="#fff" />
            <circle cx="22.4" cy="11.8" r="0.4" fill="#fff" />
          </g>
        ) : (
          <g stroke="#2a2320" strokeWidth="1.2" strokeLinecap="round" fill="none">
            <path d="M16 12.4 q 1.2 1 2.4 0" />
            <path d="M21.6 12.4 q 1.2 1 2.4 0" />
          </g>
        )}
        {/* нос + улыбка */}
        <path d="M20 12.6 q 0.6 0.8 -0.2 1.4" stroke="#d79a76" strokeWidth="0.8" fill="none" strokeLinecap="round" />
        <path d="M18.2 15.4 q 1.8 1.5 3.6 0" stroke="#b06a4e" strokeWidth="1" strokeLinecap="round" fill="none" />

        {/* Гогглы на лбу + ремешок */}
        <path d="M11.4 8 q 8.6 -3 17.2 0" stroke="#6b4a2c" strokeWidth="2.6" fill="none" strokeLinecap="round" />
        <path d="M12.4 9 q -1.4 1.4 -0.8 3.4 M27.6 9 q 1.4 1.4 0.8 3.4" stroke="#5b3f24" strokeWidth="1.4" fill="none" strokeLinecap="round" />
        <g>
          <VolCircle id={id} cx={16} cy={7.4} r={3.1} fill="#7d5636" gloss={false} />
          <circle cx="16" cy="7.4" r="1.95" fill="#bfe6d8" />
          <Gloss cx={15.2} cy={6.7} rx={0.9} ry={0.6} rotate={-30} opacity={0.85} />
          <VolCircle id={id} cx={24} cy={7.4} r={3.1} fill="#7d5636" gloss={false} />
          <circle cx="24" cy="7.4" r="1.95" fill="#bfe6d8" />
          <Gloss cx={23.2} cy={6.7} rx={0.9} ry={0.6} rotate={-30} opacity={0.85} />
        </g>

        {/* Правая рука с инструментом — качается при работе */}
        <g transform="translate(27,23)">
          <motion.g
            animate={working ? { rotate: [-40, 24, -40] } : { rotate: 12 }}
            transition={working ? { repeat: Infinity, duration: 0.75, ease: 'easeInOut' } : undefined}
            style={{ transformOrigin: '0px 0px' }}
          >
            <VolRect id={id} x={-2.2} y={-1} w={4.8} h={10.5} rx={2.4} fill={suit} />
            <VolCircle id={id} cx={0.2} cy={9.4} r={2.5} fill={skin} gloss={false} />
            <g transform="translate(0.2,9.4)">
              <Tool tool={tool} />
            </g>
          </motion.g>
        </g>
      </motion.g>
    </svg>
  );
}
