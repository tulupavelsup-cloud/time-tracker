import type { ThemeSlug } from '../api/types';

/**
 * Конфиг тематических зон планеты (этап 2, геймификация).
 * У каждой категории — своя тема-«бизнес». Набор расширяемый:
 * добавляя тему, дополни ThemeSlug в src/api/types.ts и массив ниже.
 *
 * exteriorStages — развитие зоны снаружи по мере часов; индексы стадий
 * соответствуют уровням из src/lib/thresholds.ts (стадия 0 видна с уровня
 * «Лагерь», дальше — по мере роста уровня).
 */
export interface ZoneTheme {
  slug: ThemeSlug;
  /** Название темы для пользователя */
  title: string;
  /** Развитие зоны снаружи, от первой постройки к вершине */
  exteriorStages: string[];
  /** Интерьер — куда «проваливаешься» тапом по зоне */
  interior: string;
}

export const THEMES: ZoneTheme[] = [
  {
    slug: 'mine',
    title: 'Шахта',
    exteriorStages: [
      'палатка старателя',
      'вход в шахту',
      'вагонетки',
      'блеск алмазов из шахты',
    ],
    interior:
      'подземный разрез: герой копает киркой, алмазы поблёскивают в породе, вагонетка увозит добычу',
  },
  {
    slug: 'corporation',
    title: 'Корпорация',
    exteriorStages: [
      'вагончик-офис',
      'первое здание',
      'квартал небоскрёбов',
      'золотой логотип на крыше',
    ],
    interior: 'офис: герой за столом среди этажей, лифт ездит, на табло растут цифры',
  },
  {
    slug: 'spaceport',
    title: 'Космопорт',
    exteriorStages: [
      'ангар',
      'стартовая площадка',
      'ракета в сборке',
      'космолёт стартует',
    ],
    interior:
      'цех сборки: герой крутит гайки у ракеты, искры сварки, обратный отсчёт на табло',
  },
  {
    slug: 'oil',
    title: 'Нефтевышка',
    exteriorStages: [
      'буровая палатка',
      'качалка',
      'цистерны',
      'фонтан нефти с золотым отливом',
    ],
    interior: 'буровая платформа: герой у рычагов, качалка качает, бочки наполняются',
  },
  {
    slug: 'bank',
    title: 'Банк',
    exteriorStages: [
      'обменный киоск',
      'здание с колоннами',
      'хранилище',
      'золотой купол',
    ],
    interior: 'хранилище: герой возит тележки со слитками, дверь-сейф, стопки монет растут',
  },
];

/** Порядок, в котором свободные темы предлагаются при создании категории. */
export const DEFAULT_THEME_ORDER: ThemeSlug[] = THEMES.map((t) => t.slug);

/** Тема по slug (или undefined, если slug неизвестен). */
export function getTheme(slug: ThemeSlug | string | null | undefined): ZoneTheme | undefined {
  return THEMES.find((t) => t.slug === slug);
}

/**
 * Первая тема из набора, ещё не занятая существующими категориями.
 * Если все заняты — идём по кругу.
 */
export function suggestTheme(usedSlugs: ReadonlyArray<ThemeSlug | string | null>): ThemeSlug {
  const free = DEFAULT_THEME_ORDER.find((slug) => !usedSlugs.includes(slug));
  return free ?? DEFAULT_THEME_ORDER[usedSlugs.length % DEFAULT_THEME_ORDER.length];
}
