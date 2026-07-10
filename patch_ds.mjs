import fs from 'fs';
let code = fs.readFileSync('src/combat/DamageSystem.ts', 'utf8');

const applyDamage = `
  private static applyDamageToComponent(ev: ImpactEvent, comp: DamageableComponent) {
    if (comp.detached) return;
    let remainingEnergy = ev.energyNormal;
    let breachedLayers = 0;
    
    let layerIdx = 0;
    let activeLayer = comp.layers[0];
    
    for (let i = 0; i < comp.layers.length; i++) {
      let layer = comp.layers[i];
      if (layer.integrity <= 0) {
        breachedLayers++;
        continue;
      }
      if (!activeLayer || activeLayer.integrity <= 0) activeLayer = layer;
      
      const integrityRatio = layer.integrity / layer.maxIntegrity;
      const effectiveAbsorption = layer.absorption * (DamageTuning.absorption.decayBase + DamageTuning.absorption.decayScale * Math.pow(integrityRatio, DamageTuning.absorption.decayExponent));
      
      let absorbedEnergy = remainingEnergy * effectiveAbsorption;
      if (remainingEnergy > layer.overmatchThreshold) {
        absorbedEnergy = Math.min(absorbedEnergy, layer.overmatchThreshold);
      }
      
      layer.integrity -= absorbedEnergy * 0.1;
      layer.integrity = Math.max(0, layer.integrity);
      
      if (remainingEnergy < layer.fractureThreshold) {
        layer.fatigue += remainingEnergy * 0.5;
        if (layer.fatigue > layer.fatigueLimit) {
          layer.integrity -= layer.maxIntegrity * DamageTuning.fatigue.baseDump;
          layer.fatigue = 0;
        }
      } else {
        layer.fatigue += remainingEnergy * 0.1;
      }
      layer.heat += remainingEnergy * 0.05;
      
      remainingEnergy -= absorbedEnergy;
      if (remainingEnergy <= 0) break;
    }
    
    if (breachedLayers > 1) {
      comp.visualState = 'exposed';
    } else if (comp.layers[0] && comp.layers[0].integrity < comp.layers[0].maxIntegrity * 0.5) {
      comp.visualState = 'dented';
    } else {
      comp.visualState = 'scuffed';
    }
    
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
    
    comp.visualOffset.jolt = [
      ev.normal[0] * ev.impulse * 0.01,
      ev.normal[1] * ev.impulse * 0.01,
      ev.normal[2] * ev.impulse * 0.01
    ];
    
    // Generate DentRequest
    // In real scenario we'd lookup material properties based on component
    const mat = Materials['steel']; // Fallback
    if (ev.energyNormal > mat.deformation.dentThreshold && !comp.detached) {
      const eNorm = ev.energyNormal;
      const depthRatio = Math.min(1.0, eNorm / mat.deformation.fullDentEnergy);
      ev.dentRequest = {
        eventId: 'evt_' + ev.seq,
        botId: comp.botId,
        partInstanceId: comp.hitZone,
        localContactPoint: ev.contactPoint, // Need world-to-local usually, but here we pass world/contact point. Will transform in Arena3D.
        localImpactDirection: ev.normal,
        normalEnergy: ev.energyNormal,
        tangentialEnergy: ev.energyTangential,
        peakImpulse: ev.impulse,
        obliquityRadians: ev.obliquityDeg * Math.PI / 180,
        radius: mat.deformation.minimumDentRadius + (mat.deformation.maximumDentRadius - mat.deformation.minimumDentRadius) * depthRatio,
        depth: mat.deformation.maximumDentDepth * depthRatio,
        plasticity: mat.deformation.plasticity,
        scratchBias: ev.energyTangential > ev.energyNormal ? 1 : 0
      };
    }
  }
`;

code = code.replace(/private static applyDamageToComponent\([\s\S]+?\}\s*\}/, applyDamage.trim() + '\n}');
fs.writeFileSync('src/combat/DamageSystem.ts', code);
