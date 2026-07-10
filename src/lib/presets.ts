import { VehicleConfig } from '../types';

export const BOT_PRESETS: VehicleConfig[] = [
  {
    id: "preset-striker",
    name: "Mk. I Striker",
    color: "#D32F2F",
    weapon: { type: "spinner", rpm: 4200, damage: 65 },
    armor: { type: "titanium", integrity: 90, weight: 120 },
    motor: { torque: 450, maxSpeed: 25 },
    description: "Fast-spinning kinetic weapon with highly responsive agile chassis."
  },
  {
    id: "preset-titan",
    name: "Titan Heavy",
    color: "#FBC02D",
    weapon: { type: "hammer", rpm: 1800, damage: 85 },
    armor: { type: "steel", integrity: 100, weight: 180 },
    motor: { torque: 750, maxSpeed: 14 },
    description: "Devastating top-down impact hammer with heavy armored steel plating."
  },
  {
    id: "preset-viper",
    name: "Viper Launcher",
    color: "#1976D2",
    weapon: { type: "flipper", rpm: 1000, damage: 50 },
    armor: { type: "carbon-fiber", integrity: 80, weight: 90 },
    motor: { torque: 500, maxSpeed: 32 },
    description: "High-velocity flipper system designed to overturn and launch opponents."
  },
  {
    id: "preset-beast",
    name: "Beast Drum",
    color: "#FF5500",
    weapon: { type: "drum", rpm: 5500, damage: 75 },
    armor: { type: "titanium", integrity: 95, weight: 135 },
    motor: { torque: 550, maxSpeed: 20 },
    description: "Thick armored drum spinner that delivers massive continuous vertical impacts."
  },
  {
    id: "preset-crab",
    name: "Iron Crab",
    color: "#8E24AA",
    weapon: { type: "crusher", rpm: 800, damage: 100 },
    armor: { type: "steel", integrity: 100, weight: 190 },
    motor: { torque: 800, maxSpeed: 12 },
    description: "Powerful hydraulic crusher capable of pinning and piercing thick armor plating."
  }
];
