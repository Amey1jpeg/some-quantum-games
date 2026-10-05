// ═══════════════════════════════════════════════════════
//  ENTANGLED ASCENT — built-in levels
//  This whole file is written by the level editor: editor.html →
//  🔗 Entangled Ascent → Built-in → "⬇ Save built-in file". Replace this
//  file with the one it gives you and commit it — that is what players get.
//  The game sorts levels from Easy to Frame Perfect; each unlocks the next.
// ═══════════════════════════════════════════════════════
const AL_LEVELS = [
  { name: "DRIFT", diff: 'easy', speed: 170, length: 3000, objects: [
    {t:"portal",x:335,y:230,kind:"fast"},
    {t:"col",x:345,top:[135,294],bot:[306,465],w:18},
    {t:"orb",x:360,y:415,kind:"gold"},
    {t:"orb",x:545,y:220,kind:"green"},
    {t:"col",x:610,top:[130,290],bot:[310,470],w:18},
    {t:"portal",x:615,y:405,kind:"slow"},
    {t:"orb",x:770,y:390,kind:"gold"},
    {t:"orb",x:820,y:235,kind:"green"},
    {t:"col",x:900,top:[125,285],bot:[315,475],w:18},
    {t:"trigger",x:965,mode:"desync"},
    {t:"col",x:1100,top:[95,235],bot:[300,600],w:18},
    {t:"col",x:1115,top:[0,300],bot:[306,446],w:18},
    {t:"trigger",x:1295,mode:"sync"},
    {t:"trigger",x:1665,mode:"finish"}
  ] },
]
