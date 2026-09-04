export type WeaponClass = 'Rifle' | 'Pistol' | 'Shotgun' | 'Melee' | 'Special'

export interface Weapon {
  id: string
  name: string
  /** The weapon family, e.g. "Sparks" for both Sparks and Sparks Sniper. */
  base: string
  /** The variant suffix, e.g. "Sniper". Null for a base weapon. */
  variant: string | null
  /** Null when the wiki has no icon for it yet. */
  icon: string | null
  description: string
  wikiUrl: string
  /** False for weapons the wiki documents ahead of their live release. */
  released: boolean
  unreleasedIn: string | null
  /** Weapon (loadout slot) | Tool (tool slot) | World (picked up off the map). */
  source: 'Weapon' | 'Tool' | 'World'
  class: WeaponClass
  /** Compact | Medium | Long | Special Long | Shotgun Shells | Special | Melee */
  ammo: string
  /** Lever-Action | Bolt-Action | Pump-Action | Break-Action | Single-Shot | … */
  action: string
  /** Weapon capacity 1–5; 0 for tools and world pickups, which take no weapon slot. */
  slots: number
  slotsLabel: string
  /** Rounds loaded, chambered round included. Null for melee. */
  magazine: number | null
  /** How the game writes it, e.g. "7+1". */
  magazineLabel: string
  /** For melee weapons this is the light melee attack. */
  damage: number | null
  /** Hunt Dollars. Null for Scarce weapons and world pickups, which have no price. */
  cost: number | null
  costLabel: string
  /** Chronological rank of the update that added the weapon. */
  introduced: number
  introducedLabel: string
}

export interface WeaponDataset {
  scrapedAt: string
  builtAt: string
  source: string
  weapons: Weapon[]
}

export type Verdict = 'hit' | 'miss'

export interface CellResult {
  key: string
  label: string
  verdict: Verdict
  /** Which way the answer lies, for numeric attributes. */
  direction: 'up' | 'down' | null
}
