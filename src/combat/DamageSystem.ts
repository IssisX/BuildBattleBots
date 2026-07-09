import { ImpactEvent, DamageableComponent, DamageTuning, Materials } from './DamageTypes';

export class DamageSystem {
  private static eventPool: ImpactEvent[] = [];
  private static poolSize = 100;
  private static seqCounter = 0;
  
  static initialize() {
    for (let i = 0; i < this.poolSize; i++) {
      this.eventPool.push(this.createEmptyEvent(i));
    }
  }
  
  static createEmptyEvent(seq: number): ImpactEvent {
    return {
      seq,
      time: 0,
      attackerId: '',
      defenderId: '',
      weaponId: '',
      source: 'arena',
      severity: 'tap',
      contactPoint: [0, 0, 0],
      normal: [0, 0, 0],
      tangent: [0, 0, 0],
      relativeVelocity: 0,
      normalVelocity: 0,
      tangentialVelocity: 0,
      impulse: 0,
      energyNormal: 0,
      energyTangential: 0,
      obliquityDeg: 0,
      attackerRecoilShare: 0,
      materialA: 0,
      materialB: 0,
      manifoldContacts: 0,
      seedRoll: 0
    };
  }

  static getEvent(): ImpactEvent {
    let ev = this.eventPool.find(e => e.time === 0);
    if (!ev) {
      ev = this.eventPool[0]; // Recycle oldest
      let oldestTime = Date.now();
      for (const e of this.eventPool) {
        if (e.time < oldestTime) {
          oldestTime = e.time;
          ev = e;
        }
      }
    }
    return ev;
  }

  static createDefaultComponent(id: string, botId: string, label: string, hitZone: string, isWeapon = false): DamageableComponent {
    return {
      componentId: Math.floor(Math.random() * 100000),
      botId,
      label,
      hitZone,
      layers: [
        {
          kind: 'paint',
          maxIntegrity: 10,
          integrity: 10,
          absorption: 0.1,
          hardness: 0.2,
          fractureThreshold: 15,
          overmatchThreshold: 30,
          fatigue: 0,
          fatigueLimit: 50,
          heat: 0,
          exposes: ['outerArmor']
        },
        {
          kind: isWeapon ? 'weapon' : 'outerArmor',
          maxIntegrity: 100,
          integrity: 100,
          absorption: 0.6,
          hardness: 1.0,
          fractureThreshold: 60,
          overmatchThreshold: 120,
          fatigue: 0,
          fatigueLimit: 200,
          heat: 0,
          exposes: ['frame']
        }
      ],
      cracks: [],
      mountIntegrity: 1.0,
      disabled: false,
      detached: false,
      lastHitTime: 0,
      visualState: 'clean',
      visualOffset: {
        jolt: [0, 0, 0],
        joltAngular: [0, 0, 0],
        wobblePhase: 0,
        wobbleAmplitude: 0
      }
    };
  }

  static processImpact(
    time: number,
    attackerId: string,
    defenderId: string,
    normalVelocity: number,
    tangentialVelocity: number,
    impulse: number,
    contactPoint: [number, number, number],
    normal: [number, number, number],
    tangent: [number, number, number],
    source: 'body' | 'weapon' | 'arena' | 'debris',
    defenderComp?: DamageableComponent
  ): ImpactEvent | null {
    // Rest rejection
    if (normalVelocity < DamageTuning.gating.restVMin && impulse < DamageTuning.gating.restJMin) {
      return null;
    }
    
    // Hysteresis
    if (defenderComp) {
      if (time - defenderComp.lastHitTime < DamageTuning.gating.cooldownMs) {
        return null;
      }
      defenderComp.lastHitTime = time;
    }

    const energyNormal = 0.5 * impulse * normalVelocity;
    const energyTangential = 0.5 * impulse * tangentialVelocity;
    
    const dot = normal[0]*tangent[0] + normal[1]*tangent[1] + normal[2]*tangent[2];
    let obliquityDeg = Math.acos(Math.max(-1, Math.min(1, Math.abs(dot)))) * (180/Math.PI);
    if (isNaN(obliquityDeg)) obliquityDeg = 0;

    let severity: ImpactEvent['severity'] = 'tap';
    if (energyNormal > DamageTuning.severity.crush.energyNormal) severity = 'crush';
    else if (energyNormal > DamageTuning.severity.heavy.energyNormal) severity = 'heavy';
    else if (energyNormal > DamageTuning.severity.direct.energyNormal) severity = 'direct';
    else if (energyNormal > DamageTuning.severity.glancing.energyNormal) severity = 'glancing';
    else if (energyTangential > DamageTuning.severity.scrape.energyTangential) severity = 'scrape';
    
    const ev = this.getEvent();
    ev.seq = this.seqCounter++;
    ev.time = time;
    ev.attackerId = attackerId;
    ev.defenderId = defenderId;
    ev.source = source;
    ev.severity = severity;
    ev.contactPoint = contactPoint;
    ev.normal = normal;
    ev.tangent = tangent;
    ev.relativeVelocity = Math.sqrt(normalVelocity*normalVelocity + tangentialVelocity*tangentialVelocity);
    ev.normalVelocity = normalVelocity;
    ev.tangentialVelocity = tangentialVelocity;
    ev.impulse = impulse;
    ev.energyNormal = energyNormal;
    ev.energyTangential = energyTangential;
    ev.obliquityDeg = obliquityDeg;
    ev.seedRoll = Math.random();

    if (defenderComp) {
      this.applyDamageToComponent(ev, defenderComp);
    }
    
    return ev;
  }

  private static applyDamageToComponent(ev: ImpactEvent, comp: DamageableComponent) {
    if (comp.detached) return;

    let remainingEnergy = ev.energyNormal;
    let breachedLayers = 0;

    for (let layer of comp.layers) {
      if (layer.integrity <= 0) {
        breachedLayers++;
        continue;
      }

      // Non-linear absorption decay
      const integrityRatio = layer.integrity / layer.maxIntegrity;
      const effectiveAbsorption = layer.absorption * (DamageTuning.absorption.decayBase + DamageTuning.absorption.decayScale * Math.pow(integrityRatio, DamageTuning.absorption.decayExponent));
      
      let absorbedEnergy = remainingEnergy * effectiveAbsorption;
      
      // Overmatch
      if (remainingEnergy > layer.overmatchThreshold) {
        absorbedEnergy = Math.min(absorbedEnergy, layer.overmatchThreshold);
      }
      
      // Apply damage
      layer.integrity -= absorbedEnergy * 0.1; // scale factor
      layer.integrity = Math.max(0, layer.integrity);
      
      // Fatigue
      if (remainingEnergy < layer.fractureThreshold) {
        layer.fatigue += remainingEnergy * 0.5;
        if (layer.fatigue > layer.fatigueLimit) {
          layer.integrity -= layer.maxIntegrity * DamageTuning.fatigue.baseDump;
          layer.fatigue = 0; // reset to accumulate again
        }
      } else {
        layer.fatigue += remainingEnergy * 0.1; // some fatigue even on break
      }
      
      // Heat
      layer.heat += remainingEnergy * 0.05;
      
      remainingEnergy -= absorbedEnergy;
      if (remainingEnergy <= 0) break;
    }
    
    // Update visual state
    if (breachedLayers > 1) {
      comp.visualState = 'exposed';
    } else if (comp.layers[0] && comp.layers[0].integrity < comp.layers[0].maxIntegrity * 0.5) {
      comp.visualState = 'dented';
    } else {
      comp.visualState = 'scuffed';
    }
    
    // Mount integrity
    let mountDamage = 0;
    if (ev.severity === 'crush') mountDamage = 0.6;
    else if (ev.severity === 'heavy') mountDamage = 0.4;
    else if (ev.severity === 'direct') mountDamage = 0.15;
    
    if (mountDamage > 0) {
      comp.mountIntegrity -= mountDamage;
      if (comp.mountIntegrity < 0.3) {
        comp.visualState = 'loose';
      }
      if (comp.mountIntegrity <= 0) {
        comp.detached = true;
        comp.visualState = 'detached';
      }
    }
    
    // Visual offset jolt
    comp.visualOffset.jolt = [
      ev.normal[0] * ev.impulse * 0.01,
      ev.normal[1] * ev.impulse * 0.01,
      ev.normal[2] * ev.impulse * 0.01
    ];
  }
}

DamageSystem.initialize();
