import dataset from '../data/weapons.json'
import type { Weapon, WeaponDataset } from '../types'
import type { Column } from './grid'

const data = dataset as unknown as WeaponDataset

/** What the game may pick as an answer, and what you are allowed to guess. */
export const WEAPONS: Weapon[] = data.weapons.filter((w) => w.released)
export const DATA_UPDATED = data.scrapedAt

export const WEAPON_COLUMNS: Column<Weapon>[] = [
  { key: 'class', label: 'Class', kind: 'category', value: (w) => w.class },
  { key: 'ammo', label: 'Ammo', kind: 'category', value: (w) => w.ammo },
  { key: 'action', label: 'Action', kind: 'category', value: (w) => w.action },
  { key: 'slots', label: 'Slots', kind: 'number', value: (w) => w.slots, format: (w) => w.slotsLabel },
  {
    key: 'magazine',
    label: 'Magazine',
    kind: 'number',
    value: (w) => w.magazine,
    format: (w) => w.magazineLabel,
  },
  {
    key: 'damage',
    label: 'Damage',
    kind: 'number',
    value: (w) => w.damage,
    format: (w) => (w.damage === null ? '—' : String(w.damage)),
  },
  { key: 'cost', label: 'Cost', kind: 'number', value: (w) => w.cost, format: (w) => w.costLabel },
]
