export type HybridArmorPanelProfile = {
  kind: "hybridCompositeDuctileArmor";

  totalThickness: number;

  compositeFace: {
    density: number;
    thickness: number;

    fiberAngleRadians: number;

    E1: number;
    E2: number;
    G12: number;
    nu12: number;

    Xt: number;
    Xc: number;
    Yt: number;
    Yc: number;
    S12: number;

    GIc: number;
    GIIc: number;
    mixedModeExponent: number;

    fiberDamageFloor: number;
    matrixDamageFloor: number;
    shearDamageFloor: number;

    fatigueStart: number;
    fatigueExponent: number;
    fatigueAmplification: number;

    bendingComplianceParallel: number;
    bendingComplianceTransverse: number;
  };

  ductileBacking: {
    material: "ArmorPlate" | "Steel" | "Aluminum";

    density: number;
    thickness: number;

    youngsModulus: number;
    poissonRatio: number;

    yieldStress: number;
    hardeningModulus: number;
    ductilityLimit: number;

    bendingYieldMomentScale: number;
    bendingHardeningScale: number;

    fractureEnergyPerArea: number;
    fatigueStart: number;
    fatigueExponent: number;
    fatigueAmplification: number;
  };

  interface: {
    normalCohesiveStiffness: number;
    shearCohesiveStiffness: number;

    normalStrength: number;
    shearStrength: number;

    modeIFractureEnergy: number;
    modeIIFractureEnergy: number;
    mixedModeExponent: number;

    fatigueStart: number;
    fatigueExponent: number;
    fatigueAmplification: number;
  };

  visualDamage: {
    intactRoughness: number;
    damagedRoughness: number;

    fiberExposureColor: string;
    matrixCrackColor: string;
    exposedBackingColor: string;

    heatTintEnergyDensityThreshold: number;
  };
};

export type ArmorMaterialResponseRequest = {
  eventId: string;
  sequence: number;
  simulationTick: number;

  botId: string;
  partInstanceId: string;
  partDefinitionId: string;

  localContactPoint: [number, number, number];
  localSurfaceNormal: [number, number, number];
  localImpactDirection: [number, number, number];
  localTangentialDirection: [number, number, number];

  normalImpulse: number;
  tangentialImpulse: number;

  normalEnergy: number;
  tangentialEnergy: number;
  authoritativeImpactEnergy: number;

  deformationEnergy: number;
  fractureEnergy: number;
  absorbedLayerEnergy: number;
  transferredStructuralEnergy: number;

  obliquityRadians: number;
  overmatchRatio: number;
  integrityRatio: number;
  fatigueSusceptibility: number;
};

export type ArmorFractureRequest = {
  eventId: string;
  sequence: number;
  simulationTick: number;

  botId: string;
  partInstanceId: string;
  partDefinitionId: string;

  localContactPoint: [number, number, number];
  localSurfaceNormal: [number, number, number];
  localImpactDirection: [number, number, number];
  localTangentialDirection: [number, number, number];

  fractureEnergy: number;
  overmatchRatio: number;
  obliquityRadians: number;

  sourceGeometryRevision: number;
};
