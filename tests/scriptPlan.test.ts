import { describe, expect, it } from 'vitest'
import { maskScript, qualifiedNames, scriptDeclarations } from '../src/main/custom/angelscript'
import { COMPAT_PATH, indexScripts, planScripts, scriptBase } from '../src/main/custom/scriptPlan'
import { planCopy } from '../src/main/custom/copyPlan'
import type { CopySource } from '../src/main/custom/copyPlan'
import { aeBinSource, hw2CopyPlan, scriptIndexOf } from '../src/main/custom/hw2/copy'
import { hw2Sources } from '../src/main/custom/hw2/detect'
import { AE_ROOT } from './aeInstall'
import { HAS_HW2, HW2_ROOT } from './hw2Install'

const enc = new TextEncoder()
const dec = new TextDecoder()

describe('reading the top-level declarations of a script', () => {
  it('finds classes, interfaces, enums, funcdefs, functions and globals, with their spans', () => {
    const t = [
      '// class Commented {}',
      'shared class A : B, IC { void m() { if (x) { } } }',
      'interface IThing { void Do(); }',
      'enum Kind { One = 1, Two }',
      'funcdef void Callback(int a);',
      'array<int>@ g_list = { 1, 2 };',
      'float easeSineOut(float t = 0.5f) { return sin(t * PI * 0.5); }',
      'string s = "{ not a brace";',
      'namespace Outer { namespace Inner { int Helper() { return 1; } } const int n = 2; }',
      '%defblock Template',
      'void NotADecl() {',
      '%endblock'
    ].join('\n')
    const decls = scriptDeclarations(t)
    expect(decls.map((d) => [d.kind, d.name, d.namespace.join('::')])).toEqual([
      ['class', 'A', ''],
      ['interface', 'IThing', ''],
      ['enum', 'Kind', ''],
      ['funcdef', 'Callback', ''],
      ['variable', 'g_list', ''],
      ['function', 'easeSineOut', ''],
      ['variable', 's', ''],
      ['function', 'Helper', 'Outer::Inner'],
      ['variable', 'n', 'Outer']
    ])
    const ease = decls.find((d) => d.name === 'easeSineOut')!
    expect(t.slice(ease.start, ease.end)).toBe('float easeSineOut(float t = 0.5f) { return sin(t * PI * 0.5); }')
    const a = decls.find((d) => d.name === 'A')!
    expect(t.slice(a.start, a.end)).toBe('shared class A : B, IC { void m() { if (x) { } } }')
  })

  it('masks comments, strings and preprocessor lines, offsets unchanged', () => {
    const t = 'int a; // b\n/* c */ string d = "e";\n%if X\n'
    const m = maskScript(t)
    expect(m.length).toBe(t.length)
    expect(m).not.toMatch(/[bce]|%if/)
    expect([...qualifiedNames('Modifiers::lerp(a); x.y; WorldScript :: Foo')]).toEqual(['Modifiers::lerp', 'WorldScript::Foo'])
  })
})

describe('planning the scripts a scenario carries', () => {
  const ae = indexScripts([
    { path: 'scripts/Utils/Functions.as', text: 'float easeQuad(float x) { return x * x; }' },
    { path: 'scripts/Skills/Triggered.as', text: 'class SkillTrigger {}\nclass TriggeredSkill {}' },
    { path: 'scripts/Base.as', text: 'class ActiveSkill {}' }
  ])
  const theirs = indexScripts([
    { path: 'scripts/Skills/Dash.as', text: 'class Dash : ActiveSkill { void Go() { float t = easeSineOut(0.5); Spin(); } }' },
    { path: 'scripts/Skills/Spin.as', text: 'void Spin() { }' },
    {
      path: 'scripts/Utils/Functions.as',
      text: 'float easeQuad(float x) { return x * x; }\nfloat easeSineOut(float t) { return sin(t); }\nvoid Inventory() { Quests(); }'
    },
    { path: 'scripts/Quests.as', text: 'void Quests() { }' },
    {
      path: 'scripts/Skills/Triggered.as',
      text: 'class SkillTrigger {}\nclass TriggeredSkill {}\nclass PeriodSkill : TriggeredSkill { int n = Modifiers::Count(); }'
    },
    { path: 'scripts/Modifiers.as', text: 'namespace Modifiers { int Count() { return 1; } const int n = 2; }\nint OtherCount() { return 0; }' }
  ])

  it('ships a new class whole, and what it calls from files AE has as cut-out declarations', () => {
    const plan = planScripts(['Dash'], theirs, scriptBase(ae))
    expect(plan.missing).toEqual([])
    // Spin.as is new to AE: whole. easeSineOut sits in a file AE has its own of: cut, alone,
    // so Functions.as's Inventory (and through it Quests) never comes.
    expect(plan.files.map((f) => f.path)).toEqual(['scripts/Skills/Dash.as', 'scripts/Skills/Spin.as'])
    expect(plan.compat!.path).toBe(COMPAT_PATH)
    expect(plan.compat!.text).toContain('// from scripts/Utils/Functions.as\nfloat easeSineOut(float t) { return sin(t); }')
    expect(plan.compat!.text).not.toMatch(/easeQuad|Inventory|Quests/)
  })

  it('cuts a class out of a file that also redefines AE classes, with the namespaced names it uses', () => {
    // TriggeredSkill is AE's own: asked for, it's simply not carried
    const plan = planScripts(['PeriodSkill', 'TriggeredSkill'], theirs, scriptBase(ae))
    const text = plan.compat!.text
    expect(text).toContain('class PeriodSkill : TriggeredSkill')
    expect(text).not.toMatch(/class SkillTrigger|class TriggeredSkill/)
    // Modifiers::Count is reached through its namespace; Modifiers.as is new to AE, so it ships whole
    expect(plan.files.map((f) => f.path)).toEqual(['scripts/Modifiers.as'])
  })

  it("follows a namespaced name only when it's written with its namespace", () => {
    const own = indexScripts([
      { path: 'scripts/A.as', text: 'class UsesN { int x = n; }' },
      { path: 'scripts/Lib.as', text: 'namespace Modifiers { const int n = 2; }' }
    ])
    const plan = planScripts(['UsesN'], own, scriptBase(indexScripts([])))
    expect(plan.files.map((f) => f.path)).toEqual(['scripts/A.as'])
  })

  it("drops `override`, which fails where AE's base class lacks the method", () => {
    // HW2's ResistBuffSkill overrides OnBuffApplied, which AE's skills don't have (spike S5)
    const own = indexScripts([
      {
        path: 'scripts/Resist.as',
        text: 'class Resist : ACompositeActorSkill\n{\n\tActorBuff@ OnBuffApplied(ActorBuff@ b) override { return b; }\n\tstring s = "override";\n}'
      }
    ])
    const plan = planScripts(['Resist'], own, scriptBase(indexScripts([])))
    expect(plan.files[0].text).toBe('class Resist : ACompositeActorSkill\n{\n\tActorBuff@ OnBuffApplied(ActorBuff@ b) { return b; }\n\tstring s = "override";\n}')
  })

  it('reports classes the other game lacks too, and stops on a runaway closure', () => {
    expect(planScripts(['Nowhere'], theirs, scriptBase(ae)).missing).toEqual(['Nowhere'])
    const chain = indexScripts(
      Array.from({ length: 500 }, (_, i) => ({ path: `scripts/C${i}.as`, text: `class C${i} { C${i + 1}@ next; }` }))
    )
    expect(planScripts(['C0'], chain, scriptBase(indexScripts([]))).error).toMatch(/more than \d+ script pieces/)
  })
})

describe('a copy carries the scripts its units need', () => {
  const mem = (files: Record<string, string>): CopySource => ({
    has: (p) => p in files,
    read: (p) => (p in files ? { flag: 1, data: enc.encode(files[p]) } : null)
  })
  const unit = '<unit><behavior class="StateActorBehavior"><dict><string name="class">Dash</string></dict></behavior></unit>'
  const input = {
    roots: ['hw2/actors/wolf.unit'],
    prefix: 'hw2/',
    source: mem({ 'actors/wolf.unit': unit }),
    ae: null,
    aeClasses: new Set(['StateActorBehavior']),
    aeEvents: new Set<string>()
  }

  it('ships them beside the unit instead of refusing it', () => {
    const own = indexScripts([{ path: 'scripts/Dash.as', text: 'class Dash { }' }])
    const p = planCopy({ ...input, scripts: { source: own, ae: scriptBase(indexScripts([])) } })
    expect(p.errors).toEqual([])
    expect(p.files.map((f) => f.path)).toEqual(['hw2/actors/wolf.unit', 'scripts/Dash.as'])
    expect(dec.decode(p.files[1].data)).toBe('class Dash { }')
  })

  it("still refuses a unit whose class neither game's scripts declare", () => {
    const p = planCopy({ ...input, scripts: { source: indexScripts([]), ae: scriptBase(indexScripts([])) } })
    expect(p.errors).toEqual(["hw2/actors/wolf.unit: needs the script class Dash, which AE doesn't have"])
  })
})

describe.skipIf(!HAS_HW2)("carrying the HW2 bosses' scripts", () => {
  it('plans the nine bosses to eight new files and three cut-out declarations, none clashing with AE', () => {
    const BOSSES = [
      'archibald_steelwill/boss_brother.unit', 'barrington/boss_barrington.unit', 'blight_the_horrible/boss_blight.unit',
      'commodore_sinkage/boss_sinkage.unit', 'dace_arden/boss_dace_arden.unit', 'doombringer/boss_doombringer.unit',
      'judge_supreme/boss_judge.unit', 'malgar/boss_malgar.unit', 'shock_widow/boss_shock_widow.unit'
    ]
    const plan = hw2CopyPlan(HW2_ROOT, AE_ROOT, BOSSES.map((b) => `hw2/actors/bosses/${b}`))!
    expect(plan.errors).toEqual([])
    const scripts = plan.files.filter((f) => f.path.startsWith('scripts/'))
    expect(scripts.map((f) => f.path)).toEqual([
      'scripts/Behaviors/Actions/ChainAction.as',
      'scripts/Behaviors/Actors/Enemies/EnemyOwnedActor.as',
      'scripts/Behaviors/Actors/Enemies/Movements/SteeringMovement.as',
      'scripts/Behaviors/Actors/Enemies/Skills/ChannelingSpewSkill.as',
      'scripts/Behaviors/Actors/Enemies/Skills/CompositeActorUtilitySkill.as',
      'scripts/Behaviors/Actors/Enemies/Skills/DashStrike.as',
      'scripts/Behaviors/Actors/Enemies/Skills/ResistBuffSkill.as',
      'scripts/Behaviors/Effects/ClearAggro.as',
      COMPAT_PATH
    ])
    const compat = scriptDeclarations(dec.decode(scripts.find((f) => f.path === COMPAT_PATH)!.data))
    expect(compat.map((d) => d.name).sort()).toEqual(['CompositeActorDamagedPeriodTriggeredSkill', 'IOwnedUnitLoad', 'easeSineOut'])
    // nothing replaces an AE file, and nothing AE declares is declared again
    const aeIndex = scriptIndexOf(aeBinSource(AE_ROOT)!)
    for (const f of scripts) {
      expect(aeIndex.files.has(f.path), f.path).toBe(false)
      for (const d of scriptDeclarations(dec.decode(f.data))) expect(aeIndex.byName.has(d.name), `${f.path} declares ${d.name}`).toBe(false)
    }
    expect(hw2Sources(HW2_ROOT)).not.toBeNull()
  }, 300_000)
})
