import { World, GENERATORS } from '../src/game/world.js';
let bad = 0;
for (const gen of Object.keys(GENERATORS)) {
  for (const pal of ['rust', 'ash', 'steel']) {
    const w = new World({ generator: gen, palette: pal }, 7);
    const noColor = w.boxes.filter((b) => !b.color);
    if (noColor.length) { bad++; console.log('  !! colourless boxes in', gen, noColor.length); }
    console.log(`  ${gen}/${pal}: ${w.boxes.length} boxes · ${w.navPoints.length} nav points · ${(w.verts.length/10).toFixed(0)} verts`);
  }
}
process.exit(bad ? 1 : 0);
