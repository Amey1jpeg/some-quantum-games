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
  { name: "JUMPSCARES", diff: 'medium', speed: 170, length: 3000, objects: [
    {t:"col",x:110,top:[185,294],bot:[306,415],w:18},
    {t:"orb",x:220,y:435,kind:"gold"},
    {t:"orb",x:260,y:205,kind:"green"},
    {t:"orb",x:300,y:435,kind:"gold"},
    {t:"portal",x:315,y:450,kind:"slow"},
    {t:"col",x:320,top:[75,235],bot:[365,525],w:18},
    {t:"orb",x:365,y:205,kind:"green"},
    {t:"orb",x:435,y:430,kind:"gold"},
    {t:"orb",x:490,y:215,kind:"green"},
    {t:"col",x:530,top:[135,294],bot:[306,465],w:18},
    {t:"orb",x:535,y:430,kind:"gold"},
    {t:"orb",x:570,y:215,kind:"green"},
    {t:"orb",x:605,y:430,kind:"gold"},
    {t:"orb",x:675,y:225,kind:"green"},
    {t:"orb",x:700,y:415,kind:"gold"},
    {t:"col",x:710,top:[160,294],bot:[306,440],w:18},
    {t:"orb",x:795,y:410,kind:"gold"},
    {t:"orb",x:810,y:220,kind:"green"},
    {t:"trigger",x:825,mode:"desync"},
    {t:"orb",x:860,y:225,kind:"green"},
    {t:"orb",x:870,y:400,kind:"gold"},
    {t:"col",x:890,top:[180,294],bot:[306,420],w:18},
    {t:"orb",x:910,y:400,kind:"gold"},
    {t:"orb",x:945,y:225,kind:"green"},
    {t:"orb",x:975,y:395,kind:"gold"},
    {t:"orb",x:1020,y:455,kind:"gold"},
    {t:"orb",x:1055,y:455,kind:"gold"},
    {t:"col",x:1060,top:[40,200],bot:[400,560],w:18},
    {t:"orb",x:1065,y:145,kind:"green"},
    {t:"orb",x:1090,y:455,kind:"gold"},
    {t:"col",x:1185,top:[25,185],bot:[415,575],w:18},
    {t:"trigger",x:1265,mode:"desync"},
    {t:"trigger",x:1540,mode:"finish"}
  ] },
]
