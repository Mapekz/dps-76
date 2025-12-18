// S.P.E.C.I.A.L. attributes
export const Special = {
  Strength: "Strength",
  Perception: "Perception",
  Endurance: "Endurance",
  Charisma: "Charisma",
  Intelligence: "Intelligence",
  Agility: "Agility",
  Luck: "Luck",
} as const;

export type Special = (typeof Special)[keyof typeof Special];
