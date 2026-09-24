      }
    }, c);
  }

  check("spell progression", () => {
    const maxSpellLevel = rules.getMaxSpellLevel(c);
    const mode = rules.getSpellcastingMode(c);
    const slots = Array.isArray(c.classLevels) && c.classLevels.length > 1
      ? rules.getMulticlassSpellSlotSummary(c)
      : rules.getSpellSlotSummary(c.className, level);

    assert.ok(Number.isInteger(maxSpellLevel) && maxSpellLevel >= 0 && maxSpellLevel <= 9);
    assert.ok(["none", "prepared", "known"].includes(mode));

    let previousSlotLevel = 0;
    for (const slot of slots) {
      assert.ok(Number.isInteger(slot.level) && slot.level >= 1 && slot.level <= 9);
      assert.ok(Number.isInteger(slot.count) && slot.count > 0);
      assert.ok(slot.level > previousSlotLevel);
      assert.ok(slot.level <= maxSpellLevel || mode === "none");
      previousSlotLevel = slot.level;
    }

    const cantrips = rules.getCantripsKnown(c.className, level);
    const known = rules.getSpellsKnown(c.className, level);
    const prepared = rules.getPreparedSpellCount(c);

    assert.ok(Number.isInteger(cantrips) && cantrips >= 0);
    assert.ok(known === null || (Number.isInteger(known) && known >= 0));
    assert.ok(prepared === null || (Number.isInteger(prepared) && prepared >= 1));

    const spellbook = rules.getSpellbookProgression(c.className, level);
    const wizardSpellbook = rules.getWizardSpellbookProgression(level);
    assert.ok(spellbook === null || (Number.isInteger(spellbook) && spellbook >= 0));
    assert.equal(wizardSpellbook, 6 + (level - 1) * 2);

    const summary = rules.getSpellcastingSummary(c);
    assert.equal(summary.mode, mode);
    assert.equal(summary.maxSpellLevel, maxSpellLevel);
  }, c);

  check("feat parsing and prerequisites", () => {
    for (const feat of featScan) {
      const options = rules.getFeatAbilityOptions(feat);
      const bonuses = rules.getFeatAbilityBonuses(feat);