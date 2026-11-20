// 用 Gemini 生成動作示意圖。
//   GEMINI_API_KEY=... node scripts/gen-exercise-art.mjs [動作id ...]
//
// 一致性的關鍵：先生第一張當「風格基準」，之後每一張都把基準圖一起送進去做
// 風格條件化。40 張各自獨立生成的話，配色、線寬、人物比例會整組走鐘。
//
// 走 curl 而不是 SDK：這個環境的對外連線要經過 agent proxy，curl 帶 --proxy
// 與 --cacert 最直接，也省掉裝相依套件。
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const KEY = process.env.GEMINI_API_KEY;
if (!KEY) { console.error('GEMINI_API_KEY missing'); process.exit(1); }

const MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-3-pro-image';
const OUT = process.env.OUT_DIR || 'img';
const TMP = '/tmp/gemart';
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });

const STYLE = `STYLE — this must be IDENTICAL across every image in the set:
an ANATOMICAL CUTAWAY illustration, as if seen through frosted x-ray glass.
The skin is rendered SEMI-TRANSPARENT and translucent, so the musculature
underneath reads clearly through it. Draw the anatomical muscle layer: the shape,
boundary and fibre direction of each muscle group, with clean confident linework —
the fan of the pectoral fibres, the three heads of the deltoid, the wing of the
latissimus dorsi, the four heads of the quadriceps, the segmented blocks of the
rectus abdominis. Precise medical-illustration draughtsmanship, calm and premium,
never a comic and never photorealistic.

PALETTE — strict, no other hues, and do NOT drift toward pink, red or natural
flesh tones: deep flat charcoal background (#141412); the translucent body and all
of its musculature in WARM BRASS AND AMBER (#E5A44C down to #8A5A20) — the whole
figure reads as burnished brass, not as skin; equipment in dark graphite grey
(#5C5347).

TARGET MUSCLE — this is the whole point of the image: the primary working muscle
group is the most OPAQUE, most saturated and brightest thing in the frame (near
#FFC46B) with a soft glow around it. Every other muscle is pushed back into a
dimmer, more transparent underlayer. The contrast between them is what tells the
viewer which muscle is doing the work, so it must be obvious at a glance — even
shrunk to a thumbnail the size of a postage stamp.

COMPOSITION: 3:4 vertical. One single figure that FILLS THE FRAME — the body and
its equipment should span at least 85% of the frame in the longer direction, with
only a small even margin. Do not leave large empty areas. Consistent figure scale
across the set. Flat solid charcoal background with no environment or scenery;
at most a subtle soft contact shadow under the supporting points.
THE BACKGROUND IS ONE UNBROKEN FIELD OF CHARCOAL. For floor exercises do NOT draw
a ground plane, floor slab, platform, mat, podium, horizon line or any lighter
rectangle behind or beneath the figure — the body simply sits on the flat charcoal
with a soft shadow. The background must look identical in every image of the set.

EQUIPMENT ACCURACY: barbells are olympic bars loaded with large circular weight
plates on both ends. Dumbbells have a short handle with a weight head at each end.
Grip width, plate count and joint angles must be anatomically plausible.

THE HEAD IS FEATURELESS — this matters: the head is present, correctly proportioned
and properly attached at the neck, but it is a SMOOTH BLANK ANATOMICAL FORM like a
sculptor's mannequin. Draw NO face: no eyes, no eyebrows, no nose, no mouth, no ear
detail, no facial muscles, no expression, no hair. Just the clean shape of the skull
and jaw. The head orientation still shows which way the athlete is looking.
The head must be the SAME WARM BRASS TONE as the rest of the body — never grey,
white, pale or a different material from the body it is attached to.

ANATOMY — check every one of these before finishing:
• The head and neck are clearly visible, correctly proportioned and properly
  attached to the shoulders. Never omit, hide or crop the head — but keep it
  featureless as described above.
• Exactly one head, two arms, two hands, two legs, two feet. Nothing extra, nothing missing.
• Both hands grip symmetrically, at equal distance from the centre of the bar, and
  are actually closed around it.
• Joints bend in anatomically possible directions only.

STRICTLY FORBIDDEN: any text, letters, numbers, logos, watermarks, signatures,
labels, arrows, measurement lines, borders or frames. No second person. No extra
or missing limbs. No mirrored duplicate figures. No collage or multiple panels.`;

const SET = {
  // ── 胸 ────────────────────────────────────────────────
  bench: {
    file: 'bench.png',
    what: 'a barbell bench press at the mid-point of the press',
    detail: `The athlete lies on their back on a flat bench, seen from a three-quarter side angle.
THE HEAD MUST BE DRAWN: it rests on the surface of the bench, tilted up toward the
ceiling, neck attached naturally to the shoulders. Never let the barbell, the arms or
the frame edge hide or replace the head. Keep it featureless, as the style requires.
The bench is a full-length flat weight bench on upright legs, long enough to support the
head, back and hips together; the whole torso lies along it and both feet are planted flat
on the floor either side. The body must never appear to float without support.
Shoulder blades pinned to the bench, a slight natural arch in the lower back.
Both hands grip a straight olympic barbell slightly wider than shoulder width, elbows tucked to about
45 degrees from the torso, the bar directly above the mid-chest. Target muscle: the chest (pectorals).`
  },
  inclinedb: {
    file: 'inclinedb.png',
    what: 'an incline dumbbell press at the top of the press',
    detail: `Three-quarter side view. THE BENCH MUST CLEARLY BE AN INCLINE BENCH: its backrest is visibly
tilted up at about 30-40 degrees from horizontal, so the athlete is reclined at an angle rather than lying
flat — the difference from a flat bench press must be obvious at a glance. The athlete lies back along that
angled backrest with the hips lower than the shoulders,
head resting on the bench and clearly visible, feet flat on the floor. One dumbbell in each hand, both arms
pressed up and slightly inward above the upper chest, elbows nearly straight but not locked, palms facing
forward. Target muscle: the upper portion of the chest, just below the collarbone.`
  },
  dbfly: {
    file: 'dbfly.png',
    what: 'a dumbbell fly at the stretched bottom position',
    detail: `Three-quarter view from above and the side. The athlete lies on their back on a flat bench, head
resting on the bench and clearly visible, feet flat on the floor. One dumbbell in each hand, both arms opened
wide out to the sides, level with the chest, elbows held in a fixed soft bend throughout. The chest is stretched
open. Target muscle: the chest (pectorals), shown stretched.`
  },
  cablefly: {
    file: 'cablefly.png',
    what: 'a cable crossover at the squeezed end position',
    detail: `Front view. The athlete stands upright between two high cable pulleys, one foot slightly forward for
balance, torso leaning very slightly forward. A handle in each hand, both arms drawn down and inward in an arc so
the hands meet in front of the lower chest, elbows in a fixed soft bend. Two cables run up and outward from the
hands to pulleys at the top corners. Target muscle: the chest (pectorals), squeezed together.`
  },
  dips: {
    file: 'dips.png',
    what: 'chest dips at the bottom of the descent',
    detail: `Three-quarter front view. The athlete supports their whole body between two parallel bars, one hand
gripping each bar at hip height, arms bent so the upper arms are roughly parallel to the floor. The torso leans
forward about 20 degrees, knees bent and ankles crossed behind. Target muscles: the chest (pectorals) and the
triceps at the back of the upper arms.`
  },
  pushup: {
    file: 'pushup.png',
    what: 'a push-up at the bottom position',
    detail: `Pure side view. The athlete is face down supporting themselves on both palms and the balls of both feet,
head clearly visible and looking slightly forward. Hands slightly wider than the shoulders, elbows bent back at
about 45 degrees so the chest is close to the floor, body forming one straight line from head to heels.
Target muscle: the chest (pectorals).`
  },

  // ── 背 ────────────────────────────────────────────────
  deadlift: {
    file: 'deadlift.png',
    what: 'the standing lockout at the top of a barbell deadlift',
    detail: `Pure side view, the athlete facing to the right of frame, standing fully upright and tall.
The athlete has finished the lift and is standing straight: legs straight, hips fully extended, chest up,
shoulders back, head level and facing right.
BOTH ARMS MUST BE DRAWN: the near arm hangs completely straight and vertical from the shoulder down the
FRONT of the body, and its hand is clearly closed around the barbell in an overhand grip. The far arm is
visible behind the torso doing the same. Never omit the arms, never let the torso or the weight plates
hide them, and never leave the barbell floating without a hand holding it.
BAR POSITION IS CRITICAL: the loaded olympic barbell rests across the front of the thighs at hip height,
held at the bottom of those straight arms. The bar is in front of the legs — never behind the body,
never beside the hips, never at knee height.
Target muscles: glutes, hamstrings and the erector spinae running up the spine.`
  },
  pullup: {
    file: 'pullup.png',
    what: 'a pull-up at the top of the movement',
    detail: `Seen from behind. The athlete hangs from a straight horizontal pull-up bar with an overhand
grip slightly wider than the shoulders, having pulled up until the chin is level with the bar. Elbows
driven down and slightly back toward the ribs, shoulder blades pulled together and down, legs hanging
with a slight knee bend and ankles crossed. Target muscle: the latissimus dorsi across the back.`
  },
  latpulldown: {
    file: 'latpulldown.png',
    what: 'a lat pulldown at the bottom of the pull',
    detail: `Seen from behind and slightly to the side. The athlete sits at a pulldown machine with the thighs
secured under a pad, both hands gripping a wide straight bar overhand, having pulled the bar down to the top of
the chest. Elbows driven down toward the ribs, torso leaning back only slightly. A cable runs from the middle of
the bar straight up out of the top of the frame. Target muscle: the latissimus dorsi across the back.`
  },
  row: {
    file: 'row.png',
    what: 'a barbell row at the top of the pull',
    detail: `Pure side view. The athlete stands hinged forward at the hips so the torso is about 45 degrees to the
floor, back flat and neutral, knees softly bent, head in line with the spine. Both arms pull a loaded olympic
barbell up to the lower abdomen, elbows driven back past the ribs. The bar hangs in front of the shins when down;
here it is at the belly. Target muscles: the latissimus dorsi and the rhomboids between the shoulder blades.`
  },
  dbrow: {
    file: 'dbrow.png',
    what: 'a one-arm dumbbell row at the top of the pull',
    detail: `Three-quarter side view. The athlete braces one hand and the same-side knee on a flat bench, the other
foot on the floor, back flat and roughly parallel to the ground, head clearly visible looking down and forward.
The free arm pulls a dumbbell up along the side of the body to hip height, elbow driven back past the ribs.
Target muscle: the latissimus dorsi on the working side.`
  },
  cablerow: {
    file: 'cablerow.png',
    what: 'a seated cable row at the end of the pull',
    detail: `Pure side view. The athlete sits upright on a low cable row station, legs extended forward with a soft
knee bend and feet braced on the footplate. Both hands hold a close-grip handle pulled in to the navel, elbows
driven straight back past the ribs, chest up and shoulder blades squeezed together. A cable runs forward from the
handle to a low pulley. Target muscles: the latissimus dorsi and the rhomboids.`
  },
  facepull: {
    file: 'facepull.png',
    what: 'a face pull at the end of the pull',
    detail: `Front view. The athlete stands upright and pulls a rope attachment from a high pulley toward the face,
so both hands finish beside the ears with the elbows high and level with the shoulders, upper arms rotated outward.
Two rope ends run forward and up to a pulley above head height. Target muscles: the rear head of the deltoid on
both shoulders and the rhomboids.`
  },

  // ── 腿 ────────────────────────────────────────────────
  squat: {
    file: 'squat.png',
    what: 'a barbell back squat at the bottom position',
    detail: `The athlete stands facing the viewer at a slight three-quarter angle, an olympic barbell
resting across the upper back on the trapezius, both hands gripping the bar just outside the shoulders.
Squatted down until the thighs are just below parallel to the floor, chest up, back straight, knees
tracking out over the toes, heels flat on the floor. Target muscles: quadriceps and glutes.`
  },
  frontsquat: {
    file: 'frontsquat.png',
    what: 'a front squat at the bottom position',
    detail: `Three-quarter front view. THIS IS A FRONT-RACK POSITION, NOT A BACK SQUAT: the olympic barbell rests
across the FRONT of the shoulders, sitting on the collarbone and front deltoids in front of the throat. BOTH
ELBOWS ARE DRIVEN HIGH AND POINT STRAIGHT FORWARD at shoulder height, upper arms almost parallel to the floor,
hands open behind the bar supporting it with the fingertips. The bar must never be behind the neck. The
athlete is squatted down until the thighs are just below parallel, torso almost vertical, heels flat.
Target muscle: the quadriceps at the front of the thighs.`
  },
  rdl: {
    file: 'rdl.png',
    what: 'a Romanian deadlift at the bottom of the hinge',
    detail: `Pure side view. The athlete stands with legs almost straight, only a soft bend at the knee, and hinges
forward at the hips pushing the hips back so the torso is roughly 45 degrees to the floor. Back flat and neutral,
head in line with the spine. Both arms hang completely straight and vertical, hands gripping a loaded olympic
barbell that stays in light contact with the thighs just above the knees. Target muscles: the hamstrings at the
back of the thighs and the glutes, both shown stretched.`
  },
  legpress: {
    file: 'legpress.png',
    what: 'a leg press at the bottom of the descent',
    detail: `Side view. The athlete sits reclined in a 45-degree leg press machine, back and hips flat against the
padded seat, head clearly visible. Both feet are flat on a large angled footplate above them, knees bent to about
90 degrees, hands gripping the handles at the sides. Target muscles: quadriceps and glutes.`
  },
  bss: {
    file: 'bss.png',
    what: 'a Bulgarian split squat at the bottom position',
    detail: `Three-quarter side view. The athlete stands in a long split stance with the rear foot resting on top of
a bench behind them, front foot flat on the floor about one stride ahead. The front knee is bent to roughly 90
degrees, the torso upright with a slight forward lean, a dumbbell hanging straight down in each hand.
Target muscles: the quadriceps and glute of the front leg.`
  },
  lunge: {
    file: 'lunge.png',
    what: 'a walking lunge at the bottom of the step',
    detail: `Three-quarter side view. The athlete has stepped forward into a long lunge: the front knee bent to about
90 degrees with the shin vertical, the rear knee dropped low toward the floor and also bent about 90 degrees, torso
upright and tall, head clearly visible. A dumbbell hangs straight down in each hand. Target muscles: the quadriceps
and glute of the front leg.`
  },
  legext: {
    file: 'legext.png',
    what: 'a leg extension at the top of the movement',
    detail: `Pure side view. The athlete sits upright in a leg extension machine with the back against the pad and
both hands gripping the side handles. Both shins are raised until the legs are fully straight out in front, ankles
behind a padded roller. Target muscle: the quadriceps at the front of the thighs, fully contracted.`
  },
  calfraise: {
    file: 'calfraise.png',
    what: 'a standing calf raise at the top of the movement',
    detail: `Pure side view. The athlete stands tall with the balls of both feet on a raised step and the heels
lifted as high as possible, body in one straight vertical line, hands resting on a support in front for balance.
Target muscle: the calf muscles at the back of the lower legs, fully contracted.`
  },

  // ── 肩 ────────────────────────────────────────────────
  ohp: {
    file: 'ohp.png',
    what: 'a standing overhead press at lockout',
    detail: `Front view. The athlete stands tall and has pressed a loaded olympic barbell to full lockout directly
overhead, both arms straight, the bar above the crown of the head with the head passed through between the arms.
Ribs down, glutes and core braced, feet hip width. Target muscle: the deltoids capping both shoulders.`
  },
  dbpress: {
    file: 'dbpress.png',
    what: 'a seated dumbbell shoulder press at lockout',
    detail: `Front view. The athlete sits on a bench with an upright back pad, back supported, feet flat on the floor.
One dumbbell in each hand pressed to full lockout overhead, arms straight and angled very slightly inward, palms
facing forward. Head clearly visible between the arms. Target muscle: the deltoids capping both shoulders.`
  },
  lateral: {
    file: 'lateral.png',
    what: 'a standing dumbbell lateral raise at the top of the movement',
    detail: `Front view. The athlete stands upright holding one dumbbell in each hand, arms raised out
to both sides until level with the shoulders, elbows very slightly bent and fixed, palms facing down,
shoulders down away from the ears. Target muscle: the lateral (side) head of the deltoid on both shoulders.`
  },
  frontraise: {
    file: 'frontraise.png',
    what: 'a dumbbell front raise at the top of the movement',
    detail: `Three-quarter front view. The athlete stands upright. One arm is raised straight out in front of the body
to shoulder height holding a dumbbell, elbow softly bent, palm facing down. The other arm hangs at the side holding
its dumbbell. Target muscle: the front head of the deltoid on the raised side.`
  },
  reardelt: {
    file: 'reardelt.png',
    what: 'a bent-over rear delt fly at the top of the movement',
    detail: `Three-quarter view from behind. The athlete hinges forward at the hips until the torso is nearly parallel
to the floor, knees softly bent, head in line with the spine. Both arms are raised out to the sides and slightly
back, level with the shoulders, elbows in a fixed soft bend, a dumbbell in each hand. Target muscle: the rear head
of the deltoid on both shoulders.`
  },
  shrug: {
    file: 'shrug.png',
    what: 'a barbell shrug at the top of the shrug',
    detail: `Front view. The athlete stands tall holding a loaded olympic barbell in both hands in front of the thighs,
arms completely straight and acting only as hooks. Both shoulders are lifted straight up toward the ears as high as
possible. Target muscle: the trapezius across the top of the shoulders and up the neck.`
  },

  // ── 臂 ────────────────────────────────────────────────
  bbcurl: {
    file: 'bbcurl.png',
    what: 'a barbell curl at the top of the curl',
    detail: `Front view. The athlete stands upright, upper arms pinned to the sides of the torso and motionless.
Both forearms are curled up so a loaded barbell is held at chest height, palms facing up, wrists neutral.
Target muscle: the biceps at the front of both upper arms, fully contracted.`
  },
  dbcurl: {
    file: 'dbcurl.png',
    what: 'an alternating dumbbell curl at the top of the curl',
    detail: `Front view. The athlete stands upright, both upper arms pinned to the sides of the torso. One forearm is
curled all the way up with the palm facing up and the dumbbell at shoulder height; the other arm hangs straight down
at the side holding its dumbbell. Target muscle: the biceps of the curling arm.`
  },
  hammer: {
    file: 'hammer.png',
    what: 'a hammer curl at the top of the curl',
    detail: `Front view. The athlete stands upright, both upper arms pinned to the sides. One forearm is curled up
holding a dumbbell with the palm facing inward toward the body, thumb on top, like holding a hammer; the other arm
hangs at the side. Target muscles: the biceps and the forearm muscles of the curling arm.`
  },
  preacher: {
    file: 'preacher.png',
    what: 'a preacher curl at the top of the curl',
    detail: `Three-quarter side view. The athlete sits at a preacher bench with both upper arms lying flat along the
angled pad, armpits against the top edge of the pad. Both forearms are curled up holding a barbell at the top of the
movement, palms up. Head clearly visible above the pad. Target muscle: the biceps, isolated on the pad.`
  },
  pushdown: {
    file: 'pushdown.png',
    what: 'a triceps pushdown at full extension',
    detail: `Front view. The athlete stands upright facing a high cable pulley, upper arms pinned to the sides of the
torso and motionless. Both forearms are pressed all the way down so the arms are fully straight, hands holding a
straight bar attachment at thigh height. A cable runs from the bar straight up to a pulley above.
Target muscle: the triceps at the back of both upper arms, fully contracted.`
  },
  skull: {
    file: 'skull.png',
    what: 'a skull crusher at the bottom of the movement',
    detail: `Pure side view. The athlete lies on their back on a flat bench, head resting on the bench and clearly
visible, feet flat on the floor. Both upper arms are held vertical, pointing straight up at the ceiling and locked
in place; only the forearms have rotated back so a barbell is lowered to just above the forehead, elbows bent and
pointing at the ceiling. Target muscle: the triceps at the back of both upper arms, stretched.`
  },
  ohtri: {
    file: 'ohtri.png',
    what: 'an overhead triceps extension at the stretched bottom position',
    detail: `Three-quarter front view. The athlete stands upright with both arms raised overhead, upper arms vertical
beside the head and elbows pointing forward. The forearms are bent back so a single dumbbell is held with both hands
behind the head. Head clearly visible. Target muscle: the triceps at the back of both upper arms, stretched.`
  },

  // ── 核心 ──────────────────────────────────────────────
  plank: {
    file: 'plank.png',
    what: 'a forearm plank held steady',
    detail: `Pure side view. The athlete supports their body on both forearms and the balls of both feet.
Elbows directly beneath the shoulders, forearms flat on the floor pointing forward, body forming one
straight line from the head through the hips to the heels — no sag in the lower back and no piked hips.
Target muscle: the abdominals.`
  },
  hanglegraise: {
    file: 'hanglegraise.png',
    what: 'a hanging leg raise at the top of the movement',
    detail: `Pure side view. The athlete hangs from a straight horizontal bar with both hands overhand, arms straight,
head clearly visible. The pelvis is curled up and both legs are raised together in front until the thighs are above
horizontal, knees straight or slightly bent. Target muscles: the abdominals and the hip flexors.`
  },
  cablecrunch: {
    file: 'cablecrunch.png',
    what: 'a kneeling cable crunch at the bottom of the crunch',
    detail: `Pure side view. The athlete kneels on the floor facing away from a high pulley, holding a rope
attachment with both hands beside the head, elbows pointing down. The spine is curled forward so the chest crunches
down toward the pelvis while the hips stay in place. Two rope ends run up behind the head to a high pulley.
Target muscle: the abdominals, fully contracted and shortened.`
  },
  russian: {
    file: 'russian.png',
    what: 'a Russian twist rotated to one side',
    detail: `Three-quarter front view. The athlete sits on the floor with knees bent and heels down, leaning the torso
back to about 45 degrees, head clearly visible. Both hands hold a single dumbbell together and have rotated it to one
side of the body, the torso turned with it. Target muscle: the oblique muscles down the sides of the waist.`
  },
  abwheel: {
    file: 'abwheel.png',
    what: 'an ab wheel rollout extended forward',
    detail: `Pure side view. The athlete kneels on the floor and has rolled an ab wheel forward until the arms are
straight out in front and the body is stretched into a long diagonal line from knees to hands, hips extended, lower
back kept from sagging. Both hands grip the handles either side of the wheel. Target muscle: the abdominals, braced
and stretched.`
  },
  sideplank: {
    file: 'sideplank.png',
    what: 'a side plank held steady',
    detail: `Pure side-on view of the athlete lying on one side, supported on the lower forearm and the outer edge of
the lower foot. The elbow is directly beneath the shoulder, the hips are pushed up so head, shoulder, hip and ankle
form one straight diagonal line, the upper arm resting along the side of the body.
Target muscle: the oblique muscles down the side of the waist facing the floor.`
  },

  // ── 新增：髖／臀 ──────────────────────────────────────
  hipthrust: {
    file: 'hipthrust.png',
    what: 'a barbell hip thrust at the top of the lockout',
    detail: `Pure side view. The athlete's upper back and shoulder blades rest against the edge of a short flat bench
behind them, feet planted flat on the floor in front with knees bent to roughly 90 degrees. At the top of the
movement the hips are driven fully up so the body forms one straight diagonal line from shoulders through hips to
knees — the hips are the highest point of the silhouette, clearly above the shoulder. A loaded olympic barbell rests
across the crease of the hips, held in place by both hands gripping it from above. Target muscle: the glutes,
fully contracted at the top.`
  },
  splitsquat: {
    file: 'splitsquat.png',
    what: 'a dumbbell split squat at the bottom position, both feet flat on the floor',
    detail: `Three-quarter side view. The athlete stands in a long front-to-back stance with BOTH feet flat on the
level floor — unlike a rear-foot-elevated split squat, the back foot is NOT raised on anything. The front knee is
bent to about 90 degrees with the shin close to vertical, the back knee bent and lowered toward the floor, torso
upright and tall. A dumbbell hangs straight down in each hand at the sides. Target muscles: the quadriceps and
glute of the front leg.`
  },
  hipabduction: {
    file: 'hipabduction.png',
    what: 'a seated hip abduction machine at the open (abducted) position',
    detail: `Front view. The athlete sits upright in a hip abduction machine, back against the pad, both hands
gripping the side handles for stability. Both knees press outward against padded levers, thighs spread wide open
to the sides at the top of the movement. Feet rest on a low footplate close together, knees spread apart.
Target muscle: the glutes (hip abductors), shown on the outside of both hips.`
  },
  glutekickback: {
    file: 'glutekickback.png',
    what: 'a standing cable glute kickback at the top of the kick',
    detail: `Pure side view. The athlete stands facing a low cable machine, leaning forward slightly and holding
the machine frame with both hands for balance. The standing leg (nearest the machine) is straight and vertical,
planted on the floor. The other leg, with an ankle cuff attached to a low cable pulley behind it, is extended
straight backward and lifted up behind the body to about hip height — clearly raised off the floor, kicked
backward and up, not left hanging down. Target muscle: the glute of the kicking leg, fully contracted.`
  }
};

const b64 = f => fs.readFileSync(f).toString('base64');

function call(bodyObj, tag) {
  const bodyFile = path.join(TMP, `req-${tag}.json`);
  fs.writeFileSync(bodyFile, JSON.stringify(bodyObj));
  const args = [
    '-sS', '--max-time', '240',
    '--proxy', process.env.HTTPS_PROXY || '',
    '--cacert', '/root/.ccr/ca-bundle.crt',
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
    '-H', 'Content-Type: application/json',
    '-H', `X-goog-api-key: ${KEY}`,
    '-X', 'POST', '-d', `@${bodyFile}`
  ].filter(a => a !== '');
  const raw = execFileSync('curl', args, { maxBuffer: 1024 * 1024 * 128 }).toString();
  fs.writeFileSync(path.join(TMP, `res-${tag}.json`), raw);
  return JSON.parse(raw);
}

function imageFrom(res) {
  const parts = res?.candidates?.[0]?.content?.parts || [];
  const p = parts.find(x => x.inlineData?.data || x.inline_data?.data);
  return p ? (p.inlineData?.data || p.inline_data.data) : null;
}

const only = process.argv.slice(2);
const targets = Object.entries(SET).filter(([k]) => !only.length || only.includes(k));

// REF_IMAGE 可以指向一張已經生好的基準圖，重生單張時就不必為了取得基準而
// 把整組重跑一次（也避免把已經滿意的那張洗掉）。
let referencePath = process.env.REF_IMAGE || null;
for (const [id, ex] of targets) {
  const dest = path.join(OUT, ex.file);
  const prompt = `Illustration of ${ex.what}.\n\n${ex.detail}\n\n${STYLE}`;
  const parts = [];

  // 第二張之後：附上基準圖，明確要求對齊風格
  if (referencePath && fs.existsSync(referencePath)) {
    parts.push({ inline_data: { mime_type: 'image/png', data: b64(referencePath) } });
    parts.push({
      text: `${prompt}\n\nThe attached image is the STYLE REFERENCE for this set. Match its palette, line
weight, shading, level of detail, figure proportions, background colour and framing EXACTLY. Only the
exercise being performed changes. Do not copy its pose.`
    });
  } else {
    parts.push({ text: prompt });
  }

  const body = {
    contents: [{ parts }],
    generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: '3:4' } }
  };

  try {
    let res = call(body, id);
    if (res.error) {
      // 舊版 API 介面沒有 imageConfig，退一步用預設比例再試一次
      delete body.generationConfig.imageConfig;
      res = call(body, id + '-retry');
    }
    const data = imageFrom(res);
    if (!data) throw new Error(res.error?.message || 'no image part in response');
    fs.writeFileSync(dest, Buffer.from(data, 'base64'));
    if (!referencePath) referencePath = dest;
    console.log(`OK   ${ex.file}  ${(fs.statSync(dest).size / 1024).toFixed(0)} KB`);
  } catch (e) {
    console.log(`FAIL ${id}: ${e.message}`);
  }
  await new Promise(r => setTimeout(r, 2500));
}
