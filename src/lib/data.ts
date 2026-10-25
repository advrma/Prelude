import personasJson from "../../data/personas.json";
import placesJson from "../../data/places.json";
import type { Place, Student } from "./types";

// Static seed data is imported (not read from disk) so it ships inside every serverless bundle.

export function loadPersonas(): Student[] {
  return structuredClone(personasJson as Student[]);
}

export function loadPlaces(): Place[] {
  return placesJson as Place[];
}

export function findPlace(nameOrId: string | undefined): Place | undefined {
  if (!nameOrId) return undefined;
  const key = nameOrId.trim().toLowerCase();
  const places = loadPlaces();
  return (
    places.find((p) => p.id === key) ??
    places.find((p) => p.name.toLowerCase() === key) ??
    places.find((p) => key.includes(p.name.toLowerCase()) || p.name.toLowerCase().includes(key))
  );
}
