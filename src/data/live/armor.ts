export const bodyArmor: Record<string, { id: string; name: string; damageResist: number; energyResist: number; radiationResist: number }> = {
  none: { id: 'none', name: 'None', damageResist: 0, energyResist: 0, radiationResist: 0 },
  civilEngineer: { id: 'civilEngineer', name: 'Civil Engineer Armor', damageResist: 100, energyResist: 100, radiationResist: 100 },
  secretService: { id: 'secretService', name: 'Secret Service Armor', damageResist: 100, energyResist: 100, radiationResist: 100 },
  bosRecon: { id: 'bosRecon', name: 'BOS Recon Armor', damageResist: 100, energyResist: 100, radiationResist: 100 },
}
