/**
 * Реестр ПЛОСКИХ (SVG) ассетов планеты: тема (slug из themes.ts) ->
 * Exterior/Interior. Это наследие первого визуала: сейчас у всех тем есть
 * настоящие 3D-модели и 3D-интерьеры (src/three/*), и тап по станции ныряет
 * внутрь, а не открывает панель. Плоские ассеты остались только для панели
 * станции без темы (StationSheet), поэтому реестр НЕПОЛНЫЙ: у темы может не
 * быть плоской пары — zoneAssets отдаст запасную.
 */

import type { ComponentType } from 'react';
import type { ThemeSlug } from '../../api/types';
import { Exterior as MineExterior } from './mine/Exterior';
import { Interior as MineInterior } from './mine/Interior';
import { Exterior as CorpExterior } from './corporation/Exterior';
import { Interior as CorpInterior } from './corporation/Interior';
import { Exterior as SpaceExterior } from './spaceport/Exterior';
import { Interior as SpaceInterior } from './spaceport/Interior';
import { Exterior as OilExterior } from './oil/Exterior';
import { Interior as OilInterior } from './oil/Interior';
import { Exterior as BankExterior } from './bank/Exterior';
import { Interior as BankInterior } from './bank/Interior';

export interface ZoneAssets {
  Exterior: ComponentType<{ level: number }>;
  Interior: ComponentType<{ level: number; active: boolean }>;
}

export const PLANET_ASSETS: Partial<Record<ThemeSlug, ZoneAssets>> = {
  mine: { Exterior: MineExterior, Interior: MineInterior },
  corporation: { Exterior: CorpExterior, Interior: CorpInterior },
  spaceport: { Exterior: SpaceExterior, Interior: SpaceInterior },
  oil: { Exterior: OilExterior, Interior: OilInterior },
  bank: { Exterior: BankExterior, Interior: BankInterior },
};

/** Ассеты темы с запасным вариантом (шахта), если плоской пары у темы нет. */
export function zoneAssets(theme: ThemeSlug | string | null | undefined): ZoneAssets {
  return PLANET_ASSETS[(theme ?? 'mine') as ThemeSlug] ?? { Exterior: MineExterior, Interior: MineInterior };
}
