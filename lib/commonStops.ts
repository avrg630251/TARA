export type CommonStopPreset = {
  id: string;
  label: string;
  origin: string;
  destination: string;
  routeSummary: string;
  boardStop: string;
  offStop: string;
  walkAfter: string;
};

export const COMMON_STOP_PRESETS: CommonStopPreset[] = [
  {
    id: "main-gate-to-library",
    label: "Main Gate → Library",
    origin: "Main Gate, De La Salle Araneta University",
    destination: "De La Salle Araneta University Library",
    routeSummary: "Ride jeepney from the main gate to the campus stop, then walk to the library.",
    boardStop: "Main Gate Jeepney Stop",
    offStop: "Campus Center Stop",
    walkAfter: "Walk to the library entrance",
  },
  {
    id: "dorm-to-cafeteria",
    label: "Dorm → Cafeteria",
    origin: "Residence Hall Entrance",
    destination: "University Cafeteria",
    routeSummary: "Take the campus jeepney line, get off near the student center, then walk to the cafeteria.",
    boardStop: "Residence Hall Stop",
    offStop: "Student Center Stop",
    walkAfter: "Walk through the plaza to the cafeteria",
  },
  {
    id: "gate-3-to-quad",
    label: "Gate 3 → Student Quad",
    origin: "Gate 3, De La Salle Araneta University",
    destination: "Student Quad",
    routeSummary: "Ride the campus route from Gate 3 to the central corridor, then walk to the student quad.",
    boardStop: "Gate 3 Jeepney Stop",
    offStop: "Central Campus Stop",
    walkAfter: "Walk across the central path to the quad",
  },
];
